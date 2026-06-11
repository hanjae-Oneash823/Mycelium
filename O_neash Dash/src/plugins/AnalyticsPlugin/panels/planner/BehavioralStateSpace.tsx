import { useRef, useEffect, useState, useCallback } from "react";
import { loadDailyBehaviorRecords } from "../../../PlannerPlugin/lib/plannerDb";
import { computeStateSpace, buildStateInsights } from "./behaviorMath";
import type { StateSpaceResult, ClusterFeatureLine } from "./behaviorMath";

interface LabelBox { cluster: number; x: number; y: number; w: number; h: number }

const VT        = "'VT323', 'HBIOS-SYS', monospace";
const PAD       = 0.11;
const TSNE_FRAC = 0.80;  // scatter occupies top 80% of canvas
const WIGGLE_AMP   = 1.8;
const WIGGLE_SPEED = 0.018;
const WIGGLE_PHASE = 2.3999632; // golden angle spreads phases across dots

// ─── Canvas draw ──────────────────────────────────────────────────────────────

function hexAlpha(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: StateSpaceResult,
  frame: number,
  labelBoxes: LabelBox[],
  progress = 1,
  hoveredRange: number | null = null,
  hoveredCluster: number | null = null,
) {
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);

  const { points, centroids, clusterColors, clusterLabels, bounds, rolling } = r;
  const rangeX  = bounds.maxX - bounds.minX || 1;
  const rangeY  = bounds.maxY - bounds.minY || 1;
  const k       = centroids.length;
  const tSneH   = H * TSNE_FRAC;
  const lineH   = H - tSneH;

  // Map UMAP coords → CSS pixels, confined to scatter area
  const cx = (x: number) =>
    PAD * W + ((x - bounds.minX) / rangeX) * (1 - 2 * PAD) * W;
  const cy = (y: number) =>
    (1 - PAD) * tSneH - ((y - bounds.minY) / rangeY) * (1 - 2 * PAD) * tSneH;

  // 0 ─ Crosshair axes
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(PAD * W, tSneH / 2); ctx.lineTo((1 - PAD) * W, tSneH / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2, PAD * tSneH); ctx.lineTo(W / 2, (1 - PAD) * tSneH); ctx.stroke();

  const n       = points.length;
  const visible = Math.min(n, Math.round(progress * n));

  const inRange   = (i: number) => hoveredRange === null || Math.min(2, Math.floor(i * 3 / n)) === hoveredRange;
  const inCluster = (c: number) => hoveredCluster === null || c === hoveredCluster;

  // 1 ─ Cluster blobs
  const blobFade = Math.min(1, progress / 0.4);
  for (let c = 0; c < k; c++) {
    const bx     = cx(centroids[c].x);
    const by     = cy(centroids[c].y);
    const radius = Math.min(W, tSneH) * 0.24;
    const color  = clusterColors[c];
    const fade   = blobFade * (inCluster(c) ? 1 : 0.18);
    const grad   = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
    grad.addColorStop(0,   color + hexAlpha(0.13 * fade));
    grad.addColorStop(0.5, color + hexAlpha(0.05 * fade));
    grad.addColorStop(1,   color + "00");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bx, by, radius, 0, Math.PI * 2); ctx.fill();
  }

  // 2 ─ Chronological trail
  ctx.lineCap = "round";
  for (let i = 1; i < visible; i++) {
    const age    = i / n;
    const c      = points[i].cluster;
    const active = inRange(i) && inCluster(c);
    ctx.strokeStyle = clusterColors[c] + hexAlpha(active ? 0.07 + age * 0.22 : 0.01);
    ctx.lineWidth   = active ? 0.6 + age * 0.8 : 0.3;
    ctx.beginPath();
    ctx.moveTo(cx(points[i - 1].x), cy(points[i - 1].y));
    ctx.lineTo(cx(points[i].x),     cy(points[i].y));
    ctx.stroke();
  }

  // 3 ─ Day particles
  for (let i = 0; i < visible; i++) {
    if (points[i].isToday) continue;
    const age    = i / n;
    const c      = points[i].cluster;
    const active = inRange(i) && inCluster(c);
    const wx = WIGGLE_AMP * Math.sin(frame * WIGGLE_SPEED + i * WIGGLE_PHASE);
    const wy = WIGGLE_AMP * Math.cos(frame * WIGGLE_SPEED + i * WIGGLE_PHASE * 1.618);
    ctx.fillStyle = clusterColors[c] + hexAlpha(active ? 0.2 + age * 0.8 : 0.05);
    ctx.beginPath(); ctx.arc(cx(points[i].x) + wx, cy(points[i].y) + wy, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  // 4 ─ Leading tip during animation
  if (progress < 1 && visible > 0) {
    const tip = points[visible - 1];
    const tipIdx = visible - 1;
    const twx = WIGGLE_AMP * Math.sin(frame * WIGGLE_SPEED + tipIdx * WIGGLE_PHASE);
    const twy = WIGGLE_AMP * Math.cos(frame * WIGGLE_SPEED + tipIdx * WIGGLE_PHASE * 1.618);
    ctx.fillStyle = clusterColors[tip.cluster];
    ctx.beginPath(); ctx.arc(cx(tip.x) + twx, cy(tip.y) + twy, 5, 0, Math.PI * 2); ctx.fill();
  }

  // 5 ─ Today (pulsing ring + dot)
  if (progress >= 1) {
    const todayPt  = points.find(p => p.isToday) ?? points[n - 1];
    if (todayPt) {
      const todayIdx = points.indexOf(todayPt);
      const wx    = WIGGLE_AMP * 0.7 * Math.sin(frame * WIGGLE_SPEED + todayIdx * WIGGLE_PHASE);
      const wy    = WIGGLE_AMP * 0.7 * Math.cos(frame * WIGGLE_SPEED + todayIdx * WIGGLE_PHASE * 1.618);
      const tx    = cx(todayPt.x) + wx;
      const ty    = cy(todayPt.y) + wy;
      const color = clusterColors[todayPt.cluster];
      const pulse = Math.sin(frame * 0.04) * 0.5 + 0.5;
      const fade  = inCluster(todayPt.cluster) ? 1 : 0.2;

      ctx.globalAlpha = (0.25 + pulse * 0.5) * fade;
      ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(tx, ty, 8 + pulse * 5, 0, Math.PI * 2); ctx.stroke();

      ctx.globalAlpha = fade;
      ctx.fillStyle   = color;
      ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // 6 ─ Cluster labels (fade in 75%→100%)
  const labelAlpha = Math.max(0, Math.min(1, (progress - 0.75) * 4));
  labelBoxes.length = 0;
  if (labelAlpha > 0) {
    const fontSize = Math.max(10, Math.round(Math.min(W, tSneH) * 0.036));
    const padX = 7, padY = 4;
    ctx.font = `${fontSize}px ${VT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let c = 0; c < k; c++) {
      const bx    = cx(centroids[c].x);
      const by    = cy(centroids[c].y);
      const color = clusterColors[c];
      const text  = clusterLabels[c];
      const textW = ctx.measureText(text).width;
      const boxW  = textW + padX * 2, boxH = fontSize + padY * 2;
      const lcy   = by - boxH / 2 - 14;
      const fade  = labelAlpha * (inCluster(c) ? 1 : 0.18);

      ctx.globalAlpha = fade;
      ctx.fillStyle   = color;
      ctx.fillRect(bx - boxW / 2, lcy - boxH / 2, boxW, boxH);
      ctx.fillStyle = "#000";
      ctx.fillText(text, bx, lcy);

      labelBoxes.push({ cluster: c, x: bx - boxW / 2, y: lcy - boxH / 2, w: boxW, h: boxH });
    }
    ctx.globalAlpha = 1;
  }

  // ── SEPARATOR ────────────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth   = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(W * 0.04, tSneH); ctx.lineTo(W * 0.96, tSneH); ctx.stroke();

  // ── ROLLING CHART ────────────────────────────────────────────────────────────
  {
    const lx = W * 0.10, rx = W * 0.94;
    const ty = tSneH + lineH * 0.04;
    const by = H   - lineH * 0.22;
    const sx = rx - lx, sy = by - ty;
    const N  = rolling.length;
    if (N < 2 || sy <= 0) return;

    const revealN = Math.max(1, Math.ceil(progress * N));
    const px = (i: number) => lx + (i / (N - 1)) * sx;

    for (let kk = k - 1; kk >= 0; kk--) {
      const hex = clusterColors[kk].replace("#", "");
      const rr  = parseInt(hex.slice(0, 2), 16);
      const gg  = parseInt(hex.slice(2, 4), 16);
      const bb  = parseInt(hex.slice(4, 6), 16);
      const active    = inCluster(kk);
      const fillAlpha = hoveredCluster === null ? 0.50 : active ? 0.80 : 0.10;
      const strkAlpha = hoveredCluster === null ? 0.70 : active ? 0.95 : 0.15;

      ctx.beginPath();
      for (let i = 0; i < revealN; i++) {
        let top = 0; for (let q = 0; q <= kk; q++) top += rolling[i].proportions[q];
        const y = by - top * sy;
        if (i === 0) ctx.moveTo(px(i), y); else ctx.lineTo(px(i), y);
      }
      for (let i = revealN - 1; i >= 0; i--) {
        let bot = 0; for (let q = 0; q < kk; q++) bot += rolling[i].proportions[q];
        ctx.lineTo(px(i), by - bot * sy);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${rr},${gg},${bb},${fillAlpha})`; ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < revealN; i++) {
        let top = 0; for (let q = 0; q <= kk; q++) top += rolling[i].proportions[q];
        const y = by - top * sy;
        if (i === 0) ctx.moveTo(px(i), y); else ctx.lineTo(px(i), y);
      }
      ctx.strokeStyle = `rgba(${rr},${gg},${bb},${strkAlpha})`; ctx.lineWidth = 1; ctx.stroke();
    }

    // Gridlines + labels (fade in with labelAlpha)
    if (labelAlpha > 0) {
      ctx.globalAlpha = labelAlpha;
      const fs = Math.max(10, Math.round(W * 0.030));
      ctx.font = `${fs}px ${VT}`;
      ctx.setLineDash([2, 4]);
      for (const pct of [0.5, 1.0]) {
        const y = by - pct * sy;
        ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(rx, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(`${Math.round(pct * 100)}%`, lx - 2, y);
      }
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      let lastMo = "";
      for (let i = 0; i < N; i++) {
        const mo = new Date(rolling[i].date).toLocaleString("default", { month: "short" }).toUpperCase();
        if (mo !== lastMo) { ctx.fillText(mo, px(i), by + 3); lastMo = mo; }
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onInsights: (lines: string[]) => void;
  onResult?:  (result: StateSpaceResult | null) => void;
}

export default function BehavioralStateSpace({ onInsights, onResult }: Props) {
  const containerRef      = useRef<HTMLDivElement>(null);
  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const hoveredRangeRef   = useRef<number | null>(null);
  const hoveredClusterRef = useRef<number | null>(null);
  const resultRef         = useRef<StateSpaceResult | null>(null);
  const labelBoxesRef     = useRef<LabelBox[]>([]);

  const [result, setResult]             = useState<StateSpaceResult | null>(null);
  const [hoveredRange, setHoveredRange] = useState<number | null>(null);
  const [tooltip, setTooltip]           = useState<{ x: number; y: number; cluster: number } | null>(null);

  const setRange   = (r: number | null) => { hoveredRangeRef.current = r;   setHoveredRange(r); };
  const setCluster = (c: number | null) => { hoveredClusterRef.current = c; };

  // Load data
  useEffect(() => {
    loadDailyBehaviorRecords(90)
      .then(records => {
        const r = computeStateSpace(records);
        if (r) {
          setResult(r); resultRef.current = r;
          onResult?.(r);
          onInsights(buildStateInsights(r));
        } else {
          onResult?.(null);
          onInsights(["NOT ENOUGH DATA — COMPLETE MORE TASKS"]);
        }
      })
      .catch(() => onInsights(["FAILED TO LOAD BEHAVIOR DATA"]));
  }, [onInsights, onResult]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr    = window.devicePixelRatio || 1;
      canvas.width  = el.clientWidth  * dpr;
      canvas.height = el.clientHeight * dpr;
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    if (!result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0, progress = 0, animId: number;
    const loop = () => {
      progress = Math.min(1, progress + 1 / 90);
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.width  / dpr;
      const H   = canvas.height / dpr;
      if (W > 0 && H > 0) {
        ctx.save();
        ctx.scale(dpr, dpr);
        drawFrame(ctx, W, H, result, frame, labelBoxesRef.current, progress, hoveredRangeRef.current, hoveredClusterRef.current);
        ctx.restore();
      }
      frame++;
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [result]);

  // Rolling chart hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const r      = resultRef.current;
    if (!canvas || !r) return;

    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const W     = rect.width;
    const H     = rect.height;
    const tSneH = H * TSNE_FRAC;
    const lineH = H - tSneH;

    if (my < tSneH) {
      // Check UMAP label boxes
      const hit = labelBoxesRef.current.find(
        b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h,
      ) ?? null;
      const hitCluster = hit?.cluster ?? null;
      if (hitCluster !== hoveredClusterRef.current) setCluster(hitCluster);
      if (hit) {
        const CW = canvas.clientWidth, CH = canvas.clientHeight;
        const TW = 220, TH = 160, M = 8;
        let tx = mx + 14;
        if (tx + TW > CW - M) tx = mx - TW - 14;
        tx = Math.max(M, Math.min(CW - TW - M, tx));
        const ty = Math.max(M, Math.min(CH - TH - M, my - 8));
        setTooltip({ x: tx, y: ty, cluster: hit.cluster });
      } else {
        setTooltip(null);
      }
      return;
    }
    setTooltip(null);

    const lx = W * 0.10, rx = W * 0.94;
    const ty = tSneH + lineH * 0.04;
    const by = H   - lineH * 0.22;

    if (mx < lx || mx > rx || my < ty || my > by) {
      if (hoveredClusterRef.current !== null) setCluster(null);
      return;
    }

    const N   = r.rolling.length;
    const xi  = Math.max(0, Math.min(N - 1, Math.round((mx - lx) / (rx - lx) * (N - 1))));
    const yCursor = (by - my) / (by - ty);  // 0 = bottom, 1 = top

    let cumBot = 0, hovered: number | null = null;
    for (let c = 0; c < r.rolling[xi].proportions.length; c++) {
      cumBot += r.rolling[xi].proportions[c];
      if (yCursor <= cumBot) { hovered = c; break; }
    }
    if (hovered !== hoveredClusterRef.current) setCluster(hovered);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoveredClusterRef.current !== null) setCluster(null);
    setTooltip(null);
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      {/* Time-range buttons — positioned above the rolling chart strip */}
      <div style={{
        position: "absolute", bottom: "21%", left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: "6px",
        pointerEvents: "none",
      }}>
        {(["FIRST 30", "MID 30", "LAST 30"] as const).map((label, i) => (
          <button key={i}
            onMouseEnter={() => setRange(i)}
            onMouseLeave={() => setRange(null)}
            style={{
              pointerEvents: "all",
              background: hoveredRange === i ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.55)",
              border: `1px solid ${hoveredRange === i ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.20)"}`,
              color: hoveredRange === i ? "#fff" : "rgba(255,255,255,0.35)",
              fontFamily: VT, fontSize: "0.78rem", letterSpacing: "2px",
              textTransform: "uppercase", padding: "2px 9px",
              cursor: "default", lineHeight: 1.4, borderRadius: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tooltip && result && (() => {
        const cl       = result.clusterLabels[tooltip.cluster];
        const color    = result.clusterColors[tooltip.cluster];
        const features = result.clusterFeatures[tooltip.cluster] ?? [];
        const DIR_COLOR: Record<ClusterFeatureLine["dir"], string> = {
          HIGH:   "#00c4a7",
          LOW:    "#f87171",
          NORMAL: "rgba(255,255,255,0.35)",
        };
        return (
          <div style={{
            position: "absolute", left: tooltip.x, top: tooltip.y,
            background: "rgba(8,8,12,0.94)",
            border: `1px solid ${color}`,
            padding: "8px 12px",
            fontFamily: VT, fontSize: "0.82rem", letterSpacing: "1.5px",
            color: "rgba(255,255,255,0.75)", textTransform: "uppercase",
            pointerEvents: "none", zIndex: 20, lineHeight: 1.8,
            minWidth: "190px",
          }}>
            <div style={{ color, marginBottom: "5px", fontSize: "0.92rem" }}>{cl}</div>
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>{f.name}</span>
                <span>
                  {f.value}{" "}
                  <span style={{ color: DIR_COLOR[f.dir], fontSize: "0.75rem" }}>({f.dir})</span>
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {!result && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: VT, fontSize: "1rem", letterSpacing: "3px",
          color: "rgba(255,255,255,0.12)", textTransform: "uppercase",
          pointerEvents: "none",
        }}>
          computing state space…
        </div>
      )}
    </div>
  );
}
