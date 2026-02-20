import React from "react";
import usePluginStore from "../store/usePluginStore";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../components/ui/navigation-menu";

function ListItem({ title, children, pluginId, whiteText, ...props }) {
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <button
          type="button"
          className={`flex flex-col gap-1 text-base w-full text-left px-2 py-1.5 hover:bg-gray-800 rounded ${whiteText ? "text-neutral-200" : ""}`}
          onClick={() => pluginId && setActivePlugin(pluginId)}
        >
          <div
            className={`leading-none font-semibold text-base ${whiteText ? "text-white" : ""}`}
          >
            {title}
          </div>
          <div
            className={`text-muted-foreground line-clamp-2 text-sm ${whiteText ? "text-white" : ""}`}
          >
            {children}
          </div>
        </button>
      </NavigationMenuLink>
    </li>
  );
}

export function LaunchMenu() {
  return (
    <NavigationMenu className="h-auto flex-none">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>the TERMINAL</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-96">
              <ListItem title="Notes" pluginId="notes">
                capture thoughts, ideas, and important memos.
              </ListItem>
              <ListItem title="Todo List">
                track important tasks via a modified eisenhower matrix.
              </ListItem>
              <ListItem title="Journal">
                simple journal. persistence is key.
              </ListItem>
              <ListItem title="Settings" whiteText></ListItem>
              <ListItem title="System Resource Monitor" whiteText></ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
