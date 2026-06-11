import { getEntries } from "../../../SleepTrackerPlugin/lib/sleepDb";
import { loadIrfTaskData } from "../../../PlannerPlugin/lib/plannerDb";
import type { IrfTaskRecord } from "../../../PlannerPlugin/lib/plannerDb";
import { loadAllDoneSessionNodeMinutes } from "../../../PlannerPlugin/lib/onTheClockDb";

export interface DayPoint {
  sleepH:    number;
  cpsRate:   number;
  isShock:   boolean;
  dayIndex:  number; // chronological index, 0 = oldest
  totalDays: number;
  date:      string; // e.g. "JUN 10"
  taskCount: number;
}

export interface ScatterResult {
  points:          DayPoint[];
  regA:            number;
  regB:            number;
  r:               number;
  shockThreshH:    number;
  slopePerHourPct: number;
  // Precomputed on a 40-point grid across the x range
  gridXs: number[];
  bandHi: number[];  // linear regression +1 SE
  bandLo: number[];  // linear regression -1 SE
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function computeScatter(): Promise<ScatterResult | null> {
  const [sleepEntries, tasks, sessionMins] = await Promise.all([
    getEntries(90),
    loadIrfTaskData(90),
    loadAllDoneSessionNodeMinutes(),
  ]);

  // node_id → actual minutes spent in a session
  const sessionMinMap = new Map<string, number>(sessionMins.map(s => [s.node_id, s.total_minutes]));

  // fallback: global average across all tracked session durations
  const avgSessionMinutes = sessionMins.length > 0
    ? sessionMins.reduce((s, v) => s + v.total_minutes, 0) / sessionMins.length
    : 30;
  if (sleepEntries.length < 14) return null;

  const sorted = [...sleepEntries].sort(
    (a, b) => new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime(),
  );

  const days = sorted.map((e, i) => {
    const wakeMs  = new Date(e.wake_time).getTime();
    const sleepMs = i < sorted.length - 1
      ? new Date(sorted[i + 1].sleep_start).getTime()
      : Date.now();
    return {
      wakeMs,
      sleepMs,
      wakingHours:    Math.max(0.5, Math.min(20, (sleepMs - wakeMs) / 3_600_000)),
      sleepDurationH: (wakeMs - new Date(e.sleep_start).getTime()) / 3_600_000,
      cpsRate: 0,
    };
  });

  const dayCount: number[]    = days.map(() => 0);
  const dayDuration: number[] = days.map(() => 0);
  for (const task of tasks) {
    if (!task.actual_completed_at) continue;
    const ms  = new Date(task.actual_completed_at).getTime();
    const idx = days.findIndex(d => ms >= d.wakeMs && ms < d.sleepMs);
    if (idx >= 0) {
      dayCount[idx]    += 1;
      dayDuration[idx] += sessionMinMap.get(task.id) ?? avgSessionMinutes;
    }
  }
  for (let i = 0; i < days.length; i++) {
    days[i].cpsRate = Math.sqrt(dayCount[i] * dayDuration[i]) / days[i].wakingHours;
  }

  const n          = Math.max(5, Math.floor(days.length * 0.20));
  const ranked     = days.map((d, i) => ({ i, dur: d.sleepDurationH }))
    .sort((a, b) => a.dur - b.dur);
  const shockSet     = new Set(ranked.slice(0, n).map(x => x.i));
  const shockThreshH = ranked[n - 1].dur;

  const points: DayPoint[] = days.map((d, i) => ({
    sleepH:    d.sleepDurationH,
    cpsRate:   d.cpsRate,
    isShock:   shockSet.has(i),
    dayIndex:  i,
    totalDays: days.length,
    date:      new Date(d.wakeMs).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(),
    taskCount: dayCount[i],
  }));

  const xs  = points.map(p => p.sleepH);
  const ys  = points.map(p => p.cpsRate);
  const N   = points.length;
  const sX  = xs.reduce((s, v) => s + v, 0);
  const sY  = ys.reduce((s, v) => s + v, 0);
  const sXY = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sX2 = xs.reduce((s, v) => s + v * v, 0);
  const sY2 = ys.reduce((s, v) => s + v * v, 0);
  const den = N * sX2 - sX * sX;
  if (den === 0) return null;

  const regB = (N * sXY - sX * sY) / den;
  const regA = (sY - regB * sX) / N;
  const rNum = N * sXY - sX * sY;
  const rDen = Math.sqrt((N * sX2 - sX * sX) * (N * sY2 - sY * sY));
  const r    = rDen === 0 ? 0 : rNum / rDen;

  const meanOutput      = sY / N;
  const slopePerHourPct = meanOutput > 0 ? (regB / meanOutput) * 100 : 0;
  const meanX           = sX / N;
  const Sxx             = sX2 - N * meanX * meanX;

  // Residual standard error for the confidence band
  const sse = ys.reduce((s, yi, i) => {
    const res = yi - (regA + regB * xs[i]);
    return s + res * res;
  }, 0);
  const s = Math.sqrt(sse / Math.max(1, N - 2));

  // Build 40-point eval grid across the data range
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const GRID = 40;
  const gridXs = Array.from({ length: GRID }, (_, i) => xMin + (i / (GRID - 1)) * (xMax - xMin));

  const bandHi = gridXs.map(x0 => {
    const se = s * Math.sqrt(1 / N + (x0 - meanX) ** 2 / Sxx);
    return regA + regB * x0 + se;
  });
  const bandLo = gridXs.map(x0 => {
    const se = s * Math.sqrt(1 / N + (x0 - meanX) ** 2 / Sxx);
    return Math.max(0, regA + regB * x0 - se);
  });

  return { points, regA, regB, r, shockThreshH, slopePerHourPct, gridXs, bandHi, bandLo };
}

export function buildScatterInsights(res: ScatterResult): string[] {
  const dir      = res.r >= 0 ? "POSITIVE" : "NEGATIVE";
  const strength = Math.abs(res.r) >= 0.5 ? "STRONG" : Math.abs(res.r) >= 0.3 ? "MODERATE" : "WEAK";
  const sign     = res.slopePerHourPct >= 0 ? "+" : "";
  return [
    `R = ${res.r.toFixed(2)}  ·  ${strength} ${dir} CORRELATION`,
    `+1H SLEEP  →  ${sign}${Math.round(res.slopePerHourPct)}% OUTPUT`,
    `SHOCK THRESHOLD  ≤${res.shockThreshH.toFixed(1)}H  ·  SHOWN IN RED`,
  ];
}
