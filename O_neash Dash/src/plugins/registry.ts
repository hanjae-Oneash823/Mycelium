import NotesPlugin from "./NotesPlugin/NotesPlugin";
import PlannerPlugin from "./PlannerPlugin/PlannerPlugin";
import SettingsPlugin from "./SettingsPlugin/SettingsPlugin";
import SleepTrackerPlugin from "./SleepTrackerPlugin/SleepTrackerPlugin";
import ESRAPlugin from "./ESRAPlugin/ESRAPlugin";
import HabitsPlugin from "./HabitsPlugin/HabitsPlugin";
import JournalPlugin from "./JournalPlugin/JournalPlugin";
import ProjectsPlugin from "./ProjectsPlugin/ProjectsPlugin";
import AcademicPlugin from "./AcademicPlugin/AcademicPlugin";
import AnalyticsPlugin from "./AnalyticsPlugin/AnalyticsPlugin";
import WardrobePlugin from "./WardrobePlugin/WardrobePlugin";
import FilmNegLabPlugin from "./FilmNegLabPlugin/FilmNegLabPlugin";
import SnakePlugin from "./SnakePlugin/SnakePlugin";
import TwentyFortyEightPlugin from "./TwentyFortyEightPlugin/TwentyFortyEightPlugin";
import PongPlugin from "./PongPlugin/PongPlugin";
import BreakoutPlugin from "./BreakoutPlugin/BreakoutPlugin";
import AsteroidsPlugin from "./AsteroidsPlugin/AsteroidsPlugin";
import LunarLanderPlugin from "./LunarLanderPlugin/LunarLanderPlugin";
import ArtilleryDuelPlugin from "./ArtilleryDuelPlugin/ArtilleryDuelPlugin";
import BattleshipPlugin from "./BattleshipPlugin/BattleshipPlugin";
import type { PluginItem } from "@/types";

export const plugins: PluginItem[] = [
  { id: "notes",        name: "Notes",           component: NotesPlugin         },
  { id: "planner",      name: "Planner",         component: PlannerPlugin        },
  { id: "settings",     name: "Settings",        component: SettingsPlugin       },
  { id: "sleep-tracker",name: "Sleep Tracker",   component: SleepTrackerPlugin, section: "clinic" },
  { id: "esra",         name: "L'ESRA",          component: ESRAPlugin,          section: "lab"   },
  { id: "habits",       name: "Habits",          component: HabitsPlugin,        section: "clinic"},
  { id: "journal",      name: "Journal",         component: JournalPlugin        },
  { id: "projects",     name: "Arcs & Projects", component: ProjectsPlugin       },
  { id: "academic",     name: "Deep Planner",    component: AcademicPlugin,      section: "lab"   },
  { id: "analytics",   name: "Analytics",       component: AnalyticsPlugin                           },
  { id: "wardrobe",    name: "Wardrobe",        component: WardrobePlugin,      section: "studio" },
  { id: "filmneg",     name: "Film Neg Lab",    component: FilmNegLabPlugin,    section: "studio" },
  { id: "snake",       name: "Snake",           component: SnakePlugin,             section: "arcade" },
  { id: "2048",        name: "2048",            component: TwentyFortyEightPlugin,  section: "arcade" },
  { id: "pong",        name: "Pong",            component: PongPlugin,              section: "arcade" },
  { id: "breakout",    name: "Breakout",        component: BreakoutPlugin,          section: "arcade" },
  { id: "asteroids",   name: "Asteroids",       component: AsteroidsPlugin,         section: "arcade" },
  { id: "lunar-lander", name: "Lunar Lander",   component: LunarLanderPlugin,       section: "arcade" },
  { id: "artillery-duel", name: "Artillery Duel", component: ArtilleryDuelPlugin,   section: "arcade" },
  { id: "battleship",  name: "Battleship",      component: BattleshipPlugin,        section: "arcade" },
];
