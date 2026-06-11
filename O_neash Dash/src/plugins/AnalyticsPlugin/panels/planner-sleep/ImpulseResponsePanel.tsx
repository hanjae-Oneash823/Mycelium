import { useRef, useEffect, useState } from "react";
import { getEntries } from "../../../SleepTrackerPlugin/lib/sleepDb";
import { loadIrfTaskData } from "../../../PlannerPlugin/lib/plannerDb";
import { computeIrf, buildIrfInsights } from "./impulseResponseMath";
import type { IrfResult } from "./impulseResponseMath";

const VT   = "'VT323', 'HBIOS-SYS', monospace";
const TEAL = "#00c4a7";
const RED  = "#f87171";
const GRN  = "#4ade80";

function hexAlpha(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
}

function catmullRom(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: IrfResult,
  progress: number,
  labelAlpha: number,
): void {
  ctx.clearRect(0, 0, W, H);

  const PAD_L = 0.14, PAD_R = 0.04, PAD_T = 0.08, PAD_B = 0.16;
  const leftX  = PAD_L * W;
  const rightX = (1 - PAD_R) * W;
  const topY   = PAD_T * H;
  const botY   = (1 - PAD_B) * H;
  const spanX  = rightX - leftX;
  const spanY  = botY - topY;

  const N = r.lags.length;
  const lagX = (li: number) => leftX + (li / (N - 1)) * spanX;

  // Y range fitted to data
  const flatVals = r.allTraj.flat().filter((v): v is number => v !== null);
  const dataMin = flatVals.length ? Math.min(...flatVals) : 0.4;
  const dataMax = flatVals.length ? Math.max(...flatVals) : 1.6;
  const yMin = Math.min(dataMin - 0.12, 0.35);
  const yMax = Math.max(dataMax + 0.12, 1.55);
  const cy = (v: number) => botY - ((v - yMin) / (yMax - yMin)) * spanY;
  const baseY = cy(1.0);

  const colW    = spanX / (N - 1);
  const shockLi = r.lags.indexOf(0);
  const revealX = leftX + progress * spanX;

  // ── Shock column background ───────────────────────────────────────────────
  ctx.fillStyle = RED + hexAlpha(0.06);
  ctx.fillRect(lagX(shockLi) - colW * 0.5, topY, colW, spanY);

  // ── Baseline dashed line ──────────────────────────────────────────────────
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, baseY);
  ctx.lineTo(rightX, baseY);
  ctx.stroke();
  ctx.setLineDash([]);

  const meanPts = r.meanTraj
    .map((v, li) => ({ li, v }))
    .filter((p): p is { li: number; v: number } => p.v !== null);

  if (progress > 0) {
    // Clip lines and fills to the smooth reveal frontier
    ctx.save();
    ctx.beginPath();
    ctx.rect(leftX, topY - 2, revealX - leftX + 2, spanY + 4);
    ctx.clip();

    // ── Area fills ──────────────────────────────────────────────────────────
    if (meanPts.length >= 2) {
      const mxy = meanPts.map(p => ({ x: lagX(p.li), y: cy(p.v) }));
      const drawFill = (clipTop: number, clipH: number, color: string) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(leftX, clipTop, spanX, clipH);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(mxy[0].x, mxy[0].y);
        catmullRom(ctx, mxy);
        ctx.lineTo(mxy[mxy.length - 1].x, baseY);
        ctx.lineTo(mxy[0].x, baseY);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      };
      drawFill(baseY, botY - baseY, RED + hexAlpha(0.14));
      drawFill(topY, baseY - topY, GRN + hexAlpha(0.10));
    }

    // ── Individual shock trajectories ───────────────────────────────────────
    for (const traj of r.allTraj) {
      const pts = traj
        .map((v, li) => ({ li, v }))
        .filter((p): p is { li: number; v: number } => p.v !== null);
      if (pts.length < 2) continue;
      const xy = pts.map(p => ({ x: lagX(p.li), y: cy(p.v) }));
      ctx.beginPath();
      ctx.moveTo(xy[0].x, xy[0].y);
      catmullRom(ctx, xy);
      ctx.strokeStyle = "rgba(220,220,220,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Mean trajectory line ────────────────────────────────────────────────
    if (meanPts.length >= 2) {
      const mxy = meanPts.map(p => ({ x: lagX(p.li), y: cy(p.v) }));
      ctx.beginPath();
      ctx.moveTo(mxy[0].x, mxy[0].y);
      catmullRom(ctx, mxy);
      ctx.strokeStyle = TEAL;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore(); // remove reveal clip before drawing dots

    // ── Error bars ±1σ across shock trajectories ─────────────────────────────
    const capW = Math.max(3, Math.round(colW * 0.12));
    for (const { li, v: mean } of meanPts) {
      const barAlpha = Math.max(0, Math.min(1, (revealX - lagX(li)) / colW));
      if (barAlpha <= 0) continue;
      const vals = r.allTraj.map(t => t[li]).filter((x): x is number => x !== null);
      if (vals.length < 2) continue;
      const std = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length);
      if (std < 0.001) continue;
      const x   = lagX(li);
      const yHi = cy(mean + std);
      const yLo = cy(mean - std);
      ctx.globalAlpha = barAlpha * 0.45;
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHi);
      ctx.lineTo(x, yLo);
      ctx.moveTo(x - capW, yHi);
      ctx.lineTo(x + capW, yHi);
      ctx.moveTo(x - capW, yLo);
      ctx.lineTo(x + capW, yLo);
      ctx.stroke();
    }

    // ── Mean dots (fade in as revealX sweeps past each position) ────────────
    for (const { li, v } of meanPts) {
      const dotAlpha = Math.max(0, Math.min(1, (revealX - lagX(li)) / colW));
      if (dotAlpha <= 0) continue;
      const lag = r.lags[li];
      const color = lag === 0 ? TEAL : v < 0.95 ? RED : v > 1.05 ? GRN : TEAL;
      ctx.globalAlpha = dotAlpha;
      ctx.beginPath();
      ctx.arc(lagX(li), cy(v), lag === 0 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (labelAlpha <= 0) return;

  ctx.globalAlpha = labelAlpha;
  const fs   = Math.max(9, Math.round(Math.min(W, H) * 0.032));
  const smFs = Math.max(8, fs - 1);

  // ── Y-axis labels ─────────────────────────────────────────────────────────
  ctx.font = `${fs}px ${VT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const yTicks = [0.5, 0.75, 1.0, 1.25, 1.5].filter(v => v >= yMin && v <= yMax);
  for (const v of yTicks) {
    ctx.fillStyle = v === 1.0 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)";
    ctx.fillText(v === 1.0 ? "BASE" : `${Math.round(v * 100)}%`, leftX - 5, cy(v));
  }

  // ── X-axis lag labels ─────────────────────────────────────────────────────
  ctx.font = `${fs}px ${VT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let li = 0; li < N; li++) {
    const lag = r.lags[li];
    const label = lag === 0 ? "SHOCK" : lag < 0 ? `D${lag}` : `D+${lag}`;
    ctx.fillStyle = lag === 0 ? RED + "b3" : "rgba(255,255,255,0.3)";
    ctx.fillText(label, lagX(li), botY + 6);
  }

  // ── Percentage labels on mean dots ────────────────────────────────────────
  ctx.font = `${smFs}px ${VT}`;
  ctx.textBaseline = "bottom";
  for (const { li, v } of meanPts) {
    const lag = r.lags[li];
    const color = lag === 0 ? TEAL : v < 0.95 ? RED : v > 1.05 ? GRN : TEAL;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(v * 100)}%`, lagX(li), cy(v) - 6);
  }

  ctx.globalAlpha = 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onInsights: (lines: string[]) => void }

export default function ImpulseResponsePanel({ onInsights }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const [result, setResult] = useState<IrfResult | null>(null);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEntries(90), loadIrfTaskData(90)])
      .then(([sleep, tasks]) => {
        if (cancelled) return;
        const r = computeIrf(sleep, tasks);
        if (!r) { setNoData(true); return; }
        setResult(r);
        onInsights(buildIrfInsights(r));
      })
      .catch(() => { if (!cancelled) setNoData(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelAnimationFrame(rafRef.current);

    const dpr  = window.devicePixelRatio || 1;
    const side = canvas.clientWidth;
    canvas.width  = side * dpr;
    canvas.height = side * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const W = side, H = side;

    const REVEAL_DUR  = 80;
    const LABEL_START = 90;
    let frame = 0;

    function tick() {
      frame++;
      const progress   = Math.min(1, frame / REVEAL_DUR);
      const labelAlpha = Math.min(1, Math.max(0, (frame - LABEL_START) / 20));
      drawFrame(ctx, W, H, result!, progress, labelAlpha);
      if (progress < 1 || labelAlpha < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [result]);

  if (noData) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: VT, fontSize: "1rem", letterSpacing: "2px",
        color: "rgba(255,255,255,0.2)", textTransform: "uppercase",
      }}>
        not enough data
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
