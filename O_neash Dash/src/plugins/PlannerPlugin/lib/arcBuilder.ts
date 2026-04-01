import type { Arc, Project } from '../types';

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

  return arcs.map(arc => {
    const arcProjects = projects.filter(p => p.arc_id === arc.id);
    return {
      arc,
      leftPct:  0,
      widthPct: 100,
      projects: arcProjects.map(p => {
        const counts = nodeCounts.get(p.id) ?? { total: 0, done: 0 };
        if (counts.total < 2) return null;
        return {
          project: p,
          leftPct:  0,
          widthPct: 100,
          taskCount: counts.total,
          doneCount: counts.done,
        };
      }).filter(Boolean) as ProjectPosition[],
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function detectCongestion(_arcs: Arc[]): CongestionBand[] {
  return [];
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
