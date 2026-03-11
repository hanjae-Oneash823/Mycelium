import NotesPlugin from "./NotesPlugin/NotesPlugin";
import GeoPortalViewPlugin from "./GeoPortalViewPlugin/GeoPortalView";
import TodoListPlugin from "./TodoListPlugin/TodoListPlugin";
import type { PluginItem } from "@/types";

export const plugins: PluginItem[] = [
  { id: "notes", name: "Notes", component: NotesPlugin },
  { id: "geo-portal", name: "Geo Portal", component: GeoPortalViewPlugin },
  { id: "todo-list", name: "Todo List", component: TodoListPlugin },
  // Add more plugins here as needed
];
