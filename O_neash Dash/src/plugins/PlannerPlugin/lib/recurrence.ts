import type { PlannerNode, RecurrenceRule } from '../types';

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Generate all occurrence date strings for a recurrence rule starting from startDateStr.
 * Stops at rule.until, or 1 year from start if no until is set.
 * Capped at 500 occurrences to prevent runaway generation.
 */
export function generateOccurrenceDates(rule: RecurrenceRule, startDateStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDateStr + 'T00:00:00');

  const maxDate = new Date(start);
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  const until = rule.until ? new Date(rule.until + 'T00:00:00') : maxDate;
  const end = until < maxDate ? until : maxDate;

  const MAX = 500;

  if (rule.freq === 'daily') {
    let cur = new Date(start);
    while (cur <= end && dates.length < MAX) {
      dates.push(toLocalDateStr(cur));
      cur.setDate(cur.getDate() + rule.interval);
    }
  } else if (rule.freq === 'weekly') {
    if (rule.days && rule.days.length > 0) {
      for (let week = 0; dates.length < MAX; week += rule.interval) {
        const weekBase = new Date(start);
        weekBase.setDate(start.getDate() + week * 7);
        if (weekBase > end) break;
        for (let d = 0; d < 7 && dates.length < MAX; d++) {
          const candidate = new Date(weekBase);
          candidate.setDate(weekBase.getDate() + d);
          if (candidate >= start && candidate <= end && rule.days.includes(candidate.getDay())) {
            dates.push(toLocalDateStr(candidate));
          }
        }
      }
    } else {
      let cur = new Date(start);
      while (cur <= end && dates.length < MAX) {
        dates.push(toLocalDateStr(cur));
        cur.setDate(cur.getDate() + rule.interval * 7);
      }
    }
  } else if (rule.freq === 'monthly') {
    let cur = new Date(start);
    while (cur <= end && dates.length < MAX) {
      dates.push(toLocalDateStr(cur));
      cur.setMonth(cur.getMonth() + rule.interval);
    }
  }

  return [...new Set(dates)].sort();
}

/** Parse the ID of a virtual recurring instance. Returns null if not a virtual ID. */
export function parseVirtualId(id: string): { templateId: string; dateStr: string } | null {
  // Format: "<uuid>:<YYYY-MM-DD>"
  const dateStr = id.slice(-10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  if (id[id.length - 11] !== ':') return null;
  return { templateId: id.slice(0, id.length - 11), dateStr };
}

/** Check if a recurring event template fires on a specific date. */
function occursOnDate(rule: RecurrenceRule, templateStart: Date, target: Date): boolean {
  const start = new Date(templateStart); start.setHours(0, 0, 0, 0);
  const t     = new Date(target);        t.setHours(0, 0, 0, 0);

  if (t < start) return false;
  if (rule.until) {
    const until = new Date(rule.until + 'T00:00:00');
    if (t > until) return false;
  }

  const diffDays = Math.round((t.getTime() - start.getTime()) / 86400000);

  if (rule.freq === 'daily') {
    return diffDays % rule.interval === 0;
  }

  if (rule.freq === 'weekly') {
    if (rule.days && rule.days.length > 0) {
      // Multi-day weekly: must be in a qualifying week AND the correct day-of-week
      const weeksDiff = Math.floor(diffDays / 7);
      if (weeksDiff % rule.interval !== 0) return false;
      return rule.days.includes(t.getDay());
    }
    // Single-day weekly: exact same day every N weeks
    return diffDays % (rule.interval * 7) === 0;
  }

  if (rule.freq === 'monthly') {
    if (t.getDate() !== start.getDate()) return false;
    const monthsDiff =
      (t.getFullYear() - start.getFullYear()) * 12 + (t.getMonth() - start.getMonth());
    return monthsDiff >= 0 && monthsDiff % rule.interval === 0;
  }

  return false;
}

/** Create a virtual PlannerNode instance for a specific occurrence date. */
function createVirtualInstance(template: PlannerNode, dateStr: string): PlannerNode {
  // Preserve time component from original planned_start_at if present
  let plannedAt = dateStr;
  if (template.planned_start_at?.includes('T')) {
    plannedAt = dateStr + 'T' + template.planned_start_at.slice(11);
  }
  return {
    ...template,
    id: `${template.id}:${dateStr}`,
    planned_start_at: plannedAt,
    due_at: dateStr,
    is_virtual: true,
  };
}

/**
 * Given the full node list, separate recurring templates and expand them
 * into virtual instances for every date in [fromDate, toDate].
 *
 * Returns the non-recurring nodes plus all virtual instances (templates excluded).
 */
export function expandRecurring(
  nodes: PlannerNode[],
  fromDate: Date,
  toDate: Date,
): PlannerNode[] {
  const nonRecurring = nodes.filter(n => !n.recurrence_rule);
  const templates    = nodes.filter(n =>  n.recurrence_rule);

  const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
  const to   = new Date(toDate);   to.setHours(0, 0, 0, 0);

  const virtual: PlannerNode[] = [];

  for (const tmpl of templates) {
    let rule: RecurrenceRule;
    try { rule = JSON.parse(tmpl.recurrence_rule!); } catch { continue; }

    const exceptions: string[] = tmpl.recurrence_exceptions
      ? JSON.parse(tmpl.recurrence_exceptions)
      : [];

    const startStr = tmpl.planned_start_at ?? tmpl.due_at;
    if (!startStr) continue;
    const templateStart = new Date(startStr.slice(0, 10) + 'T00:00:00');

    const cur = new Date(from);
    while (cur <= to) {
      const dateStr = toLocalDateStr(cur);
      if (!exceptions.includes(dateStr) && occursOnDate(rule, templateStart, cur)) {
        virtual.push(createVirtualInstance(tmpl, dateStr));
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  return [...nonRecurring, ...virtual];
}
