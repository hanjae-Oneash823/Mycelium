import NotesPlugin from "./NotesPlugin/NotesPlugin";
import GeoPortalViewPlugin from "./GeoPortalViewPlugin/GeoPortalView";
import PlannerPlugin from "./PlannerPlugin/PlannerPlugin";
import SettingsPlugin from "./SettingsPlugin/SettingsPlugin";
import SleepTrackerPlugin from "./SleepTrackerPlugin/SleepTrackerPlugin";
import ESRAPlugin from "./ESRAPlugin/ESRAPlugin";
import HabitsPlugin from "./HabitsPlugin/HabitsPlugin";
import JournalPlugin from "./JournalPlugin/JournalPlugin";
import ProjectsPlugin from "./ProjectsPlugin/ProjectsPlugin";
import AcademicPlugin from "./AcademicPlugin/AcademicPlugin";
import AnalyticsPlugin from "./AnalyticsPlugin/AnalyticsPlugin";
import type { PluginItem } from "@/types";

export const plugins: PluginItem[] = [
  { id: "notes",        name: "Notes",           component: NotesPlugin         },
  { id: "geo-portal",   name: "Geo Portal",      component: GeoPortalViewPlugin },
  { id: "planner",      name: "Planner",         component: PlannerPlugin        },
  { id: "settings",     name: "Settings",        component: SettingsPlugin       },
  { id: "sleep-tracker",name: "Sleep Tracker",   component: SleepTrackerPlugin, section: "the clinic" },
  { id: "esra",         name: "L'ESRA",          component: ESRAPlugin,          section: "the lab"   },
  { id: "habits",       name: "Habits",          component: HabitsPlugin,        section: "the clinic"},
  { id: "journal",      name: "Journal",         component: JournalPlugin        },
  { id: "projects",     name: "Arcs & Projects", component: ProjectsPlugin       },
  { id: "academic",     name: "Academic Planner",component: AcademicPlugin,      section: "the lab"   },
  { id: "analytics",   name: "Analytics",       component: AnalyticsPlugin                           },
];
