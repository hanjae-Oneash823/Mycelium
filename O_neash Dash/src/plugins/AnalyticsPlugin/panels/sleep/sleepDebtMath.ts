import type { SleepEntry } from "../../../SleepTrackerPlugin/lib/sleepDb";

// Borbély two-process model — Borbély 1982, Sleep 5(2):129-145
const SA    = 1.0;   // upper asymptote (max homeostatic pressure)
const SB    = 0.0;   // lower asymptote (fully rested)
const TAU_W = 18.2;  // wake time constant (hours)
const TAU_S = 4.2;   // sleep time constant (hours)
const C_AMP = 0.15;  // circadian amplitude
const C_MID = 0.5;   // circadian midpoint
const STEP_H  = 0.5; // simulation step (hours)
const STEP_MS = STEP_H * 3_600_000;
const PROJ_DAYS   = 7;
const TAU_DECAY   = 10;                        // debt half-life ~7d, gone in ~6 weeks
const DECAY_FACTOR = Math.exp(-1 / TAU_DECAY); // applied once per night

export interface DebtPoint {
  t: number;
  S: number;
  C: number;
  isSleep: boolean;
  isProjection: boolean;
}

export interface DebtNight {
  date: string;
  sleepH: number;
  debtH: number;
  cumDebtH: number;
  onsetH: number;  // folded clock hour (e.g. 23 = 11 PM, 25 = 1 AM)
  wakeH: number;   // onsetH + sleepH
}

export interface DebtResult {
  points: DebtPoint[];
  nights: DebtNight[];
  tauW: number;
  tauS: number;
  phi: number;
  tNow: number;
  personalSleepNeed: number;
  currentDebt: number;
  projectedDebt: number;
  avgNightlyDebt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function circadian(hourOfDay: number, phi: number): number {
  return C_MID + C_AMP * Math.cos((2 * Math.PI * (hourOfDay - phi)) / 24);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeDebt(entries: SleepEntry[], targetH: number): DebtResult | null {
  if (entries.length < 7) return null;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime(),
  );

  interface Interval { start: number; end: number; isProjection: boolean }

  const intervals: Interval[] = sorted.map(e => ({
    start: new Date(e.sleep_start).getTime(),
    end:   new Date(e.wake_time).getTime(),
    isProjection: false,
  }));

  // ── Projection: median of last 14 nights ──────────────────────────────────
  const recent = sorted.slice(-14);

  const onsetClockHours = recent.map(e => {
    const d = new Date(e.sleep_start);
    const h = d.getHours() + d.getMinutes() / 60;
    return h < 12 ? h + 24 : h; // fold midnight-crossing into contiguous range
  });
  const medOnsetH = median(onsetClockHours) % 24;
  const medDurH   = median(recent.map(e =>
    (new Date(e.wake_time).getTime() - new Date(e.sleep_start).getTime()) / 3_600_000,
  ));

  const tNow = Date.now();
  const todayMidnight = new Date(tNow);
  todayMidnight.setHours(0, 0, 0, 0);

  for (let d = 1; d <= PROJ_DAYS; d++) {
    const dayMs    = todayMidnight.getTime() + d * 86_400_000;
    const sleepStart = dayMs + medOnsetH * 3_600_000;
    intervals.push({ start: sleepStart, end: sleepStart + medDurH * 3_600_000, isProjection: true });
  }

  // ── Circadian phase from median onset (C peaks ~3h before habitual onset) ─
  const phi = (median(onsetClockHours) % 24 - 3 + 24) % 24;

  // ── Simulation ────────────────────────────────────────────────────────────
  const tStart = intervals[0].start - 20 * 3_600_000;
  const tEnd   = intervals[intervals.length - 1].end;
  const points: DebtPoint[] = [];
  let S = 0.35;
  let ci = 0;

  for (let t = tStart; t <= tEnd; t += STEP_MS) {
    while (ci < intervals.length - 1 && intervals[ci].end < t) ci++;

    const inSleep = ci < intervals.length &&
      intervals[ci].start <= t && t <= intervals[ci].end;

    S = inSleep
      ? SB + (S - SB) * Math.exp(-STEP_H / TAU_S)
      : SA - (SA - S) * Math.exp(-STEP_H / TAU_W);
    S = Math.max(SB, Math.min(SA, S));

    const d     = new Date(t);
    const hourOfDay = d.getHours() + d.getMinutes() / 60;
    const C     = circadian(hourOfDay, phi);
    const isProjection = t > tNow || intervals[ci]?.isProjection;

    if (t >= intervals[0].start) {
      points.push({ t, S, C, isSleep: inSleep, isProjection });
    }
  }

  // ── Personal sleep need: user-defined target ─────────────────────────────
  const allDurs = sorted.map(e =>
    (new Date(e.wake_time).getTime() - new Date(e.sleep_start).getTime()) / 3_600_000,
  );
  const personalSleepNeed = targetH;

  // ── Nightly debt (with exponential decay) ────────────────────────────────
  const nights: DebtNight[] = [];
  let cumDebt = 0;
  const nightlyDeltas: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const sleepH = allDurs[i];
    const debtH  = personalSleepNeed - sleepH;
    cumDebt = cumDebt * DECAY_FACTOR + debtH;
    nightlyDeltas.push(debtH);
    const d    = new Date(sorted[i].sleep_start);
    const rawH = d.getHours() + d.getMinutes() / 60;
    const onsetH = rawH < 12 ? rawH + 24 : rawH;
    nights.push({ date: sorted[i].date, sleepH, debtH, cumDebtH: cumDebt, onsetH, wakeH: onsetH + sleepH });
  }

  // projected debt: iterate PROJ_DAYS forward with decay
  let projDebt = cumDebt;
  for (let d = 0; d < PROJ_DAYS; d++) {
    projDebt = projDebt * DECAY_FACTOR + (personalSleepNeed - medDurH);
  }

  const avgNightlyDebt = nightlyDeltas.reduce((s, v) => s + v, 0) / nightlyDeltas.length;

  return {
    points,
    nights,
    tauW: TAU_W,
    tauS: TAU_S,
    phi,
    tNow,
    personalSleepNeed,
    currentDebt:    cumDebt,
    projectedDebt:  projDebt,
    avgNightlyDebt,
  };
}

export function findNeutralTarget(entries: SleepEntry[]): number {
  if (entries.length < 7) return 8;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime(),
  );
  const durs = sorted.map(e =>
    (new Date(e.wake_time).getTime() - new Date(e.sleep_start).getTime()) / 3_600_000,
  );
  const cumDebtMedian = (targetH: number): number => {
    let d = 0;
    const vals = durs.map(s => { d = d * DECAY_FACTOR + (targetH - s); return d; });
    return median(vals);
  };
  let lo = 4, hi = 14;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (cumDebtMedian(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function buildDebtInsights(r: DebtResult): string[] {
  const debtMin = Math.round(Math.abs(r.avgNightlyDebt) * 60);
  const totalH  = Math.abs(r.currentDebt).toFixed(1);
  const projH   = Math.abs(r.projectedDebt).toFixed(1);
  const trend   = r.avgNightlyDebt > 0 ? "ACCUMULATING" : "RECOVERING";
  const needH   = r.personalSleepNeed.toFixed(1);
  return [
    `${trend} · ${debtMin} MIN/NIGHT AVG`,
    `PERSONAL NEED · ${needH}H  ·  DEBT · ${totalH}H`,
    `7-DAY PROJECTION · ${projH}H`,
  ];
}
