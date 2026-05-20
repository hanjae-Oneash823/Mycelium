export type HabitValueType = 'boolean' | 'numeric';

export type BooleanGoalType = 'every_day' | 'times_per_month' | 'times_per_week' | 'none';
export type NumericGoalType = 'at_least_per_day' | 'at_most_per_day' | 'monthly_total' | 'none';
export type GoalType = BooleanGoalType | NumericGoalType;

export interface Habit {
  id: string;
  name: string;
  color: string;
  value_type: HabitValueType;
  goal_type: GoalType;
  goal_value: number | null;
  sort_order: number;
  created_at: string;
  archived_at: string | null;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  value: number | null;
  created_at: string;
}
