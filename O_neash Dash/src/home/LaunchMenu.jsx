import React from "react";
import usePluginStore from "../store/usePluginStore";
import {
  CornerDownRight,
  Notes,
  CheckDouble,
  Edit,
  Sliders2,
  Trending,
  CoffeeAlt,
  Timeline,
  BookOpen,
  Clipboard,
  NotesMultiple,
  Camera,
  Map,
  Movie,
  Grid,
  Human,
  HumanRun,
  EyeClosed,
  Cart,
} from "@nsmr/pixelart-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../components/ui/navigation-menu";

function ListItem({ title, children, pluginId, whiteText, ...props }) {
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  return (
    <li {...props}>
      <button
        type="button"
        className={`flex flex-col gap-1 text-base w-full text-left px-2 py-1.5 hover:bg-gray-800 rounded ${whiteText ? "text-neutral-200" : ""}`}
        onClick={() => pluginId && setActivePlugin(pluginId)}
      >
        <div
          className={`leading-none font-normal text-base ${whiteText ? "text-white" : ""}`}
        >
          {title}
        </div>
        <div
          className={`text-muted-foreground line-clamp-2 text-sm ${whiteText ? "text-white" : ""}`}
        >
          {children}
        </div>
      </button>
    </li>
  );
}

export function LaunchMenu() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        {/* TERMINAL */}
        <NavigationMenuItem className="relative">
          <NavigationMenuTrigger>
            <span className="flex items-center gap-2">
              <CornerDownRight size={14} />
              BASIC
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent align="start">
            <ul className="w-96">
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Notes size={14} /> Notes
                  </span>
                }
                pluginId="notes"
              >
                capture thoughts, ideas, and important memos.
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <CheckDouble size={14} /> Todo List
                  </span>
                }
              >
                track important tasks via a modified eisenhower matrix.
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Edit size={14} /> Journal
                  </span>
                }
              >
                simple journal. persistence is key.
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Sliders2 size={14} /> Settings
                  </span>
                }
                whiteText
              />
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Trending size={14} /> System Resource Monitor
                  </span>
                }
                whiteText
              />
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* LAB */}
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            <span className="flex items-center gap-2">
              <CoffeeAlt size={14} />
              the LAB
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent align="start">
            <ul className="w-96">
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Timeline size={14} /> Projects
                  </span>
                }
              >
                plan projects, set deadlines, and track progress
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <BookOpen size={14} /> Academic Planner
                  </span>
                }
              >
                organize study goals and manage assignments
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Clipboard size={14} /> Protocol Manager
                  </span>
                }
              >
                archive important experimental protocols
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <NotesMultiple size={14} /> Paper Library
                  </span>
                }
              >
                database for major academic papers & live RSS feed
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* DARKROOM */}
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            <span className="flex items-center gap-2">
              <Camera size={14} />
              the STUDIO
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent align="start">
            <ul className="w-96">
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Map size={14} /> Geo-Portal
                  </span>
                }
              >
                field notes for past travels & bucket list for future travel
                destinations
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Movie size={14} /> Film Neg Lab
                  </span>
                }
              >
                archive and view photos
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Grid size={14} /> CANVAS
                  </span>
                }
              >
                open moodboard for design ideas
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* VITALS */}
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            <span className="flex items-center gap-2">
              <Human size={14} />
              the CLINIC
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent align="start">
            <ul className="w-96">
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <HumanRun size={14} /> Habits and Health
                  </span>
                }
              >
                track habits/health & view analytics
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <EyeClosed size={14} /> SleepTracker
                  </span>
                }
              >
                log sleep data daily. fix irregular sleep schedules
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Cart size={14} /> Diet Log
                  </span>
                }
              >
                meal prep and diet planner
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
