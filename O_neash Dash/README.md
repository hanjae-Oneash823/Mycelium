# O_neash Dash

O_neash Dash is a modular, extensible desktop productivity suite built with React and Tauri. It features a unique homepage "bloom" navigation, always-on-top elements, and a plugin system for research, journaling, mapping, and health tracking.

## Features

- **Homepage Bloom Navigation:** Visual, radial menu for quick access to all major modules.
- **AOT (Always-On-Top) Elements:** Fluid peek boxes for scratchpad, to-do list, and quick navigation.
- **Plugin System:** Easily extend the app with new features. Core plugins include:
  - **Terminal:** Search launcher, notes, to-do list, journal, settings, and system resource monitor.
  - **Lab:** Paper library/RSS feed, protocol manager, project timelines, and academic planner.
  - **Darkroom:** GeoPortalView (interactive map and posts), Film Neg Lab, and Canvas for archiving photos.
  - **Vitals:** Habits and health tracker, sleep tracker, and diet log.
- **Pomodoro Timer & Calculator:** Quick access tools for productivity.

## Core Plugins

- **Scratchpad & Notes:** Take quick notes and organize them into groups.
- **To-Do List:** Eisenhower matrix, combines todos from all apps.
- **Journal:** Write daily journals.
- **GeoPortalView:** Interactive map with custom tiles and post archiving.
- **Projects & Academic Planner:** Manage research projects, protocols, and study plans.
- **Health Trackers:** Log habits, sleep, and diet with analytics.

## Tech Stack

- **Frontend:** React, Tailwind CSS, Framer Motion, Zustand, Radix UI, MapLibre GL, Leaflet
- **Backend:** Tauri (Rust), SQLite (via Tauri plugin)
- **Other:** PMTiles for map tiles, modular plugin architecture

## Getting Started

1. Clone the repository
2. Install dependencies with your preferred package manager (pnpm, npm, yarn)
3. Run the development server:
   ```sh
   pnpm dev
   # or
   npm run dev
   ```
4. For the desktop app, use:
   ```sh
   pnpm tauri
   # or
   npm run tauri
   ```

## Project Structure

- `src/` - Main React source code and plugins
  - `always-visible/` - Always-on-top UI elements
  - `plugins/` - Modular plugins (Clock, GeoPortalView, Notes, etc.)
  - `home/` - Homepage and launch menu
  - `lib/` - Utilities and database setup
  - `components/` - UI components
  - `store/` - Zustand state management
- `public/` - Static assets and map tiles
- `src-tauri/` - Tauri backend (Rust)
- `index.html` - App entry point

## Example UI

![Homepage Bloom Navigation](screenshot.png) <!-- Replace with your actual screenshot path -->

## License

Specify your license here.
