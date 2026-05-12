export type HabitType = 'daily' | 'weekly' | 'times_per_week';

export interface Habit {
  id: string;
  name: string;
  color: string;
  type: HabitType;
  times_per_week: number | null;
  sort_order: number;
  created_at: string;
  archived_at: string | null;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;   // YYYY-MM-DD
  created_at: string;
}
