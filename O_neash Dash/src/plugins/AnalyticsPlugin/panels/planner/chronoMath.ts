// Von Mises KDE engine for the Chrono-Fingerprint analytic.
// Pure functions — no React, no DB, no side effects.

export interface ChronoPoint {
  theta: number;       // radians [0, 2π)
  arcId: string | null;
  inSession: boolean;
  timestamp: number;   // ms epoch
}

export interface Peak {
  theta: number;
  hour: number;
  density: number;
  isPrimary: boolean;
}

export interface ArcFingerprint {
  thetas: number[];
  kde: number[];
  peaks: Peak[];
  mu: number;
  concentration: number;
}

export interface RingSlice {
  hourBins: number[];
  kde: number[];
  peaks: Peak[];
}


export interface ChronoResult {
  evalAngles: number[];
  kde: number[];
  peaks: Peak[];
  concentration: number;
  kappa: number;
  arcResults: Map<string, ArcFingerprint>;
  kdeIn: number[];
  kdeOut: number[];
  ovl: number;
  driftHours: number | null;
  hourBins: number[];
  rings: [RingSlice, RingSlice, RingSlice]; // [0]=recent 0-30d, [1]=mid 30-60d, [2]=oldest 60-90d
}

// ── Bessel I₀ (Abramowitz & Stegun 9.8.1) ───────────────────────────────────

function besselI0(x: number): number {
  const ax = Math.abs(x);
  if (ax <= 3.75) {
    const t = x / 3.75;
    const t2 = t * t;
    return (
      1 +
      t2 * (3.5156229 + t2 * (3.0899424 + t2 * (1.2067492 + t2 * (0.2659732 + t2 * (0.0360768 + t2 * 0.0045813)))))
    );
  }
  const t = 3.75 / ax;
  return (
    (Math.exp(ax) / Math.sqrt(ax)) *
    (0.39894228 +
      t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377))))))))
  );
}

// ── Circular statistics ───────────────────────────────────────────────────────

function meanResultantLength(thetas: number[]): number {
  if (thetas.length === 0) return 0;
  let sc = 0, ss = 0;
  for (const t of thetas) { sc += Math.cos(t); ss += Math.sin(t); }
  return Math.sqrt(sc ** 2 + ss ** 2) / thetas.length;
}

function meanDirection(thetas: number[]): number {
  if (thetas.length === 0) return 0;
  let sc = 0, ss = 0;
  for (const t of thetas) { sc += Math.cos(t); ss += Math.sin(t); }
  return Math.atan2(ss, sc);
}

function wrapToPi(a: number): number {
  return ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

// ── Bandwidth & KDE ───────────────────────────────────────────────────────────

function computeBandwidth(thetas: number[]): number {
  const n = thetas.length;
  if (n < 2) return 1;
  const sigma2 = Math.max(1 - meanResultantLength(thetas), 0.01);
  return Math.min(Math.max(1 / (sigma2 * Math.pow(4 / (3 * n), 2 / 5)), 0.5), 50);
}

function vonMisesKDE(thetas: number[], evalAngles: number[], kappa: number): number[] {
  const n = thetas.length;
  if (n === 0) return evalAngles.map(() => 0);
  const norm = 2 * Math.PI * besselI0(kappa);
  return evalAngles.map((theta) => {
    let sum = 0;
    for (const ti of thetas) sum += Math.exp(kappa * Math.cos(theta - ti));
    return sum / (n * norm);
  });
}

// ── Peak detection ────────────────────────────────────────────────────────────

function findPeaks(kde: number[], evalAngles: number[]): Peak[] {
  const n = kde.length;
  const candidates: { idx: number; density: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (kde[i] > kde[(i - 1 + n) % n] && kde[i] > kde[(i + 1) % n])
      candidates.push({ idx: i, density: kde[i] });
  }
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => b.density - a.density);
  const threshold = candidates[0].density * 0.55;
  return candidates
    .filter((p) => p.density >= threshold)
    .slice(0, 4)
    .map((p, i) => {
      const theta = evalAngles[p.idx];
      const hour = ((theta / (2 * Math.PI)) * 24 + 24) % 24;
      return { theta, hour, density: p.density, isPrimary: i === 0 };
    });
}

// ── Derived metrics ───────────────────────────────────────────────────────────

function sessionOVL(a: number[], b: number[]): number {
  const minSum = a.reduce((s, v, i) => s + Math.min(v, b[i]), 0);
  const maxSum = Math.max(a.reduce((s, v) => s + v, 0), b.reduce((s, v) => s + v, 0));
  return maxSum > 0 ? minSum / maxSum : 0;
}

export function arcDivergence(mu1: number, mu2: number): number {
  return (1 - Math.cos(mu1 - mu2)) / 2;
}

export function concentrationLabel(C: number): string {
  if (C > 0.75) return "razor-sharp";
  if (C > 0.4) return "focused";
  return "diffuse";
}

export function formatHour(hour: number): string {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.round(((hour % 1) + 1) % 1 * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function runChronoModel(points: ChronoPoint[]): ChronoResult {
  const EVAL_N = 360;
  const evalAngles = Array.from({ length: EVAL_N }, (_, i) => (i / EVAL_N) * 2 * Math.PI);

  const allThetas = points.map((p) => p.theta);

  const hourBins = Array(24).fill(0) as number[];
  for (const p of points) hourBins[Math.floor((p.theta / (2 * Math.PI)) * 24) % 24]++;

  const kappa = computeBandwidth(allThetas);
  const kde = vonMisesKDE(allThetas, evalAngles, kappa);
  const peaks = findPeaks(kde, evalAngles);
  const concentration = meanResultantLength(allThetas);

  // Per-arc
  const arcBuckets = new Map<string, number[]>();
  for (const p of points) {
    if (!p.arcId) continue;
    if (!arcBuckets.has(p.arcId)) arcBuckets.set(p.arcId, []);
    arcBuckets.get(p.arcId)!.push(p.theta);
  }
  const arcResults = new Map<string, ArcFingerprint>();
  for (const [arcId, thetas] of arcBuckets) {
    if (thetas.length < 8) continue;
    const k = computeBandwidth(thetas);
    const arcKde = vonMisesKDE(thetas, evalAngles, k);
    const arcPeaks = findPeaks(arcKde, evalAngles);
    arcResults.set(arcId, {
      thetas, kde: arcKde, peaks: arcPeaks,
      mu: arcPeaks[0]?.theta ?? meanDirection(thetas),
      concentration: meanResultantLength(thetas),
    });
  }

  // Session split
  const inThetas  = points.filter((p) => p.inSession).map((p) => p.theta);
  const outThetas = points.filter((p) => !p.inSession).map((p) => p.theta);
  const kdeIn  = inThetas.length  >= 5 ? vonMisesKDE(inThetas,  evalAngles, computeBandwidth(inThetas))  : [];
  const kdeOut = outThetas.length >= 5 ? vonMisesKDE(outThetas, evalAngles, computeBandwidth(outThetas)) : [];
  const ovl = kdeIn.length > 0 && kdeOut.length > 0 ? sessionOVL(kdeIn, kdeOut) : 0;

  // Temporal drift (recent 30d vs prior 30d)
  const now = Date.now();
  const MS30 = 30 * 86400000;
  const recentThetas = points.filter((p) => p.timestamp >= now - MS30).map((p) => p.theta);
  const priorThetas  = points.filter((p) => p.timestamp >= now - 2 * MS30 && p.timestamp < now - MS30).map((p) => p.theta);
  const driftHours = recentThetas.length >= 8 && priorThetas.length >= 8
    ? (wrapToPi(meanDirection(recentThetas) - meanDirection(priorThetas)) / (2 * Math.PI)) * 24
    : null;

  // Three 30-day ring slices: [0]=recent, [1]=mid, [2]=oldest
  const ringRanges: [number, number][] = [
    [now - MS30,       now],
    [now - 2 * MS30,   now - MS30],
    [now - 3 * MS30,   now - 2 * MS30],
  ];
  const rings = ringRanges.map(([start, end]) => {
    const pts = points.filter((p) => p.timestamp >= start && p.timestamp < end);
    const bins = Array(24).fill(0) as number[];
    for (const p of pts) bins[Math.floor((p.theta / (2 * Math.PI)) * 24) % 24]++;
    const thetas = pts.map((p) => p.theta);
    const ringKde = thetas.length >= 5
      ? vonMisesKDE(thetas, evalAngles, computeBandwidth(thetas))
      : Array(EVAL_N).fill(0) as number[];
    return { hourBins: bins, kde: ringKde, peaks: findPeaks(ringKde, evalAngles) };
  }) as [RingSlice, RingSlice, RingSlice];

  return { evalAngles, kde, peaks, concentration, kappa, arcResults, kdeIn, kdeOut, ovl, driftHours, hourBins, rings };
}
