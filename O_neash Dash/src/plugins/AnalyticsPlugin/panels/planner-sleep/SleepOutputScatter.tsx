import { useRef, useEffect, useState } from "react";
import { computeScatter, buildScatterInsights } from "./sleepOutputMath";
import type { ScatterResult, DayPoint } from "./sleepOutputMath";

const VT   = "'VT323', 'HBIOS-SYS', monospace";
const TEAL = "#00c4a7";
const RED  = "#f87171";
const WIGGLE_AMP   = 1.5;
const WIGGLE_SPEED = 0.019;
const WIGGLE_PHASE = 2.3999632;
const RECENT_COUNT = 5;

interface HitTarget { x: number; y: number; pt: DayPoint }

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: ScatterResult,
  progress: number,
  labelAlpha: number,
  frame: number,
  hitTargets: HitTarget[],
): void {
  ctx.clearRect(0, 0, W, H);

  const PAD_L = 0.14, PAD_R = 0.05, PAD_T = 0.08, PAD_B = 0.16;
  const leftX  = PAD_L * W;
  const rightX = (1 - PAD_R) * W;
  const topY   = PAD_T * H;
  const botY   = (1 - PAD_B) * H;
  const spanX  = rightX - leftX;
  const spanY  = botY - topY;

  const sleepVals = r.points.map(p => p.sleepH);
  const xMin = Math.max(0, Math.floor(Math.min(...sleepVals) - 0.5));
  const xMax = Math.ceil(Math.max(...sleepVals) + 0.5);
  const scx  = (h: number) => leftX + ((h - xMin) / (xMax - xMin)) * spanX;

  const cpsVals = r.points.map(p => p.cpsRate);
  const yMax = Math.max(...cpsVals) * 1.2;
  const scy  = (v: number) => botY - (v / yMax) * spanY;

  const sortedPts = [...r.points].sort((a, b) => a.sleepH - b.sleepH);
  const N = sortedPts.length;

  // ── Grid lines ────────────────────────────────────────────────────────────
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = topY + (i / 4) * spanY;
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (progress <= 0) return;

  const revealX = leftX + progress * spanX;

  // ── Regression line (sweeps left to right) ────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(leftX, topY - 2, revealX - leftX + 2, spanY + 4);
  ctx.clip();

  // ── Confidence band (±1 SE around linear regression) ─────────────────────
  if (r.gridXs.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(scx(r.gridXs[0]), scy(r.bandHi[0]));
    for (let i = 1; i < r.gridXs.length; i++) ctx.lineTo(scx(r.gridXs[i]), scy(r.bandHi[i]));
    for (let i = r.gridXs.length - 1; i >= 0; i--) ctx.lineTo(scx(r.gridXs[i]), scy(r.bandLo[i]));
    ctx.closePath();
    ctx.fillStyle = "rgba(250,204,21,0.12)";
    ctx.fill();

    ctx.strokeStyle = "rgba(250,204,21,0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(scx(r.gridXs[0]), scy(r.bandHi[0]));
    for (let i = 1; i < r.gridXs.length; i++) ctx.lineTo(scx(r.gridXs[i]), scy(r.bandHi[i]));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(scx(r.gridXs[0]), scy(r.bandLo[0]));
    for (let i = 1; i < r.gridXs.length; i++) ctx.lineTo(scx(r.gridXs[i]), scy(r.bandLo[i]));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Linear regression line (yellow) ──────────────────────────────────────
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(scx(xMin), scy(r.regA + r.regB * xMin));
  ctx.lineTo(scx(xMax), scy(r.regA + r.regB * xMax));
  ctx.stroke();

  ctx.restore();

  // ── Dots ──────────────────────────────────────────────────────────────────
  for (let i = 0; i < N; i++) {
    const pt       = sortedPts[i];
    const dotAlpha = Math.max(0, Math.min(1, (progress * N - i) * 1.5));
    if (dotAlpha <= 0) continue;

    const wx = WIGGLE_AMP * Math.sin(frame * WIGGLE_SPEED + i * WIGGLE_PHASE);
    const wy = WIGGLE_AMP * Math.cos(frame * WIGGLE_SPEED + i * WIGGLE_PHASE * 1.618);
    const cx = scx(pt.sleepH) + wx;
    const cy = scy(pt.cpsRate) + wy;

    // Older dots are dimmer: oldest → 15%, newest → 100%
    const ageFraction  = pt.totalDays > 1 ? pt.dayIndex / (pt.totalDays - 1) : 1;
    const recencyAlpha = 0.15 + 0.85 * ageFraction;
    const radius       = pt.isShock ? 4.5 : 3.5;

    ctx.globalAlpha = dotAlpha * recencyAlpha;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = pt.isShock ? RED : TEAL + "b3";
    ctx.fill();

    // Ring + hit target for the 5 most recent days
    if (pt.dayIndex >= pt.totalDays - RECENT_COUNT) {
      ctx.globalAlpha = dotAlpha * 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = pt.isShock ? RED : TEAL;
      ctx.lineWidth   = 1.2;
      ctx.stroke();
      // Use base position (no wiggle) for stable hit testing
      hitTargets.push({ x: scx(pt.sleepH), y: scy(pt.cpsRate), pt });
    }
  }
  ctx.globalAlpha = 1;

  if (labelAlpha <= 0) return;
  ctx.globalAlpha = labelAlpha;

  const fs = Math.max(9, Math.round(Math.min(W, H) * 0.032));
  ctx.font = `${fs}px ${VT}`;

  // ── Y-axis labels ─────────────────────────────────────────────────────────
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle    = "rgba(255,255,255,0.25)";
  for (let i = 0; i <= 4; i++) {
    const v = yMax * (1 - i / 4);
    ctx.fillText(v.toFixed(1), leftX - 5, topY + (i / 4) * spanY);
  }

  // ── X-axis labels ─────────────────────────────────────────────────────────
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle    = "rgba(255,255,255,0.25)";
  for (let h = xMin; h <= xMax; h++) {
    ctx.fillText(`${h}H`, scx(h), botY + 6);
  }

  // ── R label ───────────────────────────────────────────────────────────────
  ctx.fillStyle    = Math.abs(r.r) >= 0.3 ? (r.r >= 0 ? TEAL : RED) : "rgba(255,255,255,0.3)";
  ctx.textAlign    = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`R = ${r.r.toFixed(2)}`, rightX, topY + 4);

  ctx.globalAlpha = 1;
}

function DayTooltip({ x, y, pt, canvasSize }: { x: number; y: number; pt: DayPoint; canvasSize: number }) {
  const W = 148;
  const H = 96;
  const PAD = 10;
  // Prefer above the dot; flip below if too close to top
  const above = y - H - PAD;
  const top   = above < 4 ? y + PAD + 8 : above;
  // Clamp horizontally
  const left  = Math.min(Math.max(x - W / 2, 4), canvasSize - W - 4);

  return (
    <div style={{
      position:        "absolute",
      left,
      top,
      width:           W,
      pointerEvents:   "none",
      background:      "rgba(0,0,0,0.88)",
      border:          `1px solid ${pt.isShock ? RED : TEAL}44`,
      padding:         "8px 10px",
      fontFamily:      VT,
      fontSize:        "13px",
      letterSpacing:   "1.5px",
      lineHeight:      "1.55",
      color:           "rgba(255,255,255,0.85)",
      textTransform:   "uppercase",
      whiteSpace:      "nowrap",
    }}>
      <div style={{ color: pt.isShock ? RED : TEAL, marginBottom: 4, fontSize: 15 }}>{pt.date}</div>
      <div>SLEEP&nbsp;&nbsp;&nbsp;{pt.sleepH.toFixed(1)}H{pt.isShock ? "  ⚠" : ""}</div>
      <div>OUTPUT&nbsp;&nbsp;{pt.cpsRate.toFixed(2)}</div>
      <div>TASKS&nbsp;&nbsp;&nbsp;{pt.taskCount}</div>
    </div>
  );
}

interface Props { onInsights: (lines: string[]) => void }

export default function SleepOutputScatter({ onInsights }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const [result, setResult]   = useState<ScatterResult | null>(null);
  const [noData, setNoData]   = useState(false);
  const [tooltip, setTooltip] = useState<HitTarget | null>(null);
  const [canvasSize, setCanvasSize] = useState(0);

  useEffect(() => {
    let cancelled = false;
    computeScatter()
      .then(r => {
        if (cancelled) return;
        if (!r) { setNoData(true); return; }
        setResult(r);
        onInsights(buildScatterInsights(r));
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
    setCanvasSize(side);
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
      hitTargetsRef.current = [];
      drawFrame(ctx, W, H, result!, progress, labelAlpha, frame, hitTargetsRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [result]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const HIT  = 14; // px radius
    for (const t of hitTargetsRef.current) {
      const dx = mx - t.x, dy = my - t.y;
      if (dx * dx + dy * dy <= HIT * HIT) {
        setTooltip(t);
        return;
      }
    }
    setTooltip(null);
  }

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
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <DayTooltip
          x={tooltip.x}
          y={tooltip.y}
          pt={tooltip.pt}
          canvasSize={canvasSize}
        />
      )}
    </div>
  );
}
