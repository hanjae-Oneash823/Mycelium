import { getDb } from '@/lib/db';

export interface WorkLocation {
  id: string;
  name: string;
  created_at: string;
}

export interface WorkSession {
  id: string;
  title: string;
  location_id: string | null;
  location_name?: string;
  planned_date: string;
  actual_start: string | null;
  actual_end: string | null;
  status: 'planned' | 'active' | 'paused' | 'completed' | 'interrupted';
  created_at: string;
}

export interface SessionNode {
  session_id: string;
  node_id: string;
  sort_order: number;
  status: 'queued' | 'in_progress' | 'done' | 'incomplete';
  time_started: string | null;
  time_finished: string | null;
  total_minutes: number | null;
}

export interface SessionNodeWithNode extends SessionNode {
  title: string;
  node_type: string;
  arc_id: string | null;
  project_id: string | null;
  arc_color: string;
  arc_name: string | null;
}

export interface SessionPause {
  id: string;
  session_id: string;
  paused_at: string;
  resumed_at: string | null;
  pause_type: 'manual' | 'pomo_short' | 'pomo_long';
}

export interface SessionPomoBlock {
  id: string;
  session_id: string;
  block_type: 'work' | 'short_break' | 'long_break';
  started_at: string;
  ended_at: string | null;
}

export interface BrowsableNode {
  id: string;
  title: string;
  node_type: string;
  is_routine: number; // 0 or 1
  planned_date: string | null;
  arc_color: string;
  arc_name: string | null;
}

// ── Locations ─────────────────────────────────────────────────────────────────

export async function loadLocations(): Promise<WorkLocation[]> {
  return getDb().select('SELECT * FROM work_locations ORDER BY name ASC');
}

export async function createLocation(name: string): Promise<WorkLocation> {
  const id = crypto.randomUUID();
  await getDb().execute('INSERT INTO work_locations (id, name) VALUES (?, ?)', [id, name]);
  return { id, name, created_at: new Date().toISOString() };
}

export async function deleteLocation(id: string): Promise<void> {
  await getDb().execute('DELETE FROM work_locations WHERE id = ?', [id]);
}

// ── Title generation ──────────────────────────────────────────────────────────

export async function generateTitle(locationId: string, date: string): Promise<string> {
  const locs = await getDb().select<{ name: string }[]>(
    'SELECT name FROM work_locations WHERE id = ?', [locationId],
  );
  const slug = locs.length ? locs[0].name.toLowerCase().replace(/\s+/g, '-') : 'session';
  const base = `${date.replace(/-/g, '')}-${slug}`;
  const existing = await getDb().select<{ title: string }[]>(
    'SELECT title FROM work_sessions WHERE title LIKE ?', [`${base}%`],
  );
  if (!existing.length) return base;
  const maxSuffix = existing.reduce((max, r) => {
    const m = r.title.match(/-(\d{2})$/);
    return m ? Math.max(max, parseInt(m[1])) : Math.max(max, 0);
  }, 0);
  return `${base}-${String(maxSuffix + 1).padStart(2, '0')}`;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function loadActiveSession(): Promise<WorkSession | null> {
  const rows = await getDb().select<WorkSession[]>(
    `SELECT ws.*, wl.name as location_name
     FROM work_sessions ws
     LEFT JOIN work_locations wl ON wl.id = ws.location_id
     WHERE ws.status IN ('active','paused') LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function loadTodaySessions(date: string): Promise<WorkSession[]> {
  return getDb().select<WorkSession[]>(
    `SELECT ws.*, wl.name as location_name
     FROM work_sessions ws
     LEFT JOIN work_locations wl ON wl.id = ws.location_id
     WHERE ws.planned_date = ?
     ORDER BY ws.created_at ASC`,
    [date],
  );
}

export async function loadSessionsForWeek(from: string, to: string): Promise<WorkSession[]> {
  return getDb().select<WorkSession[]>(
    `SELECT ws.*, wl.name as location_name
     FROM work_sessions ws
     LEFT JOIN work_locations wl ON wl.id = ws.location_id
     WHERE ws.actual_start IS NOT NULL
       AND ws.planned_date >= ? AND ws.planned_date <= ?
     ORDER BY ws.actual_start ASC`,
    [from, to],
  );
}

export async function loadAllSessions(limit = 60): Promise<WorkSession[]> {
  return getDb().select<WorkSession[]>(
    `SELECT ws.*, wl.name as location_name
     FROM work_sessions ws
     LEFT JOIN work_locations wl ON wl.id = ws.location_id
     ORDER BY ws.planned_date DESC, ws.created_at DESC
     LIMIT ?`,
    [limit],
  );
}

export async function createSession(locationId: string, plannedDate: string): Promise<string> {
  const id = crypto.randomUUID();
  const title = await generateTitle(locationId, plannedDate);
  await getDb().execute(
    'INSERT INTO work_sessions (id, title, location_id, planned_date) VALUES (?, ?, ?, ?)',
    [id, title, locationId, plannedDate],
  );
  return id;
}

export async function startSession(sessionId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE work_sessions SET status = 'active', actual_start = ? WHERE id = ?`,
    [now, sessionId],
  );
  // Remove nodes already completed in planner
  await db.execute(
    `DELETE FROM session_nodes WHERE session_id = ?
     AND node_id IN (SELECT id FROM nodes WHERE is_completed = 1)`,
    [sessionId],
  );
  // Create first pomo work block
  const pomoId = crypto.randomUUID();
  await db.execute(
    'INSERT INTO session_pomo_blocks (id, session_id, started_at, block_type) VALUES (?, ?, ?, ?)',
    [pomoId, sessionId, now, 'work'],
  );
}

export async function pauseSession(sessionId: string, type: 'manual' | 'pomo_short' | 'pomo_long'): Promise<string> {
  const now = new Date().toISOString();
  await getDb().execute(`UPDATE work_sessions SET status = 'paused' WHERE id = ?`, [sessionId]);
  const pauseId = crypto.randomUUID();
  await getDb().execute(
    'INSERT INTO session_pauses (id, session_id, paused_at, pause_type) VALUES (?, ?, ?, ?)',
    [pauseId, sessionId, now, type],
  );
  return pauseId;
}

export async function resumeSession(sessionId: string, pauseId: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb().execute(`UPDATE work_sessions SET status = 'active' WHERE id = ?`, [sessionId]);
  await getDb().execute(
    `UPDATE session_pauses SET resumed_at = ? WHERE id = ?`,
    [now, pauseId],
  );
}

export async function endSession(sessionId: string, status: 'completed' | 'interrupted'): Promise<void> {
  return endSessionAt(sessionId, status, new Date().toISOString());
}

export async function updateSessionEndTime(sessionId: string, endTime: string): Promise<void> {
  await getDb().execute(
    `UPDATE work_sessions SET actual_end = ? WHERE id = ?`,
    [endTime, sessionId],
  );
}

export async function endSessionAt(sessionId: string, status: 'completed' | 'interrupted', endTime: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE session_pauses SET resumed_at = ? WHERE session_id = ? AND resumed_at IS NULL`,
    [endTime, sessionId],
  );
  await db.execute(
    `UPDATE session_pomo_blocks SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL`,
    [endTime, sessionId],
  );
  await db.execute(
    `UPDATE work_sessions SET status = ?, actual_end = ? WHERE id = ?`,
    [status, endTime, sessionId],
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.execute('DELETE FROM session_pomo_blocks WHERE session_id = ?', [sessionId]);
  await db.execute('DELETE FROM session_pauses WHERE session_id = ?', [sessionId]);
  await db.execute('DELETE FROM session_nodes WHERE session_id = ?', [sessionId]);
  await db.execute('DELETE FROM work_sessions WHERE id = ?', [sessionId]);
}

export async function loadSessionPauses(sessionId: string): Promise<SessionPause[]> {
  return getDb().select<SessionPause[]>(
    'SELECT * FROM session_pauses WHERE session_id = ? ORDER BY paused_at ASC',
    [sessionId],
  );
}

export async function loadSessionPomoBlocks(sessionId: string): Promise<SessionPomoBlock[]> {
  return getDb().select<SessionPomoBlock[]>(
    'SELECT * FROM session_pomo_blocks WHERE session_id = ? ORDER BY started_at ASC',
    [sessionId],
  );
}

// ── Pomo blocks ───────────────────────────────────────────────────────────────

export async function startPomoBlock(sessionId: string, type: 'work' | 'short_break' | 'long_break'): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().execute(
    'INSERT INTO session_pomo_blocks (id, session_id, started_at, block_type) VALUES (?, ?, ?, ?)',
    [id, sessionId, new Date().toISOString(), type],
  );
  return id;
}

export async function endPomoBlock(blockId: string): Promise<void> {
  await getDb().execute(
    'UPDATE session_pomo_blocks SET ended_at = ? WHERE id = ?',
    [new Date().toISOString(), blockId],
  );
}

export async function endOpenPomoWorkBlock(sessionId: string): Promise<void> {
  const rows = await getDb().select<{ id: string }[]>(
    `SELECT id FROM session_pomo_blocks WHERE session_id = ? AND block_type = 'work' AND ended_at IS NULL LIMIT 1`,
    [sessionId],
  );
  if (rows.length) await endPomoBlock(rows[0].id);
}

// ── Session nodes ─────────────────────────────────────────────────────────────

export async function loadSessionNodes(sessionId: string): Promise<SessionNodeWithNode[]> {
  return getDb().select<SessionNodeWithNode[]>(
    `SELECT sn.*,
            n.title, n.node_type, n.arc_id, n.project_id,
            COALESCE(a.color_hex, '#888888') as arc_color,
            a.name as arc_name
     FROM session_nodes sn
     JOIN nodes n ON n.id = sn.node_id
     LEFT JOIN arcs a ON a.id = n.arc_id
     WHERE sn.session_id = ?
     ORDER BY
       CASE sn.status WHEN 'in_progress' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
       sn.sort_order ASC`,
    [sessionId],
  );
}

export async function addNodesToSession(sessionId: string, nodeIds: string[]): Promise<void> {
  if (!nodeIds.length) return;
  const db = getDb();
  const maxRow = await db.select<{ m: number }[]>(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM session_nodes WHERE session_id = ?',
    [sessionId],
  );
  let next = (maxRow[0]?.m ?? -1) + 1;
  for (const nodeId of nodeIds) {
    await db.execute(
      'INSERT OR IGNORE INTO session_nodes (session_id, node_id, sort_order) VALUES (?, ?, ?)',
      [sessionId, nodeId, next++],
    );
  }
}

async function computeNetMinutes(sessionId: string, timeStarted: string, timeFinished: string): Promise<number> {
  const pauses = await getDb().select<{ paused_at: string; resumed_at: string }[]>(
    `SELECT paused_at, resumed_at FROM session_pauses
     WHERE session_id = ? AND paused_at >= ? AND paused_at <= ? AND resumed_at IS NOT NULL`,
    [sessionId, timeStarted, timeFinished],
  );
  const startMs = new Date(timeStarted).getTime();
  const endMs = new Date(timeFinished).getTime();
  const pauseMs = pauses.reduce((sum, p) => {
    const s = Math.max(new Date(p.paused_at).getTime(), startMs);
    const e = Math.min(new Date(p.resumed_at).getTime(), endMs);
    return sum + Math.max(0, e - s);
  }, 0);
  return Math.max(0, (endMs - startMs - pauseMs) / 60000);
}

export async function startNode(sessionId: string, nodeId: string): Promise<void> {
  await getDb().execute(
    `UPDATE session_nodes SET status = 'in_progress', time_started = ? WHERE session_id = ? AND node_id = ?`,
    [new Date().toISOString(), sessionId, nodeId],
  );
}

export async function finishNode(sessionId: string, nodeId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db.select<{ time_started: string | null }[]>(
    'SELECT time_started FROM session_nodes WHERE session_id = ? AND node_id = ?',
    [sessionId, nodeId],
  );
  const net = rows[0]?.time_started ? await computeNetMinutes(sessionId, rows[0].time_started, now) : 0;
  await db.execute(
    `UPDATE session_nodes SET status = 'done', time_finished = ?, total_minutes = ? WHERE session_id = ? AND node_id = ?`,
    [now, net, sessionId, nodeId],
  );
  await db.execute(
    `UPDATE nodes SET is_completed = 1, actual_completed_at = ? WHERE id = ?`,
    [now, nodeId],
  );
}

export async function markNodeIncomplete(sessionId: string, nodeId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db.select<{ time_started: string | null }[]>(
    'SELECT time_started FROM session_nodes WHERE session_id = ? AND node_id = ?',
    [sessionId, nodeId],
  );
  const net = rows[0]?.time_started ? await computeNetMinutes(sessionId, rows[0].time_started, now) : 0;
  await db.execute(
    `UPDATE session_nodes SET status = 'incomplete', time_finished = ?, total_minutes = ? WHERE session_id = ? AND node_id = ?`,
    [now, net, sessionId, nodeId],
  );
}

export async function returnNodeToQueue(sessionId: string, nodeId: string): Promise<void> {
  await getDb().execute(
    `UPDATE session_nodes SET status = 'queued', time_started = NULL WHERE session_id = ? AND node_id = ?`,
    [sessionId, nodeId],
  );
}

export async function removeNodeFromSession(sessionId: string, nodeId: string): Promise<void> {
  await getDb().execute(
    'DELETE FROM session_nodes WHERE session_id = ? AND node_id = ?',
    [sessionId, nodeId],
  );
}

// ── Force-stop helpers ────────────────────────────────────────────────────────

export async function carryOverUnfinished(sessionId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const inProg = await db.select<{ node_id: string; time_started: string | null }[]>(
    `SELECT node_id, time_started FROM session_nodes WHERE session_id = ? AND status = 'in_progress'`,
    [sessionId],
  );
  for (const sn of inProg) {
    const net = sn.time_started ? await computeNetMinutes(sessionId, sn.time_started, now) : 0;
    await db.execute(
      `UPDATE session_nodes SET status='incomplete', time_finished=?, total_minutes=? WHERE session_id=? AND node_id=?`,
      [now, net, sessionId, sn.node_id],
    );
  }
  await db.execute(`DELETE FROM session_nodes WHERE session_id = ? AND status = 'queued'`, [sessionId]);
}

export async function moveUnfinishedToSession(fromId: string, toId: string | null): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const unfinished = await db.select<{ node_id: string; status: string; time_started: string | null }[]>(
    `SELECT node_id, status, time_started FROM session_nodes
     WHERE session_id = ? AND status IN ('queued','in_progress')`,
    [fromId],
  );
  for (const sn of unfinished.filter(n => n.status === 'in_progress')) {
    const net = sn.time_started ? await computeNetMinutes(fromId, sn.time_started, now) : 0;
    await db.execute(
      `UPDATE session_nodes SET status='incomplete', time_finished=?, total_minutes=? WHERE session_id=? AND node_id=?`,
      [now, net, fromId, sn.node_id],
    );
  }
  if (toId && unfinished.length) {
    const maxRow = await db.select<{ m: number }[]>(
      'SELECT COALESCE(MAX(sort_order),-1) as m FROM session_nodes WHERE session_id = ?', [toId],
    );
    let next = (maxRow[0]?.m ?? -1) + 1;
    for (const sn of unfinished) {
      await db.execute(
        'INSERT OR IGNORE INTO session_nodes (session_id, node_id, sort_order, status) VALUES (?,?,?,?)',
        [toId, sn.node_id, next++, 'queued'],
      );
    }
  }
  await db.execute(`DELETE FROM session_nodes WHERE session_id = ? AND status = 'queued'`, [fromId]);
}

export async function markAllNodesDone(sessionId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db.select<{ node_id: string; time_started: string | null }[]>(
    `SELECT node_id, time_started FROM session_nodes WHERE session_id = ? AND status IN ('in_progress','queued')`,
    [sessionId],
  );
  for (const sn of rows) {
    const net = sn.time_started ? await computeNetMinutes(sessionId, sn.time_started, now) : 0;
    await db.execute(
      `UPDATE session_nodes SET status='done', time_finished=?, total_minutes=? WHERE session_id=? AND node_id=?`,
      [now, net, sessionId, sn.node_id],
    );
    await db.execute(
      `UPDATE nodes SET is_completed=1, actual_completed_at=? WHERE id=?`,
      [now, sn.node_id],
    );
  }
}

// ── Node browser ──────────────────────────────────────────────────────────────

export async function loadBrowsableNodes(excludeNodeIds: string[] = []): Promise<BrowsableNode[]> {
  const db = getDb();
  if (excludeNodeIds.length) {
    const ph = excludeNodeIds.map(() => '?').join(',');
    return db.select<BrowsableNode[]>(
      `SELECT n.id, n.title, n.node_type, COALESCE(n.is_routine, 0) as is_routine,
              DATE(COALESCE(n.planned_start_at, n.due_at)) as planned_date,
              COALESCE(a.color_hex,'#888888') as arc_color, a.name as arc_name
       FROM nodes n LEFT JOIN arcs a ON a.id = n.arc_id
       WHERE n.is_completed = 0 AND n.id NOT IN (${ph})
       ORDER BY planned_date ASC, n.created_at ASC`,
      excludeNodeIds,
    );
  }
  return db.select<BrowsableNode[]>(
    `SELECT n.id, n.title, n.node_type, COALESCE(n.is_routine, 0) as is_routine,
            DATE(COALESCE(n.planned_start_at, n.due_at)) as planned_date,
            COALESCE(a.color_hex,'#888888') as arc_color, a.name as arc_name
     FROM nodes n LEFT JOIN arcs a ON a.id = n.arc_id
     WHERE n.is_completed = 0
     ORDER BY planned_date ASC, n.created_at ASC`,
  );
}
