export type PlannerViewType = 'today' | 'calendar' | 'eisenhower' | 'focus' | 'arc';
export type NodeType = 'task' | 'event';
/** User-facing binary input stored in DB: 0 = normal, 1 = important */
export type UserImportance = 0 | 1;
/** Computed L0–L4 urgency level derived from importance + due date proximity */
export type ImportanceLevel = 0 | 1 | 2 | 3 | 4;

export interface PlannerGroup {
  id: string;
  name: string;
  color_hex: string;
  icon?: string | null;
  sort_order: number;
  is_visible: boolean;
  is_daily_life: boolean;
  is_ungrouped: boolean;
  created_at: string;
}

export interface Arc {
  id: string;
  name: string;
  color_hex: string;
  start_date?: string | null;
  end_date?: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  arc_id?: string | null;
  name: string;
  color_hex?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface PlannerNode {
  id: string;
  project_id?: string | null;
  arc_id?: string | null;
  title: string;
  description?: string | null;
  node_type: NodeType;
  planned_start_at?: string | null;
  due_at?: string | null;
  actual_completed_at?: string | null;
  estimated_duration_minutes?: number | null;
  actual_duration_minutes?: number | null;
  importance_level: UserImportance;
  computed_urgency_level: ImportanceLevel;
  is_completed: boolean;
  is_locked: boolean;
  is_overdue: boolean;
  is_recovery: boolean;
  is_pinned: boolean;
  recovery_set_at?: string | null;
  parent_node_id?: string | null;
  created_at: string;
  updated_at: string;
  // Recurrence (JSON strings stored in DB)
  recurrence_rule?: string | null;
  recurrence_exceptions?: string | null;
  // Computed join fields
  groups?: PlannerGroup[];
  sub_total?: number;
  sub_done?: number;
  linked_note_count?: number;
  /** True for virtual instances expanded from a recurring template. Not persisted. */
  is_virtual?: boolean;
}

export interface SubTask {
  id: string;
  node_id: string;
  title: string;
  is_completed: boolean;
  sort_order: number;
  created_at: string;
}

export interface UserCapacity {
  id: string;
  daily_minutes: number;
  peak_start: string;
  peak_end: string;
  updated_at: string;
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly';
  /** Every N units (1 = every day/week/month, 2 = every other, etc.) */
  interval: number;
  /** For weekly: days of week to fire on [0=Sun … 6=Sat]. If omitted, fires on same DOW as first occurrence. */
  days?: number[];
  /** YYYY-MM-DD — optional end date (inclusive). If omitted, recurs indefinitely. */
  until?: string;
}

export interface CreateNodeData {
  title: string;
  description?: string;
  node_type?: NodeType;
  planned_start_at?: string;
  due_at?: string;
  estimated_duration_minutes?: number;
  importance_level?: UserImportance;
  project_id?: string;
  arc_id?: string;
  group_ids?: string[];
  recurrence_rule?: RecurrenceRule | null;
}

export interface FocusContext {
  type: 'arc' | 'project' | 'group' | 'ungrouped';
  id: string;
}

export const DOT_COLORS: Record<number, string> = {
  0: '#7ecfff',
  1: '#3dbfbf',
  2: '#4ade80',
  3: '#f5a623',
  4: '#ff6b35',
};
export const DOT_COLOR_OVERDUE = '#ff3b3b';
export const DOT_COLOR_EVENT   = '#888888';

/** A resolved note reference loaded from the filesystem */
export interface NoteHit {
  compositeId: string;   // "${groupId}:${noteId}"
  groupId: string;
  groupName: string;
  groupColor: string;
  noteId: number;
  title: string;
  content: string;
  updatedAt: number;
}

/** A raw link row as stored in note_task_links */
export interface LinkedNoteRef {
  note_id: string;
  node_id: string;
  linked_at: string;
}

export function getDotDiameter(minutes: number | null | undefined): number {
  const m = minutes ?? 60;
  const clamped = Math.max(m, 1);
  const t = Math.log(clamped / 15) / Math.log(480 / 15);
  return 10 + Math.max(0, Math.min(1, t)) * 24;
}

export function getDotColor(node: PlannerNode): string {
  if (node.is_overdue) return DOT_COLOR_OVERDUE;
  if (node.node_type === 'event') return DOT_COLOR_EVENT;
  if (node.is_recovery) return DOT_COLORS[4];
  return DOT_COLORS[node.computed_urgency_level] ?? DOT_COLORS[0];
}

export function getDotAnimClass(node: PlannerNode): string {
  if (node.is_overdue) return 'dot-anim-red';
  if (node.is_recovery || node.computed_urgency_level === 4) return 'dot-anim-urgent';
  return '';
}
