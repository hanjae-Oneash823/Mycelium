import type { ComponentType } from "react";

// ─── Plugin system ───────────────────────────────────────────────────────────
export interface PluginItem {
  id: string;
  name: string;
  component: ComponentType;
}

// ─── Notes ───────────────────────────────────────────────────────────────────
export interface NoteGroup {
  id: string;
  name: string;
  color: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  type: "note";
}

export interface NoteData {
  title: string;
  content: string;
}

// ─── Database entities ────────────────────────────────────────────────────────
export interface DbNote {
  id: number;
  group_id?: number;
  title?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbGroup {
  id: number;
  name: string;
  color?: string;
  emoji?: string;
  created_at?: string;
}

export interface DbTag {
  id: number;
  label: string;
}

export interface TodoItem {
  id: number;
  parent_id?: number;
  group_id?: number;
  task: string;
  description?: string;
  effort?: number;
  is_completed: boolean;
  importance?: number;
  due_date?: string;
  created_at?: string;
}

export interface Habit {
  id: number;
  title: string;
  one_liner?: string;
  goal_week?: number;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  log_date?: string;
  status?: boolean;
  value?: number;
}

export interface SleepLog {
  id: number;
  start_time?: string;
  wake_time?: string;
  total_sleep?: number;
  quality?: number;
  notes?: string;
}

export interface Journal {
  id: number;
  entry_date?: string;
  content?: string;
  mood_rating?: number;
  energy_level?: number;
  tags?: string;
}

export interface Trip {
  id: number;
  trip_name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
}

export interface TripPin {
  id: number;
  trip_id: number;
  type?: string;
  lat: number;
  lon: number;
  date?: string;
}

export interface TravelLog {
  id: number;
  pin_id: number;
  content?: string;
  created_at?: string;
}

export interface TravelImage {
  id: number;
  pin_id: number;
  path: string;
}

export interface Scratchpad {
  id: number;
  content?: string;
  created_at?: string;
}

// ─── ForceGraph ───────────────────────────────────────────────────────────────
export interface GraphNode {
  id: string | number;
  title: string;
  type: "note" | "tag";
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GraphLink {
  source: string | number;
  target: string | number;
  type: "chronological" | "tag";
}

// ─── Geo Portal ───────────────────────────────────────────────────────────────
export type GeoPage = "landing" | "loading" | "portal";
export type GeoTransition = "" | "fade-out" | "fade-in";
