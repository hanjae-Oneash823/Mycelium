# O'neash Planner Plugin — Documentation

> Retro-terminal productivity system. SQLite-backed, canvas-rendered, drag-droppable.

---

## Table of Contents

1. [Overview](#overview)
2. [Data Models](#data-models)
3. [Database Layer](#database-layer)
4. [Logic Engine](#logic-engine)
5. [State Management](#state-management)
6. [Views](#views)
7. [Components](#components)
8. [Utility Libraries](#utility-libraries)
9. [Styling & Animations](#styling--animations)
10. [Data Flow & Architecture](#data-flow--architecture)
11. [File Map](#file-map)

---

## Overview

The Planner Plugin is a task and project management system built into the O'neash dashboard. It organizes work across four dimensions:

- **Nodes** — individual tasks or events
- **Groups** — lightweight tags/categories
- **Projects** — named collections of related nodes under an Arc
- **Arcs** — top-level time-boxed initiatives (OKR-style containers)

The design language is strict: monospace fonts (VT323), sharp corners everywhere, no rounded-rect UI. Dots represent tasks visually — their **size encodes effort** and their **color encodes urgency**.

---

## Data Models

### `PlannerNode` — the core entity

```ts
node_type: 'task' | 'event'
```

| Field | Purpose |
|---|---|
| `id`, `title`, `description` | Core identity |
| `node_type` | `'task'` (flexible) or `'event'` (scheduled) |
| `planned_start_at` | When-to-do. Date-only (`YYYY-MM-DD`) or datetime (`YYYY-MM-DDThh:mm:ss`) for timed events |
| `due_at` | Hard deadline (assignments only). Date-only string |
| `estimated_duration_minutes` | Effort in minutes — drives dot size |
| `actual_duration_minutes` | Logged after completion |
| `actual_completed_at` | Completion timestamp |
| `importance_level` | Binary user input: `0` = not important, `1` = important |
| `computed_urgency_level` | Auto-computed `0–4` from importance + due proximity |
| `is_completed` | Done flag |
| `is_overdue` | Computed at load: `due_at < today` |
| `is_missed_schedule` | Computed at load: no `due_at`, `planned_start_at < today` |
| `is_recovery` | Flagged when a rescheduled-from-overdue task |
| `is_locked` | Prevents drag-rescheduling |
| `is_pinned` | Reserved for pinning to top |
| `project_id`, `arc_id` | Optional organizational parents |
| `groups[]` | Many-to-many via `node_groups` join table |
| `recurrence_rule` | JSON string of `RecurrenceRule` |
| `recurrence_exceptions` | JSON array of skipped dates |
| `sub_total`, `sub_done` | Subtask counts (computed join) |
| `linked_note_count` | Count of linked notes (computed join) |
| `is_virtual` | Runtime flag for expanded recurring instances (not in DB) |

### Urgency Levels (`ImportanceLevel`)

| Level | Color | Condition |
|---|---|---|
| `0` | Gray `#888` | Event (no urgency concept) |
| `1` | Teal `#00c4a7` | Task or assignment — not important, due > 3 days |
| `2` | Green `#4ade80` | Important task or assignment — due > 3 days |
| `3` | Amber `#f5c842` | Assignment — not important, due ≤ 3 days |
| `4` | Orange `#ff6b35` | Assignment — important, due ≤ 3 days |
| overdue | Red `#ff3b3b` | Any node with `due_at < today` |
| missed | Amber pulse | Flexible task with `planned_start_at < today` |

### Dot Size (`getDotDiameter`)

Maps 15 min → 10px, 480 min → 34px on a logarithmic scale:

```
diameter = 10 + (log(minutes/15) / log(480/15)) * 24
```

### Organizational Containers

**PlannerGroup**
- `name`, `color_hex`, `sort_order`
- `is_visible`, `is_daily_life`, `is_ungrouped` flags
- System group `g-ungrouped` cannot be deleted

**Arc**
- `name`, `color_hex`, `start_date`, `end_date`
- `is_archived` flag
- End date auto-extends when the arc has ≥ 5 tasks

**Project**
- Belongs to an Arc (optional)
- `start_date`, `end_date` auto-computed from its nodes (requires ≥ 2 nodes to show timeline bar)
- `color_hex`, `completion_pct` (computed)

**SubTask**
- Belongs to a `PlannerNode`
- Simple checklist item with `is_completed`

**UserCapacity**
- `daily_minutes` (default 480 = 8h)
- `peak_start`, `peak_end` hours

**RecurrenceRule**
```ts
{
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number          // e.g. 2 = every 2 weeks
  days?: number[]           // 0–6 for weekly (0=Sun)
  until?: string            // YYYY-MM-DD end date
}
```

---

## Database Layer

`plannerDb.ts` — all SQLite access through Tauri's `@tauri-apps/plugin-sql`.

### Hydration (`hydrateRows`)

Every `loadNodes()` call passes raw DB rows through `hydrateRows()`:

1. **Boolean cast** — SQLite stores booleans as 0/1; cast to `true`/`false`
2. **Overdue recompute** — fresh comparison of `due_at` against today (avoids UTC-shift bugs using local date extraction)
3. **Missed schedule detection** — flexible task (no `due_at`) whose `planned_start_at` is before today
4. **WTDI auto-advance** — "When To Do It": if an assignment's planned date has passed but it's not yet overdue, automatically bumps `planned_start_at` to today in the DB, preserving any time suffix (e.g. `T12:30:00`)
5. **Urgency recompute** — calls `computeUrgencyLevel()` fresh from current data

### Key Operations

| Function | What it does |
|---|---|
| `loadNodes()` | Load all incomplete nodes + hydrate |
| `loadGroups()` | Load all groups |
| `loadArcs()` | Load all non-archived arcs |
| `loadProjects()` | Load all projects with completion % |
| `loadUserCapacity()` | Load or create default capacity row |
| `createNode(data)` | Insert node(s); if recurring, expands rule into one row per occurrence |
| `updateNode(id, patch)` | Partial update; triggers arc/project date sync |
| `deleteNode(id)` | Delete + clean up group links |
| `completeNode(id)` | Mark done + log to `productivity_log` |
| `rescheduleNode(id, date)` | Move `planned_start_at`; if was overdue, sets `is_recovery = true` |
| `addRecurrenceException(templateId, date)` | Add a date to the skip list of a recurring event |
| `replaceNodeGroups(nodeId, groupIds)` | Atomically replace all non-system groups on a node |
| `syncProjectDates(projectId)` | Recompute project start/end from its nodes |
| `syncArcEndDate(arcId)` | Auto-extend arc end date if ≥ 5 tasks |

### Analytics Queries

| Function | Returns |
|---|---|
| `loadTodayDoneSummary()` | Count + total effort (minutes) of tasks completed today |
| `loadTodayCompletedNodes()` | Full node rows for today's completed tasks |
| `loadSevenDayCompletions()` | Daily completion counts for past 7 days |
| `loadArcNodeCounts()` | Per-arc total/done counts for progress bars |

### Dev Utilities

- `seedDummyData()` — populates realistic example data (arcs, projects, groups, nodes)
- `wipePlannerData()` — deletes everything except default group and capacity row

---

## Logic Engine

`logicEngine.ts` — pure functions, no side effects.

### `computeUrgencyLevel(isImportant, dueAt, now, isEvent)`

```
isEvent  → L0  (events have no urgency)
no dueAt → L1 (not important) or L2 (important)
dueAt, daysLeft > 3 → L1 or L2
dueAt, daysLeft ≤ 3 → L3 (not important) or L4 (important)
```

### `scoreSuggestion(node, today)` — Today view suggestion ranking

| Factor | Points |
|---|---|
| Urgency bonus | L0=4, L1=8, L2=16, L3=24, L4=40 |
| Due ≤ 1 day | +35 |
| Due ≤ 3 days | +20 |
| Due ≤ 7 days | +10 |
| Recovery task | +25 |
| Quick win (≤ 30 min) | +8 |
| Heavy lift (> 3h) | −12 |
| In-progress subtasks | +10 |

### `computePressureScore(nodes, capacityMins, now)` — Workload gauge

Three components summed to a 0–100 score:

| Component | Cap | What it measures |
|---|---|---|
| Today pressure | 45 | Urgency of today's tasks + effort-over-capacity bonus |
| Overdue pressure | 25 | Severity of backlog (days late × urgency weight) |
| Horizon pressure | 30 | Urgency decay of next 7 days (proximity weighting) |

Thresholds: `safe < 26 ≤ loaded < 51 ≤ heavy < 76 ≤ critical`

### Date Helpers

| Function | Purpose |
|---|---|
| `isSameDay(dateStr, ref)` | Compare date strings to a Date object (handles both `T` and space separators from SQLite) |
| `toDateString(date)` | Format local date as `YYYY-MM-DD` |
| `formatDueLabel(dueStr, now)` | "overdue 3d ago" / "today" / "tomorrow" / "in 5d" |
| `formatEffortLabel(minutes)` | "45m" / "1.5h" / "3h" |

---

## State Management

### `usePlannerStore` (Zustand)

Holds all planner data in memory. Every mutation: executes DB op → reloads affected data → shows toast.

```ts
state:   nodes[], groups[], arcs[], projects[], capacity
actions: loadAll, createNode, updateNode, deleteNode,
         completeNode, uncompleteNode, rescheduleNode,
         replaceNodeGroups, addRecurrenceException,
         createGroup, updateGroup, deleteGroup,
         createArc, updateArc, deleteArc,
         createProject, updateProject, deleteProject,
         wipePlannerData
```

### `useViewStore` (Zustand)

Controls UI state — which view is active, what's in the task form.

```ts
state:   activeView ('today'|'eisenhower'|'focus'|'arc')
         focusContext (arc/project/group filter for FocusView)
         taskFormOpen, editNode
         commandPaletteOpen
actions: setActiveView, setFocusContext,
         openTaskForm(defaults?), openTaskFormEdit(node),
         closeTaskForm,
         openCommandPalette, closeCommandPalette
```

### `useLogicEngine` (custom hook)

Runs on mount and every 30 minutes. Scans all nodes for urgency/overdue changes. If anything changed, persists to DB and triggers a full `loadAll()`.

---

## Views

### TodayView

**Daily focus dashboard.**

```
┌─────────────────────────────┬──────────────┐
│  Header: date + effort bar  │              │
├─────────────────────────────┤  Effort      │
│  OVERDUE  (collapsible)     │  Panel       │
│  ┌──┐ ┌──┐ ┌──┐            ├──────────────┤
│  └──┘ └──┘ └──┘            │  Ongoing     │
│                             │  Arcs        │
│  TODAY                      ├──────────────┤
│  ┌──┐ ┌──┐ ┌──┐            │  Pressure    │
│  └──┘ └──┘ └──┘            │  Gauge       │
│                             │              │
│  SUGGESTIONS                │              │
│  ┌──┐ ┌──┐ ┌──┐            │              │
└─────────────────────────────┴──────────────┘
```

**Sections:**
- **Overdue**: all nodes with `is_overdue || is_missed_schedule`. Collapsible. Cards show days-ago badge.
- **Today**: nodes where `planned_start_at` or `due_at` = today. Events show `[EVENT]` badge + time range. Tasks show dot + effort.
- **Suggestions**: top 3 future candidates scored by `scoreSuggestion()`. Has "bring to today" action.
- **Done** (today): completed-today nodes shown crossed-out below the live list.

**Right sidebar analytics:**
- **TodayEffortPanel**: bar chart of today's task effort by size bucket
- **OngoingArcsPanel**: arc completion % bars for all active arcs
- **PressureGaugePanel**: needle gauge (safe/loaded/heavy/critical) with animated vibration

**Smart behaviors:**
- Re-hydrates nodes every 60 seconds if the date has crossed midnight
- Reloads analytics after any node mutation
- Events: shown in today section (not auto-completed), require manual completion, included in effort totals
- "tmrw →" reschedule button (hidden for events)

---

### EisenhowerView

**7-column drag-drop week grid.**

```
           │ OOPS! │ TODAY │ +1d │ +2d │ +3d │ +4d │ +5d │
           │░░░░░░░│▓▓▓▓▓▓│     │     │     │     │     │
───────────┼───────┼───────┼─────┼─────┼─────┼─────┼─────┤
Arc Name ▶ │  ●    │   ● ● │     │  ●  │     │     │     │
  Project  │       │   ●   │  ●  │     │     │  ●  │     │
───────────┼───────┼───────┼─────┼─────┼─────┼─────┼─────┤
Arc Name ▶ │       │       │  ●  │     │  ●  │     │  ●  │
```

**Columns:**
- `OOPS!` — overdue column (date key = `'overdue'`)
- `TODAY` — today's date (highlighted with border overlay)
- `+1d` through `+5d` — upcoming days

**Rows:**
- **Arc rows** (indent 0): show arc's total nodes. Clickable to collapse/expand projects below.
- **Project rows** (indent 1): show project's nodes. Hidden when parent arc is collapsed. Collapse/expand uses CSS `grid-template-rows` animation.
- Uncollapsed arc with children → rows show only project nodes; arc row aggregates all

**Cells (DotCell → DotNode):**
- Droppable via @dnd-kit
- DotNode sized by effort, colored by urgency, hollow ring for events
- Double-click empty cell → open TaskForm pre-filled with date/arc/project
- Drop validation: can't move past an assignment's due date

**Density bars** under each column header: green (<60%), amber (<80%), orange (<100%), red (≥100% capacity).

---

### FocusView

**2D interactive canvas — scoping + task field.**

Split into two canvas render modes:

#### Graph Mode (always on)

Force-directed node graph rendered in a `<canvas>`:

```
  ┌───────────────────────────────────────────────────────┐
  │         ○ Arc B                    ○ Group 2          │
  │    ○ Arc A   [ALL]  ────────── [GROUPS]  ○ Group 1   │
  │              ○ Arc C         ○ Project         ○ G3   │
  └───────────────────────────────────────────────────────┘
```

Node types:
| Type | Position | Visual |
|---|---|---|
| `root` | Left center (`−280, 0`) | Largest circle, "ALL" label |
| `arc` | Orbit around root | Medium circles, task-count sized |
| `project` | Fan out from parent arc | Smaller circles |
| `groups-hub` | Right center (`+280, 0`) | Medium circle |
| `group` | Orbit around groups-hub | Smaller circles |

Physics: nodes have velocity; on each animation frame, a spring force pulls toward target position with damping. Hover highlights; click enters scope.

#### Detail Mode (task field)

When a scope is active (arc/project/group selected), nodes in scope are plotted as dots on a 2D field:

- **X-axis**: scheduled date proximity. `0` = today or past (rightmost = most urgent), `1` = furthest future (leftmost)
- **Y-axis top half**: important tasks, position by effort (lighter effort = higher)
- **Y-axis bottom half**: unimportant tasks, position by effort (lighter effort = lower)
- **Dot color**: arc color (fallback: group color → default teal)
- **Dot size**: effort radius

**Drag on the field:**
- Drag dot horizontally → reschedule (snaps to nearest date, shows golden snap line + label)
- Drag dot vertically past center → toggle importance (shows importance label, golden highlight)
- Guide overlay: desaturates + darkens all other dots while dragging
- Due-date wall: dashed red vertical line showing hard deadline
- No toast if dropped back on original position

**Snap targets:** Dates from −7 to +60 days, snapped to nearest based on pixel proximity.

---

### ArcView

**4-month timeline for strategic planning.**

```
  ← [OCT] [NOV] [DEC] [JAN] →                    [ + Arc ]
  ────────────────────────────────────────────────────────
  Arc Name ▼        [════════════════75%═══════╸    ]
    Project A                 [═════╸              ]
    Project B                         [══════════╸ ]
  ──────────────────────────────────────────────────
  Arc Name 2        [══════════════]
  ────────────────────────────────────────────────────────
                          ↑ NOW
```

**Features:**
- **4-month window** with prev/next month navigation
- **NOW line**: vertical marker at current date
- **Arc bars**: width = arc duration, fill % = completion of its nodes. Color-coded.
- **Project bars**: nested below arc, same positioning system
- **Congestion bands**: amber/red background when 2+/3+ arcs end within 21 days
- **Right-click context menus** on arcs and projects (edit / archive / delete)
- **Click** arc or project → switch to FocusView scoped to that context
- **Collapse** arc rows to hide project sub-rows (CSS grid animation)

---

## Components

### `DotNode`

The fundamental visual unit. Draggable div element.

```
     ┌─────────────────────────────────────────┐
     │  diameter = f(estimated_duration_min)    │
     │  color    = f(urgency_level, is_overdue) │
     │  border   = solid ring for events        │
     │                                          │
     │  [SVG ring] — subtask completion arc     │
     │  [purple dot badge] — if linked notes    │
     └─────────────────────────────────────────┘
```

- **Hover** → `DotTooltip` (title, effort, due label) appears above via portal
- **Click** → `TaskDetailPanel` (full metadata + actions) via portal
- **Drag** → @dnd-kit draggable; original hides (`opacity: 0`), overlay renders in `DragOverlay`
- **Events**: no fill, colored border ring (`3px solid`)
- **Locked nodes**: `cursor: default`, drag disabled

### `DotCell`

Droppable container for the Eisenhower grid cells. Renders a flex-wrapped collection of `DotNode`s. Double-click to open TaskForm pre-filled with that cell's date/arc/project.

### `DotTooltip`

Portaled to `document.body`. Anchored above the dot's center. Shows title, effort label, due label. Hidden while dragging, panel open, or TaskForm open.

### `TaskDetailPanel`

Portaled to `document.body` at fixed position. Anchored above the dot.

**Shows:**
- Title, description (expandable)
- Scheduled date, due date, effort
- Groups (colored badges)
- Subtask list with completion checkboxes
- Linked notes (with unlink ×)
- Status flags (overdue, missed, recovery, locked)

**Actions:** Complete / Edit / Delete. Auto-closes on Escape or outside click.

### `TaskForm`

Two-step modal dialog:

**Step 1 — Mode picker:**
- `task` — flexible, no hard deadline
- `assignment` — has a due date
- `event` — scheduled at a specific date/time

**Step 2 — Form:**

Common fields for all modes:
- Title (required), description (optional)
- Groups multi-select (with inline "new group" creation)
- Importance checkbox
- Arc → Project cascade selectors
- Note linking (search + attach/detach)

Mode-specific fields:

| Mode | Specific fields |
|---|---|
| `task` | Planned date, effort size selector |
| `assignment` | Planned date, due date, effort size selector |
| `event` | Date picker, time input (`HH:MM` text, not native time picker due to WebKit bugs), duration (hours), optional recurrence (freq/interval/days/until) |

**Effort selector**: `TaskFormDotStage` shows growing dots visually as user picks size.

**Note linking flow**: type to search notes → results show group badge + title → click to link → linked notes shown with unlink button.

**On save:**
- Create mode: `createNode()` + `linkNoteToTask()` for each linked note
- Edit mode: `updateNode()` + diff-patch note links (add new, remove removed), `replaceNodeGroups()`

**Event time input note:** Native `<input type="time">` is broken in macOS WebKit (value returns `""` even when visually set). The form uses `<input type="text" placeholder="HH:MM">` with auto-colon insertion after 2 digits as workaround.

---

## Utility Libraries

### `recurrence.ts`

**`generateOccurrenceDates(rule, startDateStr)`** — expands a `RecurrenceRule` into a list of date strings.

- Expands up to 500 occurrences or 1 year, whichever comes first
- Respects `until` date
- Weekly: filters to only specified `days[]` within each interval week
- Returns `string[]` of `YYYY-MM-DD`

**`expandRecurring(templates, startDate, endDate)`** — takes recurring template nodes and produces virtual `PlannerNode[]` instances within a date range. Virtual IDs: `"<templateId>:<YYYY-MM-DD>"`. Exceptions (in `recurrence_exceptions`) are skipped.

### `densityCalc.ts`

**`getDensityRatio(nodes, dateStr, capacityMinutes)`** — sum effort of all non-completed nodes on a given date divided by daily capacity.

**`getDensityColor(ratio)`**:
- `< 0.6` → green `#4ade80`
- `< 0.8` → amber `#f5c842`
- `< 1.0` → orange `#ff6b35`
- `≥ 1.0` → red `#ff3b3b`

### `arcBuilder.ts`

**`buildArcPositions(arcs, projects, windowStart, windowEnd)`** — computes `left%` and `width%` for each arc/project bar in the ArcView timeline.

**`detectCongestion(arcs, windowStart)`** — scans 21-day rolling windows. Returns arc IDs colored amber (2–3 arcs ending together) or red (3+ arcs).

### `noteLinks.ts`

| Function | Description |
|---|---|
| `linkNoteToTask(compositeNoteId, nodeId)` | Insert into `note_task_links` |
| `unlinkNoteFromTask(compositeNoteId, nodeId)` | Delete from `note_task_links` |
| `getLinkedNoteIds(nodeId)` | Get all note IDs attached to a task |
| `getLinkedNodeIds(compositeNoteId)` | Get all task IDs attached to a note |
| `deleteAllLinksForNote(compositeNoteId)` | Cleanup when note is deleted |

---

## Styling & Animations

`PlannerPlugin.css`

### Design Rules

- **Font**: VT323 (monospace, pixel terminal)
- **Shape**: everything sharp — zero border radius on UI chrome (dots get `50%` from code only)
- **Colors**: high-contrast on black, using opacity variants for hierarchy
- **Events**: hollow rings (`border: 3px solid color`, transparent fill)

### Animation Classes

| Class | Effect | Used on |
|---|---|---|
| `dot-anim-urgent` | Pulsing orange glow | Urgency L4 dots |
| `dot-anim-red` | Pulsing red glow | Overdue dots |
| `dot-anim-wiggle` | Rotation wiggle | Urgency L3 dots |
| `dot-anim-missed` | Amber glow pulse | Missed schedule dots |
| `arc-dots-arrive` | Fade-in + slide-up | Dots when arc row expands |
| `task-form-mode-in` | Fade + slide-up | Mode picker entrance |
| `planner-form-out` | Fade + scale-down | Form exit transition |
| `effort-particle` | Left-to-right sweep | Effort bar particle |
| `gauge-needle-safe` | Minimal vibration | Pressure gauge needle |
| `gauge-needle-loaded` | Low vibration | Pressure gauge needle |
| `gauge-needle-heavy` | Medium vibration | Pressure gauge needle |
| `gauge-needle-critical` | Heavy vibration | Pressure gauge needle |

---

## Data Flow & Architecture

### Boot sequence

```
PlannerPlugin mounts
  → usePlannerStore.loadAll()
      → parallel: loadNodes, loadGroups, loadArcs, loadProjects, loadUserCapacity
          → hydrateRows() on nodes
              → recompute overdue, missed, urgency
              → WTDI auto-advance (bump stale planned dates to today)
  → useLogicEngine() starts 30-min interval
  → ViewSwitcher renders, default view = TodayView
```

### Mutation lifecycle

```
User action (e.g. complete task)
  → store.completeNode(id)
      → db.completeNode(id)           — DB write
      → db.loadNodes()                — reload
          → hydrateRows()             — recompute
      → set({ nodes })                — Zustand update
      → toast.success(...)            — feedback
  → React re-render (all subscribers)
```

### View switching

```
User clicks tab
  → useViewStore.setActiveView('eisenhower')
  → PlannerPlugin.tsx conditionally renders EisenhowerView
  → EisenhowerView reads nodes from usePlannerStore
```

### Task creation

```
User clicks "+ task"
  → useViewStore.openTaskForm(defaults?)
  → TaskForm modal renders
  → User selects mode → fills fields → clicks Save
      → store.createNode(data)
          → if recurring: expand rule → insert N rows
          → else: insert 1 row
      → link selected notes
      → replace groups
  → store.loadAll() (partial reload)
  → useViewStore.closeTaskForm()
```

### Drag-drop (Eisenhower)

```
User drags DotNode to new DotCell
  → @dnd-kit DragOverlay renders dot at cursor
  → onDragEnd:
      → validate: new date ≤ due_at?
      → store.rescheduleNode(id, newDateStr)
          → db: UPDATE planned_start_at
          → if was overdue: set is_recovery = true
      → store reloads nodes
      → toast
```

### FocusView field drag

```
User mousedown on dot in canvas
  → dragStateRef populated with dot info, originalDate, originalImportance
  → on mousemove: compute snapped date + new importance from position
  → guideAlpha animates up (dim + desaturate overlay renders)
  → on mouseup:
      → if snappedDate === originalDate AND importance unchanged → no-op (no toast)
      → else: store.rescheduleNode / store.updateNode(importance)
```

---

## File Map

```
PlannerPlugin/
├── PlannerPlugin.tsx          Root component, view router, Ctrl+K handler
├── PlannerPlugin.css          Animations, design tokens, scrollbar styles
├── types.ts                   All TypeScript types + color/size helpers
│
├── views/
│   ├── TodayView.tsx          Daily focus: overdue / today / suggestions / analytics
│   ├── EisenhowerView.tsx     7-day drag-drop matrix grid
│   ├── FocusView.tsx          2D canvas: graph + task field with drag-reschedule
│   └── ArcView.tsx            4-month strategic timeline
│
├── components/
│   ├── DotNode.tsx            Draggable task dot (DOM element)
│   ├── DotCell.tsx            Droppable cell container (Eisenhower)
│   ├── DotTooltip.tsx         Hover popup (portaled)
│   ├── TaskDetailPanel.tsx    Click popup — full task detail + actions (portaled)
│   ├── TaskForm.tsx           Task/event create+edit modal (2-step)
│   ├── TaskFormDotStage.tsx   Visual effort selector (growing dots preview)
│   ├── DensityBar.tsx         Effort ratio bar for column headers
│   ├── DatePickerField.tsx    Calendar date input
│   ├── HoursInput.tsx         Duration spinner
│   ├── ViewSwitcher.tsx       Tab bar (today | eisenhower | focus | arc)
│   ├── CommandPalette.tsx     Ctrl+K quick action menu
│   ├── ArcForm.tsx            Arc create/edit dialog
│   └── ProjectForm.tsx        Project create/edit dialog
│
├── store/
│   ├── usePlannerStore.ts     Zustand: all data + mutations
│   └── useViewStore.ts        Zustand: UI state (active view, form, palette)
│
├── lib/
│   ├── plannerDb.ts           All SQLite queries (load, CRUD, hydration, analytics)
│   ├── logicEngine.ts         Pure algorithms: urgency, pressure, scoring, date helpers
│   ├── useLogicEngine.ts      30-min hook: check + persist urgency/overdue changes
│   ├── recurrence.ts          Expand recurring rules → date lists + virtual instances
│   ├── densityCalc.ts         Effort ratio per day + color thresholds
│   ├── arcBuilder.ts          Timeline bar positioning + congestion detection
│   ├── noteLinks.ts           Note ↔ task many-to-many link CRUD
│   ├── noteSearch.ts          Full-text note search + batch load by IDs
│   └── dateUtils.ts           Date formatting helpers
```

---

*Last updated: 2026-03-23*
