import { useRef, useEffect, useState } from "react";
import { getEntries } from "../../../SleepTrackerPlugin/lib/sleepDb";
import {
  computePotential,
  buildPotentialInsights,
  evalU,
  fmtOnsetHour,
} from "./sleepPotentialMath";
import type { PotentialResult } from "./sleepPotentialMath";

const VT   = "'VT323', 'HBIOS-SYS', monospace";
const BLUE = "#60a5fa";

function hexAlpha(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
}

// Linear interpolation on any grid array — used for both U and drifts
function evalGrid(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[xs.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] * (1 - t) + ys[hi] * t;
}

// ─── Particle state ───────────────────────────────────────────────────────────

interface Particle { x: number; v: number; settled: boolean }

// Physics constants tuned for visually satisfying ~3-second settle
const FORCE_SCALE = 10;
const DAMPING     = 6;
const DT          = 1 / 60;
const TRAIL_LEN   = 28;

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: PotentialResult,
  progress: number,
  dotsAlpha: number,
  labelAlpha: number,
  particle: Particle,
  trail: number[],
  frame: number,
): void {
  ctx.clearRect(0, 0, W, H);

  const { xs, Us, drifts, kdes, nights, chronotypeX, chronotypeLabel, xMin, xMax } = r;
  const maxU = Math.max(...Us);
  if (maxU === 0) return;

  const PAD_L = 0.07, PAD_R = 0.04, PAD_T = 0.12, PAD_B = 0.2;
  const leftX  = PAD_L * W;
  const rightX = (1 - PAD_R) * W;
  const topY   = PAD_T * H;
  const botY   = (1 - PAD_B) * H;
  const spanX  = rightX - leftX;
  const spanY  = botY - topY;

  const cx = (x: number) => leftX + ((x - xMin) / (xMax - xMin)) * spanX;
  const cy = (u: number) => botY - (u / maxU) * spanY * 0.88;

  const clipRight = leftX + spanX * progress + 6;

  // Floor line
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(leftX, botY);
  ctx.lineTo(rightX, botY);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, clipRight, H);
  ctx.clip();

  // ── KDE probability band ──────────────────────────────────────────────────
  // Rises from the floor; height ∝ density of actual sleep times.
  // White-warm: distinct from the blue potential curve.
  const KDE_H = spanY * 0.38;
  const kdeGrad = ctx.createLinearGradient(0, botY - KDE_H, 0, botY);
  kdeGrad.addColorStop(0,   "rgba(220,220,255,0.18)");
  kdeGrad.addColorStop(0.5, "rgba(200,200,255,0.08)");
  kdeGrad.addColorStop(1,   "rgba(180,180,255,0.0)");

  ctx.beginPath();
  ctx.moveTo(cx(xs[0]), botY);
  for (let i = 0; i < xs.length; i++) {
    ctx.lineTo(cx(xs[i]), botY - kdes[i] * KDE_H);
  }
  ctx.lineTo(cx(xs[xs.length - 1]), botY);
  ctx.closePath();
  ctx.fillStyle = kdeGrad;
  ctx.fill();

  // KDE top edge — subtle bright line
  ctx.beginPath();
  ctx.moveTo(cx(xs[0]), botY - kdes[0] * KDE_H);
  for (let i = 1; i < xs.length; i++) ctx.lineTo(cx(xs[i]), botY - kdes[i] * KDE_H);
  ctx.strokeStyle = "rgba(200,200,255,0.25)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  ctx.stroke();

  // ── Potential fill ────────────────────────────────────────────────────────
  const potGrad = ctx.createLinearGradient(0, topY, 0, botY);
  potGrad.addColorStop(0,   BLUE + hexAlpha(0.22));
  potGrad.addColorStop(0.5, BLUE + hexAlpha(0.08));
  potGrad.addColorStop(1,   BLUE + hexAlpha(0.0));

  ctx.beginPath();
  ctx.moveTo(cx(xs[0]), botY);
  ctx.lineTo(cx(xs[0]), cy(Us[0]));
  for (let i = 1; i < xs.length; i++) ctx.lineTo(cx(xs[i]), cy(Us[i]));
  ctx.lineTo(cx(xs[xs.length - 1]), botY);
  ctx.closePath();
  ctx.fillStyle = potGrad;
  ctx.fill();

  // ── Potential curve — three glow passes ──────────────────────────────────
  // Colour along curve tracks |dU/dx| = |drift|: bright on walls, dim at floor.
  // We approximate by drawing the whole curve in blue, then a second pass
  // that re-strokes segments with opacity scaled to |drift[i]|.
  const maxDrift = Math.max(...drifts.map(Math.abs), 0.01);

  // Base glow passes
  for (const [lw, a] of [[7, 0.07], [3, 0.16]] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(cx(xs[0]), cy(Us[0]));
    for (let i = 1; i < xs.length; i++) ctx.lineTo(cx(xs[i]), cy(Us[i]));
    ctx.strokeStyle = BLUE + hexAlpha(a);
    ctx.lineWidth   = lw;
    ctx.setLineDash([]);
    ctx.stroke();
  }

  // Force-coloured top pass: segment by segment
  for (let i = 0; i < xs.length - 1; i++) {
    const force = Math.abs(drifts[i]) / maxDrift;  // 0=floor, 1=steep wall
    const alpha = 0.35 + force * 0.65;             // dim at well, bright on walls
    ctx.beginPath();
    ctx.moveTo(cx(xs[i]), cy(Us[i]));
    ctx.lineTo(cx(xs[i + 1]), cy(Us[i + 1]));
    ctx.strokeStyle = BLUE + hexAlpha(alpha);
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // ── Night dots ────────────────────────────────────────────────────────────
  if (dotsAlpha > 0) {
    for (let ni = 0; ni < nights.length; ni++) {
      const n      = nights[ni];
      const nx     = cx(n.onsetX);
      if (nx > clipRight) continue;
      const ny     = cy(evalGrid(xs, Us, n.onsetX));
      const age    = ni / Math.max(1, nights.length - 1);
      const isLast = ni === nights.length - 1;
      ctx.globalAlpha = dotsAlpha * (isLast ? 0 : 0.25 + age * 0.55); // hide last (particle takes over)
      ctx.beginPath();
      ctx.arc(nx, ny, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = "#f0b030";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Particle trail ────────────────────────────────────────────────────────
  if (dotsAlpha > 0 && trail.length > 1) {
    for (let ti = 0; ti < trail.length; ti++) {
      const tx    = cx(trail[ti]);
      const tu    = evalGrid(xs, Us, trail[ti]);
      const ty    = cy(tu);
      const frac  = ti / (trail.length - 1);
      ctx.globalAlpha = dotsAlpha * frac * 0.55;
      ctx.beginPath();
      ctx.arc(tx, ty, 1 + frac * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = BLUE;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Particle ──────────────────────────────────────────────────────────────
  if (dotsAlpha > 0) {
    const px  = cx(particle.x);
    const pu  = evalGrid(xs, Us, particle.x);
    const py  = cy(pu);

    // Pulse glow once settled
    const blur = particle.settled
      ? 8 + Math.sin(frame * 0.07) * 6
      : 10;

    ctx.save();
    ctx.shadowColor = BLUE;
    ctx.shadowBlur  = blur;
    ctx.globalAlpha = dotsAlpha;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    // Inner bright core
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = BLUE;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore(); // end clip

  // ── Chronotype dashed line ────────────────────────────────────────────────
  if (labelAlpha > 0) {
    const ctX = cx(chronotypeX);
    ctx.save();
    ctx.globalAlpha = labelAlpha * 0.7;
    ctx.shadowColor = BLUE;
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = BLUE + hexAlpha(0.6);
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(ctX, botY);
    ctx.lineTo(ctX, topY * 0.8);
    ctx.stroke();
    ctx.restore();

    const fs = Math.max(11, Math.round(Math.min(W, H) * 0.044));
    ctx.globalAlpha  = labelAlpha;
    ctx.font         = `${fs}px ${VT}`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle    = BLUE;
    ctx.fillText(chronotypeLabel, ctX, topY * 0.78);
    ctx.globalAlpha  = 1;
  }

  // ── X-axis labels ─────────────────────────────────────────────────────────
  if (labelAlpha > 0) {
    const fs = Math.max(10, Math.round(Math.min(W, H) * 0.036));
    ctx.font         = `${fs}px ${VT}`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.globalAlpha  = labelAlpha * 0.72;
    ctx.fillStyle    = "#ffffff";
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
      ctx.fillText(fmtOnsetHour(x), cx(x), botY + 5);
    }
    ctx.globalAlpha = 1;
  }

  // ── Equation box ─────────────────────────────────────────────────────────
  // Shows the Langevin SDE and the local parabolic approximation with fitted κ.
  if (labelAlpha > 0) {
    const { sigma, kappa } = r;
    const eqFs   = Math.max(9, Math.round(Math.min(W, H) * 0.03));
    const serif  = `italic ${eqFs}px Georgia, 'Times New Roman', serif`;
    const lineH  = eqFs * 1.55;
    const padX   = eqFs * 0.7;
    const padY   = eqFs * 0.5;

    const lines = [
      { font: serif,  text: "dx/dt = −dU/dx + σξ(t)" },
      { font: serif,  text: `U(x) ≈ ½κ(x − x₀)²` },
      { font: serif,  text: `κ = ${kappa.toFixed(2)}h⁻²   σ = ${sigma.toFixed(2)}h` },
    ];

    // Measure widest line
    let maxW = 0;
    for (const l of lines) {
      ctx.font = l.font;
      maxW = Math.max(maxW, ctx.measureText(l.text).width);
    }

    const boxW = maxW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const mg   = eqFs * 0.5;

    // Try four corners; pick first where the curve and all dots clear the box.
    const candidates = [
      { bx: rightX - boxW - mg, by: topY + mg },
      { bx: leftX + mg,          by: topY + mg },
      { bx: rightX - boxW - mg, by: botY - boxH - mg },
      { bx: leftX + mg,          by: botY - boxH - mg },
    ];
    const { bx, by } = candidates.find(({ bx: bx_, by: by_ }) => {
      const curveHit = xs.some((gx, i) => {
        const px = cx(gx), py = cy(Us[i]);
        return px >= bx_ && px <= bx_ + boxW && py >= by_ && py <= by_ + boxH;
      });
      const dotHit = nights.some(n => {
        const px = cx(n.onsetX), py = cy(evalGrid(xs, Us, n.onsetX));
        return px >= bx_ - 6 && px <= bx_ + boxW + 6 && py >= by_ - 6 && py <= by_ + boxH + 6;
      });
      return !curveHit && !dotHit;
    }) ?? candidates[0];

    ctx.globalAlpha = labelAlpha * 0.95;
    ctx.fillStyle   = "#f0b030";
    ctx.fillRect(bx, by, boxW, boxH);

    ctx.textBaseline = "top";
    ctx.textAlign    = "left";
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      ctx.font      = l.font;
      ctx.fillStyle = "#000000";
      ctx.fillText(l.text, bx + padX, by + padY + li * lineH);
    }
    ctx.globalAlpha = 1;
  }

  // ── Rotated y-axis label ──────────────────────────────────────────────────
  if (labelAlpha > 0) {
    const fs = Math.max(10, Math.round(Math.min(W, H) * 0.032));
    ctx.save();
    ctx.globalAlpha  = labelAlpha * 0.55;
    ctx.font         = `${fs}px ${VT}`;
    ctx.fillStyle    = "#ffffff";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.translate(PAD_L * W * 0.38, (topY + botY) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("POTENTIAL", 0, 0);
    ctx.restore();
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onInsights: (lines: string[]) => void }

export default function SleepPotentialLandscape({ onInsights }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<PotentialResult | null>(null);

  // Mutable animation state — not React state (no re-render needed)
  const particleRef = useRef<Particle>({ x: 0, v: 0, settled: false });
  const trailRef    = useRef<number[]>([]);
  const frameRef    = useRef(0);

  useEffect(() => {
    getEntries(90)
      .then(entries => {
        const r = computePotential(entries);
        if (r) {
          setResult(r);
          onInsights(buildPotentialInsights(r));
          // Initialise particle at most-recent night's onset
          const startX = r.nights[r.nights.length - 1]?.onsetX ?? r.chronotypeX;
          particleRef.current = { x: startX, v: 0, settled: false };
          trailRef.current    = [];
          frameRef.current    = 0;
        } else {
          onInsights(["NOT ENOUGH DATA — LOG AT LEAST 15 NIGHTS"]);
        }
      })
      .catch(() => onInsights(["FAILED TO LOAD SLEEP DATA"]));
  }, [onInsights]);

  // HiDPI resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr     = window.devicePixelRatio || 1;
      canvas.width  = el.clientWidth  * dpr;
      canvas.height = el.clientHeight * dpr;
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const REVEAL_FRAMES = 90;
    let animId: number;

    const loop = () => {
      frameRef.current += 1;
      const f        = frameRef.current;
      const progress = Math.min(1, f / REVEAL_FRAMES);
      const dotsAlpha  = Math.max(0, Math.min(1, (progress - 0.45) / 0.35));
      const labelAlpha = Math.max(0, Math.min(1, (progress - 0.75) / 0.25));

      // ── Particle physics (begins after reveal) ──────────────────────────
      const p = particleRef.current;
      if (progress >= 1 && !p.settled) {
        const drift = evalGrid(result.xs, result.drifts, p.x);
        p.v += (drift * FORCE_SCALE - DAMPING * p.v) * DT;
        p.x += p.v * DT;
        p.x  = Math.max(result.xMin, Math.min(result.xMax, p.x));

        trailRef.current.push(p.x);
        if (trailRef.current.length > TRAIL_LEN) trailRef.current.shift();

        if (Math.abs(p.v) < 0.005 && Math.abs(p.x - result.chronotypeX) < 0.04) {
          p.settled = true;
          p.x = result.chronotypeX;
        }
      }

      // ── Draw ─────────────────────────────────────────────────────────────
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.width  / dpr;
      const H   = canvas.height / dpr;
      if (W > 0 && H > 0) {
        ctx.save();
        ctx.scale(dpr, dpr);
        drawFrame(ctx, W, H, result, progress, dotsAlpha, labelAlpha,
          p, trailRef.current, f);
        ctx.restore();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [result]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {!result && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: VT, fontSize: "1rem", letterSpacing: "3px",
          color: "rgba(255,255,255,0.12)", textTransform: "uppercase",
          pointerEvents: "none",
        }}>
          computing potential well…
        </div>
      )}
    </div>
  );
}
