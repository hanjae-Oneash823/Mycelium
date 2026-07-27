import type { SleepEntry } from "../../plugins/SleepTrackerPlugin/lib/sleepDb";
import { durationHours } from "../../plugins/SleepTrackerPlugin/lib/sleepDb";
import type { HabitLog } from "../../plugins/HabitsPlugin/types";
import type { WorkSession } from "../../plugins/PlannerPlugin/lib/onTheClockDb";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Oldest → newest, 7 calendar days ending today. */
export function last7Dates(): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

export function sleepHoursByDay(entries: SleepEntry[], days: string[]): (number | null)[] {
  return days.map((day) => {
    const dayEntries = entries.filter((e) => e.date === day);
    if (dayEntries.length === 0) return null;
    return dayEntries.reduce((sum, e) => sum + durationHours(e), 0);
  });
}

export function runKmByDay(logs: HabitLog[], habitId: string | null, days: string[]): (number | null)[] {
  if (!habitId) return days.map(() => null);
  return days.map((day) => {
    const log = logs.find((l) => l.habit_id === habitId && l.date === day);
    return log?.value ?? null;
  });
}

export function sessionMinutesByDay(sessions: WorkSession[], days: string[]): (number | null)[] {
  return days.map((day) => {
    const daySessions = sessions.filter((s) => s.planned_date === day && s.actual_start);
    if (daySessions.length === 0) return null;
    const totalMs = daySessions.reduce((sum, s) => {
      const start = new Date(s.actual_start!).getTime();
      const end   = s.actual_end ? new Date(s.actual_end).getTime() : Date.now();
      return sum + Math.max(0, end - start);
    }, 0);
    return totalMs / 60_000;
  });
}
