import { getDb } from '@/lib/db';
import { computeUrgencyLevel } from './logicEngine';
import type {
  PlannerNode, PlannerGroup, Arc, Project,
  UserCapacity, CreateNodeData, ImportanceLevel,
} from '../types';

// ─── Loaders ────────────────────────────────────────────────────────────────

export async function loadNodes(): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `SELECT n.*,
       (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id) AS sub_total,
       (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id AND s.is_completed = 1) AS sub_done
     FROM nodes n
     WHERE n.is_completed = 0
     ORDER BY n.created_at DESC`
  );
  for (const row of rows) {
    row.groups = await getNodeGroups(row.id);
    row.is_completed = Boolean(row.is_completed);
    row.is_locked    = Boolean(row.is_locked);
    row.is_overdue   = Boolean(row.is_overdue);
    row.is_recovery  = Boolean(row.is_recovery);
    row.is_pinned    = Boolean(row.is_pinned);
  }
  return rows;
}

export async function loadAllNodes(): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `SELECT n.*,
       (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id) AS sub_total,
       (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id AND s.is_completed = 1) AS sub_done
     FROM nodes n
     ORDER BY n.created_at DESC`
  );
  for (const row of rows) {
    row.groups = await getNodeGroups(row.id);
    row.is_completed = Boolean(row.is_completed);
    row.is_locked    = Boolean(row.is_locked);
    row.is_overdue   = Boolean(row.is_overdue);
    row.is_recovery  = Boolean(row.is_recovery);
    row.is_pinned    = Boolean(row.is_pinned);
  }
  return rows;
}

export async function loadGroups(): Promise<PlannerGroup[]> {
  const db = getDb();
  const rows = await db.select<PlannerGroup[]>(
    `SELECT * FROM planner_groups ORDER BY sort_order ASC, name ASC`
  );
  return rows.map(r => ({
    ...r,
    is_visible:    Boolean(r.is_visible),
    is_daily_life: Boolean(r.is_daily_life),
    is_ungrouped:  Boolean(r.is_ungrouped),
  }));
}

export async function loadArcs(): Promise<Arc[]> {
  const db = getDb();
  const rows = await db.select<Arc[]>(
    `SELECT * FROM arcs WHERE is_archived = 0 ORDER BY start_date ASC`
  );
  return rows.map(r => ({ ...r, is_archived: Boolean(r.is_archived) }));
}

export async function loadProjects(): Promise<Project[]> {
  const db = getDb();
  const rows = await db.select<Project[]>(
    `SELECT * FROM projects WHERE is_archived = 0 ORDER BY start_date ASC`
  );
  return rows.map(r => ({ ...r, is_archived: Boolean(r.is_archived) }));
}

export async function loadUserCapacity(): Promise<UserCapacity> {
  const db = getDb();
  const rows = await db.select<UserCapacity[]>(
    `SELECT * FROM user_capacity WHERE id = 'default' LIMIT 1`
  );
  return rows[0] ?? { id: 'default', daily_minutes: 480, peak_start: '09:00', peak_end: '12:00', updated_at: new Date().toISOString() };
}

export async function getNodeGroups(nodeId: string): Promise<PlannerGroup[]> {
  const db = getDb();
  const rows = await db.select<PlannerGroup[]>(
    `SELECT pg.* FROM planner_groups pg
     JOIN node_groups ng ON ng.group_id = pg.id
     WHERE ng.node_id = ?
     ORDER BY pg.sort_order ASC`,
    [nodeId]
  );
  return rows.map(r => ({
    ...r,
    is_visible:    Boolean(r.is_visible),
    is_daily_life: Boolean(r.is_daily_life),
    is_ungrouped:  Boolean(r.is_ungrouped),
  }));
}

// ─── Node mutations ──────────────────────────────────────────────────────────

export async function createNode(data: CreateNodeData): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const isImportant = (data.importance_level ?? 0) === 1;
  const urgency = computeUrgencyLevel(isImportant, data.due_at ?? null, new Date());
  await db.execute(
    `INSERT INTO nodes (id, title, description, node_type, planned_start_at, due_at,
       estimated_duration_minutes, importance_level, computed_urgency_level, project_id, arc_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.title,
      data.description ?? null,
      data.node_type ?? 'task',
      data.planned_start_at ?? null,
      data.due_at ?? null,
      data.estimated_duration_minutes ?? null,
      data.importance_level ?? 0,
      urgency,
      data.project_id ?? null,
      data.arc_id ?? null,
    ]
  );
  // Add explicit groups (triggers handle ungrouped automatically)
  if (data.group_ids && data.group_ids.length > 0) {
    for (const gid of data.group_ids) {
      await db.execute(
        `INSERT OR IGNORE INTO node_groups(node_id, group_id) VALUES (?, ?)`,
        [id, gid]
      );
    }
  }
  return id;
}

export async function updateNode(id: string, patch: Record<string, unknown>): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(([k, v]) => k !== 'id' && v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.execute(
    `UPDATE nodes SET ${setClauses} WHERE id = ?`,
    [...values, id]
  );
}

export async function deleteNode(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM nodes WHERE id = ?`, [id]);
}

export async function rescheduleNode(id: string, dateStr: string): Promise<void> {
  const db = getDb();
  const isFuture = new Date(dateStr) > new Date();
  await db.execute(
    `UPDATE nodes SET planned_start_at = ?, due_at = ?, is_overdue = ?, is_recovery = CASE WHEN is_overdue = 1 THEN 1 ELSE is_recovery END, recovery_set_at = CASE WHEN is_overdue = 1 THEN CURRENT_TIMESTAMP ELSE recovery_set_at END WHERE id = ?`,
    [dateStr, dateStr, isFuture ? 0 : 1, id]
  );
}

export async function completeNode(id: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE nodes SET is_completed = 1, actual_completed_at = ? WHERE id = ?`,
    [now, id]
  );
  const logId = crypto.randomUUID();
  await db.execute(
    `INSERT INTO productivity_logs(id, node_id, completed_at) VALUES (?, ?, ?)`,
    [logId, id, now]
  );
}

export async function setNodeOverdue(id: string, value: boolean): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET is_overdue = ? WHERE id = ?`, [value ? 1 : 0, id]);
}

export async function setNodeUrgency(id: string, level: ImportanceLevel): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET computed_urgency_level = ? WHERE id = ?`, [level, id]);
}

// ─── Group mutations ─────────────────────────────────────────────────────────

export async function createGroup(data: { name: string; color_hex: string; is_daily_life?: boolean }): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO planner_groups(id, name, color_hex, is_daily_life) VALUES (?, ?, ?, ?)`,
    [id, data.name, data.color_hex, data.is_daily_life ? 1 : 0]
  );
  return id;
}

export async function deleteGroup(id: string): Promise<void> {
  if (id === 'g-ungrouped') throw new Error('Cannot delete the system ungrouped group.');
  const db = getDb();
  await db.execute(`DELETE FROM planner_groups WHERE id = ?`, [id]);
}

export async function addNodeGroup(nodeId: string, groupId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT OR IGNORE INTO node_groups(node_id, group_id) VALUES (?, ?)`,
    [nodeId, groupId]
  );
}

export async function removeNodeGroup(nodeId: string, groupId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `DELETE FROM node_groups WHERE node_id = ? AND group_id = ?`,
    [nodeId, groupId]
  );
}
