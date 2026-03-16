import React from "react";
import usePluginStore from "../store/usePluginStore";
import {
  Terminal,
  Notes,
  CheckDouble,
  SettingsCog2,
  Analytics,
  TeachSharp,
  BookOpen,
  Clipboard,
  Camera,
  MapPin,
  Grid2x22,
  Human,
  Trophy,
  Bed,
  Fish,
  PcCase,
  CoffeeSharp,
  StickyNoteText,
  ImageSharp,
  Zap,
} from "pixelarticons/react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../components/ui/navigation-menu";

interface ListItemProps extends Omit<React.HTMLAttributes<HTMLLIElement>, "title"> {
  title: React.ReactNode;
  children?: React.ReactNode;
  pluginId?: string;
  whiteText?: boolean;
}

function ListItem({ title, children, pluginId, whiteText, ...props }: ListItemProps) {
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
              <Terminal size={14} />
              BASIC
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
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
                pluginId="todo-list"
              >
                track important tasks via a modified eisenhower matrix.
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Zap size={14} /> Planner
                  </span>
                }
                pluginId="planner"
              >
                tasks, deadlines, and project arcs.
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <PcCase size={14} /> Journal
                  </span>
                }
              >
                simple journal. persistence is key.
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <SettingsCog2 size={14} /> Settings
                  </span>
                }
                whiteText
              />
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Analytics size={14} /> System Resource Monitor
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
              <CoffeeSharp size={14} />
              the LAB
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-96">
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <TeachSharp size={14} /> Projects
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
                    <StickyNoteText size={14} /> Paper Library
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
          <NavigationMenuContent>
            <ul className="w-96">
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <MapPin size={14} /> Geo-Portal
                  </span>
                }
              >
                field notes for past travels & bucket list for future travel
                destinations
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <ImageSharp size={14} /> Film Neg Lab
                  </span>
                }
              >
                archive and view photos
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Grid2x22 size={14} /> CANVAS
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
          <NavigationMenuContent>
            <ul className="w-96">
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Trophy size={14} /> Habits and Health
                  </span>
                }
              >
                track habits/health & view analytics
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Bed size={14} /> SleepTracker
                  </span>
                }
              >
                log sleep data daily. fix irregular sleep schedules
              </ListItem>
              <ListItem
                title={
                  <span className="flex items-center gap-2">
                    <Fish size={14} /> Diet Log
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
