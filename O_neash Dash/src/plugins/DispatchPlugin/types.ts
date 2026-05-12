export interface DispatchLocation {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface WorkBlock {
  id: string;
  date: string;
  start_time: number;  // minutes from midnight
  end_time: number;    // minutes from midnight
  location_id: string | null;
  created_at: string;
  updated_at: string;
  // hydrated
  location?: DispatchLocation | null;
}

export interface NodePlacement {
  id: string;
  work_block_id: string;
  node_id: string;
  start_offset: number;      // minutes from work block start
  duration_override: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlacedNode extends NodePlacement {
  node_title: string;
  arc_name: string | null;
  estimated_duration_minutes: number | null;
}

export interface PoolNode {
  id: string;
  title: string;
  arc_id: string | null;
  arc_name: string | null;
  arc_color: string | null;
  estimated_duration_minutes: number | null;
  node_type: 'task' | 'event';
  planned_start_at: string | null;
}

export type PendingBlock = { startMin: number; endMin: number; screenX: number } | null;

export type DragAction =
  | null
  | { type: 'create'; startMin: number; currentMin: number }
  | { type: 'move-block'; blockId: string; grabOffsetMin: number; currentStart: number }
  | { type: 'resize-start'; blockId: string; currentStart: number }
  | { type: 'resize-end'; blockId: string; currentEnd: number }
  | { type: 'place-node'; blockId: string; nodeId: string; startOffset: number; currentEndOffset: number };
