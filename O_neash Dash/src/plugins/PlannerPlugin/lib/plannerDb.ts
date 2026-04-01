import { getDb } from "@/lib/db";
import { computeUrgencyLevel, toDateString } from "./logicEngine";
import type {
  PlannerNode,
  PlannerGroup,
  Arc,
  Project,
  UserCapacity,
  CreateNodeData,
  ImportanceLevel,
} from "../types";

// ─── Loaders ────────────────────────────────────────────────────────────────

const NODE_SELECT = `
  SELECT n.*,
    (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id) AS sub_total,
    (SELECT COUNT(*) FROM sub_tasks s WHERE s.node_id = n.id AND s.is_completed = 1) AS sub_done
  FROM nodes n`;

async function hydrateRows(rows: PlannerNode[]): Promise<PlannerNode[]> {
  const db = getDb();
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateString(today);

  for (const row of rows) {
    row.groups = await getNodeGroups(row.id);
    row.is_completed = Boolean(row.is_completed);
    row.is_locked = Boolean(row.is_locked);
    row.is_pinned = Boolean(row.is_pinned);
    row.is_frog_pinned = Boolean(row.is_frog_pinned);
    row.is_routine = Boolean(row.is_routine);

    // ── Compute is_overdue fresh from due_at — don't trust stale DB column ───
    // Use toDateString(new Date(...)) to extract LOCAL date — avoids UTC-shift bugs
    // where a datetime like '2026-03-21T15:00:00Z' (= midnight KST March 22) would
    // slice to '2026-03-21' and be treated as yesterday.
    const dueDateStr = row.due_at
      ? row.due_at.length === 10
        ? row.due_at
        : toDateString(new Date(row.due_at))
      : null;
    // Routine nodes have no due_at — treat them as overdue when their planned date has passed
    const routinePlannedStr = row.is_routine && row.planned_start_at
      ? row.planned_start_at.length === 10
        ? row.planned_start_at
        : toDateString(new Date(row.planned_start_at))
      : null;
    row.is_overdue =
      !row.is_completed && (
        (!!row.due_at && !!dueDateStr && dueDateStr < todayStr) ||
        (!!row.is_routine && !!routinePlannedStr && routinePlannedStr < todayStr)
      );

    // ── WTDI auto-advance for assignments ────────────────────────────────────
    // If assignment's planned date has passed but it's not yet overdue, push to today
    if (
      !row.is_completed &&
      !row.is_overdue &&
      row.due_at &&
      row.planned_start_at
    ) {
      const wtdiStr =
        row.planned_start_at.length === 10
          ? row.planned_start_at
          : toDateString(new Date(row.planned_start_at));
      if (wtdiStr < todayStr) {
        // Preserve any time suffix (e.g. "T12:30:00") when advancing the date
        const timeSuffix =
          row.planned_start_at.length > 10
            ? row.planned_start_at.slice(10)
            : "";
        const newPlannedAt = todayStr + timeSuffix;
        await db.execute(`UPDATE nodes SET planned_start_at = ? WHERE id = ?`, [
          newPlannedAt,
          row.id,
        ]);
        row.planned_start_at = newPlannedAt;
      }
    }

    // ── Missed schedule: flexible task whose planned date has passed ──────────
    const plannedDateStr = row.planned_start_at
      ? row.planned_start_at.length === 10
        ? row.planned_start_at
        : toDateString(new Date(row.planned_start_at))
      : null;
    row.is_missed_schedule =
      !row.is_completed &&
      !row.is_overdue &&
      !row.due_at &&
      !row.is_routine &&
      !!row.planned_start_at &&
      !!plannedDateStr &&
      plannedDateStr < todayStr;

    // ── Recompute urgency level from current data ─────────────────────────────
    row.computed_urgency_level = computeUrgencyLevel(
      Boolean(row.importance_level),
      row.due_at,
      now,
      row.node_type === "event",
    );
  }
  return rows;
}

export async function loadNodes(): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.is_completed = 0 ORDER BY n.created_at DESC`,
  );
  return hydrateRows(rows);
}

/** All event-type nodes (routine or not, completed or not) in [from, to] for the weekly calendar. */
export async function loadEventNodesForWeek(from: string, to: string): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.node_type = 'event' AND substr(n.planned_start_at, 1, 10) >= ? AND substr(n.planned_start_at, 1, 10) <= ? ORDER BY n.planned_start_at ASC`,
    [from, to],
  );
  return hydrateRows(rows);
}

export async function loadRoutineNodesForWeek(from: string, to: string): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.is_routine = 1 AND substr(n.planned_start_at, 1, 10) >= ? AND substr(n.planned_start_at, 1, 10) <= ? ORDER BY n.planned_start_at ASC`,
    [from, to],
  );
  return hydrateRows(rows);
}

export async function loadAllNodes(): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} ORDER BY n.created_at DESC`,
  );
  return hydrateRows(rows);
}

export async function loadNodeById(id: string): Promise<PlannerNode | null> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  const hydrated = await hydrateRows(rows);
  return hydrated[0];
}

export async function loadGroups(): Promise<PlannerGroup[]> {
  const db = getDb();
  const rows = await db.select<PlannerGroup[]>(
    `SELECT * FROM planner_groups ORDER BY sort_order ASC, name ASC`,
  );
  return rows.map((r) => ({
    ...r,
    is_ungrouped: Boolean(r.is_ungrouped),
  }));
}

export async function loadArcs(): Promise<Arc[]> {
  const db = getDb();
  return db.select<Arc[]>(`SELECT * FROM arcs ORDER BY created_at ASC`);
}

export async function loadProjects(): Promise<Project[]> {
  const db = getDb();
  return db.select<Project[]>(`SELECT * FROM projects ORDER BY created_at ASC`);
}

export async function loadUserCapacity(): Promise<UserCapacity> {
  const db = getDb();
  const rows = await db.select<UserCapacity[]>(
    `SELECT * FROM user_capacity WHERE id = 'default' LIMIT 1`,
  );
  return (
    rows[0] ?? {
      id: "default",
      daily_minutes: 480,
      peak_start: "09:00",
      peak_end: "12:00",
      updated_at: new Date().toISOString(),
    }
  );
}

export async function getNodeGroups(nodeId: string): Promise<PlannerGroup[]> {
  const db = getDb();
  const rows = await db.select<PlannerGroup[]>(
    `SELECT pg.* FROM planner_groups pg
     JOIN node_groups ng ON ng.group_id = pg.id
     WHERE ng.node_id = ?
     ORDER BY pg.sort_order ASC`,
    [nodeId],
  );
  return rows.map((r) => ({
    ...r,
    is_ungrouped: Boolean(r.is_ungrouped),
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
    `INSERT INTO nodes (id, title, node_type, planned_start_at, due_at,
       estimated_duration_minutes, importance_level, computed_urgency_level, project_id, arc_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.title,
      data.node_type ?? "task",
      scheduleDate,
      dueDate,
      data.estimated_duration_minutes ?? null,
      data.importance_level ?? 0,
      urgency,
      data.project_id ?? null,
      data.arc_id ?? null,
    ],
  );
  if (data.group_ids && data.group_ids.length > 0) {
    for (const gid of data.group_ids) {
      await db.execute(
        `INSERT OR IGNORE INTO node_groups(node_id, group_id) VALUES (?, ?)`,
        [id, gid],
      );
    }
  }
  return id;
}

export async function createNode(data: CreateNodeData): Promise<string> {
  return insertSingleNode(data);
}

export async function updateNode(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(
    ([k, v]) => k !== "id" && v !== undefined,
  );
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  await db.execute(`UPDATE nodes SET ${setClauses} WHERE id = ?`, [
    ...values,
    id,
  ]);
}

export async function deleteNode(id: string): Promise<void> {
  const db = getDb();
  const nodeRows = await db.select<
    { arc_id: string | null; project_id: string | null }[]
  >(`SELECT arc_id, project_id FROM nodes WHERE id = ?`, [id]);
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
}

export async function rescheduleNode(
  id: string,
  dateStr: string,
): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET planned_start_at = ? WHERE id = ?`, [
    dateStr,
    id,
  ]);
}

export async function completeNode(id: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE nodes SET is_completed = 1, actual_completed_at = ? WHERE id = ?`,
    [now, id],
  );
  const logId = crypto.randomUUID();
  await db.execute(
    `INSERT INTO productivity_logs(id, node_id, completed_at) VALUES (?, ?, ?)`,
    [logId, id, now],
  );
}

export async function setNodeOverdue(
  id: string,
  value: boolean,
): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET is_overdue = ? WHERE id = ?`, [
    value ? 1 : 0,
    id,
  ]);
}

export async function setNodeUrgency(
  id: string,
  level: ImportanceLevel,
): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET computed_urgency_level = ? WHERE id = ?`, [
    level,
    id,
  ]);
}

// ─── Group mutations ─────────────────────────────────────────────────────────

export async function createGroup(data: {
  name: string;
  color_hex: string;
}): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO planner_groups(id, name, color_hex) VALUES (?, ?, ?)`,
    [id, data.name, data.color_hex],
  );
  return id;
}

export async function updateGroup(
  id: string,
  patch: { name?: string; color_hex?: string },
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  await db.execute(`UPDATE planner_groups SET ${setClauses} WHERE id = ?`, [
    ...values,
    id,
  ]);
}

export async function deleteGroup(id: string): Promise<void> {
  if (id === "g-ungrouped")
    throw new Error("Cannot delete the system ungrouped group.");
  const db = getDb();
  await db.execute(`DELETE FROM planner_groups WHERE id = ?`, [id]);
}

export async function addNodeGroup(
  nodeId: string,
  groupId: string,
): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT OR IGNORE INTO node_groups(node_id, group_id) VALUES (?, ?)`,
    [nodeId, groupId],
  );
}

export async function removeNodeGroup(
  nodeId: string,
  groupId: string,
): Promise<void> {
  const db = getDb();
  await db.execute(
    `DELETE FROM node_groups WHERE node_id = ? AND group_id = ?`,
    [nodeId, groupId],
  );
}

/** Replace all non-system group associations for a node (used in edit mode). */
export async function replaceNodeGroups(
  nodeId: string,
  groupIds: string[],
): Promise<void> {
  const db = getDb();
  // Remove all real-group associations (keep nothing — triggers re-add ungrouped if empty)
  await db.execute(
    `DELETE FROM node_groups WHERE node_id = ? AND group_id != (SELECT id FROM planner_groups WHERE is_ungrouped = 1 LIMIT 1)`,
    [nodeId],
  );
  for (const gid of groupIds) {
    await db.execute(
      `INSERT OR IGNORE INTO node_groups(node_id, group_id) VALUES (?, ?)`,
      [nodeId, gid],
    );
  }
}

// ─── Arc mutations ────────────────────────────────────────────────────────────

export async function createArc(data: {
  name: string;
  color_hex: string;
}): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(`INSERT INTO arcs(id, name, color_hex) VALUES (?, ?, ?)`, [
    id,
    data.name,
    data.color_hex,
  ]);
  return id;
}

export async function updateArc(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(
    ([k, v]) => k !== "id" && v !== undefined,
  );
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  await db.execute(`UPDATE arcs SET ${setClauses} WHERE id = ?`, [
    ...values,
    id,
  ]);
}

export async function archiveArc(_id: string): Promise<void> {
  // is_archived column removed — no-op
}

export async function deleteArc(id: string): Promise<void> {
  const db = getDb();
  // Orphan child nodes and projects
  await db.execute(`UPDATE nodes SET arc_id = NULL WHERE arc_id = ?`, [id]);
  await db.execute(`UPDATE projects SET arc_id = NULL WHERE arc_id = ?`, [id]);
  await db.execute(`DELETE FROM arcs WHERE id = ?`, [id]);
}

// ─── Project mutations ────────────────────────────────────────────────────────

export async function createProject(data: {
  name: string;
  arc_id?: string;
}): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(`INSERT INTO projects(id, name, arc_id) VALUES (?, ?, ?)`, [
    id,
    data.name,
    data.arc_id ?? null,
  ]);
  return id;
}

export async function updateProject(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(patch).filter(
    ([k, v]) => k !== "id" && v !== undefined,
  );
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v);
  await db.execute(`UPDATE projects SET ${setClauses} WHERE id = ?`, [
    ...values,
    id,
  ]);
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET project_id = NULL WHERE project_id = ?`, [
    id,
  ]);
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
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  // ── Groups ────────────────────────────────────────────────────────────────
  const gWork = crypto.randomUUID();
  const gHealth = crypto.randomUUID();
  const gAdmin = crypto.randomUUID();
  const gLearn = crypto.randomUUID();
  await db.execute(
    `INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`,
    [gWork, "Deep Work", "#00c4a7", 10],
  );
  await db.execute(
    `INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`,
    [gHealth, "Health", "#4ade80", 11],
  );
  await db.execute(
    `INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`,
    [gAdmin, "Admin", "#64c8ff", 12],
  );
  await db.execute(
    `INSERT OR IGNORE INTO planner_groups(id,name,color_hex,sort_order) VALUES (?,?,?,?)`,
    [gLearn, "Learning", "#c084fc", 13],
  );

  // ── Arcs ──────────────────────────────────────────────────────────────────
  const arcQ1 = crypto.randomUUID();
  const arcLearn = crypto.randomUUID();
  const arcFinance = crypto.randomUUID();
  await db.execute(`INSERT INTO arcs(id,name,color_hex) VALUES (?,?,?)`, [
    arcQ1,
    "Q1 2026",
    "#00c4a7",
  ]);
  await db.execute(`INSERT INTO arcs(id,name,color_hex) VALUES (?,?,?)`, [
    arcLearn,
    "Learning Track",
    "#c084fc",
  ]);
  await db.execute(`INSERT INTO arcs(id,name,color_hex) VALUES (?,?,?)`, [
    arcFinance,
    "Personal Finance",
    "#f5c842",
  ]);

  // ── Projects ──────────────────────────────────────────────────────────────
  const projWeb = crypto.randomUUID();
  const projFit = crypto.randomUUID();
  const projTax = crypto.randomUUID();
  const projKorean = crypto.randomUUID();
  await db.execute(`INSERT INTO projects(id,name,arc_id) VALUES (?,?,?)`, [
    projWeb,
    "Website Redesign",
    arcQ1,
  ]);
  await db.execute(`INSERT INTO projects(id,name,arc_id) VALUES (?,?,?)`, [
    projFit,
    "Fitness Goal",
    arcLearn,
  ]);
  await db.execute(`INSERT INTO projects(id,name,arc_id) VALUES (?,?,?)`, [
    projTax,
    "Tax Filing",
    arcFinance,
  ]);
  await db.execute(`INSERT INTO projects(id,name,arc_id) VALUES (?,?,?)`, [
    projKorean,
    "Korean TOPIK",
    arcLearn,
  ]);

  // Node inserter — planned = schedule date, due = hard deadline (optional)
  const ins = async (
    title: string,
    opts: {
      type?: string;
      planned?: string | null;
      due?: string | null;
      dur?: number;
      imp?: number;
      urg?: number;
      overdue?: number;
      pinned?: number;
      arc?: string | null;
      proj?: string | null;
      grps?: string[];
    },
  ) => {
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO nodes(id,title,node_type,planned_start_at,due_at,
        estimated_duration_minutes,importance_level,computed_urgency_level,
        is_overdue,is_pinned,arc_id,project_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        title,
        opts.type ?? "task",
        opts.planned ?? null,
        opts.due ?? null,
        opts.dur ?? 60,
        opts.imp ?? 0,
        opts.urg ?? 0,
        opts.overdue ?? 0,
        opts.pinned ?? 0,
        opts.arc ?? null,
        opts.proj ?? null,
      ],
    );
    for (const gid of opts.grps ?? []) {
      await db.execute(
        `INSERT OR IGNORE INTO node_groups(node_id,group_id) VALUES (?,?)`,
        [id, gid],
      );
    }
  };

  // ── HARD-DEADLINE OVERDUE (due_at passed, is_overdue=1) ───────────────────
  // These are rigid tasks with a hard due date that has already passed.
  await ins("Fix login bug", {
    planned: d(-8),
    due: d(-8),
    dur: 120,
    imp: 1,
    urg: 4,
    overdue: 1,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });
  await ins("Submit Q1 expense report", {
    planned: d(-5),
    due: d(-3),
    dur: 30,
    imp: 1,
    urg: 4,
    overdue: 1,
    arc: arcFinance,
    proj: projTax,
    grps: [gAdmin],
  });
  await ins("Update CV", {
    planned: d(-3),
    due: d(-1),
    dur: 45,
    imp: 0,
    urg: 3,
    overdue: 1,
    grps: [gAdmin],
  });

  // ── MISSED SCHEDULE (flexible, no due_at, planned date passed) ────────────
  // These tasks had no hard deadline — they just slipped their planned date.
  await ins("Grocery shopping", { planned: d(-3), dur: 25, imp: 0, urg: 2 });
  await ins("Read SICP ch.3", {
    planned: d(-5),
    dur: 60,
    imp: 0,
    urg: 1,
    arc: arcLearn,
    grps: [gLearn],
  });
  await ins("Clean desk", { planned: d(-2), dur: 20, imp: 0, urg: 2 });
  await ins("Review flashcards", {
    planned: d(-1),
    dur: 15,
    imp: 0,
    urg: 1,
    arc: arcLearn,
    proj: projKorean,
    grps: [gLearn],
  });

  // ── RECOVERY (hard-deadline overdue → rescheduled to today) ───────────────
  await ins("Update dependencies", {
    planned: d(0),
    due: d(0),
    dur: 45,
    imp: 1,
    urg: 4,
    recovery: 1,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });

  // ── TODAY — hard-deadline tasks (planned=today, due=today or soon) ─────────
  await ins("Review PR #42", {
    planned: d(0),
    due: d(0),
    dur: 60,
    imp: 1,
    urg: 4,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });
  await ins("Pay rent", {
    planned: d(0),
    due: d(2),
    dur: 10,
    imp: 1,
    urg: 3,
    grps: [gAdmin],
  });
  await ins("TOPIK application", {
    planned: d(0),
    due: d(5),
    dur: 45,
    imp: 1,
    urg: 2,
    arc: arcLearn,
    proj: projKorean,
    grps: [gLearn],
  });

  // ── TODAY — flexible tasks (no due_at) ────────────────────────────────────
  await ins("Morning run", {
    planned: d(0),
    dur: 30,
    imp: 0,
    urg: 3,
    arc: arcLearn,
    proj: projFit,
    grps: [gHealth],
  });
  await ins("Respond to emails", {
    planned: d(0),
    dur: 20,
    imp: 0,
    urg: 3,
    grps: [gAdmin],
  });

  // ── TODAY — events ────────────────────────────────────────────────────────
  await ins("Daily standup", {
    type: "event",
    planned: `${d(0)}T09:30:00`,
    dur: 15,
    grps: [gAdmin],
  });
  await ins("Team sync", {
    type: "event",
    planned: `${d(0)}T14:00:00`,
    dur: 60,
    grps: [gWork],
  });

  // ── D+1 — mixed ───────────────────────────────────────────────────────────
  // Hard deadline: due very soon, urgency should escalate
  await ins("Deploy to staging", {
    planned: d(1),
    due: d(2),
    dur: 90,
    imp: 1,
    urg: 2,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });
  // Flexible: just scheduled, no deadline
  await ins("Meditation practice", {
    planned: d(1),
    dur: 20,
    imp: 0,
    urg: 1,
    grps: [gHealth],
  });
  await ins("Vocab drill — TOPIK", {
    planned: d(1),
    dur: 30,
    imp: 0,
    urg: 1,
    arc: arcLearn,
    proj: projKorean,
    grps: [gLearn],
  });

  // ── D+2 ───────────────────────────────────────────────────────────────────
  // Hard deadline: design hand-off has a firm date
  await ins("Finalize design mockups", {
    planned: d(2),
    due: d(4),
    dur: 120,
    imp: 1,
    urg: 2,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });
  // Hard deadline: tax prep with firm filing date
  await ins("Gather tax documents", {
    planned: d(2),
    due: d(8),
    dur: 60,
    imp: 1,
    urg: 1,
    arc: arcFinance,
    proj: projTax,
    grps: [gAdmin],
  });
  // Event
  await ins("Dentist appointment", {
    type: "event",
    planned: `${d(2)}T11:00:00`,
    dur: 60,
    grps: [gHealth],
  });
  // Flexible
  await ins("Set up new laptop", {
    planned: d(2),
    dur: 90,
    imp: 0,
    urg: 1,
    pinned: 1,
  });

  // ── D+3 ───────────────────────────────────────────────────────────────────
  // Hard deadline: code review must ship before D+5 deploy
  await ins("Code review: auth module", {
    planned: d(3),
    due: d(5),
    dur: 60,
    imp: 1,
    urg: 2,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });
  // Flexible
  await ins("Read SICP ch.4", {
    planned: d(3),
    dur: 60,
    imp: 0,
    urg: 1,
    arc: arcLearn,
    grps: [gLearn],
  });
  // Event
  await ins("Korean tutoring", {
    type: "event",
    planned: `${d(3)}T18:00:00`,
    dur: 60,
    arc: arcLearn,
    proj: projKorean,
    grps: [gLearn],
  });

  // ── D+4 ───────────────────────────────────────────────────────────────────
  await ins("Doctor checkup", {
    type: "event",
    planned: `${d(4)}T10:30:00`,
    dur: 30,
    grps: [gHealth],
  });
  // Flexible
  await ins("Weekly review", {
    planned: d(4),
    dur: 45,
    imp: 0,
    urg: 1,
    grps: [gAdmin],
  });

  // ── D+5 ───────────────────────────────────────────────────────────────────
  // Hard deadline: deploy on exact date
  await ins("Deploy to production", {
    planned: d(5),
    due: d(5),
    dur: 90,
    imp: 1,
    urg: 2,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });
  // Flexible
  await ins("Refactor auth module", {
    planned: d(5),
    dur: 120,
    imp: 1,
    urg: 1,
    arc: arcQ1,
    proj: projWeb,
    grps: [gWork],
  });

  // ── D+7 ───────────────────────────────────────────────────────────────────
  // Hard deadline: arc milestone
  await ins("Q1 retrospective", {
    planned: d(7),
    due: d(8),
    dur: 60,
    imp: 1,
    urg: 1,
    arc: arcQ1,
  });
  // Hard deadline: file taxes
  await ins("Submit tax return", {
    planned: d(7),
    due: d(8),
    dur: 30,
    imp: 1,
    urg: 1,
    arc: arcFinance,
    proj: projTax,
    grps: [gAdmin],
  });
  // Flexible
  await ins("5K run", {
    planned: d(7),
    dur: 35,
    imp: 0,
    urg: 1,
    arc: arcLearn,
    proj: projFit,
    grps: [gHealth],
  });
}

// ─── Test utility: wipe all planner data ─────────────────────────────────────

export async function wipePlannerData(): Promise<void> {
  const db = getDb();
  // Drop the readd_ungrouped_if_empty trigger before wiping.
  // Without this, every DELETE on node_groups causes the trigger to re-insert
  // a row, making it impossible to empty the table and causing FK violations
  // when nodes are cascade-deleted.
  await db.execute(`DROP TRIGGER IF EXISTS readd_ungrouped_if_empty`);
  await db.execute(`DELETE FROM productivity_logs`);
  await db.execute(`DELETE FROM sub_tasks`);
  await db.execute(`DELETE FROM node_groups`);
  await db.execute(`DELETE FROM nodes`);
  await db.execute(`DELETE FROM projects`);
  await db.execute(`DELETE FROM arcs`);
  await db.execute(`DELETE FROM planner_groups WHERE id != 'g-ungrouped'`);
  await db.execute(
    `UPDATE user_capacity SET daily_minutes=480, peak_start='09:00', peak_end='12:00' WHERE id='default'`,
  );
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
  // Fetch all completed tasks in the last 36 hours to cover any timezone edge cases
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const rows = await db.select<
    {
      estimated_duration_minutes: number;
      actual_completed_at: string;
    }[]
  >(
    `SELECT estimated_duration_minutes, actual_completed_at FROM nodes WHERE is_completed = 1 AND actual_completed_at >= ?`,
    [since],
  );
  const todayStr = toDateString(new Date());
  let count = 0;
  let effortMinutes = 0;
  for (const row of rows) {
    if (!row.actual_completed_at) continue;
    const localDate = toDateString(new Date(row.actual_completed_at));
    if (localDate === todayStr) {
      count++;
      effortMinutes += row.estimated_duration_minutes || 0;
    }
  }
  return { count, effortMinutes };
}

export interface DayCompletion {
  date: string;
  count: number;
}

export async function loadSevenDayCompletions(): Promise<DayCompletion[]> {
  const db = getDb();
  // Fetch all completed tasks in the last 7 days (plus 1 for timezone safety)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.select<
    {
      actual_completed_at: string;
    }[]
  >(
    `SELECT actual_completed_at FROM nodes WHERE is_completed = 1 AND actual_completed_at >= ?`,
    [since],
  );
  // Group by local date
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.actual_completed_at) continue;
    const localDate = toDateString(new Date(row.actual_completed_at));
    counts[localDate] = (counts[localDate] || 0) + 1;
  }
  const result: DayCompletion[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = toDateString(d);
    result.push({
      date: dateStr,
      count: counts[dateStr] || 0,
    });
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
  // Fetch all completed tasks in the last 36 hours to cover any timezone edge cases
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.is_completed = 1 AND n.actual_completed_at >= ? ORDER BY n.actual_completed_at DESC`,
    [since],
  );
  // Filter in JS by local date
  const todayStr = toDateString(new Date());
  const filtered = rows.filter((row) => {
    if (!row.actual_completed_at) return false;
    const localDate = toDateString(new Date(row.actual_completed_at));
    return localDate === todayStr;
  });
  return hydrateRows(filtered);
}

export async function uncompleteNode(id: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE nodes SET is_completed = 0, actual_completed_at = NULL WHERE id = ?`,
    [id],
  );
  await db.execute(`DELETE FROM productivity_logs WHERE node_id = ?`, [id]);
}

export async function loadArcNodeCounts(): Promise<ArcNodeCount[]> {
  const db = getDb();
  const rows = await db.select<
    { arc_id: string; total: number; done: number }[]
  >(
    `SELECT arc_id,
            COUNT(*) AS total,
            SUM(is_completed) AS done
     FROM nodes
     WHERE arc_id IS NOT NULL
     GROUP BY arc_id`,
  );
  return rows;
}

// ─── Eat the Frog ────────────────────────────────────────────────────────────

/** Count how many frog-pinned tasks were completed today. */
export async function loadFrogsDoneToday(): Promise<number> {
  const db = getDb();
  // Fetch all frog-pinned completed tasks in the last 36 hours
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const rows = await db.select<
    {
      actual_completed_at: string;
      is_frog_pinned: number;
    }[]
  >(
    `SELECT actual_completed_at, is_frog_pinned FROM nodes WHERE is_completed = 1 AND actual_completed_at >= ?`,
    [since],
  );
  const todayStr = toDateString(new Date());
  let count = 0;
  for (const row of rows) {
    if (!row.actual_completed_at || !row.is_frog_pinned) continue;
    const localDate = toDateString(new Date(row.actual_completed_at));
    if (localDate === todayStr) count++;
  }
  return count;
}

/** Pin or unpin a node as the frog task. */
export async function setNodeFrogPinned(
  id: string,
  value: boolean,
): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE nodes SET is_frog_pinned = ? WHERE id = ?`, [
    value ? 1 : 0,
    id,
  ]);
}

// ─── Load Forecast ────────────────────────────────────────────────────────────

export interface WeekForecastDay {
  date: string;
  totalMins: number;
  count: number;
}

/** Return scheduled effort (sum of estimated_duration_minutes) for each of next 7 days. */
export async function loadWeekForecast(): Promise<WeekForecastDay[]> {
  const db = getDb();
  // Fetch all uncompleted tasks with planned_start_at in the next 8 days (for timezone safety)
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const until = new Date(since);
  until.setDate(until.getDate() + 8);
  const rows = await db.select<
    {
      planned_start_at: string;
      estimated_duration_minutes: number;
    }[]
  >(
    `SELECT planned_start_at, estimated_duration_minutes FROM nodes WHERE is_completed = 0 AND planned_start_at >= ? AND planned_start_at < ?`,
    [since.toISOString(), until.toISOString()],
  );
  // Group by local date
  const forecast: Record<string, { totalMins: number; count: number }> = {};
  for (const row of rows) {
    if (!row.planned_start_at) continue;
    const localDate = toDateString(new Date(row.planned_start_at));
    if (!forecast[localDate]) forecast[localDate] = { totalMins: 0, count: 0 };
    forecast[localDate].totalMins += row.estimated_duration_minutes || 60;
    forecast[localDate].count++;
  }
  const result: WeekForecastDay[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = toDateString(d);
    const day = forecast[dateStr];
    result.push({
      date: dateStr,
      totalMins: day?.totalMins ?? 0,
      count: day?.count ?? 0,
    });
  }
  return result;
}

// ─── Weekly Review ────────────────────────────────────────────────────────────

export async function saveWeeklyReview(_data: {
  notes: string;
  goals: string;
  completed_count: number;
  cleared_count: number;
}): Promise<void> {
  // weekly_review table removed — no-op
}

// ─── Tendrils ────────────────────────────────────────────────────────────────

export interface TendrilEdge {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  created_at: string;
}

export async function loadProjectNodes(
  projectId: string,
): Promise<PlannerNode[]> {
  const db = getDb();
  const rows = await db.select<PlannerNode[]>(
    `${NODE_SELECT} WHERE n.project_id = ? ORDER BY n.created_at ASC`,
    [projectId],
  );
  return hydrateRows(rows);
}

export interface ProjectNodeCounts {
  project_id: string;
  total: number;
  active: number;
  done: number;
}

export async function loadAllProjectNodeCounts(): Promise<ProjectNodeCounts[]> {
  const db = getDb();
  return db.select<ProjectNodeCounts[]>(`
    SELECT
      project_id,
      COUNT(*) AS total,
      SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) AS done
    FROM nodes
    WHERE project_id IS NOT NULL AND is_completed = 0
    GROUP BY project_id
  `);
}

export async function loadTendrilEdges(
  projectId: string,
): Promise<TendrilEdge[]> {
  const db = getDb();
  return db.select<TendrilEdge[]>(
    `SELECT * FROM tendril_edges WHERE project_id = ? ORDER BY created_at ASC`,
    [projectId],
  );
}

export async function createTendrilEdge(
  projectId: string,
  sourceId: string,
  targetId: string,
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO tendril_edges (id, project_id, source_id, target_id) VALUES (?, ?, ?, ?)`,
    [id, projectId, sourceId, targetId],
  );
  return id;
}

export async function deleteTendrilEdge(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM tendril_edges WHERE id = ?`, [id]);
}

// ─── Sub-tasks ───────────────────────────────────────────────────────────────

import type { SubTask } from "../types";

export async function loadSubTasks(nodeId: string): Promise<SubTask[]> {
  const db = getDb();
  const rows = await db.select<SubTask[]>(
    `SELECT * FROM sub_tasks WHERE node_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [nodeId],
  );
  return rows.map((r) => ({ ...r, is_completed: Boolean(r.is_completed) }));
}

export async function createSubTask(
  nodeId: string,
  title: string,
  sortOrder: number,
): Promise<SubTask> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO sub_tasks (id, node_id, title, is_completed, sort_order) VALUES (?, ?, ?, 0, ?)`,
    [id, nodeId, title, sortOrder],
  );
  const rows = await db.select<SubTask[]>(
    `SELECT * FROM sub_tasks WHERE id = ?`,
    [id],
  );
  return { ...rows[0], is_completed: false };
}

export async function updateSubTask(
  id: string,
  patch: Partial<Pick<SubTask, "title" | "is_completed">>,
): Promise<void> {
  const db = getDb();
  if (patch.title !== undefined) {
    await db.execute(`UPDATE sub_tasks SET title = ? WHERE id = ?`, [
      patch.title,
      id,
    ]);
  }
  if (patch.is_completed !== undefined) {
    await db.execute(`UPDATE sub_tasks SET is_completed = ? WHERE id = ?`, [
      patch.is_completed ? 1 : 0,
      id,
    ]);
  }
}

export async function deleteSubTask(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM sub_tasks WHERE id = ?`, [id]);
}

export async function reorderSubTasks(
  nodeId: string,
  orderedIds: string[],
): Promise<void> {
  const db = getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute(
      `UPDATE sub_tasks SET sort_order = ? WHERE id = ? AND node_id = ?`,
      [i, orderedIds[i], nodeId],
    );
  }
}
