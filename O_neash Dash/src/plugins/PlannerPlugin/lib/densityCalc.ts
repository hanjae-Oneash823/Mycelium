import type { PlannerNode } from '../types';
import { isSameDay } from './logicEngine';

export function getDensityRatio(
  nodes: PlannerNode[],
  dateStr: string,
  capacityMinutes: number,
): number {
  if (capacityMinutes <= 0) return 0;
  const ref = new Date(dateStr + 'T12:00:00');
  const total = nodes
    .filter(n => !n.is_completed && !n.is_overdue && isSameDay(n.planned_start_at, ref))
    .reduce((sum, n) => sum + (n.estimated_duration_minutes ?? 0), 0);
  return total / capacityMinutes;
}

export function getDensityColor(ratio: number): string {
  if (ratio < 0.6) return '#4ade80';   // green
  if (ratio < 0.8) return '#f5a623';   // amber
  if (ratio < 1.0) return '#ff6b35';   // orange
  return '#ff3b3b';                    // red — overloaded
}
