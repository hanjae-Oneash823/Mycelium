import type { SleepEntry } from "../../../SleepTrackerPlugin/lib/sleepDb";
import type { IrfTaskRecord } from "../../../PlannerPlugin/lib/plannerDb";

export const LAGS = [-1, 0, 1, 2, 3, 4] as const;
const MIN_BASELINE_DAYS = 5;

interface DayRecord {
  wakeMs: number;
  sleepMs: number;
  wakingHours: number;
  sleepDurationH: number;
  cpsRate: number;
}

export interface IrfResult {
  lags: readonly number[];
  meanTraj: (number | null)[];
  allTraj: (number | null)[][];
  shockCount: number;
  shockThreshH: number;
  peakDipLag: number;
  peakDipPct: number;       // e.g. 0.72 = 72% of baseline
  recoveryLag: number | null;
  hasRebound: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrMean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function arrMedian(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function arrStd(xs: number[]): number {
  const m = arrMean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

// ─── Main computation ─────────────────────────────────────────────────────────

export function computeIrf(
  sleepEntries: SleepEntry[],
  tasks: IrfTaskRecord[],
): IrfResult | null {
  if (sleepEntries.length < 14) return null;

  const sorted = [...sleepEntries].sort(
    (a, b) => new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime(),
  );

  // Build chrono days: day i spans [wake_i, sleep_{i+1})
  const days: DayRecord[] = sorted.map((e, i) => {
    const wakeMs = new Date(e.wake_time).getTime();
    const sleepMs = i < sorted.length - 1
      ? new Date(sorted[i + 1].sleep_start).getTime()
      : Date.now();
    return {
      wakeMs,
      sleepMs,
      wakingHours: Math.max(0.5, Math.min(20, (sleepMs - wakeMs) / 3_600_000)),
      sleepDurationH: (wakeMs - new Date(e.sleep_start).getTime()) / 3_600_000,
      cpsRate: 0,
    };
  });

  // Assign tasks → days; compute CPS rate = sqrt(count × totalDuration) / wakingHours
  const dayCount: number[]    = days.map(() => 0);
  const dayDuration: number[] = days.map(() => 0);
  for (const task of tasks) {
    if (!task.actual_completed_at) continue;
    const ms  = new Date(task.actual_completed_at).getTime();
    const idx = days.findIndex(d => ms >= d.wakeMs && ms < d.sleepMs);
    if (idx >= 0) {
      dayCount[idx]    += 1;
      dayDuration[idx] += task.estimated_duration_minutes ?? 30;
    }
  }
  for (let i = 0; i < days.length; i++) {
    days[i].cpsRate = Math.sqrt(dayCount[i] * dayDuration[i]) / days[i].wakingHours;
  }

  // Shock detection: bottom 20% of nights by sleep duration
  const n = Math.max(5, Math.floor(days.length * 0.20));
  const ranked = days
    .map((d, i) => ({ i, dur: d.sleepDurationH }))
    .sort((a, b) => a.dur - b.dur);
  const shockSet = new Set(ranked.slice(0, n).map(x => x.i));
  const thresh = ranked[n - 1].dur;  // sleep duration of the Nth worst night

  const shockIndices = [...shockSet];

  // Baseline: median CPS across all days with nonzero output
  if (days.length < MIN_BASELINE_DAYS) return null;

  const baselineRates = days.map(d => d.cpsRate).filter(r => r > 0);
  const baseline = baselineRates.length > 0 ? arrMedian(baselineRates) : 0;
  if (baseline < 0.001) return null;

  // Build per-shock trajectories (normalized: baseline = 1.0)
  const allTraj: (number | null)[][] = shockIndices.map(si =>
    LAGS.map(lag => {
      const idx = si + lag;
      if (idx < 0 || idx >= days.length) return null;
      if (lag !== 0 && shockSet.has(idx)) return null; // adjacent shock → skip
      return days[idx].cpsRate / baseline;
    }),
  );

  // Mean trajectory: require ≥2 valid values per lag
  const meanTraj: (number | null)[] = LAGS.map((_, li) => {
    const vals = allTraj.map(t => t[li]).filter((v): v is number => v !== null);
    return vals.length >= 2 ? arrMean(vals) : null;
  });

  // Peak dip: lowest mean at lag ≥ 0
  let peakDipLi = LAGS.findIndex(l => l >= 0); // start at lag=0
  for (let li = peakDipLi + 1; li < LAGS.length; li++) {
    const v = meanTraj[li];
    const best = meanTraj[peakDipLi];
    if (v !== null && (best === null || v < best)) peakDipLi = li;
  }

  const recoveryLi = LAGS.findIndex((lag, li) => lag > 0 && (meanTraj[li] ?? 0) >= 1.0);
  const recoveryLag = recoveryLi >= 0 ? LAGS[recoveryLi] : null;
  const hasRebound = meanTraj.some((v, li) => LAGS[li] > 0 && v !== null && v > 1.0);

  return {
    lags: LAGS,
    meanTraj,
    allTraj,
    shockCount: shockSet.size,
    shockThreshH: thresh,
    peakDipLag: LAGS[peakDipLi],
    peakDipPct: meanTraj[peakDipLi] ?? 1,
    recoveryLag,
    hasRebound,
  };
}

export function buildIrfInsights(r: IrfResult): string[] {
  const dipPct = Math.round(r.peakDipPct * 100);
  const lagLabel = r.peakDipLag === 0 ? "SHOCK DAY" : `D+${r.peakDipLag}`;
  const recoveryStr = r.recoveryLag !== null
    ? `RECOVERY D+${r.recoveryLag}${r.hasRebound ? "  ·  REBOUND" : ""}`
    : r.hasRebound ? "PARTIAL RECOVERY  ·  REBOUND" : "NO FULL RECOVERY IN WINDOW";
  return [
    `${r.shockCount} BAD NIGHTS  ·  BOTTOM 20%  ·  ≤${r.shockThreshH.toFixed(1)}H`,
    `PEAK DIP: ${lagLabel}  ·  OUTPUT ${dipPct}% OF BASELINE`,
    recoveryStr,
  ];
}
