# O_neash — App Overview

A personal life-management desktop app built on Tauri. All data is stored locally in a single SQLite file (`~/Documents/O-neash-data/oneash-DB.db`). The UI is a plugin system — each feature lives in its own plugin panel launched from a home menu.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS, custom monospace aesthetic (VT323 / HBIOS-SYS fonts) |
| Database | SQLite via Tauri plugin |
| Charts | Recharts |
| Rich text | TipTap (with KaTeX math support) |
| Graph / canvas | XYFlow |
| Maps | MapLibre GL |
| State | Zustand |

---

## Plugins

### Planner
Task and project management. Tasks live inside **projects**, which are grouped under long-term **arcs**. Supports sub-tasks, routines, routine rules, dependency edges (tendril edges), and capacity planning. Today view shows a timeline with drag-and-drop scheduling.

### Academic Planner
Subject-scoped planning with a **Canvas View** — a day-band timeline where task nodes can be dragged between dates to reschedule. Supports dependency edges between canvas nodes, weekly completion charts, and a timetable view.

### Notes
Document-style notes with wiki-link backlinks, inline comments, note groups, and rich TipTap editing.

### Journal
Daily journal entries with image attachment support.

### Habits
Daily and weekly habit tracking with streak and goal logging.

### Sleep Tracker
Sleep entry logging with configurable targets and history view.

### Geo Portal
Location-based feature with MapLibre GL map visualization.

### Projects / Arcs
Top-level arc and project browser with status tracking.

### ESRA
Lab / experimental plugin.

### Settings
App-level configuration.

---

## Database Schema (key tables)

```
arcs                        — long-term goals
projects                    — grouped under arcs
nodes                       — tasks and events (planned_start_at, due_at, node_type)
sub_tasks                   — children of nodes
tendril_edges               — dependency graph between nodes
routines / routine_rules    — recurring task definitions
notes / note_links          — rich documents with backlinks
doc_comments                — inline note comments
habits / habit_logs         — habit definitions and daily logs
sleep_entries / targets     — sleep tracking
academic_subjects           — subjects tied to projects
academic_canvases           — per-subject planning canvases
academic_canvas_nodes       — node placements (day, x_slot)
academic_canvas_edges       — dependency edges on canvas
planner_groups / node_groups
productivity_logs
```
