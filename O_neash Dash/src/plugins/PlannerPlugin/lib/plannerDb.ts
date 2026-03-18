import { getDb } from '@/lib/db';
import { computeUrgencyLevel } from './logicEngine';
import { generateOccurrenceDates } from './recurrence';
import type {
  PlannerNode, PlannerGroup, Arc, Project,
  UserCapacity, CreateNodeData, ImportanceLevel,
} from '../types';

// ─── Loaders ────────────────────────────────────────────────────────────────

const NODE_SELECT = `
  SELECT n.*,
    (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id) AS sub_total,
    (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id AND s.is_completed = 1) AS sub_done,
    (SELECT COUNT(*) FROM note_task_links l WHERE l.node_id = n.id) AS linked_note_count
  FROM nodes n`;

async function hydrateRows(rows: PlannerNode[]): Promise<PlannerNode[]> {
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

export async function loadNodes(): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.is_completed = 0 ORDER BY n.created_at DESC`
  );
  return hydrateRows(rows);
}

export async function loadAllNodes(): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} ORDER BY n.created_at DESC`
  );
  return hydrateRows(rows);
}

export async function loadNodeById(id: string): Promise<PlannerNode | null> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.id = ? LIMIT 1`, [id]
  );
  if (!rows[0]) return null;
  const hydrated = await hydrateRows(rows);
  return hydrated[0];
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

async function insertSingleNode(
  data: CreateNodeData,
  dateOverride?: string,
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const dateStr = dateOverride ?? data.planned_start_at ?? data.due_at ?? null;
  const isImportant = (data.importance_level ?? 0) === 1;
  const urgency = computeUrgencyLevel(isImportant, data.due_at ?? null, new Date());
  await db.execute(
    `INSERT INTO nodes (id, title, description, node_type, planned_start_at, due_at,
       estimated_duration_minutes, importance_level, computed_urgency_level, project_id, arc_id,
       recurrence_rule)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.title,
      data.description ?? null,
      data.node_type ?? 'task',
      dateStr,
      dateStr,
      data.estimated_duration_minutes ?? null,
      data.importance_level ?? 0,
      urgency,
      data.project_id ?? null,
      data.arc_id ?? null,
      null, // recurrence_rule not stored per-instance
    ]
  );
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

export async function createNode(data: CreateNodeData): Promise<string> {
  // Recurring events: expand the rule and insert one real row per occurrence
  if (data.recurrence_rule && data.node_type === 'event') {
    const startStr = data.planned_start_at ?? data.due_at;
    if (startStr) {
      const dates = generateOccurrenceDates(data.recurrence_rule, startStr.slice(0, 10));
      // Preserve the original time component (e.g. "T09:00:00.000Z") on every instance
      const timeSuffix = startStr.includes('T') ? startStr.slice(10) : '';
      let firstId = '';
      for (const dateStr of dates) {
        const dateWithTime = timeSuffix ? dateStr + timeSuffix : dateStr;
        const id = await insertSingleNode(data, dateWithTime);
        if (!firstId) firstId = id;
      }
      if (data.project_id) await syncProjectDates(data.project_id, data.arc_id ?? null);
      else if (data.arc_id) await syncArcEndDate(data.arc_id);
      return firstId;
    }
  }

  // Non-recurring: single insert
  const id = await insertSingleNode(data);
  if (data.project_id) await syncProjectDates(data.project_id, data.arc_id ?? null);
  else if (data.arc_id) await syncArcEndDate(data.arc_id);
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
  // Sync end dates if due/planned dates or arc/project changed
  const needsSync = entries.some(([k]) => ['due_at', 'planned_start_at', 'arc_id', 'project_id'].includes(k));
  if (needsSync) {
    const nodeRows = await db.select<{ arc_id: string | null; project_id: string | null }[]>(
      `SELECT arc_id, project_id FROM nodes WHERE id = ?`, [id]
    );
    const n = nodeRows[0];
    if (n?.project_id) await syncProjectDates(n.project_id, n.arc_id);
    else if (n?.arc_id) await syncArcEndDate(n.arc_id);
  }
}

export async function deleteNode(id: string): Promise<void> {
  const db = getDb();
  const nodeRows = await db.select<{ arc_id: string | null; project_id: string | null }[]>(
    `SELECT arc_id, project_id FROM nodes WHERE id = ?`, [id]
  );
  const n = nodeRows[0];
  await db.execute(`DELETE FROM nodes WHERE id = ?`, [id]);
  if (n?.project_id) await syncProjectDates(n.project_id, n.arc_id);
  else if (n?.arc_id) await syncArcEndDate(n.arc_id);
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

/**
 * Mark a specific date as "skipped" for a recurring event template.
 * Used when the user completes (or dismisses) a single virtual occurrence.
 */
export async function addRecurrenceException(templateId: string, dateStr: string): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ recurrence_exceptions: string | null }[]>(
    `SELECT recurrence_exceptions FROM nodes WHERE id = ?`, [templateId]
  );
  const existing: string[] = rows[0]?.recurrence_exceptions
    ? JSON.parse(rows[0].recurrence_exceptions)
    : [];
  if (!existing.includes(dateStr)) existing.push(dateStr);
  await db.execute(
    `UPDATE nodes SET recurrence_exceptions = ? WHERE id = ?`,
    [JSON.stringify(existing), templateId]
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

export async function updateGroup(id: string, patch: { name?: string; color_hex?: string }): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.execute(`UPDATE planner_groups SET ${setClauses} WHERE id = ?`, [...values, id]);
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

/** Replace all non-system group associations for a node (used in edit mode). */
export async function replaceNodeGroups(nodeId: string, groupIds: string[]): Promise<void> {
  const db = getDb();
  // Remove all real-group associations (keep nothing — triggers re-add ungrouped if empty)
  await db.execute(
    `DELETE FROM node_groups WHERE node_id = ? AND group_id != (SELECT id FROM planner_groups WHERE is_ungrouped = 1 LIMIT 1)`,
    [nodeId]
  );
  for (const gid of groupIds) {
    await db.execute(`INSERT OR IGNORE INTO node_groups(node_id, group_id) VALUES (?, ?)`, [nodeId, gid]);
  }
}

// ─── Arc/Project auto date sync ───────────────────────────────────────────────

async function syncArcEndDate(arcId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ n: number; latest: string | null }[]>(
    `SELECT COUNT(*) AS n, MAX(COALESCE(due_at, planned_start_at)) AS latest FROM nodes WHERE arc_id = ? AND is_completed = 0`,
    [arcId]
  );
  if ((rows[0]?.n ?? 0) <= 5) return;
  const latest = rows[0]?.latest;
  if (!latest) return;
  const arcRows = await db.select<{ end_date: string | null }[]>(
    `SELECT end_date FROM arcs WHERE id = ?`, [arcId]
  );
  const current = arcRows[0]?.end_date;
  if (!current || latest > current) {
    await db.execute(`UPDATE arcs SET end_date = ? WHERE id = ?`, [latest.slice(0, 10), arcId]);
  }
}

/** Sync both start_date and end_date of a project from its tasks.
 *  If the project has < 2 tasks, both dates are set to null (no bar shown). */
async function syncProjectDates(projectId: string, arcId: string | null): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ n: number; earliest: string | null; latest: string | null }[]>(
    `SELECT COUNT(*) AS n,
            MIN(COALESCE(planned_start_at, due_at)) AS earliest,
            MAX(COALESCE(due_at, planned_start_at)) AS latest
     FROM nodes WHERE project_id = ? AND is_completed = 0`,
    [projectId]
  );
  const { n, earliest, latest } = rows[0] ?? { n: 0, earliest: null, latest: null };
  if (n < 2) {
    await db.execute(`UPDATE projects SET start_date = NULL, end_date = NULL WHERE id = ?`, [projectId]);
  } else {
    await db.execute(
      `UPDATE projects SET start_date = ?, end_date = ? WHERE id = ?`,
      [earliest!.slice(0, 10), latest!.slice(0, 10), projectId]
    );
  }
  if (arcId) await syncArcEndDate(arcId);
}

// ─── Arc mutations ────────────────────────────────────────────────────────────

export async function createArc(data: { name: string; color_hex: string; start_date?: string; end_date?: string }): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  // Default end_date = start_date + 1 month (or today + 1 month if no start_date)
  let endDate = data.end_date ?? null;
  if (!endDate) {
    const base = data.start_date ? new Date(data.start_date) : new Date();
    base.setMonth(base.getMonth() + 1);
    endDate = base.toISOString().slice(0, 10);
  }
  await db.execute(
    `INSERT INTO arcs(id, name, color_hex, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
    [id, data.name, data.color_hex, data.start_date ?? null, endDate]
  );
  return id;
}

export async function updateArc(id: string, patch: Record<string, unknown>): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(([k, v]) => k !== 'id' && v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.execute(`UPDATE arcs SET ${setClauses} WHERE id = ?`, [...values, id]);
}

export async function archiveArc(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE arcs SET is_archived = 1 WHERE id = ?`, [id]);
}

export async function deleteArc(id: string): Promise<void> {
  const db = getDb();
  // Orphan child nodes and projects
  await db.execute(`UPDATE nodes SET arc_id = NULL WHERE arc_id = ?`, [id]);
  await db.execute(`UPDATE projects SET arc_id = NULL WHERE arc_id = ?`, [id]);
  await db.execute(`DELETE FROM arcs WHERE id = ?`, [id]);
}

// ─── Project mutations ────────────────────────────────────────────────────────

export async function createProject(data: { name: string; color_hex?: string; arc_id?: string }): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  // Dates start null — they are set automatically by syncProjectDates when tasks are added
  await db.execute(
    `INSERT INTO projects(id, name, color_hex, arc_id, start_date, end_date) VALUES (?, ?, ?, ?, NULL, NULL)`,
    [id, data.name, data.color_hex ?? null, data.arc_id ?? null]
  );
  return id;
}

export async function updateProject(id: string, patch: Record<string, unknown>): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(([k, v]) => k !== 'id' && v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.execute(`UPDATE projects SET ${setClauses} WHERE id = ?`, [...values, id]);
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET project_id = NULL WHERE project_id = ?`, [id]);
  await db.execute(`DELETE FROM projects WHERE id = ?`, [id]);
}


// ─── Test utility: wipe all planner data ─────────────────────────────────────

export async function wipePlannerData(): Promise<void> {
  const db = getDb();
  // Drop the readd_ungrouped_if_empty trigger before wiping.
  // Without this, every DELETE on node_groups causes the trigger to re-insert
  // a row, making it impossible to empty the table and causing FK violations
  // when nodes are cascade-deleted.
  await db.execute(`DROP TRIGGER IF EXISTS readd_ungrouped_if_empty`);
  await db.execute(`DELETE FROM note_task_links`);
  await db.execute(`DELETE FROM productivity_logs`);
  await db.execute(`DELETE FROM sub_tasks`);
  await db.execute(`DELETE FROM node_groups`);
  await db.execute(`DELETE FROM nodes`);
  await db.execute(`DELETE FROM projects`);
  await db.execute(`DELETE FROM arcs`);
  await db.execute(`DELETE FROM planner_groups WHERE id != 'g-ungrouped'`);
  await db.execute(`UPDATE user_capacity SET daily_minutes=480, peak_start='09:00', peak_end='12:00' WHERE id='default'`);
  // Recreate the trigger for normal operation
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS readd_ungrouped_if_empty AFTER DELETE ON node_groups
    BEGIN
      INSERT OR IGNORE INTO node_groups(node_id, group_id)
      SELECT OLD.node_id, id FROM planner_groups
      WHERE is_ungrouped = 1
        AND NOT EXISTS (
          SELECT 1 FROM node_groups WHERE node_id = OLD.node_id
        );
    END
  `);
}
