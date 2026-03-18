# Mycelium — Planner Plugin Blueprint v4
> **O_neash Dashboard v03 · For Claude Code Agent**
> Source: `mycelium-blueprint-v4.html` + existing codebase (`registry.js`, `usePluginStore.js`, `db.js`, `App.jsx`)

---

## Table of Contents
1. [Plugin Registration](#1-plugin-registration)
2. [Overview & v2 Changes](#2-overview--v2-changes)
3. [The Dot System](#3-the-dot-system)
4. [Node / Group / Arc Hierarchy](#4-node--group--arc-hierarchy)
5. [Architecture & Import Graph](#5-architecture--import-graph)
6. [UI Tech Stack](#6-ui-tech-stack)
7. [Database Schema](#7-database-schema)
8. [The Five Views](#8-the-five-views)
9. [Logic Engine](#9-logic-engine)
10. [Component Specs](#10-component-specs)
11. [TaskForm — Quick vs Project](#11-taskform--quick-vs-project)
12. [CRUD Operations](#12-crud-operations)
13. [Note ↔ Task Link System](#13-note--task-link-system)
14. [Design Guidelines](#14-design-guidelines)
15. [Build Roadmap](#15-build-roadmap)

---

## 1. Plugin Registration

### How plugins work in this codebase

Plugins are registered in `src/plugins/registry.js` as a flat array of `{ id, name, component }` objects. The `usePluginStore` (Zustand) holds `plugins` (the array) and `activePlugin` (the active plugin id). `PluginBox.jsx` renders the active plugin's component with Framer Motion transitions. If no plugin is active, `HomePage` renders.

```
src/plugins/
  registry.js           ← import and export all plugins here
  PluginBox.jsx         ← renders active plugin with fade transition
  PlannerPlugin/        ← new folder for this plugin
    PlannerPlugin.jsx   ← root component (entry point)
    views/
    components/
    store/
    lib/
```

### Step 1 — Create the folder
```
src/plugins/PlannerPlugin/
```

### Step 2 — Create the root component
```jsx
// src/plugins/PlannerPlugin/PlannerPlugin.jsx
import ViewSwitcher from './components/ViewSwitcher';
import TodayView from './views/TodayView';
import CalendarView from './views/CalendarView';
import EisenhowerView from './views/EisenhowerView';
import FocusView from './views/FocusView';
import ArcView from './views/ArcView';
import CommandPalette from './components/CommandPalette';
import { usePlannerStore } from './store/usePlannerStore';
import { useViewStore } from './store/useViewStore';

function PlannerPlugin() {
  const activeView = useViewStore(s => s.activeView);
  const viewMap = {
    today: <TodayView />,
    calendar: <CalendarView />,
    eisenhower: <EisenhowerView />,
    focus: <FocusView />,
    arc: <ArcView />,
  };
  return (
    <div className="planner-plugin h-full w-full flex flex-col">
      <ViewSwitcher />
      <div className="flex-1 overflow-hidden">
        {viewMap[activeView] ?? <TodayView />}
      </div>
      <CommandPalette />
    </div>
  );
}

export default PlannerPlugin;
```

### Step 3 — Register in `src/plugins/registry.js`
```js
import NotesPlugin from './NotesPlugin/NotesPlugin.jsx';
import GeoPortalViewPlugin from './GeoPortalViewPlugin/GeoPortalView.jsx';
import PlannerPlugin from './PlannerPlugin/PlannerPlugin.jsx'; // ADD THIS

export const plugins = [
  { id: 'notes', name: 'Notes', component: NotesPlugin },
  { id: 'geo-portal', name: 'Geo Portal', component: GeoPortalViewPlugin },
  { id: 'planner', name: 'Planner', component: PlannerPlugin }, // ADD THIS
];
```

The `SingleBloomNav` and `LaunchMenu` will automatically pick up the new plugin from `usePluginStore`. Add an entry to `LaunchMenu.jsx` under the appropriate category (e.g. BASIC) with a `pluginId="planner"` prop.

---

## 2. Overview & v2 Changes

### v1 Problems Fixed in v2
- Groups were structural hierarchy (Y-axis rows only) — too rigid for mixed task types.
- Daily tasks (groceries, meetings) were forced into Arc/Project overhead they don't need.
- No daily timeline with clock time.
- No default landing view showing what matters right now.
- Note-Task link was a one-liner idea with no design.

### v2 Solutions
- **Groups are now tags** — many-to-many with any node. A task can belong to multiple groups. No group = auto-assigned "ungrouped".
- **Daily tasks** live in permanent groups (errands, social) with no arc/project requirement. Same dot system, same logic engine.
- **Calendar view** — week view, 4am–4am columns, night zone tinting, drag-to-create events.
- **Focus view** — left context selector (arc/project/group tree) + right filtered task list.
- **Today view** — new default. Overdue + today + smart suggestions.
- **Architecture** — fully specified import dependency graph.
- **Note↔Task** — full bidirectional link system with `[[` search, preview tooltips, cross-plugin graph.

---

## 3. The Dot System

Every task and event is represented as a colored circle (dot). Color = importance/urgency level. Size = effort (logarithmic).

### Color Scale (L0–L4, isoluminant)

| Level | Color | Hex | Quadrant | Behavior |
|---|---|---|---|---|
| L0 | Light Blue | `#7ecfff` | — (Seed) | No due date, zero pressure. Never auto-escalates. Floats freely. |
| L1 | Teal | `#3dbfbf` | Not Urgent / Not Important | ELIMINATE / LATER. Escalates to L4 when ≤2d from due_at. |
| L2 | Green | `#4ade80` | Not Urgent / Important | SCHEDULE — ideal state. Most tasks should live here. Escalates to L4 when ≤2d from due_at. |
| L3 | Amber | `#f5a623` | Urgent / Not Important | DELEGATE. Escalates to L4 when ≤1d from due_at. |
| L4 | Deep Orange | `#ff6b35` | Urgent / Important | DO IT NOW. Pulsing glow animation (`urgp`). |
| OVERDUE | Pure Red | `#ff3b3b` | OOPS column | Intentionally breaks isoluminance — visceral friction. Pulsing red glow (`redp`). |
| EVENT | Grey | `#888888` | — | Fixed-time event. `is_locked=1`. Size = duration. |

> **Design principle:** L0–L4 share the same perceived brightness (isoluminant). The hue carries the signal. Overdue red is the only intentional brightness break — it must feel alarming.

### Size Scale (Logarithmic Effort)

```
Formula: t = log(min/15) / log(480/15)
         px = 10 + clamp(t, 0, 1) × 24

15m  → 10px
30m  → 13px
1hr  → 16px
2hr  → 20px
4hr  → 25px
8hr  → 34px
```

Log scale: the first hour grows fastest. Deep work adds diminishing pixels. No single dot dominates the grid.

### Dot Animations

```css
/* L4 — pulsing urgent glow */
@keyframes urgp {
  0%,100% { box-shadow: 0 0 9px #ff6b35 }
  50%      { box-shadow: 0 0 20px #ff6b35, 0 0 28px rgba(255,107,53,.3) }
}

/* OVERDUE — pulsing red */
@keyframes redp {
  0%,100% { box-shadow: 0 0 10px #ff3b3b }
  50%      { box-shadow: 0 0 22px #ff3b3b, 0 0 32px rgba(255,59,59,.22) }
}
```

### Dot States (beyond L0–OVERDUE)

- **Recovery:** Task was overdue, then rescheduled. Renders as L4 Deep Orange even though no longer overdue. Shows "Recovery" badge in `TaskDetailPanel`. Persists until task is completed or user manually clears it.
- **Locked:** `is_locked=1` — cannot be dragged (events are always locked).
- **Pinned:** `is_pinned=1` — surfaced prominently in TodayView.
- **Subtask ring:** SVG arc overlay on dot showing sub-task completion ratio.
- **Note badge:** Small teal note icon at bottom-right corner of dot if ≥1 linked note exists.

---

## 4. Node / Group / Arc Hierarchy

### Structure

```
ARC (macro, multi-month)
  └── PROJECT (milestone within arc)
        └── TASK (node_type='task') — can have SUBTASKS
        └── EVENT (node_type='event', is_locked=1, fixed time)

TASK / EVENT (no project, no arc)
  — daily life tasks go here: errands, social, health

GROUPS (tags — SEPARATE from the arc hierarchy)
  — many-to-many with any TASK or EVENT
  — a task can have multiple groups simultaneously
  — adding first real group removes "ungrouped" automatically (trigger)
  — removing all groups re-adds "ungrouped" automatically (trigger)
```

### Relationship Table

| Relationship | Type | Required? | Implementation |
|---|---|---|---|
| Arc → Project | one-to-many | No | `arc_id` nullable on `projects` |
| Project → Task/Event | one-to-many | No | `project_id` nullable on `nodes` |
| Arc → Task/Event (direct) | one-to-many | No | `arc_id` nullable on `nodes` (new field) |
| Task → Sub-task | one-to-many | No | `parent_node_id` self-ref on `nodes` |
| Task/Event ↔ Group | **many-to-many** | No (auto "ungrouped") | `node_groups(node_id, group_id)` junction |

### Default Groups (seed data)

| id | name | color | is_daily_life | is_ungrouped |
|---|---|---|---|---|
| g-ungrouped | ungrouped | #444 | 0 | **1** |
| g-school | schoolwork | #3dbfbf | 0 | 0 |
| g-fgl | FGL internship | #4ade80 | 0 | 0 |
| g-grad | grad school prep | #f5c842 | 0 | 0 |
| g-errands | errands | #7ecfff | **1** | 0 |
| g-social | social | #c084fc | **1** | 0 |
| g-health | health | #f5a623 | **1** | 0 |

`is_daily_life=1` means these groups represent permanent life areas (not project-bearing). `is_ungrouped=1` must be exactly one row — this is the system auto-tag.

---

## 5. Architecture & Import Graph

### File Tree

```
src/plugins/PlannerPlugin/
├── PlannerPlugin.jsx          ← ROOT: registers views, mounts CommandPalette
├── views/
│   ├── TodayView.tsx
│   ├── CalendarView.tsx
│   ├── EisenhowerView.tsx
│   ├── FocusView.tsx
│   └── ArcView.tsx
├── components/
│   ├── DotNode.tsx
│   ├── DotCell.tsx
│   ├── TaskDetailPanel.tsx
│   ├── TaskForm.tsx
│   ├── ArcBar.tsx
│   ├── DensityBar.tsx
│   ├── ViewSwitcher.tsx
│   └── CommandPalette.tsx
├── store/
│   ├── usePlannerStore.ts      ← nodes, groups, arcs, projects state
│   ├── useViewStore.ts         ← activeView, focusContext
│   ├── useLogicEngine.ts       ← urgency rule runner
│   └── useDragStore.ts         ← drag ghost, active drag state
├── lib/
│   ├── plannerDb.ts            ← ALL SQLite access; no view queries DB directly
│   ├── logicEngine.ts          ← rule evaluation, suggestion scoring
│   ├── densityCalc.ts          ← daily capacity calculations
│   └── arcBuilder.ts           ← arc position math, congestion detection
└── types.ts                    ← TypeScript interfaces
```

### Import Direction Rules

- `PlannerPlugin.jsx` → all Views
- All Views → `DotNode`, `TaskDetailPanel`, `DensityBar`, `TaskForm`
- `EisenhowerView` → `DotCell`, `DensityBar`, `DotNode`
- `ArcView` → `ArcBar`
- `DotCell` → `DotNode`, `TaskForm`
- `DotNode` → `TaskDetailPanel`
- All Views + Components → `usePlannerStore`, `useViewStore`
- `usePlannerStore` → `plannerDb.ts`
- `useLogicEngine` → `logicEngine.ts`, `densityCalc.ts`
- `ArcView` → `arcBuilder.ts`
- `plannerDb.ts` → SQLite DB (via `@tauri-apps/plugin-sql`)

> **Critical rule:** No view ever queries SQLite directly. All DB access goes through `plannerDb.ts`.

### Zustand Stores

```ts
// usePlannerStore.ts
{
  nodes: PlannerNode[];
  groups: PlannerGroup[];
  arcs: Arc[];
  projects: Project[];
  db: Database | null;

  loadNodes: () => Promise<void>;
  createNode: (data) => Promise<void>;
  updateNode: (id, patch) => Promise<void>;
  deleteNode: (id) => Promise<void>;
  rescheduleNode: (id, newDate) => Promise<void>;
  completeNode: (id) => Promise<void>;
}

// useViewStore.ts
{
  activeView: 'today' | 'calendar' | 'eisenhower' | 'focus' | 'arc';
  setActiveView: (v) => void;
  focusContext: { type: 'arc'|'project'|'group'|'ungrouped', id: string } | null;
  setFocusContext: (ctx) => void;
}

// useDragStore.ts
{
  activeNodeId: string | null;
  ghostPosition: { x: number, y: number } | null;
  setActiveDrag: (id, pos) => void;
  clearDrag: () => void;
}
```

---

## 6. UI Tech Stack

### Component System

- **shadcn/UI** — Lyra style, Neutral base, `--radius: 0rem` (zero radius everywhere, system law)
- **Radix UI** primitives for Dialog, Tooltip, ContextMenu, Popover, Tabs, Toggle, Checkbox, AlertDialog
- **dnd-kit** for drag-and-drop (DotCell drop targets, CalendarView block dragging)
- **Pixelarticons V2** (`@nsmr/pixelart-react`) for all UI icons — 24×24, `currentColor`

### `components.json` (shadcn config)

```json
{
  "style": "new-york",
  "tailwind": {
    "baseColor": "neutral",
    "cssVariables": true
  },
  "rsc": false,
  "tsx": true
}
```

### `globals.css` additions (Lyra neutral theme + zero radius)

```css
@layer base {
  :root {
    --background:         0 0% 0%;      /* pure black */
    --foreground:         0 0% 100%;
    --card:               0 0% 3%;
    --card-foreground:    0 0% 95%;
    --border:             0 0% 9%;
    --input:              0 0% 9%;
    --muted:              0 0% 6%;
    --muted-foreground:   0 0% 35%;
    --accent:             168 100% 38%; /* teal */
    --accent-foreground:  0 0% 100%;
    --primary:            168 100% 38%;
    --primary-foreground: 0 0% 0%;
    --destructive:        0 84% 60%;
    --ring:               168 100% 38%;
    --radius:             0rem;         /* NO RADIUS — system law */
  }
}

/* Safety net: override any stray rounded classes */
* { border-radius: 0 !important; }
/* Exception: dots only */
.dot { border-radius: 50% !important; }
```

### Component Mapping

| UI Element | shadcn/Radix Component | Pixelarticons Icon | Notes |
|---|---|---|---|
| TaskForm modal | `Dialog` (Radix) | `Edit` | No overlay blur. `rounded-none` required. |
| Tooltip (dot hover) | `Tooltip` (Radix) | — | `side="bottom"` for Eisenhower cells + FLOAT tray. `sideOffset=6`. |
| Context menu (right-click) | `ContextMenu` (Radix) | `MoreHorizontal` | Edit · Delay · Add tag · Delete |
| CommandPalette | `Command` (cmdk/shadcn) | `Search` | Full-screen overlay. Custom `[[` note search mode. |
| View switcher tabs | `Tabs` (Radix) | Today:`Zap` Cal:`Calendar` Eis:`Grid` Focus:`Target` Arc:`TrendingUp` | Active = teal border-bottom |
| Group tag chips | `Badge` (shadcn) | `Tag` | Custom color per group inline style. Clickable. |
| TaskDetailPanel | `Popover` (Radix `HoverCard`) | `Info` | Width 280px. No arrow. |
| Date picker | `Calendar` + `Popover` | `CalendarDays` | Single-day. No rounded cells. |
| Importance dot selector | Custom | — | 5-dot row, click to select, uses `.dot` CSS |
| Subtask checkbox | `Checkbox` (Radix) | `Check` | Teal fill on checked. `rounded-none` override. |
| ArcForm | `Dialog` + `Input` + `Label` | `FolderOpen` | Date range: two `<input type="date">`. Arc color: swatch picker. |
| Filter toggles | `Toggle` (Radix) | `Filter` | Pressed = teal border + teal text. |
| Delete confirm | `AlertDialog` (Radix) | `Trash` | Archive vs Delete options. Destructive = red. |
| Drag ghost | Custom (dnd-kit) | — | `DotCell` + `DragOverlay` from dnd-kit. |

### Key Pixelarticons

```
Navigation:   Zap, Calendar, Grid, Target, TrendingUp, Command
Task Actions: Plus, Edit, Trash, Check, Clock, ArrowRight
Task Meta:    Tag, Link, AlarmClock, Timer, AlertTriangle, RefreshCw
Arcs:         FolderOpen, ChevronRight, ChevronDown, BarChart2, Filter, MoreHorizontal
Notes/Links:  FileText, Search, ExternalLink, Hash, GitBranch, BookOpen
System:       Moon, Sun, Cpu, Settings, Archive, X
```

---

## 7. Database Schema

> The plugin uses the existing app database (`oneash-DB.db`) via `setupDb()` in `src/lib/db.js`. Add new tables to the `schemaSql` string in `db.js` using `CREATE TABLE IF NOT EXISTS`. Do not create a separate DB.

### New Tables Required

#### `arcs`
```sql
CREATE TABLE IF NOT EXISTS arcs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color_hex   TEXT DEFAULT '#00c4a7',
    start_date  DATE,
    end_date    DATE,
    is_archived BOOLEAN DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `projects`
```sql
CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    arc_id      TEXT,                -- nullable: project can exist without arc
    name        TEXT NOT NULL,
    color_hex   TEXT,
    start_date  DATE,
    end_date    DATE,
    is_archived BOOLEAN DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(arc_id) REFERENCES arcs(id) ON DELETE SET NULL
);
```

#### `nodes` (Updated — replaces `todo_items` for Planner)
```sql
CREATE TABLE IF NOT EXISTS nodes (
    id                          TEXT PRIMARY KEY,
    project_id                  TEXT,         -- nullable
    arc_id                      TEXT,         -- NEW: direct arc membership (no project needed)
    -- group_id REMOVED — use node_groups junction instead
    title                       TEXT NOT NULL,
    description                 TEXT,
    node_type                   TEXT NOT NULL DEFAULT 'task'
                                    CHECK(node_type IN('task','event')),
    planned_start_at            DATETIME,
    due_at                      DATETIME,
    actual_completed_at         DATETIME,
    estimated_duration_minutes  INTEGER,
    actual_duration_minutes     INTEGER,
    importance_level            INTEGER NOT NULL DEFAULT 0
                                    CHECK(importance_level BETWEEN 0 AND 4),
    computed_urgency_level      INTEGER NOT NULL DEFAULT 0
                                    CHECK(computed_urgency_level BETWEEN 0 AND 4),
    is_completed                BOOLEAN DEFAULT 0,
    is_locked                   BOOLEAN DEFAULT 0,
    is_overdue                  BOOLEAN DEFAULT 0,
    is_recovery                 BOOLEAN DEFAULT 0,
    is_pinned                   BOOLEAN DEFAULT 0,
    recovery_set_at             TIMESTAMP,    -- when recovery state was set
    parent_node_id              TEXT,         -- self-ref for sub-tasks
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id)     REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY(arc_id)         REFERENCES arcs(id)     ON DELETE SET NULL,
    FOREIGN KEY(parent_node_id) REFERENCES nodes(id)    ON DELETE CASCADE
);

-- Auto-update timestamp
CREATE TRIGGER IF NOT EXISTS nodes_ts AFTER UPDATE ON nodes
BEGIN UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

-- Auto-assign 'ungrouped' on new node with no group
CREATE TRIGGER IF NOT EXISTS nodes_auto_ungrouped AFTER INSERT ON nodes
BEGIN
  INSERT INTO node_groups(node_id, group_id)
  SELECT NEW.id, id FROM planner_groups WHERE is_ungrouped = 1 LIMIT 1;
END;
```

#### `node_groups` (NEW — many-to-many junction)
```sql
CREATE TABLE IF NOT EXISTS node_groups (
    node_id   TEXT NOT NULL,
    group_id  TEXT NOT NULL,
    PRIMARY KEY(node_id, group_id),
    FOREIGN KEY(node_id)  REFERENCES nodes(id)           ON DELETE CASCADE,
    FOREIGN KEY(group_id) REFERENCES planner_groups(id)  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ng_node  ON node_groups(node_id);
CREATE INDEX IF NOT EXISTS idx_ng_group ON node_groups(group_id);

-- Remove 'ungrouped' when a real group is added
CREATE TRIGGER IF NOT EXISTS remove_ungrouped AFTER INSERT ON node_groups
BEGIN
  DELETE FROM node_groups
  WHERE node_id = NEW.node_id
    AND group_id = (SELECT id FROM planner_groups WHERE is_ungrouped=1)
    AND NEW.group_id != (SELECT id FROM planner_groups WHERE is_ungrouped=1);
END;

-- Re-add 'ungrouped' if last group is removed
CREATE TRIGGER IF NOT EXISTS readd_ungrouped_if_empty AFTER DELETE ON node_groups
BEGIN
  INSERT INTO node_groups(node_id, group_id)
  SELECT OLD.node_id, id FROM planner_groups
  WHERE is_ungrouped = 1
    AND NOT EXISTS (
      SELECT 1 FROM node_groups WHERE node_id = OLD.node_id
    );
END;
```

#### `planner_groups`
```sql
CREATE TABLE IF NOT EXISTS planner_groups (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    color_hex      TEXT DEFAULT '#64c8ff',
    icon           TEXT,
    sort_order     INTEGER DEFAULT 0,
    is_visible     BOOLEAN DEFAULT 1,
    is_daily_life  BOOLEAN DEFAULT 0,   -- true = life group (errands/social)
    is_ungrouped   BOOLEAN DEFAULT 0,   -- exactly one row = 1 (system auto-tag)
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed defaults:
INSERT OR IGNORE INTO planner_groups VALUES
  ('g-ungrouped', 'ungrouped',       '#444444', NULL, 99, 1, 0, 1, CURRENT_TIMESTAMP),
  ('g-school',    'schoolwork',      '#3dbfbf', NULL,  0, 1, 0, 0, CURRENT_TIMESTAMP),
  ('g-fgl',       'FGL internship',  '#4ade80', NULL,  1, 1, 0, 0, CURRENT_TIMESTAMP),
  ('g-grad',      'grad school prep','#f5c842', NULL,  2, 1, 0, 0, CURRENT_TIMESTAMP),
  ('g-errands',   'errands',         '#7ecfff', NULL,  3, 1, 1, 0, CURRENT_TIMESTAMP),
  ('g-social',    'social',          '#c084fc', NULL,  4, 1, 1, 0, CURRENT_TIMESTAMP),
  ('g-health',    'health',          '#f5a623', NULL,  5, 1, 1, 0, CURRENT_TIMESTAMP);
```

#### `sub_tasks`
```sql
CREATE TABLE IF NOT EXISTS sub_tasks (
    id          TEXT PRIMARY KEY,
    node_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT 0,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subtasks_node ON sub_tasks(node_id);
```

#### `productivity_logs`
```sql
CREATE TABLE IF NOT EXISTS productivity_logs (
    id              TEXT PRIMARY KEY,
    node_id         TEXT,
    completed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_actual INTEGER,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE SET NULL
);
```

#### `user_capacity`
```sql
CREATE TABLE IF NOT EXISTS user_capacity (
    id              TEXT PRIMARY KEY DEFAULT 'default',
    daily_minutes   INTEGER DEFAULT 480,   -- 8 hours
    peak_start      TEXT DEFAULT '09:00',
    peak_end        TEXT DEFAULT '12:00',
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO user_capacity VALUES('default', 480, '09:00', '12:00', CURRENT_TIMESTAMP);
```

#### `note_task_links` (Phase 3 — cross-plugin)
```sql
CREATE TABLE IF NOT EXISTS note_task_links (
    note_id    TEXT NOT NULL,    -- references notes(id)
    node_id    TEXT NOT NULL,    -- references nodes(id)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(note_id, node_id),
    FOREIGN KEY(note_id) REFERENCES notes(id)  ON DELETE CASCADE,
    FOREIGN KEY(node_id) REFERENCES nodes(id)  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ntl_note ON note_task_links(note_id);
CREATE INDEX IF NOT EXISTS idx_ntl_node ON note_task_links(node_id);
```

### Indexes to Add
```sql
CREATE INDEX IF NOT EXISTS idx_nodes_project    ON nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_nodes_arc        ON nodes(arc_id);
CREATE INDEX IF NOT EXISTS idx_nodes_due        ON nodes(due_at);
CREATE INDEX IF NOT EXISTS idx_nodes_planned    ON nodes(planned_start_at);
CREATE INDEX IF NOT EXISTS idx_nodes_completed  ON nodes(is_completed);
CREATE INDEX IF NOT EXISTS idx_nodes_overdue    ON nodes(is_overdue);
CREATE INDEX IF NOT EXISTS idx_nodes_parent     ON nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_projects_arc     ON projects(arc_id);
```

---

## 8. The Five Views

### 8.1 Today View (default)
**File:** `views/TodayView.tsx`
**Icon:** `Zap`

Three stacked sections:

**OVERDUE** — Red tinted rows. Sorted overdue-oldest first. Each row: checkbox, red dot, title, "N days overdue" label, effort chip, group tag. Background: `rgba(255,59,59,.03)`.

**TODAY** — All nodes where `planned_start_at = today` (tasks + events). Events show time range + "EVENT" label. Grey dot.

**SUGGESTIONS** — "Bring to today?" cards. Ranked by `scoreSuggestion()`. "+" button on each card calls `rescheduleNode(id, today)`. Only shown if score > 40 (or top 3 if none reach threshold).

**Header bar:** Shows date, overdue count badge (red), today task count (teal), suggestions count, capacity indicator (`4.75h / 8h`).

**Footer:** Total effort of today's tasks vs `user_capacity.daily_minutes`.

#### Suggestion Scoring Algorithm (`logicEngine.ts`)
```ts
export function scoreSuggestion(node: PlannerNode, today: Date): number {
  let score = 0;

  // Importance: L4=+40, L3=+24, L2=+16, L1=+8, L0=+4
  score += [4, 8, 16, 24, 40][node.importance_level] ?? 0;

  // Due date proximity
  if (node.due_at) {
    const daysLeft = (new Date(node.due_at).getTime() - today.getTime()) / 86400000;
    if (daysLeft <= 1)      score += 35;
    else if (daysLeft <= 3) score += 20;
    else if (daysLeft <= 7) score += 10;
  }

  // Recovery tasks — keep them visible
  if (node.is_recovery) score += 25;

  // Effort: quick wins get bonus, heavy lifts get penalty
  const hrs = (node.estimated_duration_minutes ?? 60) / 60;
  if (hrs <= 0.5)   score += 8;
  else if (hrs > 3) score -= 12;

  // In-progress subtasks — momentum signal
  if (node.sub_done > 0 && node.sub_done < node.sub_total) score += 10;

  return Math.max(0, score);
}

// CONFIGURABLE CONSTANTS in logicEngine.ts:
const SUGGESTION_THRESHOLD = 40;
const SUGGESTION_LIMIT = 3;
```

---

### 8.2 Calendar View
**File:** `views/CalendarView.tsx`
**Icon:** `Calendar`

**7-column week grid** where each column spans **4:00 AM → 4:00 AM next day** (24-hour range).

**Structure:**
- Header row: week range title (e.g. "MAR 9–15, 2026") + prev/today/next nav buttons.
- Day column headers: day name (MON/TUE/...) + date number. TODAY column is teal-tinted.
- **FLOAT tray row:** tasks with `planned_start_at` on that day but no specific time render here as mini dots with tooltip.
- **Time grid:** rows at 4am, 7am, 9am (★ peak, teal highlight band), noon, 3pm, 6pm, 9pm, midnight, 2am.
- **Night Owl Zone (00:00–04:00):** dark red tint.
- **Peak hours (from `user_capacity`):** soft teal highlight band.
- **Current time line:** Thin red line at exact current time in today's column.

**Events** render as solid colored time blocks at their exact datetime position. Height = duration. Click → edit.

**Tasks with time** render as smaller colored chips inside cells.

**Drag behavior:**
- Drag an event block to a new time → reschedule.
- Drag from FLOAT tray onto a time cell → assigns specific time.
- `mousedown + mousemove` on empty cell → creates new event with time range pre-filled.

**Pixel positioning:**
```ts
// 4am = 0px baseline. Each hour = configurable px (e.g. 60px).
const pixelFromTime = (datetime: Date, baseDate: Date) => {
  const fourAM = new Date(baseDate);
  fourAM.setHours(4, 0, 0, 0);
  return (datetime.getTime() - fourAM.getTime()) / 3600000 * PX_PER_HOUR;
};
```

---

### 8.3 Eisenhower View
**File:** `views/EisenhowerView.tsx`
**Icon:** `Grid`

**Grid:** Y-axis = Arcs and their Projects. X-axis = days (OOPS, TODAY, tomorrow, D+2 ... D+8).

**Y-axis rows:** Arc header rows (collapsible ▸) with Project sub-rows. Tasks without Arc/Project collected in a bottom "ungrouped" row.

**X-axis columns:**
- `OOPS` (leftmost, red tint) — overdue tasks appear here regardless of due date.
- `TODAY` (teal tint) — today's date.
- `D+1` through `D+8` — next 8 days.

**DensityBar:** 3px colored bar below each column header showing today's load vs capacity.
- Green < 60% | Amber 60–80% | Orange 80–100% | Red > 100%

**Dot interactions:**
- Hover → `TaskDetailPanel` popover.
- Right-click → ContextMenu (Edit, Delay, Add tag, Delete).
- Drag → reschedule to target day cell (`DotCell` as drop target).
- Double-click empty cell → `TaskForm` (pre-fills date + arc/project from row).

**Filter bar:** Arc/Project toggles. Also has "🔗 has note" toggle (Phase 3).

**Arc rows** are collapsible. Click ▸ to show/hide Project sub-rows.

---

### 8.4 Focus View
**File:** `views/FocusView.tsx`
**Icon:** `Target`

**Two-panel layout:**

**Left panel (context selector):**
- Arc → Project tree. Each arc row has expand arrow. Click to select.
- Progress bar per arc/project showing % tasks completed.
- Task count per item (e.g. "18t").
- Group tag chips below the tree (click to filter by group).
- "ungrouped" entry at bottom.

**Right panel (filtered list):**
- Header shows selected context name + task count + % done.
- List of tasks sorted: overdue DESC → urgency DESC → planned_start_at ASC.
- Each row: dot, title, due date label, effort chip.
- Completed tasks shown at 30% opacity with strikethrough.
- Expanding a task row shows subtasks inline.

**State:** Selected context stored in `useViewStore.focusContext`.

---

### 8.5 Arc View
**File:** `views/ArcView.tsx`
**Icon:** `TrendingUp`

**Macro timeline.** Parallel horizontal rows, one per Arc, spanning a 6-month window.

**Components:**
- **Arc bar** (wide): spans `arc.start_date` → `arc.end_date` as a % of the 6-month viewport.
- **Project sub-bars** (thin): rendered below the Arc bar at proportional positions.
- **Completion overlay**: left-filled portion of project sub-bar showing % tasks done.
- **NOW line**: vertical red line at today's exact position. Label "NOW" above. Recalculates on mount + midnight.
- **Congestion band**: amber/red shaded band where ≥2 Arc deadlines cluster within 21 days.

**Navigation:** Prev/next arrows shift window by 1 month. "today" button snaps back.

**Interactions:**
- Click Arc bar → FocusView filtered to that Arc.
- Click Project sub-bar → FocusView filtered to that Project.
- "＋ New Arc" header button → `ArcForm` modal.
- Hover Arc bar → "＋" button appears → `ProjectForm` pre-filled with `arc_id`.
- Right-click Arc bar → ContextMenu (Edit, Archive, Delete).

#### `arcBuilder.ts`
```ts
export function buildArcPositions(arcs: Arc[], windowStart: Date, windowEnd: Date): ArcPosition[] {
  const span = windowEnd.getTime() - windowStart.getTime();
  return arcs.map(arc => ({
    ...arc,
    leftPct:  Math.max(0, (new Date(arc.start_date).getTime() - windowStart.getTime()) / span * 100),
    widthPct: Math.min(100, (new Date(arc.end_date).getTime() - new Date(arc.start_date).getTime()) / span * 100),
    projects: arc.projects.map(p => ({
      ...p,
      leftPct:  Math.max(0, (new Date(p.start_date).getTime() - windowStart.getTime()) / span * 100),
      widthPct: Math.min(100, (new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / span * 100),
    }))
  }));
}

export function detectCongestion(arcs: Arc[]): CongestionBand[] {
  const WINDOW_MS = 21 * 86400000; // 21-day bucket
  const ends = arcs
    .filter(a => a.end_date)
    .map(a => new Date(a.end_date).getTime())
    .sort((a, b) => a - b);

  const bands: CongestionBand[] = [];
  let i = 0;
  while (i < ends.length) {
    const group = ends.filter(t => t - ends[i] <= WINDOW_MS);
    if (group.length >= 2) {
      bands.push({
        startMs:  ends[i] - WINDOW_MS / 2,
        endMs:    group[group.length - 1] + WINDOW_MS / 2,
        count:    group.length,
        severity: group.length >= 3 ? 'red' : 'amber'
      });
    }
    i += group.length;
  }
  return bands;
}
```

---

## 9. Logic Engine

**File:** `lib/logicEngine.ts`

Runs on load and every 30 minutes via `useLogicEngine` hook. Polls `plannerDb.ts`, applies rules, writes back to `nodes`.

### 5 Rules

| Rule | Trigger | Effect | Clears When |
|---|---|---|---|
| 1 · Urgency Escalation | Load + every 30min | Sets `computed_urgency_level=4` for tasks due ≤2d (L2: 2d, L3: 1d, L1: 2d) | Rescheduled past threshold |
| 2 · Overdue Detection | Load + midnight | Sets `is_overdue=1`. Dot turns pure red. Moves to OOPS column. | Rescheduled to future date |
| 3 · Red State Recovery | On drag-reschedule of overdue task | `is_recovery=1`, `recovery_set_at=now`. Dot stays L4 Deep Orange. Recovery badge shown. | Task completed OR user manually clicks "Clear recovery" in TaskDetailPanel |
| 4 · Density Score | Every create/update/reschedule | Computes `density_ratio` per day → DensityBar color (green/amber/orange/red) | Recalculated continuously |
| 5 · Delay Mechanic | Right-click → delay… | Blocks drop to overdue column (shake animation). Warns if target column >90% dense. Triggers Rule 3 if was overdue. | Drop confirmed on valid column |

> **Recovery UX note:** `is_recovery` persists until completion or manual clear. `TaskDetailPanel` shows: *"Recovery — rescheduled from overdue 3 days ago"* (uses `recovery_set_at` to compute the duration). This prevents alert fatigue while maintaining signal.

### `densityCalc.ts`

```ts
export function getDensityRatio(
  nodes: PlannerNode[],
  date: Date,
  capacityMinutes: number
): number {
  const dayTotal = nodes
    .filter(n => isSameDay(n.planned_start_at, date) && !n.is_completed)
    .reduce((sum, n) => sum + (n.estimated_duration_minutes ?? 0), 0);
  return dayTotal / capacityMinutes;
}

export function getDensityColor(ratio: number): string {
  if (ratio < 0.6)  return '#4ade80';   // green
  if (ratio < 0.8)  return '#f5a623';   // amber
  if (ratio < 1.0)  return '#ff6b35';   // orange
  return '#ff3b3b';                     // red — overloaded
}
```

---

## 10. Component Specs

### `DotNode.tsx`
Core visual primitive. Renders a single dot with optional overlays.

- `getDotSize(estimatedMinutes)` → px diameter (log scale formula)
- `getDotColor(importanceLevel, isOverdue, isRecovery)` → hex color
- `getDotAnimClass(urgencyLevel, isOverdue)` → animation class string
- SVG arc ring overlay if `sub_total > 0`: shows subtask completion ratio as a partial circle stroke
- Small `FileText` icon badge (bottom-right corner) if `linked_note_count > 0`
- `useDraggable` from dnd-kit — disabled if `is_locked=true`
- On hover → mounts `TaskDetailPanel` via Floating UI

### `DotCell.tsx`
Drop target for Eisenhower grid.

- `useDroppable` from dnd-kit
- Blocks drop to OOPS (overdue) column — shows shake animation on attempt
- Warns via tooltip if target column density > 90%
- Double-click → opens `TaskForm` with date + arc/project context pre-filled

### `TaskDetailPanel.tsx`
Hover popover. Width 280px. No arrow. `side="bottom"` default.

Content:
- Title, description
- Group chips (colored per group)
- Arc → Project breadcrumb chain (if applicable)
- Due date in "focus language": "TODAY", "tomorrow!", "3 days", "overdue 2d ago"
- Effort estimate chip
- Linked notes section: note title + first 50 chars of content. "＋ link note" button.
- **Recovery badge** (if `is_recovery=1`): "Recovery — rescheduled from overdue N days ago"
- Action row: `Done` · `Edit` · `Delay` · `Delete`

### `DensityBar.tsx`
Props: `{ totalMinutes: number, capacityMinutes: number }`

Renders a 3px bar with color from `getDensityColor(totalMinutes/capacityMinutes)`.

### `ArcBar.tsx`
Props: `{ arc, projects, windowStart, windowEnd, congestionBands }`

Renders one row of the Arc timeline. Uses % CSS positioning. Click handler navigates to FocusView.

### `ViewSwitcher.tsx`
5-tab row using Radix `Tabs`. Active tab = teal bottom border, no background fill.

```
[⚡ TODAY] [📅 CALENDAR] [⊞ EISENHOWER] [◎ FOCUS] [📈 ARC]
```

### `CommandPalette.tsx`
Global `Ctrl+K`. Full-screen overlay using `Command` (cmdk).

| Prefix | Mode |
|---|---|
| `+` | Fast create task |
| `/` | View switch: `/today` `/cal` `/eis` `/focus` `/arc` |
| `[[` | Note search mode (queries Notes DB) |
| bare text | Fuzzy search existing nodes |

---

## 11. TaskForm — Quick vs Project

**File:** `components/TaskForm.tsx`

Two modes toggled by QUICK / PROJECT buttons at top of form. Modal via Radix `Dialog`.

### QUICK Mode (default)

Fields:
- **TITLE** — text input. Placeholder: "e.g. buy groceries, meet Jisoo, tutoring session…"
- **GROUPS (tags)** — tag chip selector. All `planner_groups` shown. Click to toggle. "＋ new group" dashed chip at end.
- **WHEN** (optional) — date picker (Calendar + Popover)
- **EFFORT** — text/number input (e.g. "30 min", "2hr")
- **IMPORTANCE** — 5-dot row (click to select, L0–L4 using `.dot` CSS classes)
- **DESCRIPTION** (optional) — textarea. Placeholder shows `[[link to a note]]`. Typing `[[` triggers note-search dropdown (Phase 3).

Footer: Cancel / SAVE (teal border + `teal-d` background).

No Arc or Project required.

### PROJECT Mode

All QUICK fields, plus:
- **ARC / PROJECT section** (left-bordered teal block):
  - ARC dropdown (select existing arc)
  - PROJECT dropdown (optional, filtered to selected arc)
  - PLANNED DATE — date picker
  - DUE DATE — hard deadline date picker

SAVE button uses blue styling.

---

## 12. CRUD Operations

### Arc

| Action | Entry Point | Behavior |
|---|---|---|
| Create | Arc View "＋ New Arc" button | Opens `ArcForm` modal (name, color, start, end) |
| Edit | Click Arc bar → pencil in tooltip | `ArcForm` pre-filled |
| Archive | Right-click → Archive | Sets `is_archived=1`, hides from timeline, preserves data |
| Delete | Right-click → Delete → confirm | Sets `arc_id=NULL` on child projects + nodes (orphaned, not deleted) |

### Project

| Action | Entry Point |
|---|---|
| Create (Phase 2+) | Arc View → click arc's "＋" → `ProjectForm`. Or FocusView tree → "＋ project". |
| Create (Phase 1 workaround) | CommandPalette → "new project [name]". Or seed in `plannerDb.ts` during dev. |
| Edit | Click project sub-bar → pencil → `ProjectForm` |
| Delete | Right-click → Delete (soft-orphans nodes: `project_id=NULL`) |

### Planner Group

| Action | Entry Point |
|---|---|
| Create | TaskForm tag selector "＋ new group" chip. Or Settings → Manage Groups. |
| Edit | Group chip right-click → Edit. Or Settings. |
| Delete | Settings → Manage Groups. Removes all `node_groups` rows; nodes become ungrouped via trigger. |

Note: The `is_ungrouped` system group cannot be deleted or renamed.

### Task

| Action | Entry Points |
|---|---|
| Create | (1) Double-click empty Eisenhower cell → `TaskForm` (QUICK, pre-fills date/arc/project). (2) Ctrl+K → "＋ [title]" fast create. (3) Calendar FLOAT tray "＋" button. |
| Edit | Right-click dot → Edit. Or TaskDetailPanel pencil icon. |
| Complete | Click checkbox in any view → `is_completed=1`, `actual_completed_at=now`. Writes to `productivity_logs`. |
| Delete | Right-click → Delete → confirm. Cascades to `sub_tasks`, `node_groups`. |
| Drag reschedule | Drag dot to new Eisenhower cell. Ctrl+Z within 10s to undo. |

### Event

| Action | Entry Points |
|---|---|
| Create | (1) mousedown + drag on Calendar empty space → `EventForm` (time range pre-filled). (2) `TaskForm` with `node_type` toggle = EVENT. |
| Edit | Click event block → pencil → `EventForm` |
| Delete | Right-click event block → Delete |

Events are `is_locked=1` — cannot drag in Eisenhower. Cannot be "completed".

### Sub-task

| Action | Entry Point |
|---|---|
| Create | `TaskDetailPanel` → "＋ add subtask" inline. Or `TaskForm` sub-tasks section. |
| Complete | Checkbox in `TaskDetailPanel` or FocusView expanded row. Updates subtask arc ring immediately. |
| Delete | Row right-click → Delete. Or drag to trash icon. |

### Group Tag (assigning to a task)

| Action | Behavior |
|---|---|
| Add | TaskForm chip click. Or right-click dot → "Add tag" → tag picker popover. |
| Remove | Click "×" on selected chip in TaskForm or tag picker. |
| Auto behavior | Adding first real tag removes "ungrouped" (trigger). Removing all real tags re-adds "ungrouped" (trigger). Node always has at least one group. |

---

## 13. Note ↔ Task Link System

**Phase 3 feature.** Notes and Tasks share the same SQLite DB. Cross-plugin via `note_task_links` junction table.

### The 7 Surfaces

| Surface | Description |
|---|---|
| **TaskForm `[[` trigger** | Typing `[[` in description opens floating dropdown searching Notes DB by title. Selecting a note creates a `note_task_links` row. Renders as teal chip: `[[Cell Suspension Notes]]`. |
| **DotNode note badge** | When `linked_note_count ≥ 1`, small `FileText` icon at dot bottom-right. Hover shows count: "2 notes". Visible in all views. |
| **TaskDetailPanel linked notes** | "Linked Notes" section: note title + first 50 chars. Click note title → opens NotesPlugin at that note. "＋ link note" button inline. |
| **Note Editor linked tasks sidebar** | In NotesPlugin, collapsible "Linked Tasks" panel on right edge. Shows dot color chip, title, urgency, due date. Can mark complete from here. |
| **ForceGraph cross-plugin edges** | Gold dashed edges in NotesPlugin ForceGraph connecting note nodes to task nodes (smaller dots). |
| **CommandPalette `[[` search** | Typing `[[` in Ctrl+K switches to note-search mode. Selecting shows linked tasks as sub-items. |
| **Eisenhower "has note" filter** | Filter bar toggle: "🔗 has note" — shows only dots with ≥1 linked note. |

### `plannerDb.ts` Note Link Queries

```ts
export async function getLinkedNotes(db: Database, nodeId: string) {
  return db.select<LinkedNote[]>(`
    SELECT n.id, n.title, SUBSTR(n.content_text, 1, 80) AS preview, n.updated_at
    FROM   notes n
    JOIN   note_task_links l ON l.note_id = n.id
    WHERE  l.node_id = ?
    ORDER BY n.updated_at DESC
  `, [nodeId]);
}

export async function getLinkedTasks(db: Database, noteId: string) {
  return db.select<LinkedTask[]>(`
    SELECT nd.id, nd.title, nd.importance_level, nd.computed_urgency_level,
           nd.is_overdue, nd.due_at, nd.estimated_duration_minutes
    FROM   nodes nd
    JOIN   note_task_links l ON l.node_id = nd.id
    WHERE  l.note_id = ?
    ORDER BY nd.computed_urgency_level DESC, nd.due_at ASC
  `, [noteId]);
}

export async function linkNoteToTask(db: Database, noteId: string, nodeId: string) {
  await db.execute(
    'INSERT OR IGNORE INTO note_task_links(note_id, node_id) VALUES (?,?)',
    [noteId, nodeId]
  );
}
```

---

## 14. Design Guidelines

### Core Identity

Mycelium is not a productivity app that looks good — it is a workspace built by a researcher, photographer, traveller, programmer, archivist, and cartographer. Every visual decision must reflect that origin.

### Typography — Two Fonts Only

| Role | Font | Size Range |
|---|---|---|
| Display / Hero headings | VT323 | 3.5rem–7rem |
| Section headings, component names | VT323 | 1.2rem–2rem |
| Body text, labels, metadata | IBM Plex Mono 300 | 0.52rem–0.73rem |
| Code, hex values | IBM Plex Mono 400–500 | 0.61rem–0.72rem |
| Uppercase nav/badge labels | IBM Plex Mono 400 | 0.52rem–0.57rem, letter-spacing 1–3px |

No serif. No sans-serif. The monospace constraint enforces grid alignment and CRT terminal authenticity.

### Color System

| Token | Value | Use |
|---|---|---|
| `--teal` | `#00c4a7` | Primary accent — active states, headings, CTAs |
| `--blue` | `#64c8ff` | Secondary accent — file paths, L0 dot, UI badges |
| `--c2` (green) | `#4ade80` | L2 dot, success states, Phase 1 roadmap |
| `--yellow` | `#f5c842` | String literals, warnings, L3 zone |
| `--c4` (deep orange) | `#ff6b35` | L4 dot, urgent pulsing glow, new/warn badges |
| `--cr` (pure red) | `#ff3b3b` | **Overdue only** — intentional isoluminance break |
| `--purple` | `#c084fc` | Group tags, many-to-many relationships |
| `--ce` (grey) | `#888888` | Event dots, disabled/muted states |

### Transparency Layers

| Token | Value | Use |
|---|---|---|
| `--g1` | `rgba(255,255,255,.055)` | Card/surface fill |
| `--b1` | `rgba(255,255,255,.09)` | All borders |
| `--b2` | `rgba(255,255,255,.22)` | Hover border, active elements |
| `--t1` | `rgba(255,255,255,.35)` | Muted text — labels, metadata, placeholders |
| `--t2` | `rgba(255,255,255,.62)` | Body text |
| `--t3` | `rgba(255,255,255,.85)` | Near-full text — important body copy |

### 7 Design Rules

1. **Black ground, always.** Background is pure `#000000`. Never dark grey. Never navy.
2. **Glow is semantic, not decorative.** Box-shadow glows apply to dots only, and only to signal state. Never apply glow to text or structural chrome.
3. **No border-radius on structural elements.** Cards, panels, tables, code blocks — always `border-radius: 0`. Rounded is reserved for dots only (circle = task/event metaphor).
4. **Scanline overlay stays at `z-index: 9999`.** The `body::after` repeating-gradient scanline is global texture. Never remove it. Adjust colors instead.
5. **Icons: Pixelarticons only.** All UI icons use `@nsmr/pixelart-react`. No Font Awesome. No Heroicons. No mixed sets. 24px pixel-grid, flat geometric, brutalist.
6. **Animation is functional, not theatrical.** Transitions show state change only. Duration cap: 500ms for state changes, 9s for ambient background elements only.
7. **Text hierarchy through size + opacity, not weight.** Use font-size variation and `--t1/t2/t3` opacity scale. Bold (`font-weight: 500`) is reserved for emphasized values within body copy only.

### The Mycelium Test
> If you removed all color from the interface, would the information hierarchy still be perfectly readable from size, position, and contrast alone? If yes — the design is correct. Color should *reinforce* meaning, never *carry* it alone.

---

## 15. Build Roadmap

### Phase 1 · Foundation (build first)

- [ ] DB schema — all 8 tables + `node_groups` (add to `db.js` `schemaSql`)
- [ ] Seed `planner_groups` (7 defaults)
- [ ] Auto-ungrouped trigger + remove-ungrouped trigger + readd-ungrouped trigger
- [ ] `plannerDb.ts` — core CRUD + group queries
- [ ] `TodayView` — default landing (overdue + today sections)
- [ ] `TaskForm` — QUICK mode, group tag chip picker
- [ ] `DotNode` component (color + size + animation)
- [ ] `EisenhowerView` — basic grid + `DotCell`
- [ ] Logic Engine Rules 1 + 2 (urgency escalation + overdue detection)
- [ ] `ViewSwitcher` (5 tabs)
- [ ] Plugin registered in `registry.js` and `LaunchMenu.jsx`

> ⚠ Phase 1 workaround: seed Projects via `plannerDb.ts` directly until `ArcView` is built in Phase 2.

### Phase 2 · Intelligence

- [ ] Logic Engine Rules 3, 4, 5 (recovery, density, delay)
- [ ] `DensityBar` component
- [ ] Today Suggestions algorithm (`scoreSuggestion`)
- [ ] `CalendarView` — 4am–4am, FLOAT tray
- [ ] `CalendarView` — drag-to-create event
- [ ] `FocusView` — context selector tree + filtered list
- [ ] `TaskDetailPanel` hover popover
- [ ] Subtask arc SVG overlay on `DotNode`
- [ ] `ArcView` + `arcBuilder.ts`
- [ ] Arc + Project CRUD (`ArcForm`)
- [ ] `CommandPalette` Ctrl+K
- [ ] `TaskForm` PROJECT mode

### Phase 3 · Ecosystem

- [ ] `note_task_links` table (add to `db.js`)
- [ ] `[[` trigger in TaskForm description
- [ ] Note badge on `DotNode`
- [ ] Linked notes section in `TaskDetailPanel`
- [ ] Linked tasks sidebar in Note editor (modify `NotesPlugin`)
- [ ] ForceGraph gold cross-plugin edges (modify NotesPlugin graph)
- [ ] `productivity_logs` write on task complete
- [ ] Recurring tasks (RRULE)
- [ ] Vitals Sync — sleep data → capacity adjustment
- [ ] Lab Project Bridge (Arc auto-create from Lab protocol)
- [ ] Energy profile from `productivity_logs`
- [ ] AOT Planner mini widget (top 3 today tasks in always-on-top strip)

---

*Blueprint v4 · Built from mycelium-blueprint-v4.html + O_neash codebase analysis*
*5 Views · 8+ DB Tables · 5 Logic Rules · 3 Build Phases*
