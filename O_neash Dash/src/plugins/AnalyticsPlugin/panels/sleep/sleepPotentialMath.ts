import type { SleepEntry } from "../../../SleepTrackerPlugin/lib/sleepDb";

export interface SleepNight {
  onsetX: number;    // hours after 20:00  (0 = 8 pm, 4 = midnight, 7 = 3 am)
  durationH: number;
  date: string;
}

export interface PotentialResult {
  nights: SleepNight[];
  xs: number[];             // 200-point grid in onset-hour space
  Us: number[];             // U(x), min shifted to 0
  drifts: number[];         // D¹(x) — kernel-estimated drift at each grid point
  kdes: number[];           // KDE of actual onset times, normalised to max=1
  chronotypeX: number;      // x at minimum U
  chronotypeLabel: string;  // e.g. "11:30 PM"
  wellDepth: number;        // max(Us) — shallower = less stable
  sigma: number;            // RMS of night-to-night Δonset (hours)
  kappa: number;            // d²U/dx² at chronotype — well stiffness (h⁻²)
  xMin: number;
  xMax: number;
}

// Convert ISO datetime → hours after 20:00 (handles midnight crossing)
function toOnsetX(sleepStart: string): number {
  const d = new Date(sleepStart);
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 20 ? h - 20 : h + 4;
}

function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u);
}

// Nadaraya-Watson kernel regression: E[dy | x] from paired (x, dy) observations
function kernelRegress(
  dataX: number[],
  dataY: number[],
  x: number,
  h: number,
): number {
  let num = 0, den = 0;
  for (let i = 0; i < dataX.length; i++) {
    const k = gaussianKernel((dataX[i] - x) / h);
    num += k * dataY[i];
    den += k;
  }
  return den > 1e-10 ? num / den : 0;
}

// Linear interpolation of U at arbitrary x on the grid
export function evalU(xs: number[], Us: number[], x: number): number {
  if (x <= xs[0]) return Us[0];
  if (x >= xs[xs.length - 1]) return Us[xs.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return Us[lo] * (1 - t) + Us[hi] * t;
}

// Format onset-hour value back to clock time string
export function fmtOnsetHour(x: number): string {
  const h = (x + 20) % 24;
  const hInt = Math.floor(h);
  const mInt = Math.round((h - hInt) * 60);
  const suffix = hInt >= 12 ? "AM" : "PM";
  const h12 = hInt % 12 || 12;
  return `${h12}:${mInt.toString().padStart(2, "0")} ${suffix}`;
}

export function computePotential(entries: SleepEntry[]): PotentialResult | null {
  if (entries.length < 15) return null;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime(),
  );

  const nights: SleepNight[] = sorted.map(e => ({
    onsetX: toOnsetX(e.sleep_start),
    durationH:
      (new Date(e.wake_time).getTime() - new Date(e.sleep_start).getTime()) / 3_600_000,
    date: e.date,
  }));

  // Build Kramers-Moyal pairs: consecutive nights within 2 calendar days
  const kmX: number[] = [];
  const kmDx: number[] = [];
  for (let i = 0; i < nights.length - 1; i++) {
    const dayGap =
      (new Date(nights[i + 1].date).getTime() - new Date(nights[i].date).getTime()) /
      86_400_000;
    if (dayGap > 2) continue;
    const dx = nights[i + 1].onsetX - nights[i].onsetX;
    if (Math.abs(dx) <= 5) {    // discard travel / outlier jumps
      kmX.push(nights[i].onsetX);
      kmDx.push(dx);
    }
  }
  if (kmX.length < 8) return null;

  // Silverman's rule bandwidth for kernel regression
  const meanX = kmX.reduce((s, v) => s + v, 0) / kmX.length;
  const stdX = Math.sqrt(kmX.reduce((s, v) => s + (v - meanX) ** 2, 0) / kmX.length);
  const h = Math.max(0.3, 1.06 * stdX * Math.pow(kmX.length, -0.2));

  // Grid
  const allOnsets = nights.map(n => n.onsetX);
  const xMin = Math.max(0, Math.min(...allOnsets) - 0.5);
  const xMax = Math.min(12, Math.max(...allOnsets) + 0.5);
  const GRID = 200;
  const step = (xMax - xMin) / (GRID - 1);
  const xs = Array.from({ length: GRID }, (_, i) => xMin + i * step);

  // Drift D¹(x) = E[Δx | onset = x]  via kernel regression
  const drifts = xs.map(x => kernelRegress(kmX, kmDx, x, h));

  // Potential reconstruction: U(x_{i+1}) = U(x_i) − D¹(x_i)·Δx
  const rawUs: number[] = new Array(GRID).fill(0);
  for (let i = 1; i < GRID; i++) {
    rawUs[i] = rawUs[i - 1] - drifts[i - 1] * step;
  }

  // Shift minimum to 0
  const minU = Math.min(...rawUs);
  const Us = rawUs.map(u => u - minU);

  const minIdx = rawUs.indexOf(minU);
  const chronotypeX = xs[minIdx];
  const chronotypeLabel = fmtOnsetHour(chronotypeX);

  const sigma = Math.sqrt(kmDx.reduce((s, v) => s + v * v, 0) / kmDx.length);
  const wellDepth = Math.max(...Us);

  // Well curvature κ = d²U/dx² at the minimum (numerical second derivative)
  const kappa = minIdx > 0 && minIdx < GRID - 1
    ? (Us[minIdx + 1] + Us[minIdx - 1]) / (step * step)
    : 0;

  // KDE of actual onset times — Silverman bandwidth on the raw onset distribution
  const meanO = allOnsets.reduce((s, v) => s + v, 0) / allOnsets.length;
  const stdO  = Math.sqrt(allOnsets.reduce((s, v) => s + (v - meanO) ** 2, 0) / allOnsets.length);
  const hKde  = Math.max(0.25, 1.06 * stdO * Math.pow(allOnsets.length, -0.2));
  const rawKdes = xs.map(x =>
    allOnsets.reduce((s, o) => s + gaussianKernel((o - x) / hKde), 0) / allOnsets.length,
  );
  const maxKde = Math.max(...rawKdes);
  const kdes = rawKdes.map(k => k / maxKde);

  return { nights, xs, Us, drifts, kdes, chronotypeX, chronotypeLabel, wellDepth, sigma, kappa, xMin, xMax };
}

export function buildPotentialInsights(r: PotentialResult): string[] {
  const sigMin = Math.round(r.sigma * 60);
  const stability =
    r.wellDepth > 1.5 ? "STABLE RHYTHM" :
    r.wellDepth > 0.7 ? "MODERATE RHYTHM" :
    "IRREGULAR RHYTHM";
  return [
    `CHRONOTYPE · ${r.chronotypeLabel}`,
    `IRREGULARITY · ±${sigMin} MIN / NIGHT`,
    stability,
  ];
}
