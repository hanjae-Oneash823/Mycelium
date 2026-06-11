# Mycelium
<div align="center">
<img width="70%" alt="image" src="https://github.com/user-attachments/assets/629719a4-f7f5-432b-aeb6-db5b4c9140ec" />
</div>

> A personal operating system. Local-first, terminal-aesthetic, built for people who think in systems.

Mycelium is a native desktop application built on Tauri and React. It replaces the scattered constellation of productivity apps, note-taking tools, trackers, and planners with a single, unified environment that lives entirely on your machine. No subscriptions. No sync accounts. No cloud. One SQLite file.
<div align="center">
<img width="80%" alt="image" src="https://github.com/user-attachments/assets/91c616c9-261e-41c4-97cf-07d40b902cd8" />
</div>

---

## Philosophy

### 1. Everything is local
All data lives in a single SQLite database at `~/Documents/O-neash-data/oneash-DB.db`. Nothing leaves your machine. You own the file, you own the schema, you own the history. If you want to query your own task data in a terminal, you can — it's just SQL.

### 2. Structure before speed
Most productivity apps optimize for fast capture and abandon structure. Mycelium inverts this. Work is organized into a three-tier hierarchy:

```
Arcs  →  Projects  →  Nodes
```

**Arcs** are long-horizon goals — semester plans, research initiatives, career bets. **Projects** are bounded work units under an arc. **Nodes** are individual tasks or events. This hierarchy isn't bureaucracy; it's the map that makes the territory legible. When you know which arc a task belongs to, you know *why* you're doing it.

### 3. Time is multidimensional
A task has at least four time coordinates: when you *plan* to work on it (`planned_start_at`), when it's *due* (`due_at`), how long you *think* it takes (`estimated_duration_minutes`), and how long it *actually* took (`actual_duration_minutes`). Most apps collapse these into a single date. Mycelium keeps them separate because the gap between estimated and actual time is where you learn about yourself.

### 4. Visual weight encodes meaning
In the planner's dot view, **a node is a circle**. Its size encodes effort. Its color encodes urgency — computed from importance level and deadline proximity, not manually set. The goal is a view where the shape of your workload is immediately visible without reading a word.

| Color | Meaning |
|---|---|
| Teal `#00c4a7` | Task — low urgency |
| Green `#4ade80` | Task — important, not urgent |
| Amber `#f5c842` | Assignment — deadline approaching |
| Orange `#ff6b35` | Assignment — important, deadline close |
| Red `#ff3b3b` | Overdue |

### 5. The aesthetic is intentional
Mycelium uses a strict monospace design language: VT323 and HBIOS-SYS fonts, sharp corners, high-contrast dark backgrounds, amber and teal accents. This is not nostalgia. Terminal aesthetics communicate density and precision. They signal that this is a tool for working, not a dashboard for feeling productive about productivity.

### 6. Modules, not monoliths
Each feature is an isolated plugin. The home screen is a launcher that switches between plugins. Plugins share a database but own their own schema tables, state, and UI. Adding a new capability means adding a new plugin — not touching the core.

---

## Who It's For

Mycelium is designed for **one specific type of person**: someone juggling multiple long-horizon projects simultaneously — academic, creative, and professional — who needs a single environment to plan, track, and understand all of them.

Concretely: graduate students, researchers, independent creatives, and knowledge workers who:

- Work across multiple concurrent projects with different deadlines and rhythms
- Keep notes and documentation alongside their planning, not in a separate app
- Prefer explicit structure over "just write it down anywhere"
- Are comfortable with (or attracted to) dense, information-rich interfaces
- Want to own their data

Mycelium is **not** for casual to-do use. The Arc → Project → Node structure has intentional friction — it asks you to categorize before you capture. If you want a quick inbox, use a notepad. Mycelium is for the phase after that: when you have enough work that you need to understand it at a systems level.

---

## Features

### BASIC
| Plugin | Description |
|---|---|
| **Planner** | Core task and project management. Today view with drag-and-drop scheduling, Eisenhower matrix, routine management, On The Clock focus timer with session tracking |
| **Notes** | Rich-text document editor with wiki-link backlinks, inline comments, note groups, and KaTeX math support |
| **Arcs & Projects** | Top-level goal management — arc timelines, project grouping, completion tracking |
| **Journal** | Daily log entries with image attachment support |

### The Lab
| Plugin | Description |
|---|---|
| **Academic Planner** | Subject-scoped planning with a canvas view — a day-band timeline where task nodes drag between dates, support for dependency edges, multi-canvas overview, weekly completion analytics |
| **L'ESRA** | Encyclopedia of Relative and Absolute knowledge — a personal knowledge base with bookshelf, search, entries, articles, and a force-directed network view of concept relationships |

### The Clinic
| Plugin | Description |
|---|---|
| **Habits** | Daily and weekly habit tracking with streak analytics and goal logging |
| **Sleep Tracker** | Sleep entry logging with configurable targets and historical analysis |

### The Studio
| Plugin | Description |
|---|---|
| **Geo Portal** | Location-based travel log and bucket list with MapLibre GL map visualization |

### Home Widgets
The home screen hosts configurable widgets: daily task summary, day/night arc, sleep-last-night readout, recent documents, pressure gauge, and a set of cellular automata simulations (Conway's Life, Brian's Brain, Langton's Ant, Wireworld, CodiCA).

---

## Architecture

### Overview

```
┌──────────────────────────────────────────────────────┐
│                    Tauri Shell (Rust)                 │
│  - Window management                                 │
│  - File system access                                │
│  - SQLite via tauri-plugin-sql                       │
│  - PDF export via WebKit/AppKit (macOS)              │
└───────────────────┬──────────────────────────────────┘
                    │  IPC bridge
┌───────────────────▼──────────────────────────────────┐
│               React Frontend (TypeScript)            │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Plugin     │  │  Home /      │  │  Always-    │ │
│  │  System     │  │  LaunchMenu  │  │  Visible    │ │
│  └──────┬──────┘  └──────────────┘  │  Layer      │ │
│         │                           └─────────────┘ │
│  ┌──────▼──────────────────────────────────────────┐ │
│  │               Plugins                           │ │
│  │  Planner │ Notes │ Journal │ Academic │ ESRA    │ │
│  │  Habits  │ Sleep │ Geo     │ Projects │ ...     │ │
│  └──────────────────────────────────────────────────┘ │
│                                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │           Shared DB Layer (src/lib/db.ts)        │ │
│  │  SQLite schema migration on startup              │ │
│  │  getDb() singleton — typed select/execute        │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Directory Structure

```
O_neash Dash/
├── src/
│   ├── always-visible/        # Persistent UI layer (AOT elements, navigator)
│   ├── components/ui/         # Shared Radix-based primitives
│   ├── home/                  # LaunchMenu, HomePage, category definitions
│   ├── lib/
│   │   └── db.ts              # SQLite singleton, full schema, migration logic
│   ├── plugins/
│   │   ├── AcademicPlugin/
│   │   ├── ClockPlugin/
│   │   ├── ESRAPlugin/
│   │   ├── GeoPortalViewPlugin/
│   │   ├── HabitsPlugin/
│   │   ├── JournalPlugin/
│   │   ├── NotesPlugin/
│   │   ├── PlannerPlugin/
│   │   ├── ProjectsPlugin/
│   │   ├── SettingsPlugin/
│   │   ├── SleepTrackerPlugin/
│   │   └── registry.ts        # Plugin manifest
│   ├── store/                 # Global Zustand stores (plugin, widget state)
│   ├── types/                 # Shared TypeScript interfaces
│   └── widgets/               # Home screen widget components
├── src-tauri/
│   ├── src/
│   │   ├── main.rs            # Tauri entry point
│   │   └── lib.rs             # Plugin setup, DB directory creation
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # App config (window, permissions, SQL)
```

### Database

The entire application state lives in one SQLite file. The schema is applied at startup via a `CREATE TABLE IF NOT EXISTS` migration block in `src/lib/db.ts` — no migration tooling required, columns are added with `ALTER TABLE` guards.

Key tables:

| Table | Owns |
|---|---|
| `arcs` | Long-horizon goal containers |
| `projects` | Work units under arcs |
| `nodes` | Tasks and events (the universal work unit) |
| `sub_tasks` | Checklist items within nodes |
| `tendril_edges` | Dependency graph between nodes |
| `routines / routine_rules` | Recurring task definitions |
| `notes / note_links` | Rich documents with backlinks |
| `planner_groups / node_groups` | Many-to-many node tagging |
| `habits / habit_logs` | Habit definitions and daily completions |
| `sleep_entries` | Sleep session records |
| `academic_subjects` | Projects designated as academic subjects |
| `academic_canvases` | Per-subject planning canvases |
| `academic_canvas_nodes` | Node placements on canvas (day, x_slot) |
| `academic_canvas_edges` | Dependency arrows on canvas |
| `work_sessions / productivity_logs` | On The Clock focus sessions |
| `journal_entries` | Daily log records |

### State Management

Each plugin manages its own state. The Planner uses two Zustand stores:

- `usePlannerStore` — node/arc/project data and all DB mutations
- `useViewStore` — UI state (active view, open forms, edit context)

Global stores:

- `usePluginStore` — which plugin is currently active
- `useWidgetStore` — home widget configuration

### Frontend Stack

| Concern | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS + inline styles |
| Primitives | Radix UI (dialog, select, popover, checkbox, slider) |
| Animations | Framer Motion |
| State | Zustand |
| Charts | Recharts |
| Rich text | Tiptap with KaTeX, highlight, code blocks, tasks |
| Maps | MapLibre GL + react-map-gl + PMTiles |
| Graph/canvas | XYFlow (React Flow) |
| Drag-and-drop | dnd-kit + custom mouse-event implementations |
| Icons | Pixelarticons |
| Toasts | Sonner |

### Backend (Tauri / Rust)

The Rust layer is intentionally thin. It handles:

- **Window management** — fullscreen, single-window
- **SQLite** — via `tauri-plugin-sql`, configured to load the database at a user-specific path
- **File system** — creating the `~/Documents/O-neash-data/` directory on first launch
- **PDF export** — macOS-only: uses `objc2-app-kit` and `objc2-web-kit` to print a `WKWebView` to PDF

The frontend does all business logic. The Rust layer has no awareness of schema or data shape.

### Plugin Structure

Each plugin follows a consistent pattern:

```
PluginName/
├── PluginName.tsx         # Root component, data loading, top-level state
├── PluginName.css         # Plugin-scoped styles
├── lib/
│   └── pluginDb.ts        # All SQL queries for this plugin
├── store/
│   └── usePluginStore.ts  # Zustand store (if needed)
├── components/            # Shared sub-components
├── views/                 # Full-page view components
└── types.ts               # Plugin-local TypeScript types
```

---

## Running Locally

**Prerequisites:** Node.js ≥ 20, Rust (stable), pnpm

```bash
# Install dependencies
pnpm install

# Development (hot reload)
pnpm tauri dev

# Production build
pnpm tauri build
```

The app runs fullscreen. The SQLite database is created automatically at first launch in `~/Documents/O-neash-data/oneash-DB.db`.

---

## Roadmap

### Phase 1 — Core ✓
Planner, Notes, Journal, Arcs & Projects. The foundational loop: capture → organize → review.

### Phase 2 — Knowledge & Study ✓ / in progress
Academic Planner with canvas view and multi-subject tracking. L'ESRA knowledge base with network view. These form the "lab" — tools for structured learning and research.

### Phase 3 — Health & Routine ✓ / in progress
Habits tracker, Sleep Tracker. The clinic modules: understanding the physical inputs that affect cognitive output.

### Phase 4 — Studio (next)
- **Film Neg Lab** — photo archive and analog film log
- **Open Canvas** — freeform moodboard / inspiration board
- **Geo Portal** — expand travel log with richer entry types and offline maps

### Phase 5 — Lab Extensions (planned)
- **Protocol Manager** — experimental protocol archive for structured research workflows
- **Paper Library** — academic paper database with RSS feed ingestion and citation management
- **Diet Log** — meal planning and nutritional tracking

### Phase 6 — System Layer (planned)
- **System Resource Monitor** — embedded system stats panel
- Inter-plugin cross-references (link a note to a node, link a journal entry to a project)
- Import/export to standard formats (Markdown, CSV, iCal)
- Configurable widget layout with drag-to-reorder

---

## Name

The name comes from the biological structure that inspired the app's architecture: mycelium — the underground fungal network that connects and feeds individual organisms without centralizing control. Each plugin is an organism. The shared database is the network. Nothing is in the cloud because the network is local, by design.
