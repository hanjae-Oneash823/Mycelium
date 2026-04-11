import { getDb } from '../../../lib/db';

export interface SleepEntry {
  id:          number;
  date:        string;
  sleep_start: string;
  wake_time:   string;
  notes:       string | null;
  created_at:  string;
}

export interface SleepTarget {
  id:                  number;
  target_sleep_start:  string; // HH:MM
  target_duration:     number; // hours
  set_at:              string;
}

export async function getEntries(limit = 60): Promise<SleepEntry[]> {
  const db = getDb();
  return db.select<SleepEntry[]>(
    `SELECT id, date, sleep_start, wake_time, notes, created_at FROM sleep_entries WHERE is_nap = 0 ORDER BY sleep_start DESC LIMIT ?`,
    [limit],
  );
}

export async function getLast7MainSessions(): Promise<SleepEntry[]> {
  const db = getDb();
  return db.select<SleepEntry[]>(
    `SELECT id, date, sleep_start, wake_time, notes, created_at FROM sleep_entries WHERE is_nap = 0 ORDER BY sleep_start DESC LIMIT 7`,
  );
}

export async function getActiveTarget(): Promise<SleepTarget | null> {
  const db = getDb();
  const rows = await db.select<SleepTarget[]>(
    `SELECT * FROM sleep_targets ORDER BY set_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function addEntry(e: {
  date:        string;
  sleep_start: string;
  wake_time:   string;
  notes:       string;
}): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO sleep_entries (date, sleep_start, wake_time, is_nap, notes) VALUES (?, ?, ?, 0, ?)`,
    [e.date, e.sleep_start, e.wake_time, e.notes || null],
  );
}

export async function deleteEntry(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM sleep_entries WHERE id = ?`, [id]);
}

export async function setTarget(
  target_sleep_start: string,
  target_duration:    number,
): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO sleep_targets (target_sleep_start, target_duration) VALUES (?, ?)`,
    [target_sleep_start, target_duration],
  );
}

// ── Computed helpers ──────────────────────────────────────────────────────────

export function durationHours(entry: SleepEntry): number {
  const start = new Date(entry.sleep_start).getTime();
  const end   = new Date(entry.wake_time).getTime();
  return (end - start) / 3_600_000;
}

export function formatDuration(hours: number): string {
  const h = Math.floor(Math.abs(hours));
  const m = Math.round((Math.abs(hours) - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function avgDuration(sessions: SleepEntry[]): number {
  if (!sessions.length) return 0;
  return sessions.reduce((s, e) => s + durationHours(e), 0) / sessions.length;
}

/** Returns HH:MM string of average sleep-start time, treating pre-noon as next-day. */
export function avgStartTime(sessions: SleepEntry[]): string {
  if (!sessions.length) return '--:--';
  const mins = sessions.map(e => {
    const d = new Date(e.sleep_start);
    let m = d.getHours() * 60 + d.getMinutes();
    if (m < 12 * 60) m += 24 * 60; // normalise: treat <noon as "next day"
    return m;
  });
  const avg  = mins.reduce((s, m) => s + m, 0) / mins.length;
  const norm = avg % (24 * 60);
  const h    = Math.floor(norm / 60);
  const mn   = Math.round(norm % 60);
  return `${h.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')}`;
}

/** Convert a datetime string or HH:MM string to minutes since 20:00 for the chart Y-axis.
 *  20:00 → 0, 00:00 → 240, 12:00 → 960. */
export function toChartMin(timeStr: string): number {
  let h: number, m: number;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    h = d.getHours(); m = d.getMinutes();
  } else {
    [h, m] = timeStr.split(':').map(Number);
  }
  return h >= 20 ? (h - 20) * 60 + m : 240 + h * 60 + m;
}
