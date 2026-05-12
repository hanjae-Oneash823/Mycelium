import { getDb } from '../../../lib/db';
import type { WorkBlock, NodePlacement, DispatchLocation, PoolNode, PlacedNode } from '../types';

const LOCATION_COLORS = [
  '#3a6b6b', '#6b3a5e', '#3a4f6b', '#6b5e3a',
  '#4f6b3a', '#6b3a3a', '#3a5a6b', '#5a6b3a',
];

// ── Locations ──────────────────────────────────────────────────────────────

export async function getLocations(): Promise<DispatchLocation[]> {
  const db = getDb();
  return db.select<DispatchLocation[]>(
    `SELECT id, name, color, created_at FROM dispatch_locations ORDER BY created_at ASC`
  );
}

export async function upsertLocation(name: string): Promise<DispatchLocation> {
  const db = getDb();
  const trimmed = name.trim();
  const existing = await db.select<DispatchLocation[]>(
    `SELECT id, name, color, created_at FROM dispatch_locations WHERE lower(name) = lower(?) LIMIT 1`,
    [trimmed]
  );
  if (existing[0]) return existing[0];

  const countRows = await db.select<{ c: number }[]>(`SELECT COUNT(*) as c FROM dispatch_locations`);
  const idx = (countRows[0]?.c ?? 0) % LOCATION_COLORS.length;
  const color = LOCATION_COLORS[idx];
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO dispatch_locations (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
    [id, trimmed, color, now]
  );
  return { id, name: trimmed, color, created_at: now };
}

// ── Work Blocks ────────────────────────────────────────────────────────────

interface WorkBlockRow {
  id: string; date: string; start_time: number; end_time: number;
  location_id: string | null; created_at: string; updated_at: string;
  location_name: string | null; location_color: string | null;
}

export async function getWorkBlocksForDate(date: string): Promise<WorkBlock[]> {
  const db = getDb();
  const rows = await db.select<WorkBlockRow[]>(
    `SELECT wb.id, wb.date, wb.start_time, wb.end_time, wb.location_id, wb.created_at, wb.updated_at,
            dl.name as location_name, dl.color as location_color
     FROM dispatch_work_blocks wb
     LEFT JOIN dispatch_locations dl ON dl.id = wb.location_id
     WHERE wb.date = ?
     ORDER BY wb.start_time ASC`,
    [date]
  );
  return rows.map(r => ({
    id: r.id, date: r.date, start_time: r.start_time, end_time: r.end_time,
    location_id: r.location_id, created_at: r.created_at, updated_at: r.updated_at,
    location: r.location_id && r.location_name
      ? { id: r.location_id, name: r.location_name, color: r.location_color ?? '#555', created_at: '' }
      : null,
  }));
}

export async function createWorkBlock(
  date: string, start_time: number, end_time: number, location_id: string | null
): Promise<WorkBlock> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO dispatch_work_blocks (id, date, start_time, end_time, location_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, date, start_time, end_time, location_id, now, now]
  );
  return { id, date, start_time, end_time, location_id, created_at: now, updated_at: now };
}

export async function updateWorkBlock(
  id: string,
  patch: Partial<Pick<WorkBlock, 'start_time' | 'end_time' | 'location_id'>>
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = [...entries.map(([, v]) => v), new Date().toISOString(), id];
  await db.execute(`UPDATE dispatch_work_blocks SET ${fields}, updated_at = ? WHERE id = ?`, values);
}

export async function deleteWorkBlock(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM dispatch_work_blocks WHERE id = ?`, [id]);
}

// ── Node Placements ────────────────────────────────────────────────────────

export async function getPlacementsForDate(date: string): Promise<PlacedNode[]> {
  const db = getDb();
  return db.select<PlacedNode[]>(
    `SELECT np.id, np.work_block_id, np.node_id, np.start_offset, np.duration_override,
            np.created_at, np.updated_at,
            n.title as node_title, a.name as arc_name, n.estimated_duration_minutes
     FROM dispatch_node_placements np
     JOIN dispatch_work_blocks wb ON wb.id = np.work_block_id
     JOIN nodes n ON n.id = np.node_id
     LEFT JOIN arcs a ON a.id = n.arc_id
     WHERE wb.date = ?`,
    [date]
  );
}

export async function createPlacement(
  work_block_id: string, node_id: string, start_offset: number, duration_override: number | null
): Promise<NodePlacement> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO dispatch_node_placements (id, work_block_id, node_id, start_offset, duration_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, work_block_id, node_id, start_offset, duration_override, now, now]
  );
  return { id, work_block_id, node_id, start_offset, duration_override, created_at: now, updated_at: now };
}

export async function deletePlacement(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM dispatch_node_placements WHERE id = ?`, [id]);
}

// ── Planner Node Queries ───────────────────────────────────────────────────

const NODE_COLS = `
  n.id, n.title, n.arc_id, a.name as arc_name, a.color_hex as arc_color,
  n.estimated_duration_minutes, n.node_type, n.planned_start_at
  FROM nodes n LEFT JOIN arcs a ON a.id = n.arc_id`;

export async function getPoolNodesForDate(date: string): Promise<PoolNode[]> {
  const db = getDb();
  return db.select<PoolNode[]>(
    `SELECT ${NODE_COLS}
     WHERE n.node_type = 'task'
       AND substr(n.planned_start_at, 1, 10) = ?
       AND n.is_completed = 0
     ORDER BY a.name, n.title`,
    [date]
  );
}

export async function getEventNodesForDate(date: string): Promise<PoolNode[]> {
  const db = getDb();
  return db.select<PoolNode[]>(
    `SELECT ${NODE_COLS}
     WHERE n.node_type = 'event'
       AND substr(n.planned_start_at, 1, 10) = ?
     ORDER BY n.planned_start_at ASC`,
    [date]
  );
}
