// Data loading and transformation for the Chrono-Fingerprint analytic.
// Events are intentionally excluded — recurring events (classes, meetings) bias
// the KDE toward event-adjacent times rather than genuine cognitive rhythm.

import { loadCompletionsForRange } from "../../../PlannerPlugin/lib/plannerDb";
import { loadSessionsForWeek } from "../../../PlannerPlugin/lib/onTheClockDb";
import type { ChronoPoint } from "./chronoMath";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function loadChronoData(): Promise<ChronoPoint[]> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 89);
  const fromKey = dateKey(start);
  const toKey   = dateKey(now);

  const [completions, sessions] = await Promise.all([
    loadCompletionsForRange(fromKey, toKey),
    loadSessionsForWeek(fromKey, toKey),
  ]);

  const sessionIntervals = sessions
    .filter((s) => s.actual_start != null)
    .map((s) => ({
      start: new Date(s.actual_start!).getTime(),
      end:   s.actual_end ? new Date(s.actual_end).getTime() : Date.now(),
    }));

  function isInSession(tsMs: number): boolean {
    return sessionIntervals.some((iv) => tsMs >= iv.start && tsMs <= iv.end);
  }

  return completions
    .filter((c) => c.actual_completed_at != null)
    .map((c) => {
      const ts = new Date(c.actual_completed_at!);
      const hourDecimal = ts.getHours() + ts.getMinutes() / 60 + ts.getSeconds() / 3600;
      return {
        theta:     (hourDecimal / 24) * 2 * Math.PI,
        arcId:     c.arc_id ?? null,
        inSession: isInSession(ts.getTime()),
        timestamp: ts.getTime(),
      };
    });
}
