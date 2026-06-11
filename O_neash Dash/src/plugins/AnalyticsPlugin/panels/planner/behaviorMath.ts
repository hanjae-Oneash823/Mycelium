import type { DailyBehaviorRecord } from "../../../PlannerPlugin/lib/plannerDb";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClusterLabel = "DEEP FOCUS" | "MAINTENANCE" | "RECOVERY" | "DRIFT";

export interface ClusterFeatureLine {
  name:  string;
  value: string;
  dir:   "HIGH" | "LOW" | "NORMAL";
}

export interface StatePoint {
  date: string;
  x: number;
  y: number;
  cluster: number;
  isToday: boolean;
}

export interface RollingPoint {
  date: string;
  proportions: number[];
}

export interface StateSpaceResult {
  points:          StatePoint[];
  centroids:       Array<{ x: number; y: number }>;
  clusterLabels:   ClusterLabel[];
  clusterColors:   string[];
  clusterFeatures: ClusterFeatureLine[][];
  bounds:          { minX: number; maxX: number; minY: number; maxY: number };
  rolling:         RollingPoint[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LABEL_COLORS: Record<ClusterLabel, string> = {
  "DEEP FOCUS":  "#00c4a7",
  "MAINTENANCE": "#60a5fa",
  "RECOVERY":    "#f5c842",
  "DRIFT":       "#ff6b6b",
};

const LABEL_ORDER: ClusterLabel[] = ["DEEP FOCUS", "MAINTENANCE", "RECOVERY", "DRIFT"];

const F_COMPLETIONS   = 0;
const F_DIVERSITY     = 1;
const F_ROUTINE       = 2;
const F_HOUR_MEDIAN   = 3;
const F_HOUR_SPREAD   = 4;
const F_ARC_DOMINANCE = 5;
const F_ARC_COUNT     = 6;
const F_MORNING_RATIO = 7;
const F_ARC_SWITCHES  = 8;
const N_FEATURES      = 9;
const ROLLING_W       = 7;

function fmtHour(h: number): string {
  const hh   = Math.floor(h) % 24;
  const mm   = Math.round((h - Math.floor(h)) * 60);
  const ampm = hh < 12 ? "AM" : "PM";
  const h12  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

const FEATURE_META: { name: string; fmt: (v: number) => string }[] = [
  { name: "COMPLETIONS",   fmt: v => `${Math.round(v)} tasks` },
  { name: "DIVERSITY",     fmt: v => `${v.toFixed(1)} bits` },
  { name: "ROUTINE",       fmt: v => `${Math.round(v * 100)}%` },
  { name: "PEAK HOUR",     fmt: v => fmtHour(v) },
  { name: "HOUR SPREAD",   fmt: v => `${v.toFixed(1)}h` },
  { name: "ARC FOCUS",     fmt: v => `${Math.round(v * 100)}%` },
  { name: "ARCS TOUCHED",  fmt: v => `${Math.round(v)}` },
  { name: "MORNING RATIO", fmt: v => `${Math.round(v * 100)}%` },
  { name: "ARC SWITCHES",  fmt: v => `${Math.round(v)}/day` },
];

// ─── Seeded PRNG (LCG) ───────────────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return localDateStr(new Date().toISOString());
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function shannonEntropy(ids: (string | null)[]): number {
  const valid = ids.filter(Boolean) as string[];
  if (valid.length === 0) return 0;
  const counts: Record<string, number> = {};
  for (const id of valid) counts[id] = (counts[id] ?? 0) + 1;
  const n = valid.length;
  return -Object.values(counts).reduce((s, c) => {
    const p = c / n;
    return s + p * Math.log2(p);
  }, 0);
}

// ─── Feature engineering ─────────────────────────────────────────────────────

interface DayRaw { date: string; features: number[] }

function buildDayRaws(records: DailyBehaviorRecord[]): DayRaw[] {
  const groups = new Map<string, DailyBehaviorRecord[]>();
  for (const r of records) {
    const d = localDateStr(r.actual_completed_at);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(r);
  }

  const raws: DayRaw[] = [];
  for (const [date, recs] of groups) {
    const n = recs.length;
    let routineCount = 0;
    const arcCounts = new Map<string, number>();
    const hours: number[] = [];

    for (const r of recs) {
      if (r.is_routine) routineCount++;
      if (r.arc_id) arcCounts.set(r.arc_id, (arcCounts.get(r.arc_id) ?? 0) + 1);
      const d = new Date(r.actual_completed_at);
      hours.push(d.getHours() + d.getMinutes() / 60);
    }

    const maxArcCount = arcCounts.size > 0 ? Math.max(...arcCounts.values()) : 0;

    const morningCount = recs.filter(r => {
      const d = new Date(r.actual_completed_at);
      return d.getHours() + d.getMinutes() / 60 < 12;
    }).length;

    const sorted = [...recs].sort(
      (a, b) => new Date(a.actual_completed_at).getTime() - new Date(b.actual_completed_at).getTime(),
    );
    let arcSwitches = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].arc_id !== sorted[i - 1].arc_id) arcSwitches++;
    }

    const f = new Array<number>(N_FEATURES).fill(0);
    f[F_COMPLETIONS]   = n;
    f[F_DIVERSITY]     = shannonEntropy(recs.map(r => r.arc_id));
    f[F_ROUTINE]       = n > 0 ? routineCount / n : 0;
    f[F_HOUR_MEDIAN]   = median(hours);
    f[F_HOUR_SPREAD]   = stddev(hours);
    f[F_ARC_DOMINANCE] = n > 0 ? maxArcCount / n : 0;
    f[F_ARC_COUNT]     = arcCounts.size;
    f[F_MORNING_RATIO] = n > 0 ? morningCount / n : 0;
    f[F_ARC_SWITCHES]  = arcSwitches;
    raws.push({ date, features: f });
  }

  raws.sort((a, b) => a.date.localeCompare(b.date));
  return raws;
}

// ─── Standardisation ─────────────────────────────────────────────────────────

function standardize(matrix: number[][]): number[][] {
  const n = matrix.length, d = matrix[0].length;
  const means = new Array<number>(d).fill(0);
  const stds  = new Array<number>(d).fill(0);
  for (const row of matrix) for (let j = 0; j < d; j++) means[j] += row[j] / n;
  for (const row of matrix) for (let j = 0; j < d; j++) stds[j] += (row[j] - means[j]) ** 2 / n;
  for (let j = 0; j < d; j++) stds[j] = Math.sqrt(stds[j]) || 1;
  return matrix.map(row => row.map((x, j) => (x - means[j]) / stds[j]));
}

// ─── UMAP (seeded SGD) ───────────────────────────────────────────────────────
// Curve params precomputed for min_dist = 0.1
const UMAP_A = 1.5769, UMAP_B = 0.8951;

function umap(X: number[][], nNeighbors = 12, epochs = 400): Array<[number, number]> {
  const n   = X.length;
  const K   = Math.min(nNeighbors, n - 1);
  const rng = makeRng(42);
  const sd2 = (a: number[], b: number[]) => a.reduce((s, v, f) => s + (v - b[f]) ** 2, 0);

  // k-NN (exact O(n²), fine for n ≤ 200)
  const knnDists: number[][] = [];
  const knnIdxs:  number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = X.map((xj, j) => ({ j, d: j === i ? Infinity : Math.sqrt(sd2(X[i], xj)) }));
    row.sort((a, b) => a.d - b.d);
    knnDists.push(row.slice(0, K).map(r => r.d));
    knnIdxs.push(row.slice(0, K).map(r => r.j));
  }

  // Per-point bandwidth via binary search
  const rhos   = knnDists.map(d => d[0]);
  const sigmas = Array(n).fill(1) as number[];
  const target = Math.log2(K);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = Infinity, sigma = 1;
    for (let it = 0; it < 64; it++) {
      const sum = knnDists[i].reduce((s, d) => s + Math.exp(-Math.max(0, d - rhos[i]) / sigma), 0);
      if (Math.abs(sum - target) < 1e-5) break;
      if (sum < target) { lo = sigma; sigma = hi === Infinity ? sigma * 2 : (lo + hi) / 2; }
      else              { hi = sigma; sigma = (lo + hi) / 2; }
    }
    sigmas[i] = Math.max(sigma, 1e-8);
  }

  // Fuzzy graph with probabilistic OR symmetrisation
  const Wg: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (let i = 0; i < n; i++) {
    for (let ki = 0; ki < K; ki++) {
      const j   = knnIdxs[i][ki];
      const wij = Math.exp(-Math.max(0, knnDists[i][ki] - rhos[i]) / sigmas[i]);
      const wji = Wg[j].get(i) ?? 0;
      const ws  = wij + wji - wij * wji;
      Wg[i].set(j, ws); Wg[j].set(i, ws);
    }
  }
  const edges: { i: number; j: number; w: number }[] = [];
  for (let i = 0; i < n; i++)
    for (const [j, w] of Wg[i]) if (j > i) edges.push({ i, j, w });

  // Random init
  const Y: [number, number][] = Array.from({ length: n }, () => [
    (rng() - 0.5) * 10, (rng() - 0.5) * 10,
  ]);

  // SGD: attraction on positive edges + repulsion via negative sampling
  for (let ep = 0; ep < epochs; ep++) {
    const lr = Math.max(0.0001, 1.0 * (1 - ep / epochs));
    for (const { i, j, w } of edges) {
      if (rng() > w) continue;
      let dx = Y[i][0] - Y[j][0], dy = Y[i][1] - Y[j][1];
      const dv = dx * dx + dy * dy + 1e-6;
      const db = Math.pow(dv, UMAP_B);
      const fA = Math.max(-4, Math.min(4, -2 * UMAP_A * UMAP_B * Math.pow(dv, UMAP_B - 1) / (1 + UMAP_A * db)));
      Y[i][0] += lr * fA * dx; Y[i][1] += lr * fA * dy;
      Y[j][0] -= lr * fA * dx; Y[j][1] -= lr * fA * dy;
      for (let neg = 0; neg < 5; neg++) {
        const ki = Math.floor(rng() * n);
        if (ki === i) continue;
        dx = Y[i][0] - Y[ki][0]; dy = Y[i][1] - Y[ki][1];
        const dv2 = dx * dx + dy * dy + 0.001;
        const fR  = Math.max(0, Math.min(4, 2 * UMAP_B / ((0.001 + dv2) * (1 + UMAP_A * Math.pow(dv2, UMAP_B)))));
        Y[i][0] += lr * fR * dx; Y[i][1] += lr * fR * dy;
      }
    }
  }
  return Y;
}

// ─── K-means (seeded k-means++) ──────────────────────────────────────────────

function kmeans(pts: Array<[number, number]>, k: number): number[] {
  const n   = pts.length;
  const rng = makeRng(42);
  if (n === 0 || k === 0) return [];

  // k-means++ initialisation
  const centroids: Array<[number, number]> = [pts[Math.floor(rng() * n)]];
  while (centroids.length < k) {
    const dists = pts.map(p =>
      Math.min(...centroids.map(c => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2)),
    );
    const total = dists.reduce((s, d) => s + d, 0);
    let r = rng() * total, idx = 0;
    for (let i = 0; i < n; i++) { r -= dists[i]; if (r <= 0) { idx = i; break; } }
    centroids.push([...pts[idx]] as [number, number]);
  }

  const labels = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < n; i++) {
      let minD = Infinity, best = 0;
      for (let c = 0; c < k; c++) {
        const d = (pts[i][0] - centroids[c][0]) ** 2 + (pts[i][1] - centroids[c][1]) ** 2;
        if (d < minD) { minD = d; best = c; }
      }
      labels[i] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      sums[c][0] += pts[i][0]; sums[c][1] += pts[i][1]; sums[c][2]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][2] > 0) centroids[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
    }
  }
  return labels;
}

// ─── Cluster labeling ─────────────────────────────────────────────────────────

function labelClusters(normed: number[][], labels: number[], k: number): ClusterLabel[] {
  const featureSums = Array.from({ length: k }, () => new Array<number>(N_FEATURES).fill(0));
  const counts = new Array<number>(k).fill(0);
  for (let i = 0; i < normed.length; i++) {
    const c = labels[i];
    for (let j = 0; j < N_FEATURES; j++) featureSums[c][j] += normed[i][j];
    counts[c]++;
  }
  const scores = featureSums.map((fm, c) => {
    const cnt = counts[c] || 1;
    return {
      c,
      score: (fm[F_COMPLETIONS]   / cnt) * 0.5
           + (fm[F_ARC_DOMINANCE] / cnt) * 0.3
           - (fm[F_ROUTINE]       / cnt) * 0.2,
    };
  });
  scores.sort((a, b) => b.score - a.score);
  const result = new Array<ClusterLabel>(k);
  for (let rank = 0; rank < k; rank++) result[scores[rank].c] = LABEL_ORDER[rank];
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeStateSpace(records: DailyBehaviorRecord[]): StateSpaceResult | null {
  const raws = buildDayRaws(records);
  if (raws.length < 4) return null;

  const matrix    = raws.map(r => r.features);
  const normed    = standardize(matrix);
  const projected = umap(normed);

  const k             = Math.min(4, raws.length);
  const labels        = kmeans(projected, k);
  const clusterLabels = labelClusters(normed, labels, k);
  const clusterColors = clusterLabels.map(l => LABEL_COLORS[l]);

  const today  = todayStr();
  const points: StatePoint[] = raws.map((r, i) => ({
    date:    r.date,
    x:       projected[i][0],
    y:       projected[i][1],
    cluster: labels[i],
    isToday: r.date === today,
  }));

  const centSums = Array.from({ length: k }, () => ({ x: 0, y: 0, n: 0 }));
  for (const p of points) {
    centSums[p.cluster].x += p.x;
    centSums[p.cluster].y += p.y;
    centSums[p.cluster].n++;
  }
  const centroids = centSums.map(s => ({
    x: s.n > 0 ? s.x / s.n : 0,
    y: s.n > 0 ? s.y / s.n : 0,
  }));

  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };

  const rolling: RollingPoint[] = points.map((pt, i) => {
    const win    = points.slice(Math.max(0, i - ROLLING_W + 1), i + 1);
    const counts = new Array<number>(k).fill(0);
    for (const p of win) counts[p.cluster]++;
    return { date: pt.date, proportions: counts.map(c => c / win.length) };
  });

  // Per-cluster raw means for tooltip feature lines
  const globalMeans = new Array<number>(N_FEATURES).fill(0);
  const globalVars  = new Array<number>(N_FEATURES).fill(0);
  for (const row of matrix) for (let j = 0; j < N_FEATURES; j++) globalMeans[j] += row[j] / matrix.length;
  for (const row of matrix) for (let j = 0; j < N_FEATURES; j++) globalVars[j]  += (row[j] - globalMeans[j]) ** 2 / matrix.length;
  const globalStds = globalVars.map(v => Math.sqrt(v) || 1);

  const rawSums  = Array.from({ length: k }, () => new Array<number>(N_FEATURES).fill(0));
  const rawCounts = new Array<number>(k).fill(0);
  for (let i = 0; i < matrix.length; i++) {
    rawCounts[labels[i]]++;
    for (let j = 0; j < N_FEATURES; j++) rawSums[labels[i]][j] += matrix[i][j];
  }

  const clusterFeatures: ClusterFeatureLine[][] = Array.from({ length: k }, (_, c) => {
    const cnt   = rawCounts[c] || 1;
    const means = rawSums[c].map(s => s / cnt);
    return means
      .map((v, j) => ({ j, v, z: (v - globalMeans[j]) / globalStds[j] }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 5)
      .map(({ j, v, z }) => ({
        name:  FEATURE_META[j]?.name  ?? `FEAT ${j}`,
        value: FEATURE_META[j]?.fmt(v) ?? v.toFixed(2),
        dir:   (z > 0.5 ? "HIGH" : z < -0.5 ? "LOW" : "NORMAL") as ClusterFeatureLine["dir"],
      }));
  });

  return { points, centroids, clusterLabels, clusterColors, clusterFeatures, bounds, rolling };
}

export function buildStateInsights(result: StateSpaceResult): string[] {
  const { points, clusterLabels } = result;
  if (points.length === 0) return [];

  const last         = points[points.length - 1];
  const currentLabel = clusterLabels[last.cluster];

  let streak = 1;
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].cluster === last.cluster) streak++;
    else break;
  }

  const labelCounts: Record<string, number> = {};
  for (const p of points) {
    const l = clusterLabels[p.cluster];
    labelCounts[l] = (labelCounts[l] ?? 0) + 1;
  }
  const [dominantLabel, dominantCount] = Object.entries(labelCounts)
    .sort((a, b) => b[1] - a[1])[0];
  const dominantPct = Math.round((dominantCount / points.length) * 100);

  const lines: string[] = [];
  lines.push(`STATE: ${currentLabel} · ${streak}D STREAK`);
  lines.push(`DOMINANT: ${dominantLabel} · ${dominantPct}% OF DAYS`);

  if (points.length >= 14) {
    const focusRatio = (pts: StatePoint[]) =>
      pts.filter(p =>
        clusterLabels[p.cluster] === "DEEP FOCUS" ||
        clusterLabels[p.cluster] === "MAINTENANCE",
      ).length / pts.length;
    const delta = focusRatio(points.slice(-7)) - focusRatio(points.slice(-14, -7));
    if      (delta >  0.2) lines.push("TREND: MOMENTUM RISING ↑");
    else if (delta < -0.2) lines.push("TREND: MOMENTUM FALLING ↓");
    else                   lines.push("TREND: STABLE —");
  }

  return lines;
}
