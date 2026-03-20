import type { PlannerNode, ImportanceLevel } from '../types';

// ─── Core: compute urgency level ─────────────────────────────────────────────
// L0 = event (no urgency concept)
// L1 = simple task not important  |  assignment not important, DD > 3 days
// L2 = simple task important      |  assignment important,     DD > 3 days
// L3 = assignment not important,  DD ≤ 3 days
// L4 = assignment important,      DD ≤ 3 days
export function computeUrgencyLevel(
  isImportant: boolean,
  dueAt: string | null | undefined,
  now: Date,
  isEvent = false,
): ImportanceLevel {
  if (isEvent) return 0;
  if (!dueAt) {
    // Simple task — urgency from importance only, never L0
    return isImportant ? 2 : 1;
  }
  // Assignment — urgency from importance + DD proximity
  const normalized = dueAt.length === 10 ? dueAt + 'T12:00:00' : dueAt;
  const daysLeft = (new Date(normalized).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const urgent = daysLeft <= 3;
  if (!isImportant && !urgent) return 1;
  if ( isImportant && !urgent) return 2;
  if (!isImportant &&  urgent) return 3;
  return 4;
}

// ─── Rule 2: Overdue detection ────────────────────────────────────────────────
export function isNodeOverdue(node: PlannerNode, now: Date): boolean {
  if (!node.due_at) return false;
  if (node.is_completed) return false;
  const normalized = node.due_at.length === 10 ? node.due_at + 'T23:59:59' : node.due_at;
  return new Date(normalized) < now;
}

// ─── Missed schedule detection (flexible tasks only) ─────────────────────────
export function isMissedSchedule(node: PlannerNode, now: Date): boolean {
  if (node.is_completed || node.is_overdue || node.due_at) return false;
  if (!node.planned_start_at) return false;
  const scheduledDay = new Date(node.planned_start_at.slice(0, 10) + 'T00:00:00');
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return scheduledDay < today;
}

// ─── Suggestion scoring (Today view) ─────────────────────────────────────────
export function scoreSuggestion(node: PlannerNode, today: Date): number {
  let score = 0;

  // Urgency bonus: L0=4, L1=8, L2=16, L3=24, L4=40
  const importanceBonus: Record<ImportanceLevel, number> = { 0: 4, 1: 8, 2: 16, 3: 24, 4: 40 };
  score += importanceBonus[node.computed_urgency_level] ?? 0;

  // Due date proximity
  if (node.due_at) {
    const normalizedDue = node.due_at.length === 10 ? node.due_at + 'T12:00:00' : node.due_at;
    const daysLeft = (new Date(normalizedDue).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
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
  // Date-only strings (YYYY-MM-DD) are parsed as UTC by JS — force local noon to avoid timezone drift
  const normalized = dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr;
  const d = new Date(normalized);
  return d.getFullYear() === ref.getFullYear()
      && d.getMonth()    === ref.getMonth()
      && d.getDate()     === ref.getDate();
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
