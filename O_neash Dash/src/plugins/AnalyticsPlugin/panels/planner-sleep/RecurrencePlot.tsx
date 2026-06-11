import { useRef, useEffect, useState, useCallback } from "react";
import type { ClusterResult } from "./clusterMath";
import { CLUSTER_COLORS } from "./clusterMath";

interface Props {
  result: ClusterResult | null;
}

const STRIP_FRAC = 0.045;
const LABEL_FRAC = 0.07;

function simToRGB(s: number): [number, number, number] {
  if (s <= 0.7) {
    const t = s / 0.7;
    return [Math.round(8 * (1 - t)), Math.round(8 + 188 * t), Math.round(16 + 151 * t)];
  }
  const t = (s - 0.7) / 0.3;
  return [Math.round(255 * t), Math.round(196 + 59 * t), Math.round(167 + 88 * t)];
}

interface HoverInfo { i: number; j: number }
interface TooltipState { x: number; y: number; lines: string[]; canvasW: number }

function getGeom(W: number, H: number, N: number) {
  const stripPx = Math.round(W * STRIP_FRAC);
  const labelPx = Math.round(W * LABEL_FRAC);
  const matX0   = stripPx + labelPx;
  const matY0   = stripPx;
  const matW    = W - matX0;
  const matH    = H - matY0 - labelPx;
  const cellW   = matW / N;
  const cellH   = matH / N;
  return { stripPx, labelPx, matX0, matY0, matW, matH, cellW, cellH };
}

export default function RecurrencePlot({ result }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const colRef       = useRef<number>(0);
  const hoverRef     = useRef<HoverInfo | null>(null);
  const cacheRef     = useRef<ImageData | null>(null); // base image without crosshair

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Draws the static base: matrix + strips + labels + watermark. No crosshair.
  const drawBase = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
    if (!result) return;
    const { days, clusters, recurrence } = result;
    const N = days.length;
    if (N === 0) return;

    const { stripPx, labelPx, matX0, matY0, matW, matH, cellW, cellH } = getGeom(W, H, N);

    ctx.fillStyle = "#080810";
    ctx.fillRect(0, 0, W, H);

    const colMax = colRef.current;
    for (let j = 0; j < colMax && j < N; j++) {
      for (let i = 0; i < N; i++) {
        const [r, g, b] = simToRGB(recurrence[i][j]);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(matX0 + j * cellW, matY0 + i * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // cluster color strips
    for (let j = 0; j < N; j++) {
      ctx.fillStyle = CLUSTER_COLORS[days[j].cluster] ?? "#555";
      ctx.fillRect(matX0 + j * cellW, 0, Math.ceil(cellW), stripPx - 1);
    }
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = CLUSTER_COLORS[days[i].cluster] ?? "#555";
      ctx.fillRect(0, matY0 + i * cellH, stripPx - 1, Math.ceil(cellH));
    }

    // month labels — x-axis
    const fs = Math.round(W * 0.030);
    ctx.save();
    ctx.font = `bold ${fs}px 'VT323', monospace`;
    ctx.fillStyle = "rgba(255,255,255,0.50)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let prevMon = "";
    for (let j = 0; j < N; j++) {
      const mon = new Date(days[j].date).toLocaleString("default", { month: "short" }).toUpperCase();
      if (mon !== prevMon) {
        ctx.fillText(mon, matX0 + (j + 0.5) * cellW, matY0 + matH + 4);
        prevMon = mon;
      }
    }
    // month labels — y-axis (rotated)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    prevMon = "";
    for (let i = 0; i < N; i++) {
      const mon = new Date(days[i].date).toLocaleString("default", { month: "short" }).toUpperCase();
      if (mon !== prevMon) {
        const py = matY0 + (i + 0.5) * cellH;
        ctx.save();
        ctx.translate(stripPx + labelPx * 0.5, py);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(mon, 0, 0);
        ctx.restore();
        prevMon = mon;
      }
    }
    ctx.restore();

    // cluster legend
    clusters.forEach((_cl, k) => {
      ctx.save();
      ctx.font = `bold ${Math.round(W * 0.022)}px 'VT323', monospace`;
      ctx.fillStyle = CLUSTER_COLORS[k];
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${k + 1}`, 2, matY0 + k * (stripPx / Math.max(clusters.length, 1)) + stripPx / Math.max(clusters.length * 2, 1));
      ctx.restore();
    });

    // RECURRENCE watermark
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.font = `bold ${Math.round(W * 0.10)}px 'VT323', monospace`;
    ctx.fillStyle = "#00c4a7";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RECURRENCE", W / 2, H / 2);
    ctx.restore();

    // dim unrendered columns
    if (colMax < N) {
      ctx.fillStyle = "rgba(8,8,16,0.65)";
      ctx.fillRect(matX0 + colMax * cellW, matY0, matW - colMax * cellW, matH);
    }
  }, [result]);

  // Draws crosshair. Geometry is in physical canvas pixels (for sharp rendering).
  const drawCrosshair = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
    if (!result) return;
    const hov = hoverRef.current;
    if (!hov) return;
    const N = result.days.length;
    const { matX0, matY0, matW, matH, cellW, cellH } = getGeom(W, H, N);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.40)";
    ctx.lineWidth = Math.max(1, W * 0.002);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(matX0 + hov.j * cellW + cellW / 2, matY0);
    ctx.lineTo(matX0 + hov.j * cellW + cellW / 2, matY0 + matH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(matX0, matY0 + hov.i * cellH + cellH / 2);
    ctx.lineTo(matX0 + matW, matY0 + hov.i * cellH + cellH / 2);
    ctx.stroke();
    ctx.restore();
  }, [result]);

  // Fast hover repaint: blit cached base then draw crosshair in physical pixels.
  const repaintHover = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Always use the actual canvas physical pixel dimensions for rendering.
    const W = canvas.width, H = canvas.height;

    if (cacheRef.current && cacheRef.current.width === W && cacheRef.current.height === H) {
      ctx.putImageData(cacheRef.current, 0, 0);
    } else {
      drawBase(ctx, W, H);
    }
    drawCrosshair(ctx, W, H);
  }, [result, drawBase, drawCrosshair]);

  // Animation loop — calls drawBase each frame, captures cache when done.
  useEffect(() => {
    if (!result) return;
    cacheRef.current  = null;
    colRef.current    = 0;
    const N = result.days.length;

    const step = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;

      colRef.current = Math.min(colRef.current + Math.max(1, Math.ceil(N / 80)), N);
      drawBase(ctx, W, H);

      if (colRef.current < N) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // Animation complete — snapshot the base image for fast hover repaints.
        cacheRef.current = ctx.getImageData(0, 0, W, H);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [result, drawBase]);

  // Resize observer — invalidates cache and redraws.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(width  * dpr);
      canvas.height = Math.round(height * dpr);
      cacheRef.current = null;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawBase(ctx, canvas.width, canvas.height);
        if (colRef.current >= (result?.days.length ?? Infinity)) {
          cacheRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
      }
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [drawBase, result]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use the canvas's bounding rect so coordinates are canvas-relative
    // regardless of which child element originally fired the event.
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const W  = rect.width;
    const H  = rect.height;
    const N  = result.days.length;
    const { matX0, matY0, matW, matH, cellW, cellH } = getGeom(W, H, N);

    if (px < matX0 || py < matY0 || px >= matX0 + matW || py >= matY0 + matH) {
      if (hoverRef.current !== null) { hoverRef.current = null; setTooltip(null); repaintHover(); }
      return;
    }

    const j = Math.min(N - 1, Math.floor((px - matX0) / cellW));
    const i = Math.min(N - 1, Math.floor((py - matY0) / cellH));

    if (j >= colRef.current) {
      if (hoverRef.current !== null) { hoverRef.current = null; setTooltip(null); repaintHover(); }
      return;
    }

    hoverRef.current = { i, j };
    repaintHover();

    const sim  = result.recurrence[i][j];
    const dayI = result.days[i];
    const dayJ = result.days[j];
    const clI  = result.clusters[dayI.cluster];
    const clJ  = result.clusters[dayJ.cluster];
    const fmt  = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    setTooltip({
      x: px,
      y: py,
      canvasW: W,
      lines: [
        `${fmt(dayI.date)}  ↔  ${fmt(dayJ.date)}`,
        `SIM  ${(sim * 100).toFixed(0)}%`,
        `ROW  ${clI.label}`,
        `COL  ${clJ.label}`,
        ...(Math.abs(i - j) <= 1 ? ["· DIAGONAL IDENTITY"] : []),
      ],
    });
  }, [result, repaintHover]);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only clear hover when cursor actually leaves the outer container.
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (px >= 0 && py >= 0 && px < rect.width && py < rect.height) return;
    }
    hoverRef.current = null;
    setTooltip(null);
    repaintHover();
  }, [repaintHover]);

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%", cursor: "crosshair" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {tooltip && <RecurrenceTooltip {...tooltip} />}
    </div>
  );
}

const TW = 230, TH = 155, TM = 10;
function RecurrenceTooltip({ x, y, lines, canvasW }: TooltipState) {
  const VT = "'VT323', 'HBIOS-SYS', monospace";
  const tx = Math.max(TM, Math.min(canvasW - TW - TM, x - TW / 2));
  const ty = y > TH + TM ? y - TH - TM : y + TM;
  return (
    <div style={{
      position: "absolute", left: tx, top: ty, width: TW,
      background: "rgba(8,8,24,0.93)",
      border: "1px solid rgba(0,196,167,0.35)",
      padding: "8px 12px", pointerEvents: "none", zIndex: 10,
      fontFamily: VT, letterSpacing: "1.5px", textTransform: "uppercase",
    }}>
      <div style={{ fontSize: "0.88rem", color: "#00c4a7", lineHeight: 1.5 }}>{lines[0]}</div>
      <div style={{ fontSize: "1.05rem", color: "#ffffff", lineHeight: 1.4, marginTop: 2 }}>{lines[1]}</div>
      {lines.slice(2).map((l, idx) => (
        <div key={idx} style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.3 }}>{l}</div>
      ))}
    </div>
  );
}
