import { getDb } from "../../../lib/db";
import type { Habit, HabitLog, GoalType, HabitValueType } from "../types";

export async function getHabits(): Promise<Habit[]> {
  return getDb().select<Habit[]>(
    `SELECT * FROM habits WHERE archived_at IS NULL ORDER BY sort_order ASC, created_at ASC`,
  );
}

export async function createHabit(
  name: string,
  color: string,
  valueType: HabitValueType,
  goalType: GoalType,
  goalValue: number | null,
): Promise<Habit> {
  const db = getDb();
  const id = crypto.randomUUID();
  const [{ m }] = await db.select<[{ m: number }]>(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM habits WHERE archived_at IS NULL`,
  );
  await db.execute(
    `INSERT INTO habits(id, name, color, value_type, goal_type, goal_value, sort_order, created_at)
     VALUES(?,?,?,?,?,?,?,datetime('now'))`,
    [id, name, color, valueType, goalType, goalValue, m + 1],
  );
  const [row] = await db.select<Habit[]>(`SELECT * FROM habits WHERE id=?`, [id]);
  return row;
}

export async function updateHabit(
  id: string,
  name: string,
  color: string,
  valueType: HabitValueType,
  goalType: GoalType,
  goalValue: number | null,
): Promise<void> {
  await getDb().execute(
    `UPDATE habits SET name=?, color=?, value_type=?, goal_type=?, goal_value=? WHERE id=?`,
    [name, color, valueType, goalType, goalValue, id],
  );
}

export async function archiveHabit(id: string): Promise<void> {
  await getDb().execute(
    `UPDATE habits SET archived_at=datetime('now') WHERE id=?`,
    [id],
  );
}

export async function getLogsForMonth(year: number, month: number): Promise<HabitLog[]> {
  const from      = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return getDb().select<HabitLog[]>(
    `SELECT * FROM habit_logs WHERE date >= ? AND date < ? ORDER BY date ASC`,
    [from, nextMonth],
  );
}

export async function getSleepForMonth(year: number, month: number): Promise<Record<string, number>> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await getDb().select<{ date: string; sleep_start: string; wake_time: string }[]>(
    `SELECT date, sleep_start, wake_time FROM sleep_entries
     WHERE is_nap = 0 AND date LIKE ? ORDER BY date ASC`,
    [`${prefix}-%`],
  );
  const result: Record<string, number> = {};
  for (const r of rows) {
    const hours = (new Date(r.wake_time).getTime() - new Date(r.sleep_start).getTime()) / 3_600_000;
    result[r.date] = Math.round(hours * 100) / 100;
  }
  return result;
}

export async function toggleBooleanLog(habitId: string, date: string): Promise<void> {
  const db   = getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM habit_logs WHERE habit_id=? AND date=?`,
    [habitId, date],
  );
  if (rows.length > 0) {
    await db.execute(`DELETE FROM habit_logs WHERE habit_id=? AND date=?`, [habitId, date]);
  } else {
    await db.execute(
      `INSERT INTO habit_logs(id, habit_id, date, value, created_at) VALUES(?,?,?,NULL,datetime('now'))`,
      [crypto.randomUUID(), habitId, date],
    );
  }
}

export async function setNumericLog(habitId: string, date: string, value: number | null): Promise<void> {
  const db = getDb();
  if (value === null) {
    await db.execute(`DELETE FROM habit_logs WHERE habit_id=? AND date=?`, [habitId, date]);
  } else {
    await db.execute(
      `INSERT INTO habit_logs(id, habit_id, date, value, created_at) VALUES(?,?,?,?,datetime('now'))
       ON CONFLICT(habit_id, date) DO UPDATE SET value=excluded.value`,
      [crypto.randomUUID(), habitId, date, value],
    );
  }
}
