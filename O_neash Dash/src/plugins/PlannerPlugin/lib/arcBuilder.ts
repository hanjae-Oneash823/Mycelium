import type { Arc, Project } from '../types';

/** Parse a YYYY-MM-DD date string as local midnight to match how the window boundaries are set. */
function localMs(s: string): number {
  return new Date(s + 'T00:00:00').getTime();
}

export interface ArcPosition {
  arc: Arc;
  leftPct: number;
  widthPct: number;
  projects: ProjectPosition[];
}

export interface ProjectPosition {
  project: Project;
  leftPct: number;
  widthPct: number;
  taskCount: number;
  doneCount: number;
}

export interface CongestionBand {
  startMs: number;
  endMs: number;
  count: number;
  severity: 'amber' | 'red';
}

export function buildArcPositions(
  arcs: Arc[],
  projects: Project[],
  nodeCounts: Map<string, { total: number; done: number }>,
  windowStart: Date,
  windowEnd: Date,
): ArcPosition[] {
  const span = windowEnd.getTime() - windowStart.getTime();
  if (span <= 0) return [];

  const winStart = windowStart.getTime();
  const winEnd   = windowEnd.getTime();

  // Arcs/projects with no declared end date are treated as ending today
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  return arcs
    .map(arc => {
      const arcStart = arc.start_date ? localMs(arc.start_date) : winStart;
      const arcEnd   = arc.end_date   ? localMs(arc.end_date)   : todayMs;

      // Skip arcs entirely outside the window
      if (arcEnd <= winStart || arcStart >= winEnd) return null;

      // Clamp to window bounds for rendering
      const visStart = Math.max(arcStart, winStart);
      const visEnd   = Math.min(arcEnd,   winEnd);

      const arcProjects = projects.filter(p => p.arc_id === arc.id);

      return {
        arc,
        leftPct:  (visStart - winStart) / span * 100,
        widthPct: Math.max(0.5, (visEnd - visStart) / span * 100),
        projects: arcProjects
          .map(p => {
            const counts = nodeCounts.get(p.id) ?? { total: 0, done: 0 };
            // Don't show a bar for projects with fewer than 2 tasks (no auto dates yet)
            if (counts.total < 2) return null;
            // Project bars use their own auto-computed dates, only clamped to the window
            if (!p.start_date || !p.end_date) return null;
            const pStart = localMs(p.start_date);
            const pEnd   = localMs(p.end_date);
            if (pEnd <= winStart || pStart >= winEnd) return null;
            const pVisStart = Math.max(pStart, winStart);
            const pVisEnd   = Math.min(pEnd,   winEnd);
            return {
              project: p,
              leftPct:  (pVisStart - winStart) / span * 100,
              widthPct: Math.max(0.5, (pVisEnd - pVisStart) / span * 100),
              taskCount: counts.total,
              doneCount: counts.done,
            };
          })
          .filter(Boolean) as ProjectPosition[],
      };
    })
    .filter(Boolean) as ArcPosition[];
}

export function detectCongestion(arcs: Arc[]): CongestionBand[] {
  const WINDOW_MS = 21 * 86400000;
  const ends = arcs
    .filter(a => a.end_date)
    .map(a => localMs(a.end_date!))
    .sort((a, b) => a - b);

  const bands: CongestionBand[] = [];
  let i = 0;
  while (i < ends.length) {
    const group = ends.filter(t => t - ends[i] <= WINDOW_MS);
    if (group.length >= 2) {
      bands.push({
        startMs:  ends[i] - WINDOW_MS / 2,
        endMs:    group[group.length - 1] + WINDOW_MS / 2,
        count:    group.length,
        severity: group.length >= 3 ? 'red' : 'amber',
      });
    }
    i += group.length;
  }
  return bands;
}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function windowLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts).toUpperCase()} – ${end.toLocaleDateString('en-US', opts).toUpperCase()}`;
}
