import { getEntries } from "../../../SleepTrackerPlugin/lib/sleepDb";
import { loadArcs, loadIrfTaskDataWithArc } from "../../../PlannerPlugin/lib/plannerDb";
import { loadAllDoneSessionNodeMinutes } from "../../../PlannerPlugin/lib/onTheClockDb";

export const ROLLING_WINDOW = 10;
export const CLUSTER_COLORS = ["#00c4a7", "#f87171", "#facc15", "#a78bfa", "#38bdf8", "#fb923c", "#4ade80"] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayRecord {
  date:    string;
  sleepH:  number;
  cpsRate: number;
  cluster: number;
  tsneX:   number;  // normalised 0–1
  tsneY:   number;
}

export interface ClusterInfo {
  id:      number;
  color:   string;
  label:   string;
  details: string[];
  size:    number;
}

export interface RollingPoint {
  date:        string;
  proportions: number[];  // length K, sums to 1
}

export interface ClusterResult {
  k:           number;
  days:        DayRecord[];
  clusters:    ClusterInfo[];
  rolling:     RollingPoint[];
  recurrence:  number[][];   // N×N similarity matrix, 0–1
  recentTrend: string[];
  arcNames:    string[];     // ordered arc names matching feature vector indices 8..8+A-1
}

// ─── Seeded PRNG (LCG) ────────────────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}

// ─── Normalisation ────────────────────────────────────────────────────────────

interface NormResult { Z: number[][]; means: number[]; stds: number[] }

function zNorm(X: number[][]): NormResult {
  const n = X.length, D = X[0].length;
  const means = Array(D).fill(0) as number[];
  const vars  = Array(D).fill(0) as number[];
  for (const x of X) for (let d = 0; d < D; d++) means[d] += x[d] / n;
  for (const x of X) for (let d = 0; d < D; d++) vars[d] += (x[d] - means[d]) ** 2 / n;
  const stds = vars.map(v => Math.sqrt(v) || 1);
  return { Z: X.map(x => x.map((v, d) => (v - means[d]) / stds[d])), means, stds };
}

// ─── k-means ─────────────────────────────────────────────────────────────────

function d2(a: number[], b: number[]): number {
  let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s;
}

function kmeansOnce(
  X: number[][], k: number, rng: () => number,
): { labels: number[]; inertia: number } {
  const n = X.length;
  // k-means++ initialisation
  const ci = [Math.floor(rng() * n)];
  while (ci.length < k) {
    const dists = X.map(x => Math.min(...ci.map(c => d2(x, X[c]))));
    const total = dists.reduce((s, v) => s + v, 0);
    let r = rng() * total;
    for (let i = 0; i < n; i++) { r -= dists[i]; if (r <= 0) { ci.push(i); break; } }
    if (ci.length < k) ci.push(Math.floor(rng() * n));
  }

  const D = X[0].length;
  let centroids = ci.map(i => [...X[i]]);
  let labels    = new Array<number>(n).fill(0);

  for (let iter = 0; iter < 100; iter++) {
    const nl = X.map(x => {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) { const dd = d2(x, centroids[c]); if (dd < bestD) { bestD = dd; best = c; } }
      return best;
    });
    if (nl.every((l, i) => l === labels[i])) break;
    labels = nl;
    const sums  = Array.from({ length: k }, () => Array(D).fill(0) as number[]);
    const cnts  = Array(k).fill(0) as number[];
    for (let i = 0; i < n; i++) {
      cnts[labels[i]]++;
      for (let d = 0; d < D; d++) sums[labels[i]][d] += X[i][d];
    }
    centroids = sums.map((s, c) => cnts[c] > 0 ? s.map(v => v / cnts[c]) : centroids[c]);
  }

  const inertia = X.reduce((s, x, i) => s + d2(x, centroids[labels[i]]), 0);
  return { labels, inertia };
}

function kmeans(X: number[][], k: number): number[] {
  const rng = makeRng(42);
  let best: { labels: number[]; inertia: number } | null = null;
  for (let r = 0; r < 5; r++) {
    const res = kmeansOnce(X, k, rng);
    if (!best || res.inertia < best.inertia) best = res;
  }
  return best!.labels;
}

// ─── UMAP (seeded SGD) ────────────────────────────────────────────────────────
// Curve params precomputed for min_dist = 0.1
const UMAP_A = 1.5769, UMAP_B = 0.8951;

function umap(X: number[][], nNeighbors = 15, epochs = 500): [number, number][] {
  const n   = X.length;
  const rng = makeRng(42);

  // k-NN (exact O(n²), fine for n ≤ 200)
  const knnDists: number[][] = [];
  const knnIdxs:  number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = X.map((xj, j) => ({ j, d: j === i ? Infinity : Math.sqrt(d2(X[i], xj)) }));
    row.sort((a, b) => a.d - b.d);
    knnDists.push(row.slice(0, nNeighbors).map(r => r.d));
    knnIdxs.push(row.slice(0, nNeighbors).map(r => r.j));
  }

  // Binary search for per-point bandwidth sigma_i
  const rhos   = knnDists.map(d => d[0]);
  const sigmas = Array(n).fill(1) as number[];
  const target = Math.log2(nNeighbors);
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
  const W: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < nNeighbors; k++) {
      const j   = knnIdxs[i][k];
      const wij = Math.exp(-Math.max(0, knnDists[i][k] - rhos[i]) / sigmas[i]);
      const wji = W[j].get(i) ?? 0;
      const ws  = wij + wji - wij * wji;
      W[i].set(j, ws); W[j].set(i, ws);
    }
  }
  const edges: { i: number; j: number; w: number }[] = [];
  for (let i = 0; i < n; i++)
    for (const [j, w] of W[i]) if (j > i) edges.push({ i, j, w });

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
        const k = Math.floor(rng() * n);
        if (k === i) continue;
        dx = Y[i][0] - Y[k][0]; dy = Y[i][1] - Y[k][1];
        const dv2 = dx * dx + dy * dy + 0.001;
        const fR  = Math.max(0, Math.min(4, 2 * UMAP_B / ((0.001 + dv2) * (1 + UMAP_A * Math.pow(dv2, UMAP_B)))));
        Y[i][0] += lr * fR * dx; Y[i][1] += lr * fR * dy;
      }
    }
  }
  return Y;
}

// ─── Silhouette-based K selection ────────────────────────────────────────────

function sqDist(a: number[], b: number[]): number {
  let s = 0; for (let d = 0; d < a.length; d++) s += (a[d] - b[d]) ** 2; return s;
}

function silhouette(Z: number[][], labels: number[], k: number): number {
  const N = Z.length;
  let total = 0;
  for (let i = 0; i < N; i++) {
    const ci = labels[i];
    let aSum = 0, aCount = 0;
    const bSums = new Float64Array(k), bCounts = new Float64Array(k);
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const d = Math.sqrt(sqDist(Z[i], Z[j]));
      if (labels[j] === ci) { aSum += d; aCount++; }
      else { bSums[labels[j]] += d; bCounts[labels[j]]++; }
    }
    const a = aCount > 0 ? aSum / aCount : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c !== ci && bCounts[c] > 0) b = Math.min(b, bSums[c] / bCounts[c]);
    }
    total += (b - a) / Math.max(a, b === Infinity ? 0 : b);
  }
  return total / N;
}

function pickBestK(Z: number[][]): { k: number; labels: number[] } {
  let bestK = 4, bestLabels = kmeans(Z, 4), bestSil = silhouette(Z, bestLabels, 4);
  for (const k of [3, 5] as const) {
    const labels = kmeans(Z, k);
    const sil    = silhouette(Z, labels, k);
    if (sil > bestSil) { bestK = k; bestLabels = labels; bestSil = sil; }
  }
  return { k: bestK, labels: bestLabels };
}

// ─── Cluster labelling ────────────────────────────────────────────────────────

const BASE_LABEL_FEATS = [0, 1, 2, 3, 4] as const;
const ARC_FEAT_OFFSET  = 8; // arc features start at index 8

function formatHour(h: number): string {
  const hh   = Math.floor(h) % 24;
  const mm   = Math.floor((h - Math.floor(h)) * 60);
  const ampm = hh < 12 ? "AM" : "PM";
  const h12  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

function shortDesc(feat: number, z: number, arcNames: string[]): string {
  const pos = z > 0;
  switch (feat) {
    case 0:  return pos ? "LONG SLEEP"   : "SHORT SLEEP";
    case 1:  return pos ? "LATE BEDTIME" : "EARLY BEDTIME";
    case 2:  return pos ? "HIGH OUTPUT"  : "LOW OUTPUT";
    case 3:  return pos ? "MANY TASKS"   : "FEW TASKS";
    case 4:  return pos ? "HEAVY LOAD"   : "LIGHT LOAD";
    default: {
      const arcName = arcNames[feat - ARC_FEAT_OFFSET] ?? "ARC";
      return pos ? `HEAVY ${arcName}` : `LIGHT ${arcName}`;
    }
  }
}

function detailLine(feat: number, z: number, v: number, arcNames: string[]): string | null {
  const pos = z > 0;
  switch (feat) {
    case 0:  return `SLEEP · ${pos ? "LONG" : "SHORT"} · ${v.toFixed(1)}H AVG`;
    case 1:  return `BEDTIME · ${pos ? "LATE" : "EARLY"} · ${formatHour(v)}`;
    case 2:  return `OUTPUT · ${pos ? "HIGH" : "LOW"}`;
    case 3:  return `TASKS · ${pos ? "MANY" : "FEW"} · ${Math.round(v)}/DAY`;
    case 4:  return `WORKLOAD · ${pos ? "HEAVY" : "LIGHT"} · ${Math.round(v * 60)}MIN/DAY`;
    default: {
      const arcName = arcNames[feat - ARC_FEAT_OFFSET] ?? "ARC";
      return `${arcName} · ${pos ? "HEAVY" : "LIGHT"} · ${Math.round(v)} TASKS/DAY`;
    }
  }
}

function buildClusterLabel(
  idxs: number[], rawX: number[][], means: number[], stds: number[],
  labelFeats: number[], arcNames: string[],
): { label: string; details: string[] } {
  if (idxs.length === 0) return { label: "SPARSE", details: ["NO DAYS"] };
  const D = rawX[0].length;
  const c = Array(D).fill(0) as number[];
  for (const i of idxs) for (let d = 0; d < D; d++) c[d] += rawX[i][d] / idxs.length;

  const zDevs  = labelFeats.map(d => ({ d, z: (c[d] - means[d]) / stds[d], v: c[d] }));
  const ranked = [...zDevs].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  const label   = ranked.slice(0, 2).map(({ d, z }) => shortDesc(d, z, arcNames)).join(" · ");
  const details = ranked
    .slice(0, 3)
    .map(({ d, z, v }) => detailLine(d, z, v, arcNames))
    .filter((s): s is string => s !== null);

  return { label, details };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function computeClusters(forcedK?: number): Promise<ClusterResult | null> {
  const [sleepEntries, tasks, arcs, sessionMins] = await Promise.all([
    getEntries(180),
    loadIrfTaskDataWithArc(180),
    loadArcs(),
    loadAllDoneSessionNodeMinutes(),
  ]);

  const sessionMinMap = new Map<string, number>(sessionMins.map(s => [s.node_id, s.total_minutes]));
  const avgSessionMinutes = sessionMins.length > 0
    ? sessionMins.reduce((s, v) => s + v.total_minutes, 0) / sessionMins.length
    : 30;
  if (sleepEntries.length < 20) return null;

  // Build a stable arc index map (ordered by arc creation, matching loadArcs order)
  const arcIdToIdx = new Map(arcs.map((a, i) => [a.id, i]));
  const arcNames   = arcs.map(a => a.name.toUpperCase());

  const sorted = [...sleepEntries].sort(
    (a, b) => new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime(),
  );

  const globalMeanSleepHolder = { v: 0 };

  const days = sorted.map((e, i) => {
    const sleepStartMs = new Date(e.sleep_start).getTime();
    const wakeMs       = new Date(e.wake_time).getTime();
    const sleepMs      = i < sorted.length - 1
      ? new Date(sorted[i + 1].sleep_start).getTime() : Date.now();
    const wakeDate = new Date(wakeMs);
    return {
      date:          wakeDate.toISOString().slice(0, 10),
      wakeMs, sleepMs,
      wakingHours:   Math.max(0.5, Math.min(20, (sleepMs - wakeMs) / 3_600_000)),
      sleepH:        Math.max(0, (wakeMs - sleepStartMs) / 3_600_000),
      bedtimeH:      new Date(sleepStartMs).getHours() + new Date(sleepStartMs).getMinutes() / 60,
      wakeH:         wakeDate.getHours() + wakeDate.getMinutes() / 60,
      dayOfWeek:     wakeDate.getDay(),
      cpsRate:       0,
      taskCount:     0,
      totalDurationH: 0,
      medianHour:    0 as number,
    };
  });

  const globalMeanSleep = days.reduce((s, d) => s + d.sleepH, 0) / days.length;
  globalMeanSleepHolder.v = globalMeanSleep;

  const A = arcs.length;
  const taskHours:     number[][] = days.map(() => []);
  const arcTaskCounts: number[][] = days.map(() => Array(A).fill(0));

  for (const task of tasks) {
    if (!task.actual_completed_at) continue;
    const ms  = new Date(task.actual_completed_at).getTime();
    const idx = days.findIndex(d => ms >= d.wakeMs && ms < d.sleepMs);
    if (idx < 0) continue;
    days[idx].taskCount++;
    days[idx].totalDurationH += (sessionMinMap.get(task.id) ?? avgSessionMinutes) / 60;
    taskHours[idx].push((ms - days[idx].wakeMs) / 3_600_000);
    const arcIdx = task.arc_id !== null ? arcIdToIdx.get(task.arc_id) : undefined;
    if (arcIdx !== undefined) arcTaskCounts[idx][arcIdx]++;
  }

  for (let i = 0; i < days.length; i++) {
    const d  = days[i];
    d.cpsRate = Math.sqrt(d.taskCount * d.totalDurationH * 60) / d.wakingHours;
    const th  = [...taskHours[i]].sort((a, b) => a - b);
    d.medianHour = th.length > 0
      ? th.length % 2 === 0 ? (th[th.length / 2 - 1] + th[th.length / 2]) / 2 : th[Math.floor(th.length / 2)]
      : d.wakingHours / 2;
  }

  const rolling3 = days.map((_, i) => {
    const w = days.slice(Math.max(0, i - 2), i + 1);
    return w.reduce((s, d) => s + d.sleepH, 0) / w.length;
  });

  // (8 + A)-dimensional feature vector: 2 sleep, 3 work, 2 cyclical, 1 rolling, A arc counts
  const rawX: number[][] = days.map((d, i) => [
    d.sleepH,                                   // 0
    d.bedtimeH,                                 // 1
    d.cpsRate,                                  // 2
    d.taskCount,                                // 3
    d.totalDurationH,                           // 4
    Math.sin(2 * Math.PI * d.dayOfWeek / 7),   // 5
    Math.cos(2 * Math.PI * d.dayOfWeek / 7),   // 6
    rolling3[i],                                // 7
    ...arcTaskCounts[i],                        // 8 … 8+A-1
  ]);

  // Label features: base 5 + one per arc
  const labelFeats: number[] = [
    ...BASE_LABEL_FEATS,
    ...Array.from({ length: A }, (_, a) => ARC_FEAT_OFFSET + a),
  ];

  const { Z, means, stds } = zNorm(rawX);

  // Group-weighted feature scaling: each semantic group contributes a fixed total
  // weight to Euclidean distance regardless of how many dimensions it has.
  // Without this, A arc features overwhelm the 2 sleep features.
  const GROUP_W = { sleep: 2.0, work: 2.0, cyclical: 0.5, rolling: 0.5, arcs: 1.0 };
  const scales = Z[0].map((_, d): number => {
    if (d <= 1) return Math.sqrt(GROUP_W.sleep    / 2);
    if (d <= 4) return Math.sqrt(GROUP_W.work     / 3);
    if (d <= 6) return Math.sqrt(GROUP_W.cyclical / 2);
    if (d === 7) return Math.sqrt(GROUP_W.rolling);
    return A > 0 ? Math.sqrt(GROUP_W.arcs / A) : 1;
  });
  const Zw = Z.map(row => row.map((v, d) => v * scales[d]));

  const { k: bestK, labels } = forcedK
    ? { k: forcedK, labels: kmeans(Zw, forcedK) }
    : pickBestK(Zw);
  const Y2D = umap(Zw);

  const allTx = Y2D.map(y => y[0]), allTy = Y2D.map(y => y[1]);
  const minTx = Math.min(...allTx), maxTx = Math.max(...allTx);
  const minTy = Math.min(...allTy), maxTy = Math.max(...allTy);
  const spTx  = maxTx - minTx || 1, spTy = maxTy - minTy || 1;

  const dayRecords: DayRecord[] = days.map((d, i) => ({
    date:    d.date,
    sleepH:  d.sleepH,
    cpsRate: d.cpsRate,
    cluster: labels[i],
    tsneX:   (Y2D[i][0] - minTx) / spTx,
    tsneY:   (Y2D[i][1] - minTy) / spTy,
  }));

  const clusterIdxs = Array.from({ length: bestK }, (_, k) =>
    dayRecords.map((_, i) => i).filter(i => labels[i] === k),
  );
  const clusters: ClusterInfo[] = Array.from({ length: bestK }, (_, k) => {
    const { label, details } = buildClusterLabel(clusterIdxs[k], rawX, means, stds, labelFeats, arcNames);
    return { id: k, color: CLUSTER_COLORS[k], label, details, size: clusterIdxs[k].length };
  });

  // Rolling ROLLING_WINDOW-day cluster proportions
  const rolling: RollingPoint[] = dayRecords.map((day, i) => {
    const win    = dayRecords.slice(Math.max(0, i - ROLLING_WINDOW + 1), i + 1);
    const counts = Array(bestK).fill(0) as number[];
    for (const dd of win) counts[dd.cluster]++;
    return { date: day.date, proportions: counts.map(c => c / win.length) };
  });

  // Trend: compare recent vs previous rolling window
  const recentW   = rolling.slice(-ROLLING_WINDOW);
  const previousW = rolling.slice(-ROLLING_WINDOW * 2, -ROLLING_WINDOW);
  const recentTrend: string[] = [];

  if (previousW.length >= 7) {
    const rMeans = Array.from({ length: bestK }, (_, k) =>
      recentW.reduce((s, r) => s + r.proportions[k], 0) / recentW.length,
    );
    const pMeans = Array.from({ length: bestK }, (_, k) =>
      previousW.reduce((s, r) => s + r.proportions[k], 0) / previousW.length,
    );
    const deltas = rMeans.map((r, k) => ({ k, delta: r - pMeans[k] }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const { k, delta } of deltas.slice(0, 2)) {
      if (Math.abs(delta) < 0.04) continue;
      const pct = Math.round(Math.abs(delta) * 100);
      recentTrend.push(`${delta > 0 ? "↑" : "↓"} ${clusters[k].label}  ${pct}% LAST ${ROLLING_WINDOW}D`);
    }
  }
  if (recentTrend.length === 0) recentTrend.push(`STABLE PATTERN OVER LAST ${ROLLING_WINDOW} DAYS`);

  // N×N recurrence similarity matrix — uses Zw so weighting is consistent with clustering
  const N = Zw.length;
  const dists: number[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let d = 0;
      for (let f = 0; f < Zw[0].length; f++) d += (Zw[i][f] - Zw[j][f]) ** 2;
      dists.push(Math.sqrt(d));
    }
  }
  const meanDist = dists.length ? dists.reduce((s, d) => s + d, 0) / dists.length : 1;
  const scale    = meanDist * 0.7 || 1;

  const recurrence: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => {
      if (i === j) return 1;
      let d = 0;
      for (let f = 0; f < Zw[0].length; f++) d += (Zw[i][f] - Zw[j][f]) ** 2;
      return Math.exp(-Math.sqrt(d) / scale);
    }),
  );

  return { k: bestK, days: dayRecords, clusters, rolling, recurrence, recentTrend, arcNames };
}
