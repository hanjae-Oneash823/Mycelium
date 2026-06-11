import { useRef, useEffect, useState } from "react";
import { loadArcCompletions } from "../../../PlannerPlugin/lib/plannerDb";
import { computeArcStreams, buildStreamInsights } from "./arcStreamMath";
import type { StreamResult } from "./arcStreamMath";

const VT     = "'VT323', 'HBIOS-SYS', monospace";
const PAD_X   = 0.08;
const PAD_TOP = 0.06;
const PAD_BOT = 0.16;

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function hexAlpha(alpha: number): string {
  return Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
}

// ─── Label placement ──────────────────────────────────────────────────────────

type LabelSlot = { x1: number; x2: number; y1: number; y2: number };

interface PlacedLabel {
  lx: number; anchorLx: number; labelY: number; anchorY: number;
  text: string; color: string;
}

// Greedy collision-free label placement.
// lx is clamped to [leftBound, rightBound] so badges never clip the canvas edge.
// anchorLx keeps the true peak-week x so the leader line still points at the stream.
function computeLabelPlacements(
  ctx: CanvasRenderingContext2D,
  candidates: Array<{ lx: number; anchorY: number; isAbove: boolean; text: string; color: string }>,
  topBound: number,
  botBound: number,
  fontSize: number,
  leftBound: number,
  rightBound: number,
): PlacedLabel[] {
  const taken: LabelSlot[] = [];
  const result: PlacedLabel[] = [];
  const PAD_X = 5, PAD_Y = 2;
  const boxH  = fontSize + PAD_Y * 2;

  for (const isAbove of [true, false]) {
    const group = candidates.filter(c => c.isAbove === isAbove).sort((a, b) => a.lx - b.lx);
    for (const c of group) {
      const textW   = ctx.measureText(c.text).width;
      const boxW    = textW + PAD_X * 2;
      const anchorLx = c.lx;
      const lx      = Math.max(leftBound + boxW / 2, Math.min(rightBound - boxW / 2, c.lx));
      const dir     = isAbove ? -1 : 1;
      let labelY    = c.anchorY + dir * (fontSize + 10);

      for (let attempt = 0; attempt < 10; attempt++) {
        const clamped = isAbove
          ? Math.max(topBound + boxH / 2, labelY)
          : Math.min(botBound - boxH / 2, labelY);
        const x1 = lx - boxW / 2 - 2, x2 = lx + boxW / 2 + 2;
        const y1 = clamped - boxH / 2 - 2, y2 = clamped + boxH / 2 + 2;
        const collides = taken.some(t => t.x2 > x1 && t.x1 < x2 && t.y2 > y1 && t.y1 < y2);
        if (!collides) {
          taken.push({ x1, x2, y1, y2 });
          result.push({ lx, anchorLx, labelY: clamped, anchorY: c.anchorY, text: c.text, color: c.color });
          break;
        }
        labelY += dir * (boxH + 3);
      }
    }
  }
  return result;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: StreamResult,
  progress: number,
  labelAlpha: number,
): void {
  ctx.clearRect(0, 0, W, H);

  const { streams, numWeeks, weekLabels, maxHalfHeight } = r;
  const midY    = ((PAD_TOP + 1 - PAD_BOT) / 2) * H;
  const streamH = (1 - PAD_TOP - PAD_BOT) * H;
  const leftX   = PAD_X * W;
  const rightX  = (1 - PAD_X) * W;
  const spanX   = rightX - leftX;
  // Scale so the busiest week fills ~90% of the draw area; quieter weeks are shorter.
  const scale   = (streamH * 0.45) / maxHalfHeight;

  const cx = (w: number) => leftX + (w / Math.max(1, numWeeks - 1)) * spanX;
  const cy = (v: number) => midY - v * scale;
  const xs = Array.from({ length: numWeeks }, (_, w) => cx(w));

  // Centre baseline
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(leftX, midY);
  ctx.lineTo(rightX, midY);
  ctx.stroke();

  // Clip streams to current progress (left → right reveal)
  const clipRight = leftX + spanX * progress + 6;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, clipRight, H);
  ctx.clip();

  // Stream fills — straight-line polygons; adjacent streams share exact boundary points
  for (let si = streams.length - 1; si >= 0; si--) {
    const s = streams[si];
    ctx.beginPath();
    ctx.moveTo(xs[0], cy(s.tops[0]));
    for (let w = 1; w < numWeeks; w++) ctx.lineTo(xs[w], cy(s.tops[w]));
    for (let w = numWeeks - 1; w >= 0; w--) ctx.lineTo(xs[w], cy(s.bottoms[w]));
    ctx.closePath();
    ctx.fillStyle = s.arcColor + hexAlpha(0.62);
    ctx.fill();
  }

  // Top-edge strokes
  for (const s of streams) {
    ctx.beginPath();
    ctx.moveTo(xs[0], cy(s.tops[0]));
    for (let w = 1; w < numWeeks; w++) ctx.lineTo(xs[w], cy(s.tops[w]));
    ctx.strokeStyle = s.arcColor + hexAlpha(0.75);
    ctx.lineWidth   = 1.2;
    ctx.stroke();
  }

  ctx.restore();

  // Week labels along bottom
  const wLabelFade = Math.min(1, progress * 2);
  if (wLabelFade > 0) {
    const fontSize = Math.max(9, Math.round(Math.min(W, H) * 0.028));
    ctx.globalAlpha  = wLabelFade * 0.35;
    ctx.font         = `${fontSize}px ${VT}`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle    = "#ffffff";
    for (let w = 0; w < numWeeks; w += 3) {
      if (cx(w) > clipRight) break;
      ctx.fillText(weekLabels[w], cx(w), (1 - PAD_BOT + 0.025) * H);
    }
    ctx.globalAlpha = 1;
  }

  // Arc labels — collision-free, outside stream edges with leader lines
  if (labelAlpha > 0) {
    const fontSize = Math.max(9, Math.round(Math.min(W, H) * 0.032));
    const topBound = PAD_TOP * H;
    const botBound = (1 - PAD_BOT) * H;
    ctx.font = `${fontSize}px ${VT}`;

    const candidates = streams.map(s => {
      const topEdge = cy(s.tops[s.peakWeek]);
      const botEdge = cy(s.bottoms[s.peakWeek]);
      const isAbove = (topEdge + botEdge) / 2 <= midY;
      return {
        lx: cx(s.peakWeek),
        anchorY: isAbove ? topEdge : botEdge,
        isAbove,
        text: s.arcName,
        color: s.arcColor,
      };
    });

    const placed = computeLabelPlacements(ctx, candidates, topBound, botBound, fontSize, leftX, rightX);

    ctx.globalAlpha  = labelAlpha;
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    for (const lb of placed) {
      const dir    = lb.labelY < lb.anchorY ? 1 : -1; // line goes from label toward anchor
      const lineEnd = lb.labelY + dir * (fontSize * 0.5 + 2);

      ctx.strokeStyle = lb.color + hexAlpha(0.5);
      ctx.lineWidth   = 0.9;
      ctx.beginPath();
      ctx.moveTo(lb.lx, lineEnd);
      ctx.lineTo(lb.anchorLx, lb.anchorY);
      ctx.stroke();

      const textW = ctx.measureText(lb.text).width;
      const padX = 5, padY = 2;
      ctx.fillStyle = lb.color;
      ctx.fillRect(lb.lx - textW / 2 - padX, lb.labelY - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2);
      ctx.fillStyle = "#000000";
      ctx.fillText(lb.text, lb.lx, lb.labelY);
    }
    ctx.globalAlpha = 1;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onInsights: (lines: string[]) => void;
}

export default function ArcCompositionStream({ onInsights }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<StreamResult | null>(null);

  useEffect(() => {
    loadArcCompletions(90)
      .then(records => {
        const r = computeArcStreams(records);
        if (r) {
          setResult(r);
          onInsights(buildStreamInsights(r));
        } else {
          onInsights(["NOT ENOUGH DATA — COMPLETE MORE TASKS"]);
        }
      })
      .catch(() => onInsights(["FAILED TO LOAD ARC DATA"]));
  }, [onInsights]);

  // Keep canvas buffer in sync with container dimensions (HiDPI)
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

  // Animation loop — re-runs whenever result changes
  useEffect(() => {
    if (!result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DRAW_FRAMES = 90;
    let progress = 0;
    let animId: number;

    const loop = () => {
      progress = Math.min(1, progress + 1 / DRAW_FRAMES);
      const labelAlpha = Math.max(0, Math.min(1, (progress - 0.85) / 0.15));
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.width  / dpr;
      const H   = canvas.height / dpr;
      if (W > 0 && H > 0) {
        ctx.save();
        ctx.scale(dpr, dpr);
        drawFrame(ctx, W, H, result, progress, labelAlpha);
        ctx.restore();
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [result]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {!result && (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: VT, fontSize: "1rem", letterSpacing: "3px",
            color: "rgba(255,255,255,0.12)", textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          computing arc streams…
        </div>
      )}
    </div>
  );
}
