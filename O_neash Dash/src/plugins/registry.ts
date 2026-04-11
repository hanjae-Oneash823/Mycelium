import NotesPlugin from "./NotesPlugin/NotesPlugin";
import GeoPortalViewPlugin from "./GeoPortalViewPlugin/GeoPortalView";
import TodoListPlugin from "./TodoListPlugin/TodoListPlugin";
import PlannerPlugin from "./PlannerPlugin/PlannerPlugin";
import SettingsPlugin from "./SettingsPlugin/SettingsPlugin";
import SleepTrackerPlugin from "./SleepTrackerPlugin/SleepTrackerPlugin";
import ESRAPlugin from "./ESRAPlugin/ESRAPlugin";
import type { PluginItem } from "@/types";

export const plugins: PluginItem[] = [
  { id: "notes",        name: "Notes",        component: NotesPlugin         },
  { id: "geo-portal",   name: "Geo Portal",   component: GeoPortalViewPlugin },
  { id: "todo-list",    name: "Todo List",    component: TodoListPlugin       },
  { id: "planner",      name: "Planner",      component: PlannerPlugin        },
  { id: "settings",     name: "Settings",     component: SettingsPlugin       },
  { id: "sleep-tracker",name: "Sleep Tracker",component: SleepTrackerPlugin, section: "the clinic" },
  { id: "esra",         name: "L'ESRA",         component: ESRAPlugin,          section: "the lab" },
];
