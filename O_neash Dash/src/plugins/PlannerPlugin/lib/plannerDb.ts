import { getDb } from '@/lib/db';
import { computeUrgencyLevel, toDateString } from './logicEngine';
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
  const db    = getDb();
  const now   = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateString(today);

  for (const row of rows) {
    row.groups       = await getNodeGroups(row.id);
    row.is_completed = Boolean(row.is_completed);
    row.is_locked    = Boolean(row.is_locked);
    row.is_recovery  = Boolean(row.is_recovery);
    row.is_pinned    = Boolean(row.is_pinned);

    // ── Compute is_overdue fresh from due_at — don't trust stale DB column ───
    // Use toDateString(new Date(...)) to extract LOCAL date — avoids UTC-shift bugs
    // where a datetime like '2026-03-21T15:00:00Z' (= midnight KST March 22) would
    // slice to '2026-03-21' and be treated as yesterday.
    const dueDateStr = row.due_at
      ? (row.due_at.length === 10 ? row.due_at : toDateString(new Date(row.due_at)))
      : null;
    row.is_overdue =
      !row.is_completed && !!row.due_at && !!dueDateStr && dueDateStr < todayStr;

    // ── WTDI auto-advance for assignments ────────────────────────────────────
    // If assignment's planned date has passed but it's not yet overdue, push to today
    if (!row.is_completed && !row.is_overdue && row.due_at && row.planned_start_at) {
      const wtdiStr = row.planned_start_at.length === 10
        ? row.planned_start_at
        : toDateString(new Date(row.planned_start_at));
      if (wtdiStr < todayStr) {
        // Preserve any time suffix (e.g. "T12:30:00") when advancing the date
        const timeSuffix = row.planned_start_at.length > 10 ? row.planned_start_at.slice(10) : '';
        const newPlannedAt = todayStr + timeSuffix;
        await db.execute(`UPDATE nodes SET planned_start_at = ? WHERE id = ?`, [newPlannedAt, row.id]);
        row.planned_start_at = newPlannedAt;
      }
    }

    // ── Missed schedule: flexible task whose planned date has passed ──────────
    const plannedDateStr = row.planned_start_at
      ? (row.planned_start_at.length === 10 ? row.planned_start_at : toDateString(new Date(row.planned_start_at)))
      : null;
    row.is_missed_schedule =
      !row.is_completed && !row.is_overdue && !row.due_at &&
      !!row.planned_start_at && !!plannedDateStr && plannedDateStr < todayStr;

    // ── Recompute urgency level from current data ─────────────────────────────
    row.computed_urgency_level = computeUrgencyLevel(
      Boolean(row.importance_level),
      row.due_at,
      now,
      row.node_type === 'event',
    );
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
  // planned_start_at: when to work on it (schedule date)
  const scheduleDate = dateOverride ?? data.planned_start_at ?? null;
  // due_at: hard deadline — only set when explicitly provided.
  // Recurring event instances inherit the instance date as their deadline; normal flexible tasks get null.
  const dueDate = dateOverride != null ? dateOverride : (data.due_at ?? null);
  const isImportant = (data.importance_level ?? 0) === 1;
  const urgency = computeUrgencyLevel(isImportant, dueDate, new Date());
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
      scheduleDate,
      dueDate,
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
  // The readd_ungrouped_if_empty trigger re-inserts a row into node_groups whenever
  // one is deleted — which prevents CASCADE from ever fully removing child rows,
  // causing a FK violation and rolling back the entire DELETE. Drop it first.
  await db.execute(`DROP TRIGGER IF EXISTS readd_ungrouped_if_empty`);
  await db.execute(`DELETE FROM nodes WHERE id = ?`, [id]);
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
  if (n?.project_id) await syncProjectDates(n.project_id, n.arc_id);
  else if (n?.arc_id) await syncArcEndDate(n.arc_id);
}

export async function rescheduleNode(id: string, dateStr: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE nodes SET planned_start_at = ?,
      is_recovery = CASE WHEN due_at IS NOT NULL AND due_at < date('now') AND is_completed = 0 THEN 1 ELSE is_recovery END,
      recovery_set_at = CASE WHEN due_at IS NOT NULL AND due_at < date('now') AND is_completed = 0 THEN CURRENT_TIMESTAMP ELSE recovery_set_at END
     WHERE id = ?`,
    [dateStr, id]
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
  if (n < 2 || !earliest || !latest) {
    await db.execute(`UPDATE projects SET start_date = NULL, end_date = NULL WHERE id = ?`, [projectId]);
  } else {
    await db.execute(
      `UPDATE projects SET start_date = ?, end_date = ? WHERE id = ?`,
      [earliest.slice(0, 10), latest.slice(0, 10), projectId]
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


// ─── Dev utility: seed dummy data ────────────────────────────────────────────

export async function seedDummyData(): Promise<void> {
  const db = getDb();

  // Local-midnight date helper (avoids UTC shift)
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const d = (offset: number): string => {
    const dt = new Date(base);
    dt.setDate(dt.getDate() + offset);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  // ── Groups ────────────────────────────────────────────────────────────────
  const gWork    = crypto.randomUUID();
  const gHealth  = crypto.randomUUID();
  const gAdmin   = crypto.randomUUID();
  const gLearn   = crypto.randomUUID();
  await db.execute(`INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`, [gWork,   'Deep Work', '#00c4a7', 10]);
  await db.execute(`INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`, [gHealth, 'Health',    '#4ade80', 11]);
  await db.execute(`INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`, [gAdmin,  'Admin',     '#64c8ff', 12]);
  await db.execute(`INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`, [gLearn,  'Learning',  '#c084fc', 13]);

  // ── Arcs ──────────────────────────────────────────────────────────────────
  const arcQ1      = crypto.randomUUID();
  const arcLearn   = crypto.randomUUID();
  const arcFinance = crypto.randomUUID();
  await db.execute(`INSERT INTO arcs(id,name,color_hex,start_date,end_date) VALUES (?,?,?,?,?)`, [arcQ1,      'Q1 2026',         '#00c4a7', d(-76), d(13)]);
  await db.execute(`INSERT INTO arcs(id,name,color_hex,start_date,end_date) VALUES (?,?,?,?,?)`, [arcLearn,   'Learning Track',  '#c084fc', d(-45), d(74)]);
  await db.execute(`INSERT INTO arcs(id,name,color_hex,start_date,end_date) VALUES (?,?,?,?,?)`, [arcFinance, 'Personal Finance','#f5c842', d(-10), d(30)]);

  // ── Projects ──────────────────────────────────────────────────────────────
  const projWeb    = crypto.randomUUID();
  const projFit    = crypto.randomUUID();
  const projTax    = crypto.randomUUID();
  const projKorean = crypto.randomUUID();
  await db.execute(`INSERT INTO projects(id,name,color_hex,arc_id) VALUES (?,?,?,?)`, [projWeb,    'Website Redesign', '#00c4a7', arcQ1]);
  await db.execute(`INSERT INTO projects(id,name,color_hex,arc_id) VALUES (?,?,?,?)`, [projFit,    'Fitness Goal',     '#4ade80', arcLearn]);
  await db.execute(`INSERT INTO projects(id,name,color_hex,arc_id) VALUES (?,?,?,?)`, [projTax,    'Tax Filing',       '#f5c842', arcFinance]);
  await db.execute(`INSERT INTO projects(id,name,color_hex,arc_id) VALUES (?,?,?,?)`, [projKorean, 'Korean TOPIK',     '#c084fc', arcLearn]);

  // Node inserter — planned = schedule date, due = hard deadline (optional)
  const ins = async (
    title: string,
    opts: {
      type?: string; planned?: string | null; due?: string | null; desc?: string | null;
      dur?: number; imp?: number; urg?: number;
      overdue?: number; recovery?: number; pinned?: number;
      arc?: string | null; proj?: string | null; grps?: string[];
    },
  ) => {
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO nodes(id,title,description,node_type,planned_start_at,due_at,
        estimated_duration_minutes,importance_level,computed_urgency_level,
        is_overdue,is_recovery,is_pinned,arc_id,project_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, title, opts.desc ?? null, opts.type ?? 'task',
        opts.planned ?? null, opts.due ?? null,
        opts.dur ?? 60, opts.imp ?? 0, opts.urg ?? 0,
        opts.overdue ?? 0, opts.recovery ?? 0, opts.pinned ?? 0,
        opts.arc ?? null, opts.proj ?? null,
      ],
    );
    for (const gid of opts.grps ?? []) {
      await db.execute(`INSERT OR IGNORE INTO node_groups(node_id,group_id) VALUES (?,?)`, [id, gid]);
    }
  };

  // ── HARD-DEADLINE OVERDUE (due_at passed, is_overdue=1) ───────────────────
  // These are rigid tasks with a hard due date that has already passed.
  await ins('Fix login bug',          { planned: d(-8), due: d(-8), dur: 120, imp: 1, urg: 4, overdue: 1, arc: arcQ1,      proj: projWeb,    grps: [gWork]  });
  await ins('Submit Q1 expense report',{ planned: d(-5), due: d(-3), dur:  30, imp: 1, urg: 4, overdue: 1, arc: arcFinance, proj: projTax,    grps: [gAdmin] });
  await ins('Update CV',              { planned: d(-3), due: d(-1), dur:  45, imp: 0, urg: 3, overdue: 1,                                    grps: [gAdmin] });

  // ── MISSED SCHEDULE (flexible, no due_at, planned date passed) ────────────
  // These tasks had no hard deadline — they just slipped their planned date.
  await ins('Grocery shopping',  { planned: d(-3), dur:  25, imp: 0, urg: 2 });
  await ins('Read SICP ch.3',    { planned: d(-5), dur:  60, imp: 0, urg: 1, arc: arcLearn,             grps: [gLearn] });
  await ins('Clean desk',        { planned: d(-2), dur:  20, imp: 0, urg: 2 });
  await ins('Review flashcards', { planned: d(-1), dur:  15, imp: 0, urg: 1, arc: arcLearn, proj: projKorean, grps: [gLearn] });

  // ── RECOVERY (hard-deadline overdue → rescheduled to today) ───────────────
  await ins('Update dependencies', { planned: d(0), due: d(0), dur: 45, imp: 1, urg: 4, recovery: 1, arc: arcQ1, proj: projWeb, grps: [gWork] });

  // ── TODAY — hard-deadline tasks (planned=today, due=today or soon) ─────────
  await ins('Review PR #42',     { planned: d(0), due: d(0),  dur:  60, imp: 1, urg: 4, arc: arcQ1,      proj: projWeb, grps: [gWork]  });
  await ins('Pay rent',          { planned: d(0), due: d(2),  dur:  10, imp: 1, urg: 3,                                 grps: [gAdmin] });
  await ins('TOPIK application', { planned: d(0), due: d(5),  dur:  45, imp: 1, urg: 2, arc: arcLearn, proj: projKorean, grps: [gLearn], desc: 'Fill out and submit the TOPIK II exam registration form' });

  // ── TODAY — flexible tasks (no due_at) ────────────────────────────────────
  await ins('Morning run',       { planned: d(0), dur:  30, imp: 0, urg: 3, arc: arcLearn, proj: projFit, grps: [gHealth] });
  await ins('Respond to emails', { planned: d(0), dur:  20, imp: 0, urg: 3,                               grps: [gAdmin]  });

  // ── TODAY — events ────────────────────────────────────────────────────────
  await ins('Daily standup', { type: 'event', planned: `${d(0)}T09:30:00`, dur: 15, grps: [gAdmin] });
  await ins('Team sync',     { type: 'event', planned: `${d(0)}T14:00:00`, dur: 60, grps: [gWork]  });

  // ── D+1 — mixed ───────────────────────────────────────────────────────────
  // Hard deadline: due very soon, urgency should escalate
  await ins('Deploy to staging',    { planned: d(1), due: d(2),  dur:  90, imp: 1, urg: 2, arc: arcQ1, proj: projWeb, grps: [gWork]  });
  // Flexible: just scheduled, no deadline
  await ins('Meditation practice',  { planned: d(1),             dur:  20, imp: 0, urg: 1,                            grps: [gHealth] });
  await ins('Vocab drill — TOPIK',  { planned: d(1),             dur:  30, imp: 0, urg: 1, arc: arcLearn, proj: projKorean, grps: [gLearn] });

  // ── D+2 ───────────────────────────────────────────────────────────────────
  // Hard deadline: design hand-off has a firm date
  await ins('Finalize design mockups', { planned: d(2), due: d(4),  dur:  120, imp: 1, urg: 2, arc: arcQ1,      proj: projWeb,  grps: [gWork]  });
  // Hard deadline: tax prep with firm filing date
  await ins('Gather tax documents',    { planned: d(2), due: d(8),  dur:   60, imp: 1, urg: 1, arc: arcFinance, proj: projTax,  grps: [gAdmin] });
  // Event
  await ins('Dentist appointment', { type: 'event', planned: `${d(2)}T11:00:00`, dur: 60, grps: [gHealth] });
  // Flexible
  await ins('Set up new laptop',   { planned: d(2), dur: 90, imp: 0, urg: 1, pinned: 1 });

  // ── D+3 ───────────────────────────────────────────────────────────────────
  // Hard deadline: code review must ship before D+5 deploy
  await ins('Code review: auth module', { planned: d(3), due: d(5),  dur:  60, imp: 1, urg: 2, arc: arcQ1, proj: projWeb, grps: [gWork]  });
  // Flexible
  await ins('Read SICP ch.4',           { planned: d(3),             dur:  60, imp: 0, urg: 1, arc: arcLearn,             grps: [gLearn] });
  // Event
  await ins('Korean tutoring', { type: 'event', planned: `${d(3)}T18:00:00`, dur: 60, arc: arcLearn, proj: projKorean, grps: [gLearn] });

  // ── D+4 ───────────────────────────────────────────────────────────────────
  await ins('Doctor checkup', { type: 'event', planned: `${d(4)}T10:30:00`, dur: 30, grps: [gHealth] });
  // Flexible
  await ins('Weekly review',  { planned: d(4), dur: 45, imp: 0, urg: 1, grps: [gAdmin] });

  // ── D+5 ───────────────────────────────────────────────────────────────────
  // Hard deadline: deploy on exact date
  await ins('Deploy to production',  { planned: d(5), due: d(5),  dur:  90, imp: 1, urg: 2, arc: arcQ1, proj: projWeb, grps: [gWork] });
  // Flexible
  await ins('Refactor auth module',  { planned: d(5),             dur: 120, imp: 1, urg: 1, arc: arcQ1, proj: projWeb, grps: [gWork] });

  // ── D+7 ───────────────────────────────────────────────────────────────────
  // Hard deadline: arc milestone
  await ins('Q1 retrospective',      { planned: d(7), due: d(8),  dur:  60, imp: 1, urg: 1, arc: arcQ1 });
  // Hard deadline: file taxes
  await ins('Submit tax return',     { planned: d(7), due: d(8),  dur:  30, imp: 1, urg: 1, arc: arcFinance, proj: projTax, grps: [gAdmin], desc: 'Final filing — income + deductions verified' });
  // Flexible
  await ins('5K run',                { planned: d(7),             dur:  35, imp: 0, urg: 1, arc: arcLearn, proj: projFit, grps: [gHealth] });
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

// ─── Analytics queries ────────────────────────────────────────────────────────

export interface TodayDoneSummary {
  count: number;
  effortMinutes: number;
}

export async function loadTodayDoneSummary(): Promise<TodayDoneSummary> {
  const db = getDb();
  const today = toDateString(new Date());
  const rows = await db.select<{ count: number; effort: number }[]>(
    `SELECT COUNT(*) as count, SUM(COALESCE(estimated_duration_minutes, 0)) as effort
     FROM nodes WHERE DATE(actual_completed_at) = ? AND is_completed = 1`,
    [today],
  );
  return { count: rows[0]?.count ?? 0, effortMinutes: rows[0]?.effort ?? 0 };
}

export interface DayCompletion {
  date: string;
  count: number;
}

export async function loadSevenDayCompletions(): Promise<DayCompletion[]> {
  const db = getDb();
  const rows = await db.select<{ day: string; count: number }[]>(
    `SELECT DATE(actual_completed_at) as day, COUNT(*) as count
     FROM nodes
     WHERE actual_completed_at >= DATE('now', '-6 days') AND is_completed = 1
     GROUP BY day`,
  );
  const result: DayCompletion[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = toDateString(d);
    result.push({ date: dateStr, count: rows.find(r => r.day === dateStr)?.count ?? 0 });
  }
  return result;
}

export interface ArcNodeCount {
  arc_id: string;
  total: number;
  done: number;
}

export async function loadTodayCompletedNodes(): Promise<PlannerNode[]> {
  const db = getDb();
  const today = toDateString(new Date());
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.is_completed = 1 AND DATE(n.actual_completed_at) = ? ORDER BY n.actual_completed_at DESC`,
    [today]
  );
  return hydrateRows(rows);
}

export async function uncompleteNode(id: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE nodes SET is_completed = 0, actual_completed_at = NULL WHERE id = ?`,
    [id]
  );
  await db.execute(`DELETE FROM productivity_logs WHERE node_id = ?`, [id]);
}

export async function loadArcNodeCounts(): Promise<ArcNodeCount[]> {
  const db = getDb();
  const rows = await db.select<{ arc_id: string; total: number; done: number }[]>(
    `SELECT arc_id,
            COUNT(*) AS total,
            SUM(is_completed) AS done
     FROM nodes
     WHERE arc_id IS NOT NULL
     GROUP BY arc_id`,
  );
  return rows;
}
