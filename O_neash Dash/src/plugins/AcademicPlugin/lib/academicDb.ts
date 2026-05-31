import { getDb } from '@/lib/db';

export interface AcademicNode {
  id: string;
  project_id: string;
  title: string;
  node_type: 'task' | 'event';
  due_at: string | null;
  planned_start_at: string | null;
  is_completed: boolean;
  actual_completed_at: string | null;
  importance_level: number;
  estimated_duration_minutes: number | null;
  is_routine: boolean;
}

export interface CompletionPoint {
  date: string;
  count: number;
}

export async function loadAcademicSubjectIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select<{ project_id: string }[]>(
    `SELECT project_id FROM academic_subjects ORDER BY sort_order ASC, created_at ASC`,
  );
  return rows.map(r => r.project_id);
}

export async function addAcademicSubject(projectId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT OR IGNORE INTO academic_subjects (project_id) VALUES (?)`,
    [projectId],
  );
}

export async function removeAcademicSubject(projectId: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM academic_subjects WHERE project_id = ?`, [projectId]);
}

export async function loadNodesForProjects(
  projectIds: string[],
): Promise<Map<string, AcademicNode[]>> {
  const map = new Map<string, AcademicNode[]>();
  if (projectIds.length === 0) return map;
  for (const pid of projectIds) map.set(pid, []);

  const db = getDb();
  const placeholders = projectIds.map(() => '?').join(',');
  const rows = await db.select<AcademicNode[]>(
    `SELECT id, project_id, title, node_type, due_at, planned_start_at,
            is_completed, actual_completed_at, importance_level, estimated_duration_minutes, is_routine
     FROM nodes
     WHERE project_id IN (${placeholders})
     ORDER BY COALESCE(due_at, planned_start_at) ASC, created_at ASC`,
    projectIds,
  );
  for (const row of rows) {
    row.is_completed = Boolean(row.is_completed);
    row.is_routine = Boolean(row.is_routine);
    map.get(row.project_id)?.push(row);
  }
  return map;
}

export async function loadCompletionHistories(
  projectIds: string[],
): Promise<Map<string, CompletionPoint[]>> {
  const map = new Map<string, CompletionPoint[]>();
  if (projectIds.length === 0) return map;
  for (const pid of projectIds) map.set(pid, []);

  const db = getDb();
  const placeholders = projectIds.map(() => '?').join(',');
  const rows = await db.select<{ project_id: string; date: string; count: number }[]>(
    `SELECT project_id, DATE(actual_completed_at) as date, COUNT(*) as count
     FROM nodes
     WHERE project_id IN (${placeholders}) AND actual_completed_at IS NOT NULL
     GROUP BY project_id, DATE(actual_completed_at)
     ORDER BY date ASC`,
    projectIds,
  );
  for (const row of rows) {
    map.get(row.project_id)?.push({ date: row.date, count: row.count });
  }
  return map;
}

export interface DailyNodeSummary {
  count: number;
  items: { title: string; node_type: string; arc_color: string }[];
}

export async function loadDailyNodeCounts(days: string[]): Promise<Map<string, DailyNodeSummary>> {
  if (days.length === 0) return new Map();
  const db = getDb();
  const placeholders = days.map(() => '?').join(',');
  const rows = await db.select<{ day: string; title: string; node_type: string; arc_color: string }[]>(
    `SELECT DATE(n.planned_start_at) as day, n.title, n.node_type,
            COALESCE(a.color_hex, '#ffffff') as arc_color
     FROM nodes n
     LEFT JOIN projects p ON p.id = n.project_id
     LEFT JOIN arcs a ON a.id = p.arc_id
     WHERE n.is_completed = 0 AND DATE(n.planned_start_at) IN (${placeholders})
     ORDER BY DATE(n.planned_start_at), n.created_at`,
    days,
  );
  const map = new Map<string, DailyNodeSummary>();
  for (const r of rows) {
    if (!map.has(r.day)) map.set(r.day, { count: 0, items: [] });
    const entry = map.get(r.day)!;
    entry.count++;
    entry.items.push({ title: r.title, node_type: r.node_type, arc_color: r.arc_color });
  }
  return map;
}

export async function updateNodePlannedDate(nodeId: string, date: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET planned_start_at = ? WHERE id = ?`, [date + ' 00:00:00', nodeId]);
}

export async function createAcademicNode(
  projectId: string,
  arcId: string | null,
  title: string,
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10) + ' 00:00:00';
  await db.execute(
    `INSERT INTO nodes (id, project_id, arc_id, title, node_type, planned_start_at, is_completed, importance_level)
     VALUES (?, ?, ?, ?, 'task', ?, 0, 0)`,
    [id, projectId, arcId, title, today],
  );
  return id;
}
