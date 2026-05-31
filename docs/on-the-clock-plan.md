# On the Clock — Feature Plan

## Concept

A work session planner and recorder integrated into the Planner plugin. Sessions are assembled in advance or on the fly, manually started and ended, and tied to a physical location. The feature records what was worked on, how long each task took, and logs pomodoro cycles. Sessions appear as blocks on the weekly calendar.

---

## Surfaces

### 1. Right AOT Panel
Always-on-top panel triggered by hovering the right screen edge. Has two states.

**Idle state (no active/paused session):**
- List of today's planned sessions (each shows: auto-title, location name, node count)
- "Start" button per planned session
- "Start unplanned session" button → prompts location selection from managed list
- All start buttons are disabled if any session is active or paused

**Active state (session running):**
- Session header: auto-title, location name
- Total session timer (counts up, freezes while paused)
- Pomodoro timer (25:00 counting down, shows current interval type)
- Pomodoro progress: 4-dot indicator showing completed work blocks in current cycle
- **Pause / Resume** button
- **End Session** button — only accessible when session is NOT paused
- Node queue (see Node States section)
- "Add node" button — opens date-ordered node browser (only when not paused)

**Paused state:**
- All node actions locked
- "Add node" locked
- "End Session" hidden/disabled
- Only **Resume** is actionable
- Pomo break can be ended early via Resume (actual break duration is logged)

---

### 2. On the Clock — Planner Menu Item
Single unified view. Menu icon: pixelarticons `Clock`.

**Layout:**
- Top section: session builder
  - Location picker (managed list)
  - Planned date picker
  - Node assembly (date-ordered node browser, draggable to reorder)
  - "Save as planned" button
- Main section: session log / archive
  - Sessions in reverse chronological order
  - Each entry shows: auto-title, location, date, actual start → end, total net time, node list with per-node time
  - Status badge: planned / active / paused / completed / interrupted

---

### 3. Today View (Planner)
- Planned sessions appear in the task list with distinct visual treatment (different from task nodes)
- Nodes currently assigned to an active session are shown as **"within current session"** — non-interactive, cannot be clicked or edited from the Today view
- Nodes can be removed from the session only from within the AOT panel
- Weekly calendar shows session blocks using actual `start → end` times only (planned sessions with no actual_start are not shown on the calendar)

---

## Session Lifecycle

```
planned → active → paused → active → completed
                                   → interrupted
```

### Creating a Session
- From: Today view or On the Clock menu item
- Required: location (from managed list), planned date
- Optional: pre-assembled node list
- Session can start with zero nodes (nodes added on the fly)
- Status: `planned`

### Starting a Session
- Initiated from the AOT right panel
- Planned session: click "Start" → session begins immediately
- Unplanned session: click "Start unplanned" → location selection prompt → session begins
- `actual_start` recorded, status → `active`
- Pomo timer starts at 25:00
- Any already-completed nodes pre-assigned to the session are filtered out at start time

### Pausing a Session
- Manual pause: status → `paused`, pause record created (`pause_type: manual`)
- Pomo break (auto): after each 25-min work block → session pauses (`pause_type: pomo_short`), pomo block ends, break block begins
- Long break (after 4 work blocks): popup prompts user for duration (15–30 min) → session pauses (`pause_type: pomo_long`)
- While paused: no node actions, no end session, only Resume is available

### Resuming a Session
- User clicks Resume
- `resumed_at` set on the pause record
- Pomo timer resumes from where it left off
- Status → `active`
- If resumed from a pomo break: `ended_at` set on pomo block record, actual break duration logged (even if 0)

### Ending a Session (Clean)
- All nodes are done → user clicks "End Session"
- `actual_end` recorded, status → `completed`
- No dialog shown
- Calendar block rendered from `actual_start` to `actual_end`

### Ending a Session (Force-Stop)
- User clicks "End Session" with unfinished nodes (queued or in-progress)
- Dialog appears with options:

**Option A — Carry over**
- In-progress nodes: status → `incomplete`, `time_finished` = now, `total_minutes` calculated (minus pause time)
- Queued nodes: removed from session, become regular orphan planner nodes
- Session status → `interrupted`

**Option B — Move to session**
- All unfinished nodes (in-progress + queued) moved to a chosen existing planned session
- If no planned sessions exist: falls back silently to orphan (same as Carry over for queued)
- In-progress nodes from this session: `time_finished` = now, `total_minutes` calculated, status → `incomplete` in current session; re-added as `queued` in target session
- Appended to end of target session's sort order
- Session status → `interrupted`

**Option C — Mark all done**
- All nodes (in-progress + queued) force-completed
- `time_finished` = now for in-progress, `total_minutes` calculated
- Queued nodes: `time_started` = `time_finished` = now, `total_minutes` = 0
- All nodes marked done in the Planner (`actual_completed_at` set)
- Session status → `completed`
- Confirmation prompt before executing

**Option D — Cancel**
- Return to session, nothing changes

---

## Node Behaviour

### States
```
queued → in_progress → done
                     → incomplete
```

### Rules
- Multiple nodes can be in-progress simultaneously
- In-progress nodes: can only be marked done or moved back to queued
- In-progress nodes cannot be reordered — only queued nodes are draggable
- Done nodes are immovable and locked
- When a node is marked done via session → `actual_completed_at` set in the `nodes` table (marks complete in Planner)

### Adding Nodes
- Pre-session: assembled in the On the Clock builder or Today view
- Mid-session: via "Add node" in AOT panel (only when not paused)
- Browser: date-ordered list of all planner nodes, separated by date header
- Already-in-session nodes excluded from browser
- Already-completed nodes excluded from browser

### Nodes in Planner While Session Active
- Nodes assigned to current session appear as "within current session" in Today/Planner views
- Non-interactive from Planner — all actions disabled
- Can be removed from the session only via the AOT panel
- Removal returns them to regular planner nodes

### Time Calculation
Net time per node (excluding all pause durations that overlap the node's active period):

```
total_minutes = (time_finished − time_started) − Σ(overlapping pause durations)
```

Since nothing can be done while paused, a node's `time_started` always precedes any pause that falls within its active window. Pause overlap is computed by cross-referencing `session_pauses` for the session.

---

## Pomodoro Timer

### Cycle
```
[25 min work] → [5 min short break] → repeat ×4 → [15–30 min long break] → reset cycle
```

### Behaviour
- Runs per session, starts when session starts
- Freezes when session is paused (manual or break)
- After each 25-min work block: session auto-pauses, pomo short break begins
  - User can skip break at any time → Resume ends the break early, actual duration logged
- After 4 work blocks: popup prompts user for long break duration (15–30 min)
  - User can skip the popup → 0 min logged
  - Long break also skippable mid-break → Resume ends it early, actual duration logged
- Pomo cycle resets after long break completes (or is skipped)

### Logging
- Every pomo break writes to both:
  - `session_pauses` (for accurate session/node time calculation)
  - `session_pomo_blocks` (for future analytics)
- `ended_at` on a pomo block = the moment the break ends or is skipped

---

## Data Model

```sql
-- Managed locations (user-built list)
work_locations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT DEFAULT (datetime('now'))
)

-- Sessions
work_sessions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,        -- auto-generated: YYYYMMDD-[location-slug], -01/-02 suffix if duplicate
  location_id  TEXT REFERENCES work_locations(id),
  planned_date TEXT NOT NULL,        -- YYYY-MM-DD
  actual_start TEXT,                 -- ISO datetime, null until started
  actual_end   TEXT,                 -- ISO datetime, null until ended
  status       TEXT NOT NULL DEFAULT 'planned',
                                     -- planned | active | paused | completed | interrupted
  created_at   TEXT DEFAULT (datetime('now'))
)

-- Nodes within a session
session_nodes (
  session_id    TEXT    NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  node_id       TEXT    NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'queued',
                                  -- queued | in_progress | done | incomplete
  time_started  TEXT,             -- ISO datetime
  time_finished TEXT,             -- ISO datetime
  total_minutes REAL,             -- net minutes (wall time minus overlapping pauses)
  PRIMARY KEY (session_id, node_id)
)

-- Pause intervals (manual + pomo breaks)
session_pauses (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  paused_at   TEXT NOT NULL,     -- ISO datetime
  resumed_at  TEXT,              -- ISO datetime, null if currently paused
  pause_type  TEXT NOT NULL DEFAULT 'manual'
                                 -- manual | pomo_short | pomo_long
)

-- Pomodoro block log (for analytics)
session_pomo_blocks (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,              -- ISO datetime (set on completion or skip)
  block_type  TEXT NOT NULL      -- work | short_break | long_break
)
```

---

## Session Title Generation

Format: `YYYYMMDD-[location-slug]`
- Location slug: lowercase, spaces → hyphens (e.g., "Main Library" → `main-library`)
- On duplicate (same date + location): append `-01`, `-02`, etc.
- Example: `20260525-home`, `20260525-home-01`, `20260525-home-02`
- Generated at session creation time, stored in DB

---

## UI / Interaction Rules Summary

| Condition | End Session | Pause | Node Actions | Add Node |
|---|---|---|---|---|
| Session active | ✓ | ✓ | ✓ | ✓ |
| Session paused (manual) | ✗ | Resume only | ✗ | ✗ |
| Session paused (pomo break) | ✗ | Resume (skips break) | ✗ | ✗ |
| No active session | — | — | — | — |

---

## Analytics (Future)
Deferred. Data model is designed to support: total hours per day/week, completion rates, time per project/arc, session streaks, pomo adherence, break duration patterns.
