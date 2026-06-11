import type { SleepEntry } from "../../../SleepTrackerPlugin/lib/sleepDb";

export const STATE_COLORS = ["#60a5fa", "#f0b030", "#a78bfa", "#4ade80"] as const;

export interface HmmNight {
  onsetX: number;
  durationH: number;
  date: string;
}

export interface HmmResult {
  k: number;
  nights: HmmNight[];
  states: number[];
  stateColors: string[];
  stateLabels: string[];
  stateDescriptors: string[];
  transitionMatrix: number[][];
  logLikelihood: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COV_REG  = 0.08;
const MAX_ITER = 80;
const RESTARTS = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toOnsetX(sleepStart: string): number {
  const d = new Date(sleepStart);
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 20 ? h - 20 : h + 4;
}

function logSumExp(a: number[]): number {
  const m = Math.max(...a);
  if (!isFinite(m)) return -Infinity;
  return m + Math.log(a.reduce((s, v) => s + Math.exp(v - m), 0));
}

type Obs  = [number, number];
type Cov2 = [[number, number], [number, number]];

function bivGaussLog(o: Obs, mu: number[], cov: Cov2): number {
  const dx = o[0] - mu[0], dy = o[1] - mu[1];
  const a = cov[0][0], b = cov[0][1], d = cov[1][1];
  const det = a * d - b * b;
  if (det < 1e-12) return -1e9;
  const maha = (d * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
  return -Math.log(2 * Math.PI) - 0.5 * Math.log(det) - 0.5 * maha;
}

function logEmissions(k: number, o: Obs, mu: number[][], cov: Cov2[]): number[] {
  return Array.from({ length: k }, (_, ki) => bivGaussLog(o, mu[ki], cov[ki]));
}

// ─── Forward / Backward (log-domain) ─────────────────────────────────────────

function forwardLog(k: number, obs: Obs[], pi: number[], A: number[][], mu: number[][], cov: Cov2[]): number[][] {
  const T = obs.length;
  const la: number[][] = Array.from({ length: T }, () => new Array(k).fill(-Infinity));
  const lB0 = logEmissions(k, obs[0], mu, cov);
  for (let ki = 0; ki < k; ki++) la[0][ki] = Math.log(Math.max(pi[ki], 1e-300)) + lB0[ki];
  for (let t = 1; t < T; t++) {
    const lBt = logEmissions(k, obs[t], mu, cov);
    for (let j = 0; j < k; j++) {
      la[t][j] =
        logSumExp(Array.from({ length: k }, (_, i) => la[t - 1][i] + Math.log(Math.max(A[i][j], 1e-300)))) +
        lBt[j];
    }
  }
  return la;
}

function backwardLog(k: number, obs: Obs[], A: number[][], mu: number[][], cov: Cov2[]): number[][] {
  const T = obs.length;
  const lb: number[][] = Array.from({ length: T }, () => new Array(k).fill(0));
  for (let t = T - 2; t >= 0; t--) {
    const lBt1 = logEmissions(k, obs[t + 1], mu, cov);
    for (let i = 0; i < k; i++) {
      lb[t][i] = logSumExp(
        Array.from({ length: k }, (_, j) =>
          Math.log(Math.max(A[i][j], 1e-300)) + lBt1[j] + lb[t + 1][j],
        ),
      );
    }
  }
  return lb;
}

// ─── Baum-Welch EM ────────────────────────────────────────────────────────────

interface BwResult { pi: number[]; A: number[][]; mu: number[][]; cov: Cov2[]; logL: number }

function baumWelch(k: number, obs: Obs[], initMu: number[][]): BwResult | null {
  const T = obs.length;

  let pi  = Array.from({ length: k }, () => 1 / k);
  let A   = Array.from({ length: k }, () => Array.from({ length: k }, () => 1 / k));
  let mu  = initMu.map(m => [...m]);

  const varX = obs.reduce((s, o) => s + o[0] ** 2, 0) / T - (obs.reduce((s, o) => s + o[0], 0) / T) ** 2;
  const varY = obs.reduce((s, o) => s + o[1] ** 2, 0) / T - (obs.reduce((s, o) => s + o[1], 0) / T) ** 2;
  let cov: Cov2[] = Array.from({ length: k }, () =>
    [[Math.max(varX * 0.5, COV_REG), 0], [0, Math.max(varY * 0.5, COV_REG)]],
  );

  let prevLogL = -Infinity;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const la   = forwardLog(k, obs, pi, A, mu, cov);
    const lb   = backwardLog(k, obs, A, mu, cov);
    const logL = logSumExp(la[T - 1]);
    if (!isFinite(logL)) return null;

    // γ[t][ki]
    const gamma = la.map((lat, t) => {
      const norm = logSumExp(Array.from({ length: k }, (_, ki) => lat[ki] + lb[t][ki]));
      return Array.from({ length: k }, (_, ki) => Math.exp(lat[ki] + lb[t][ki] - norm));
    });

    // ξ[t][i][j]
    const xi: number[][][] = [];
    for (let t = 0; t < T - 1; t++) {
      const lBt1 = logEmissions(k, obs[t + 1], mu, cov);
      const flat: number[] = [];
      for (let i = 0; i < k; i++)
        for (let j = 0; j < k; j++)
          flat.push(la[t][i] + Math.log(Math.max(A[i][j], 1e-300)) + lBt1[j] + lb[t + 1][j]);
      const norm = logSumExp(flat);
      const rows: number[][] = [];
      let idx = 0;
      for (let i = 0; i < k; i++) {
        rows.push(flat.slice(idx, idx + k).map(v => Math.exp(v - norm)));
        idx += k;
      }
      xi.push(rows);
    }

    // M-step π
    const piRaw = gamma[0].map(g => Math.max(g, 1e-10));
    const piSum = piRaw.reduce((s, v) => s + v, 0);
    pi = piRaw.map(p => p / piSum);

    // M-step A
    A = Array.from({ length: k }, (_, i) => {
      const denom = xi.reduce((s, xit) => s + xit[i].reduce((ss, v) => ss + v, 0), 0);
      const row   = Array.from({ length: k }, (_, j) =>
        Math.max(xi.reduce((s, xit) => s + xit[i][j], 0) / Math.max(denom, 1e-10), 1e-10),
      );
      const rs = row.reduce((s, v) => s + v, 0);
      return row.map(v => v / rs);
    });

    // M-step μ, Σ
    const newMu: number[][] = [];
    const newCov: Cov2[]   = [];
    for (let ki = 0; ki < k; ki++) {
      const wSum = Math.max(gamma.reduce((s, g) => s + g[ki], 0), 1e-10);
      let mx = 0, my = 0;
      for (let t = 0; t < T; t++) { mx += gamma[t][ki] * obs[t][0]; my += gamma[t][ki] * obs[t][1]; }
      mx /= wSum; my /= wSum;
      newMu.push([mx, my]);
      let cxx = COV_REG, cxy = 0, cyy = COV_REG;
      for (let t = 0; t < T; t++) {
        const dx = obs[t][0] - mx, dy = obs[t][1] - my;
        cxx += gamma[t][ki] * dx * dx;
        cxy += gamma[t][ki] * dx * dy;
        cyy += gamma[t][ki] * dy * dy;
      }
      newCov.push([[cxx / wSum, cxy / wSum], [cxy / wSum, cyy / wSum]]);
    }
    mu  = newMu;
    cov = newCov;

    if (Math.abs(logL - prevLogL) < 1e-3) return { pi, A, mu, cov, logL };
    prevLogL = logL;
  }

  return { pi, A, mu, cov, logL: prevLogL };
}

// ─── Viterbi ──────────────────────────────────────────────────────────────────

function viterbi(k: number, obs: Obs[], pi: number[], A: number[][], mu: number[][], cov: Cov2[]): number[] {
  const T = obs.length;
  const delta: number[][] = Array.from({ length: T }, () => new Array(k).fill(-Infinity));
  const psi: number[][]   = Array.from({ length: T }, () => new Array(k).fill(0));

  const lB0 = logEmissions(k, obs[0], mu, cov);
  for (let ki = 0; ki < k; ki++) delta[0][ki] = Math.log(Math.max(pi[ki], 1e-300)) + lB0[ki];

  for (let t = 1; t < T; t++) {
    const lBt = logEmissions(k, obs[t], mu, cov);
    for (let j = 0; j < k; j++) {
      let best = -Infinity, bestI = 0;
      for (let i = 0; i < k; i++) {
        const v = delta[t - 1][i] + Math.log(Math.max(A[i][j], 1e-300));
        if (v > best) { best = v; bestI = i; }
      }
      delta[t][j] = best + lBt[j];
      psi[t][j]   = bestI;
    }
  }

  const states = new Array<number>(T).fill(0);
  states[T - 1] = delta[T - 1].indexOf(Math.max(...delta[T - 1]));
  for (let t = T - 2; t >= 0; t--) states[t] = psi[t + 1][states[t + 1]];
  return states;
}

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dataHash(obs: Obs[]): number {
  return obs.reduce(
    (h, o) => ((h * 31 + Math.round(o[0] * 1000)) * 31 + Math.round(o[1] * 100)) | 0,
    0x811c9dc5,
  );
}

// ─── K-means++ init ───────────────────────────────────────────────────────────

function kMeansInit(obs: Obs[], k: number, rng: () => number): number[][] {
  const means: number[][] = [];
  const first = obs[Math.floor(rng() * obs.length)];
  means.push([first[0], first[1]]);
  for (let ki = 1; ki < k; ki++) {
    const dists = obs.map(o =>
      means.reduce((m, mu) => Math.min(m, (o[0] - mu[0]) ** 2 + (o[1] - mu[1]) ** 2), Infinity),
    );
    const total = dists.reduce((s, v) => s + v, 0);
    let r = rng() * total, added = false;
    for (let i = 0; i < obs.length; i++) {
      r -= dists[i];
      if (r <= 0) { means.push([obs[i][0], obs[i][1]]); added = true; break; }
    }
    if (!added) means.push([obs[obs.length - 1][0], obs[obs.length - 1][1]]);
  }
  return means;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeHmm(entries: SleepEntry[], k: number): HmmResult | null {
  if (entries.length < 15) return null;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime(),
  );

  const nights: HmmNight[] = sorted.map(e => ({
    onsetX:    toOnsetX(e.sleep_start),
    durationH: (new Date(e.wake_time).getTime() - new Date(e.sleep_start).getTime()) / 3_600_000,
    date:      e.date,
  }));

  const obs: Obs[] = nights.map(n => [n.onsetX, Math.max(0.5, Math.min(14, n.durationH))]);

  // seed includes k so different K values don't share the same initialization sequence
  const rng = mulberry32(dataHash(obs) ^ (k * 0x9e3779b9));

  let best: BwResult | null = null;
  let bestStates: number[]  = [];

  for (let r = 0; r < RESTARTS; r++) {
    const result = baumWelch(k, obs, kMeansInit(obs, k, rng));
    if (result && (!best || result.logL > best.logL)) {
      best       = result;
      bestStates = viterbi(k, obs, result.pi, result.A, result.mu, result.cov);
    }
  }

  if (!best) return null;

  const sortOrder = Array.from({ length: k }, (_, ki) => ki).sort(
    (a, b) => best!.mu[a][0] - best!.mu[b][0],
  );
  const stateMap = new Array<number>(k).fill(0);
  sortOrder.forEach((oldK, newK) => { stateMap[oldK] = newK; });
  const remapped = bestStates.map(s => stateMap[s]);

  const A_remap: number[][] = Array.from({ length: k }, (_, ni) =>
    Array.from({ length: k }, (_, nj) => best!.A[sortOrder[ni]][sortOrder[nj]]),
  );

  const stateLabels = sortOrder.map((oldK, newK) => {
    const mu     = best!.mu[oldK];
    const onsetH = (mu[0] + 20) % 24;
    const h12    = Math.floor(onsetH) % 12 || 12;
    const min    = Math.round((onsetH % 1) * 60);
    const suf    = Math.floor(onsetH) >= 12 ? "PM" : "AM";
    const stateNights = nights.filter((_, t) => remapped[t] === newK);
    const avgDur = stateNights.reduce((s, n) => s + n.durationH, 0) / Math.max(1, stateNights.length);
    return `${h12}${min > 0 ? `:${String(min).padStart(2, "0")}` : ""}${suf} · ${avgDur.toFixed(1)}H`;
  });

  // ─── State descriptors ────────────────────────────────────────────────────
  const ONSET_TOKS: Record<number, string[]> = {
    2: ["early", "late"],
    3: ["early", "mid", "late"],
    4: ["early", "mid", "mid", "late"],
  };
  const onsetToks = ONSET_TOKS[k] ?? ["early", ...Array(k - 2).fill("mid"), "late"];

  const stateStats = Array.from({ length: k }, (_, newK) => {
    const sn     = nights.filter((_, t) => remapped[t] === newK);
    const onsets = sn.map(n => n.onsetX);
    const durs   = sn.map(n => n.durationH);
    const avgDur = durs.reduce((s, v) => s + v, 0) / Math.max(1, durs.length);
    const muOns  = onsets.reduce((s, v) => s + v, 0) / Math.max(1, onsets.length);
    const onsetStd = onsets.length > 1
      ? Math.sqrt(onsets.reduce((s, v) => s + (v - muOns) ** 2, 0) / onsets.length)
      : 0;
    return { avgDur, onsetStd };
  });

  const durRanks  = [...stateStats.map((s, ki) => ({ ki, dur: s.avgDur }))].sort((a, b) => a.dur - b.dur);
  const durRange  = durRanks[k - 1].dur - durRanks[0].dur;
  const durToks   = new Array<string>(k).fill("");
  if (durRange >= 0.75) {
    durToks[durRanks[0].ki]     = "short";
    durToks[durRanks[k - 1].ki] = "long";
  }

  const stateDescriptors = stateStats.map((stat, ki) => {
    const parts: string[] = [onsetToks[ki]];
    if (durToks[ki]) parts.push(durToks[ki]);
    if (stat.onsetStd > 1.5)       parts.push("chaotic");
    else if (stat.onsetStd > 0.75) parts.push("variable");
    return parts.join(" · ");
  });

  return {
    k,
    nights,
    states:           remapped,
    stateColors:      Array.from({ length: k }, (_, ki) => STATE_COLORS[ki]),
    stateLabels,
    stateDescriptors,
    transitionMatrix: A_remap,
    logLikelihood:    best.logL,
  };
}

export function buildHmmInsights(r: HmmResult): string[] {
  const T = r.nights.length;
  let transitions = 0;
  for (let t = 1; t < T; t++) if (r.states[t] !== r.states[t - 1]) transitions++;
  const mostCommon = Array.from({ length: r.k }, (_, ki) => ({
    ki,
    count: r.states.filter(s => s === ki).length,
  })).sort((a, b) => b.count - a.count)[0];
  const pct = Math.round((mostCommon.count / T) * 100);
  return [
    `${r.k} SLEEP REGIMES IDENTIFIED`,
    `${transitions} MODE SWITCHES · ${T} NIGHTS`,
    `${r.stateLabels[mostCommon.ki]} · ${pct}% DOMINANT`,
  ];
}
