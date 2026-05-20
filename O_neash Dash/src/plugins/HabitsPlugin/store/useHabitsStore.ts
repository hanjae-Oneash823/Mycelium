import { create } from 'zustand';
import type { Habit, HabitLog, GoalType, HabitValueType } from '../types';
import * as db from '../lib/habitsDb';
import { getActiveTarget } from '../../SleepTrackerPlugin/lib/sleepDb';

interface HabitsStore {
  habits: Habit[];
  logs: HabitLog[];
  sleepByDate: Record<string, number>;
  sleepTarget: number | null;
  viewYear: number;
  viewMonth: number;
  loading: boolean;
  reload: () => Promise<void>;
  setMonth: (year: number, month: number) => Promise<void>;
  createHabit: (name: string, color: string, valueType: HabitValueType, goalType: GoalType, goalValue: number | null) => Promise<void>;
  updateHabit: (id: string, name: string, color: string, valueType: HabitValueType, goalType: GoalType, goalValue: number | null) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  toggleBoolean: (habitId: string, date: string) => Promise<void>;
  setNumeric: (habitId: string, date: string, value: number | null) => Promise<void>;
}

const now = new Date();

export const useHabitsStore = create<HabitsStore>((set, get) => ({
  habits: [],
  logs: [],
  sleepByDate: {},
  sleepTarget: null,
  viewYear: now.getFullYear(),
  viewMonth: now.getMonth() + 1,
  loading: false,

  reload: async () => {
    const { viewYear, viewMonth } = get();
    set({ loading: true });
    const [habits, logs, sleepByDate, target] = await Promise.all([
      db.getHabits(),
      db.getLogsForMonth(viewYear, viewMonth),
      db.getSleepForMonth(viewYear, viewMonth),
      getActiveTarget(),
    ]);
    set({ habits, logs, sleepByDate, sleepTarget: target?.target_duration ?? null, loading: false });
  },

  setMonth: async (year, month) => {
    set({ viewYear: year, viewMonth: month, loading: true });
    const [habits, logs, sleepByDate, target] = await Promise.all([
      db.getHabits(),
      db.getLogsForMonth(year, month),
      db.getSleepForMonth(year, month),
      getActiveTarget(),
    ]);
    set({ habits, logs, sleepByDate, sleepTarget: target?.target_duration ?? null, loading: false });
  },

  createHabit: async (name, color, valueType, goalType, goalValue) => {
    await db.createHabit(name, color, valueType, goalType, goalValue);
    await get().reload();
  },

  updateHabit: async (id, name, color, valueType, goalType, goalValue) => {
    await db.updateHabit(id, name, color, valueType, goalType, goalValue);
    await get().reload();
  },

  archiveHabit: async (id) => {
    await db.archiveHabit(id);
    await get().reload();
  },

  toggleBoolean: async (habitId, date) => {
    const hit = get().logs.find(l => l.habit_id === habitId && l.date === date);
    if (hit) {
      set(s => ({ logs: s.logs.filter(l => !(l.habit_id === habitId && l.date === date)) }));
    } else {
      const stub: HabitLog = { id: crypto.randomUUID(), habit_id: habitId, date, value: null, created_at: new Date().toISOString() };
      set(s => ({ logs: [...s.logs, stub] }));
    }
    await db.toggleBooleanLog(habitId, date);
  },

  setNumeric: async (habitId, date, value) => {
    set(s => ({
      logs: value === null
        ? s.logs.filter(l => !(l.habit_id === habitId && l.date === date))
        : s.logs.some(l => l.habit_id === habitId && l.date === date)
          ? s.logs.map(l => l.habit_id === habitId && l.date === date ? { ...l, value } : l)
          : [...s.logs, { id: crypto.randomUUID(), habit_id: habitId, date, value, created_at: new Date().toISOString() }],
    }));
    await db.setNumericLog(habitId, date, value);
  },
}));
