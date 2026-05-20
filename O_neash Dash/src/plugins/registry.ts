import NotesPlugin from "./NotesPlugin/NotesPlugin";
import GeoPortalViewPlugin from "./GeoPortalViewPlugin/GeoPortalView";
import PlannerPlugin from "./PlannerPlugin/PlannerPlugin";
import SettingsPlugin from "./SettingsPlugin/SettingsPlugin";
import SleepTrackerPlugin from "./SleepTrackerPlugin/SleepTrackerPlugin";
import ESRAPlugin from "./ESRAPlugin/ESRAPlugin";
import DispatchPlugin from "./DispatchPlugin/DispatchPlugin";
import HabitsPlugin from "./HabitsPlugin/HabitsPlugin";
import JournalPlugin from "./JournalPlugin/JournalPlugin";
import type { PluginItem } from "@/types";

export const plugins: PluginItem[] = [
  { id: "notes",        name: "Notes",        component: NotesPlugin         },
  { id: "geo-portal",   name: "Geo Portal",   component: GeoPortalViewPlugin },
  { id: "planner",      name: "Planner",      component: PlannerPlugin        },
  { id: "dispatch",     name: "Dispatch",     component: DispatchPlugin       },
  { id: "settings",     name: "Settings",     component: SettingsPlugin       },
  { id: "sleep-tracker",name: "Sleep Tracker",component: SleepTrackerPlugin, section: "the clinic" },
  { id: "esra",         name: "L'ESRA",       component: ESRAPlugin,          section: "the lab"   },
  { id: "habits",       name: "Habits",       component: HabitsPlugin,        section: "the clinic"},
  { id: "journal",      name: "Journal",      component: JournalPlugin        },
];
