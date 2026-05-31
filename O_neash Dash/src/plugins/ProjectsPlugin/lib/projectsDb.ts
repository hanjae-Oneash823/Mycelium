import { getDb } from '@/lib/db';

export type ProjectStatus = 'active' | 'done' | 'archived';

export interface Arc {
  id: string;
  name: string;
  color_hex: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
}

export interface Project {
  id: string;
  arc_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export async function getAllArcs(): Promise<Arc[]> {
  const db = getDb();
  return db.select<Arc[]>(`SELECT * FROM arcs ORDER BY created_at ASC`);
}

export async function createArc(name: string, color_hex: string): Promise<Arc> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO arcs (id, name, color_hex, description, status) VALUES (?, ?, ?, '', 'active')`,
    [id, name, color_hex],
  );
  const rows = await db.select<Arc[]>(`SELECT * FROM arcs WHERE id = ?`, [id]);
  return rows[0];
}

export async function updateArc(
  id: string,
  fields: Partial<Pick<Arc, 'name' | 'color_hex' | 'description' | 'status'>>,
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  await db.execute(`UPDATE arcs SET ${sets} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

export async function cascadeArcStatus(arcId: string, status: ProjectStatus): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE arcs SET status = ? WHERE id = ?`, [status, arcId]);
  await db.execute(`UPDATE projects SET status = ? WHERE arc_id = ?`, [status, arcId]);
}

export async function deleteArc(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM arcs WHERE id = ?`, [id]);
}

export async function getAllProjects(): Promise<Project[]> {
  const db = getDb();
  return db.select<Project[]>(`SELECT * FROM projects WHERE arc_id IS NOT NULL ORDER BY created_at ASC`);
}

export async function createProject(arc_id: string, name: string): Promise<Project> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO projects (id, arc_id, name, description, status) VALUES (?, ?, ?, '', 'active')`,
    [id, arc_id, name],
  );
  const rows = await db.select<Project[]>(`SELECT * FROM projects WHERE id = ?`, [id]);
  return rows[0];
}

export async function updateProject(
  id: string,
  fields: Partial<Pick<Project, 'name' | 'description' | 'status' | 'start_date' | 'end_date' | 'arc_id'>>,
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  await db.execute(`UPDATE projects SET ${sets} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM projects WHERE id = ?`, [id]);
}

export interface ProjectCounts {
  nodeCount: number;
  noteCount: number;
}

export async function getAllArcNodeCounts(): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db.select<{ arc_id: string; count: number }[]>(
    `SELECT arc_id, COUNT(*) as count FROM nodes WHERE arc_id IS NOT NULL GROUP BY arc_id`,
  );
  return new Map(rows.map(r => [r.arc_id, r.count]));
}

export interface ProjectActivity {
  sparkline: number[]; // 7 values oldest→newest, task completions per day
  lastActiveDaysAgo: number | null;
}

export async function getAllProjectActivity(): Promise<Map<string, ProjectActivity>> {
  const db = getDb();
  const today = new Date();
  const days = 10;
  const since = new Date(today);
  since.setDate(since.getDate() - days + 1);
  const sinceStr = since.toISOString().slice(0, 10);

  const dayStrs: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayStrs.push(d.toISOString().slice(0, 10));
  }

  const [completions, lastNodes, lastNotes] = await Promise.all([
    db.select<{ project_id: string; date: string; count: number }[]>(
      `SELECT project_id, DATE(actual_completed_at) as date, COUNT(*) as count
       FROM nodes WHERE project_id IS NOT NULL AND actual_completed_at IS NOT NULL AND DATE(actual_completed_at) >= ?
       GROUP BY project_id, DATE(actual_completed_at)`,
      [sinceStr],
    ),
    db.select<{ project_id: string; last_at: string }[]>(
      `SELECT project_id, MAX(actual_completed_at) as last_at FROM nodes WHERE project_id IS NOT NULL AND actual_completed_at IS NOT NULL GROUP BY project_id`,
    ),
    db.select<{ project_id: string; last_at: string }[]>(
      `SELECT project_id, MAX(created_at) as last_at FROM notes WHERE project_id IS NOT NULL AND status = 'active' GROUP BY project_id`,
    ),
  ]);

  const sparkMap = new Map<string, Map<string, number>>();
  for (const r of completions) {
    if (!sparkMap.has(r.project_id)) sparkMap.set(r.project_id, new Map());
    sparkMap.get(r.project_id)!.set(r.date, r.count);
  }

  const lastMap = new Map<string, string>();
  for (const r of [...lastNodes, ...lastNotes]) {
    const existing = lastMap.get(r.project_id);
    if (!existing || r.last_at > existing) lastMap.set(r.project_id, r.last_at);
  }

  const allIds = new Set([...sparkMap.keys(), ...lastMap.keys()]);
  const todayMs = new Date(today.toISOString().slice(0, 10)).getTime();
  const result = new Map<string, ProjectActivity>();

  for (const pid of allIds) {
    const dm = sparkMap.get(pid) ?? new Map();
    const sparkline = dayStrs.map(d => dm.get(d) ?? 0);
    const lastAt = lastMap.get(pid);
    const lastActiveDaysAgo = lastAt
      ? Math.floor((todayMs - new Date(lastAt.slice(0, 10)).getTime()) / 86400000)
      : null;
    result.set(pid, { sparkline, lastActiveDaysAgo });
  }

  return result;
}

export interface ArcDayCount {
  arc_id: string;
  date: string;
  count: number;
}

export async function getArcActivityHistory(days = 30): Promise<ArcDayCount[]> {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  const sinceStr = since.toISOString().slice(0, 10);

  const [nodeCounts, noteCounts] = await Promise.all([
    db.select<{ arc_id: string; date: string; count: number }[]>(
      `SELECT arc_id, DATE(actual_completed_at) as date, COUNT(*) as count
       FROM nodes WHERE arc_id IS NOT NULL AND actual_completed_at IS NOT NULL AND DATE(actual_completed_at) >= ?
       GROUP BY arc_id, DATE(actual_completed_at)`,
      [sinceStr],
    ),
    db.select<{ arc_id: string; date: string; count: number }[]>(
      `SELECT arc_id, DATE(created_at) as date, COUNT(*) as count
       FROM notes WHERE arc_id IS NOT NULL AND status = 'active' AND DATE(created_at) >= ?
       GROUP BY arc_id, DATE(created_at)`,
      [sinceStr],
    ),
  ]);

  const map = new Map<string, number>();
  for (const r of [...nodeCounts, ...noteCounts]) {
    const key = `${r.arc_id}|${r.date}`;
    map.set(key, (map.get(key) ?? 0) + r.count);
  }

  return Array.from(map.entries()).map(([key, count]) => {
    const [arc_id, date] = key.split('|');
    return { arc_id, date, count };
  });
}

export async function getAllProjectCounts(): Promise<Map<string, ProjectCounts>> {
  const db = getDb();
  const [nodeCounts, noteCounts] = await Promise.all([
    db.select<{ project_id: string; count: number }[]>(
      `SELECT project_id, COUNT(*) as count FROM nodes WHERE project_id IS NOT NULL GROUP BY project_id`,
    ),
    db.select<{ project_id: string; count: number }[]>(
      `SELECT project_id, COUNT(*) as count FROM notes WHERE project_id IS NOT NULL AND status = 'active' GROUP BY project_id`,
    ),
  ]);
  const map = new Map<string, ProjectCounts>();
  for (const r of nodeCounts) map.set(r.project_id, { nodeCount: r.count, noteCount: 0 });
  for (const r of noteCounts) {
    const existing = map.get(r.project_id) ?? { nodeCount: 0, noteCount: 0 };
    map.set(r.project_id, { ...existing, noteCount: r.count });
  }
  return map;
}
