import type { PlannerNode, ImportanceLevel } from '../types';

// ─── Core: compute urgency level from importance + due date ───────────────────
// L0 = no due date
// L1 = not important, not urgent  (>2 days)
// L2 = important,     not urgent  (>2 days)
// L3 = not important, urgent      (≤2 days)
// L4 = important,     urgent      (≤2 days)
export function computeUrgencyLevel(
  isImportant: boolean,
  dueAt: string | null | undefined,
  now: Date,
): ImportanceLevel {
  if (!dueAt) return 0;
  const daysLeft = (new Date(dueAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const urgent = daysLeft <= 2;
  if (!isImportant && !urgent) return 1;
  if ( isImportant && !urgent) return 2;
  if (!isImportant &&  urgent) return 3;
  return 4; // important + urgent
}

// ─── Rule 2: Overdue detection ────────────────────────────────────────────────
export function isNodeOverdue(node: PlannerNode, now: Date): boolean {
  if (!node.due_at) return false;
  if (node.is_completed) return false;
  return new Date(node.due_at) < now;
}

// ─── Suggestion scoring (Today view) ─────────────────────────────────────────
export function scoreSuggestion(node: PlannerNode, today: Date): number {
  let score = 0;

  // Urgency bonus: L0=4, L1=8, L2=16, L3=24, L4=40
  const importanceBonus: Record<ImportanceLevel, number> = { 0: 4, 1: 8, 2: 16, 3: 24, 4: 40 };
  score += importanceBonus[node.computed_urgency_level] ?? 0;

  // Due date proximity
  if (node.due_at) {
    const daysLeft = (new Date(node.due_at).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 1)      score += 35;
    else if (daysLeft <= 3) score += 20;
    else if (daysLeft <= 7) score += 10;
  }

  // Recovery bonus
  if (node.is_recovery) score += 25;

  // Effort: quick wins get bonus, heavy lifts get penalty
  const hrs = (node.estimated_duration_minutes ?? 60) / 60;
  if (hrs <= 0.5)   score += 8;
  else if (hrs > 3) score -= 12;

  // In-progress subtasks — momentum signal
  const subDone  = node.sub_done  ?? 0;
  const subTotal = node.sub_total ?? 0;
  if (subDone > 0 && subDone < subTotal) score += 10;

  return Math.max(0, score);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function isSameDay(dateStr: string | null | undefined, ref: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear()
      && d.getMonth()    === ref.getMonth()
      && d.getDate()     === ref.getDate();
}

export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatDueLabel(dueDateStr: string | null | undefined, now: Date): string {
  if (!dueDateStr) return '';
  const due  = new Date(dueDateStr);
  const diff = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return `overdue ${Math.abs(diff)}d ago`;
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff}d`;
}

export function formatEffortLabel(minutes: number | null | undefined): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  return h === Math.floor(h) ? `${h}h` : `${h.toFixed(1)}h`;
}
