import type { RecurrenceRule } from '../types';

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

