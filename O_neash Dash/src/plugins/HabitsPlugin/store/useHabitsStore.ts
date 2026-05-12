import { create } from 'zustand';
import type { Habit, HabitLog, HabitType } from '../types';
import * as db from '../lib/habitsDb';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface HabitsStore {
  habits: Habit[];
  logs: HabitLog[];
  loading: boolean;
  reload: () => Promise<void>;
  createHabit: (name: string, color: string, type: HabitType, n: number | null) => Promise<void>;
  updateHabit: (id: string, name: string, color: string, type: HabitType, n: number | null) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  toggleLog: (habitId: string, date: string) => Promise<void>;
}

export const useHabitsStore = create<HabitsStore>((set, get) => ({
  habits: [],
  logs: [],
  loading: false,

  reload: async () => {
    set({ loading: true });
    const [habits, logs] = await Promise.all([
      db.getHabits(),
      db.getLogsFrom(daysAgo(90)),
    ]);
    set({ habits, logs, loading: false });
  },

  createHabit: async (name, color, type, n) => {
    await db.createHabit(name, color, type, n);
    await get().reload();
  },

  updateHabit: async (id, name, color, type, n) => {
    await db.updateHabit(id, name, color, type, n);
    await get().reload();
  },

  archiveHabit: async (id) => {
    await db.archiveHabit(id);
    await get().reload();
  },

  toggleLog: async (habitId, date) => {
    // optimistic
    const hit = get().logs.find(l => l.habit_id === habitId && l.date === date);
    if (hit) {
      set(s => ({ logs: s.logs.filter(l => !(l.habit_id === habitId && l.date === date)) }));
    } else {
      const stub: HabitLog = {
        id: crypto.randomUUID(),
        habit_id: habitId,
        date,
        created_at: new Date().toISOString(),
      };
      set(s => ({ logs: [...s.logs, stub] }));
    }
    await db.toggleLog(habitId, date);
  },
}));
