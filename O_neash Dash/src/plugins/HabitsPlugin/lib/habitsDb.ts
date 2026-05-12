import { getDb } from "../../../lib/db";
import type { Habit, HabitLog, HabitType } from "../types";

export async function getHabits(): Promise<Habit[]> {
  return getDb().select<Habit[]>(
    `SELECT * FROM habits WHERE archived_at IS NULL ORDER BY sort_order ASC, created_at ASC`,
  );
}

export async function createHabit(
  name: string,
  color: string,
  type: HabitType,
  timesPerWeek: number | null,
): Promise<Habit> {
  const db = getDb();
  const id = crypto.randomUUID();
  const [{ m }] = await db.select<[{ m: number }]>(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM habits WHERE archived_at IS NULL`,
  );
  await db.execute(
    `INSERT INTO habits(id, name, color, type, times_per_week, sort_order, created_at)
     VALUES(?,?,?,?,?,?,datetime('now'))`,
    [id, name, color, type, timesPerWeek, m + 1],
  );
  const [row] = await db.select<Habit[]>(`SELECT * FROM habits WHERE id=?`, [id]);
  return row;
}

export async function updateHabit(
  id: string,
  name: string,
  color: string,
  type: HabitType,
  timesPerWeek: number | null,
): Promise<void> {
  await getDb().execute(
    `UPDATE habits SET name=?, color=?, type=?, times_per_week=? WHERE id=?`,
    [name, color, type, timesPerWeek, id],
  );
}

export async function archiveHabit(id: string): Promise<void> {
  await getDb().execute(
    `UPDATE habits SET archived_at=datetime('now') WHERE id=?`,
    [id],
  );
}

export async function getLogsFrom(fromDate: string): Promise<HabitLog[]> {
  return getDb().select<HabitLog[]>(
    `SELECT * FROM habit_logs WHERE date >= ? ORDER BY date ASC`,
    [fromDate],
  );
}

export async function toggleLog(habitId: string, date: string): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM habit_logs WHERE habit_id=? AND date=?`,
    [habitId, date],
  );
  if (rows.length > 0) {
    await db.execute(
      `DELETE FROM habit_logs WHERE habit_id=? AND date=?`,
      [habitId, date],
    );
  } else {
    await db.execute(
      `INSERT INTO habit_logs(id, habit_id, date, created_at) VALUES(?,?,?,datetime('now'))`,
      [crypto.randomUUID(), habitId, date],
    );
  }
}
