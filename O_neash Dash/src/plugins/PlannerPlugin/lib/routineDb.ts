import { getDb } from '@/lib/db';
import { generateOccurrenceDates } from './recurrence';
import { computeUrgencyLevel } from './logicEngine';
import type { Routine, RecurrenceRule, RoutineRule } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToRule(r: Record<string, unknown>): RoutineRule {
  return {
    id:               r.id as string,
    routine_id:       r.routine_id as string,
    sort_order:       (r.sort_order as number) ?? 0,
    freq:             r.freq as RoutineRule['freq'],
    repeat_interval:  (r.repeat_interval as number) ?? 1,
    days:             r.days ? JSON.parse(r.days as string) as number[] : null,
    start_date:       r.start_date as string,
    end_mode:         r.end_mode as RoutineRule['end_mode'],
    end_count:        (r.end_count as number | null) ?? null,
    end_date:         (r.end_date as string | null) ?? null,
    start_time:       (r.start_time as string | null) ?? null,
    duration_minutes: (r.duration_minutes as number | null) ?? null,
    exceptions:       r.exceptions ? JSON.parse(r.exceptions as string) as string[] : null,
  };
}

function genId(): string { return crypto.randomUUID(); }

/** Normalise a start_time value to HH:MM — handles "1030" → "10:30" */
function normalizeTime(t: string): string {
  return /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : t;
}

function toDS(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Routines ──────────────────────────────────────────────────────────────────

export async function loadRoutines(): Promise<Routine[]> {
  const db = getDb();
  const rows = await db.select<Routine[]>(
    `SELECT * FROM routines ORDER BY created_at DESC`,
  );
  const routines = rows.map(r => ({ ...r }));
  for (const routine of routines) {
    routine.rules = await loadRoutineRules(routine.id);
    const groupRows = await db.select<{ group_id: string }[]>(
      `SELECT group_id FROM routine_groups WHERE routine_id = ?`, [routine.id],
    );
    routine.group_ids = groupRows.map(r => r.group_id);
  }
  return routines;
}

export async function createRoutine(
  data: Omit<Routine, 'id' | 'created_at' | 'updated_at' | 'rules'>,
): Promise<string> {
  const db = getDb();
  const id = genId();
  await db.execute(
    `INSERT INTO routines (id, title, node_type, arc_id, project_id, importance_level)
     VALUES (?,?,?,?,?,?)`,
    [
      id, data.title, data.node_type ?? 'task',
      data.arc_id ?? null, data.project_id ?? null,
      data.importance_level ?? 0,
    ],
  );
  return id;
}

export async function updateRoutine(id: string, patch: Partial<Routine>): Promise<void> {
  const db = getDb();
  const allowed = [
    'title', 'node_type', 'arc_id', 'project_id', 'importance_level',
  ] as const;
  const keys = Object.keys(patch).filter(k => (allowed as readonly string[]).includes(k));
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as Record<string, unknown>)[k]);
  await db.execute(`UPDATE routines SET ${sets} WHERE id = ?`, [...vals, id]);
}

export async function deleteRoutine(id: string): Promise<void> {
  const db = getDb();
  // Delete all incomplete nodes for this routine (completed ones stay as history)
  await db.execute(`DELETE FROM nodes WHERE routine_id = ? AND is_completed = 0`, [id]);
  await db.execute(`DELETE FROM routines WHERE id = ?`, [id]);
}

// ── Routine rules ──────────────────────────────────────────────────────────────

export async function loadRoutineRules(routineId: string): Promise<RoutineRule[]> {
  const rows = await getDb().select<Record<string, unknown>[]>(
    `SELECT * FROM routine_rules WHERE routine_id = ? ORDER BY sort_order ASC, rowid ASC`,
    [routineId],
  );
  return rows.map(rowToRule);
}

export async function createRoutineRule(
  routineId: string,
  rule: Omit<RoutineRule, 'id' | 'routine_id'>,
  sortOrder = 0,
): Promise<string> {
  const id = genId();
  await getDb().execute(
    `INSERT INTO routine_rules
       (id, routine_id, sort_order, freq, repeat_interval, days,
        start_date, end_mode, end_count, end_date, start_time, duration_minutes, exceptions)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, routineId, sortOrder,
      rule.freq, rule.repeat_interval,
      rule.days?.length ? JSON.stringify(rule.days) : null,
      rule.start_date, rule.end_mode,
      rule.end_count ?? null, rule.end_date ?? null,
      rule.start_time ?? null, rule.duration_minutes ?? null,
      rule.exceptions?.length ? JSON.stringify(rule.exceptions) : null,
    ],
  );
  return id;
}

export async function replaceRoutineRules(
  routineId: string,
  rules: Omit<RoutineRule, 'id' | 'routine_id'>[],
): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM routine_rules WHERE routine_id = ?`, [routineId]);
  for (let i = 0; i < rules.length; i++) {
    await createRoutineRule(routineId, rules[i], i);
  }
}

// ── Routine groups ─────────────────────────────────────────────────────────────

export async function setRoutineGroups(routineId: string, groupIds: string[]): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM routine_groups WHERE routine_id = ?`, [routineId]);
  for (const gid of groupIds) {
    await db.execute(
      `INSERT OR IGNORE INTO routine_groups (routine_id, group_id) VALUES (?, ?)`,
      [routineId, gid],
    );
  }
}

// ── Node generation ───────────────────────────────────────────────────────────

function generateRuleDates(rule: RoutineRule): string[] {
  if (rule.freq === 'manual') return [rule.start_date];
  const rec: RecurrenceRule = {
    freq:     rule.freq,
    interval: rule.repeat_interval,
    days:     rule.days ?? undefined,
    until:    rule.end_mode === 'date' ? (rule.end_date ?? undefined) : undefined,
  };
  const dates = generateOccurrenceDates(rec, rule.start_date);
  const all = rule.end_mode === 'count' && rule.end_count ? dates.slice(0, rule.end_count) : dates;
  const exceptions = new Set(rule.exceptions ?? []);
  return exceptions.size > 0 ? all.filter(d => !exceptions.has(d)) : all;
}

/**
 * Generates real nodes in the nodes table for a routine's rules within [from, to].
 * Skips dates that already have a node for this routine.
 * Copies the routine's group memberships to each generated node.
 */
export async function generateAndInsertRoutineNodes(
  routineId: string, fromDateStr: string, toDateStr: string,
): Promise<void> {
  const db = getDb();
  const rules = await loadRoutineRules(routineId);
  if (!rules.length) return;

  const [routine] = await db.select<Routine[]>(
    `SELECT * FROM routines WHERE id = ? LIMIT 1`, [routineId],
  );
  if (!routine) return;

  // Get routine's group memberships to copy onto generated nodes
  const routineGroups = await db.select<{ group_id: string }[]>(
    `SELECT group_id FROM routine_groups WHERE routine_id = ?`, [routineId],
  );

  // Load ALL existing node dates for this routine (no date filter) to reliably skip duplicates.
  // Manual rules bypass the date window, so filtering by [from, to] would miss past manual nodes.
  const existing = await db.select<{ planned_start_at: string }[]>(
    `SELECT planned_start_at FROM nodes WHERE routine_id = ?`,
    [routineId],
  );
  const existingSet = new Set(existing.map(r => r.planned_start_at.slice(0, 10)));

  const now = new Date();

  for (const rule of rules) {
    const allDates = generateRuleDates(rule);
    // Manual rules spawn their one date regardless of the date window
    const inRange  = rule.freq === 'manual'
      ? allDates.filter(d => !existingSet.has(d))
      : allDates.filter(d => d >= fromDateStr && d <= toDateStr);

    for (const d of inRange) {
      if (existingSet.has(d)) continue;

      const scheduledAt = rule.start_time ? `${d}T${normalizeTime(rule.start_time)}:00` : d;
      const urgency = computeUrgencyLevel(
        Boolean(routine.importance_level), scheduledAt, now, routine.node_type === 'event',
      );
      const nodeId = genId();

      await db.execute(
        `INSERT OR IGNORE INTO nodes
           (id, project_id, arc_id, title, node_type, planned_start_at,
            estimated_duration_minutes, importance_level, computed_urgency_level,
            is_completed, is_locked, is_overdue, is_pinned,
            is_routine, routine_id)
         VALUES (?,?,?,?,?,?,?,?,?,0,0,0,0,1,?)`,
        [
          nodeId, routine.project_id ?? null, routine.arc_id ?? null,
          routine.title, routine.node_type,
          scheduledAt, rule.duration_minutes ?? null,
          routine.importance_level, urgency,
          routineId,
        ],
      );

      // Copy routine's groups onto the node (overrides the auto-ungrouped trigger)
      if (routineGroups.length > 0) {
        for (const { group_id } of routineGroups) {
          await db.execute(
            `INSERT OR IGNORE INTO node_groups (node_id, group_id) VALUES (?, ?)`,
            [nodeId, group_id],
          );
        }
      }

      existingSet.add(d);
    }
  }
}

/**
 * Delete all incomplete nodes for a routine on or after today,
 * then regenerate from today through one year out.
 * Called when a routine's rules are edited.
 */
export async function regenerateRoutineNodes(routineId: string): Promise<void> {
  const db  = getDb();
  const today = toDS(new Date());
  await db.execute(
    `DELETE FROM nodes WHERE routine_id = ? AND is_completed = 0 AND planned_start_at >= ?`,
    [routineId, today],
  );
  const yearOut = new Date(); yearOut.setFullYear(yearOut.getFullYear() + 1);
  await generateAndInsertRoutineNodes(routineId, today, toDS(yearOut));
}

/**
 * Cancel an exception for a routine: removes the date from the matching rule's
 * exceptions array in the DB, then inserts a node for that date.
 * Works for both past and future dates.
 */
export async function cancelException(routineId: string, date: string): Promise<void> {
  const db = getDb();
  const rules = await loadRoutineRules(routineId);
  const [routine] = await db.select<Routine[]>(`SELECT * FROM routines WHERE id = ? LIMIT 1`, [routineId]);
  if (!routine) return;

  // Find the rule that owns this exception
  for (const rule of rules) {
    const exceptions = rule.exceptions ?? [];
    if (!exceptions.includes(date)) continue;

    // Remove the date from this rule's exceptions and persist
    const updated = exceptions.filter(e => e !== date);
    await db.execute(
      `UPDATE routine_rules SET exceptions = ? WHERE id = ?`,
      [updated.length > 0 ? JSON.stringify(updated) : null, rule.id],
    );

    // Check if a node already exists for this date (e.g. completed one)
    const existing = await db.select<{ id: string }[]>(
      `SELECT id FROM nodes WHERE routine_id = ? AND substr(planned_start_at, 1, 10) = ? LIMIT 1`,
      [routineId, date],
    );
    if (existing.length > 0) return; // node already exists

    // Insert the restored node
    const scheduledAt = rule.start_time ? `${date}T${normalizeTime(rule.start_time)}:00` : date;
    const now = new Date();
    const urgency = computeUrgencyLevel(
      Boolean(routine.importance_level), scheduledAt, now, routine.node_type === 'event',
    );
    const nodeId = genId();
    await db.execute(
      `INSERT OR IGNORE INTO nodes
         (id, project_id, arc_id, title, node_type, planned_start_at,
          estimated_duration_minutes, importance_level, computed_urgency_level,
          is_completed, is_locked, is_overdue, is_pinned, is_routine, routine_id)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,0,0,1,?)`,
      [
        nodeId, routine.project_id ?? null, routine.arc_id ?? null,
        routine.title, routine.node_type,
        scheduledAt, rule.duration_minutes ?? null,
        routine.importance_level, urgency,
        routineId,
      ],
    );

    // Copy routine group memberships
    const routineGroups = await db.select<{ group_id: string }[]>(
      `SELECT group_id FROM routine_groups WHERE routine_id = ?`, [routineId],
    );
    for (const { group_id } of routineGroups) {
      await db.execute(
        `INSERT OR IGNORE INTO node_groups (node_id, group_id) VALUES (?, ?)`,
        [nodeId, group_id],
      );
    }
    return;
  }
}

/**
 * On startup: generate any missing routine nodes for the next year without
 * deleting anything. Safe — skips dates that already have a node.
 */
export async function fillMissingRoutineNodes(): Promise<void> {
  const routines = await loadRoutines();
  const today = toDS(new Date());
  const yearOut = new Date(); yearOut.setFullYear(yearOut.getFullYear() + 1);
  for (const routine of routines) {
    if (!routine.rules?.length) continue;
    await generateAndInsertRoutineNodes(routine.id, today, toDS(yearOut));
  }
}

/** Delete the incomplete node for a specific routine + date (for immediate ✕ removal in edit form). */
export async function deleteRoutineNodeByDate(routineId: string, date: string): Promise<void> {
  await getDb().execute(
    `DELETE FROM nodes WHERE routine_id = ? AND substr(planned_start_at, 1, 10) = ? AND is_completed = 0`,
    [routineId, date],
  );
}

/** Count completed nodes per routine_id (for progress bars). */
export async function loadRoutineCompletedCounts(): Promise<Record<string, number>> {
  const rows = await getDb().select<{ routine_id: string; count: number }[]>(`
    SELECT routine_id, COUNT(*) AS count
    FROM nodes
    WHERE is_routine = 1 AND is_completed = 1 AND routine_id IS NOT NULL
    GROUP BY routine_id
  `);
  return Object.fromEntries(rows.map(r => [r.routine_id, r.count]));
}

/** Count incomplete routine nodes per project_id (for TendrilsHub). */
export async function loadRoutineNodeCountsByProject(): Promise<{ project_id: string; count: number }[]> {
  return getDb().select<{ project_id: string; count: number }[]>(`
    SELECT project_id, COUNT(*) AS count
    FROM nodes
    WHERE is_routine = 1 AND is_completed = 0 AND project_id IS NOT NULL
    GROUP BY project_id
  `);
}
