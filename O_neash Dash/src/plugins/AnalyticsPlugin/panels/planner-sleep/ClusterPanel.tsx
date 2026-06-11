import { useRef, useEffect, useState, useCallback } from "react";
import type { ClusterResult } from "./clusterMath";
import { CLUSTER_COLORS, ROLLING_WINDOW } from "./clusterMath";

const VT         = "'VT323', 'HBIOS-SYS', monospace";
const SPLIT      = 0.63;
const MONTH_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;
const WIGGLE_AMP   = 1.6;
const WIGGLE_SPEED = 0.019;
const WIGGLE_PHASE = 2.3999632;

interface LabelBox { cluster: number; x: number; y: number; w: number; h: number }

function drawFrame(
  ctx:        CanvasRenderingContext2D,
  W:          number,
  H:          number,
  r:          ClusterResult,
  labelBoxes: LabelBox[],
  hovered:    number | null,
  progress:   number,
  labelAlpha: number,
  frame:      number,
): void {
  ctx.clearRect(0, 0, W, H);

  const tSneH = H * SPLIT;
  const lineH = H - tSneH;

  // ── UMAP ZONE ───────────────────────────────────────────────────────────────
  {
    const PAD = 0.08;
    const lx = W * PAD,          rx = W * (1 - PAD);
    const ty = tSneH * 0.06,     by = tSneH * 0.98;
    const sx = rx - lx,   sy = by - ty;
    const cx = (x: number) => lx + x * sx;
    const cy = (y: number) => ty + (1 - y) * sy;

    // Crosshair axes at zone center
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(lx, (ty + by) / 2); ctx.lineTo(rx, (ty + by) / 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((lx + rx) / 2, ty); ctx.lineTo((lx + rx) / 2, by); ctx.stroke();

    // Dots in chronological order (r.days is sorted by date from computeClusters)
    const N       = r.days.length;
    const visible = Math.min(N, Math.round(progress * N));
    for (let i = 0; i < visible; i++) {
      const pt     = r.days[i];
      const dimmed = hovered !== null && pt.cluster !== hovered;
      const age    = N > 1 ? i / (N - 1) : 1;  // 0 = oldest, 1 = newest
      const wx = WIGGLE_AMP * Math.sin(frame * WIGGLE_SPEED + i * WIGGLE_PHASE);
      const wy = WIGGLE_AMP * Math.cos(frame * WIGGLE_SPEED + i * WIGGLE_PHASE * 1.618);
      ctx.globalAlpha = dimmed ? 0.08 : 0.15 + age * 0.8;
      ctx.beginPath();
      ctx.arc(cx(pt.tsneX) + wx, cy(pt.tsneY) + wy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = CLUSTER_COLORS[pt.cluster];
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Labels — collision-resolved, clamped to zone bounds
    if (labelAlpha > 0) {
      labelBoxes.length = 0;
      const fontSize = Math.max(11, Math.round(Math.min(W, tSneH) * 0.048));
      const padX = 6, padY = 3, lineGap = 3, SEP = 8;
      ctx.font = `${fontSize}px ${VT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      type Rect = { id: number; color: string; lines: string[]; x: number; y: number; w: number; h: number };
      const rects: Rect[] = r.clusters.flatMap(cl => {
        const pts = r.days.filter(d => d.cluster === cl.id);
        if (!pts.length) return [];
        const centX = cx(pts.reduce((s, p) => s + p.tsneX, 0) / pts.length);
        const centY = cy(pts.reduce((s, p) => s + p.tsneY, 0) / pts.length);
        const lines    = cl.label.split(" · ");
        const maxTextW = Math.max(...lines.map(l => ctx.measureText(l).width));
        const w = maxTextW + padX * 2;
        const h = fontSize * lines.length + lineGap * (lines.length - 1) + padY * 2;
        // Start above centroid, clamped to zone
        const x = Math.max(lx, Math.min(rx - w, centX - w / 2));
        const y = Math.max(ty, Math.min(by - h, centY - h - 10));
        return [{ id: cl.id, color: cl.color, lines, x, y, w, h }];
      });

      // Iterative collision resolution
      for (let iter = 0; iter < 60; iter++) {
        let moved = false;
        for (let a = 0; a < rects.length; a++) {
          for (let b = a + 1; b < rects.length; b++) {
            const A = rects[a], B = rects[b];
            const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
            const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
            if (ox <= 0 || oy <= 0) continue;
            moved = true;
            const push = (ox < oy ? ox : oy) / 2 + SEP / 2;
            if (ox < oy) {
              const dir = (A.x + A.w / 2) < (B.x + B.w / 2) ? -1 : 1;
              A.x += dir * push; B.x -= dir * push;
            } else {
              const dir = (A.y + A.h / 2) < (B.y + B.h / 2) ? -1 : 1;
              A.y += dir * push; B.y -= dir * push;
            }
            A.x = Math.max(lx, Math.min(rx - A.w, A.x));
            A.y = Math.max(ty, Math.min(by - A.h, A.y));
            B.x = Math.max(lx, Math.min(rx - B.w, B.x));
            B.y = Math.max(ty, Math.min(by - B.h, B.y));
          }
        }
        if (!moved) break;
      }

      // Draw
      for (const rect of rects) {
        ctx.globalAlpha = labelAlpha * (hovered === null || hovered === rect.id ? 1 : 0.25);
        ctx.fillStyle = rect.color;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = "#000";
        rect.lines.forEach((line, li) => {
          ctx.fillText(line, rect.x + rect.w / 2, rect.y + padY + fontSize / 2 + li * (fontSize + lineGap));
        });
        labelBoxes.push({ cluster: rect.id, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      }
      ctx.globalAlpha = 1;

      // Watermark
      ctx.globalAlpha = labelAlpha * 0.55;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `${Math.max(11, Math.round(fontSize * 1.0))}px ${VT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("UMAP", lx + 3, ty + 3);
      ctx.globalAlpha = 1;
    }
  }

  // ── SEPARATOR ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(0,196,167,0.15)";
  ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(W * 0.04, tSneH); ctx.lineTo(W * 0.96, tSneH); ctx.stroke();

  // ── TIMELINE ZONE ───────────────────────────────────────────────────────────
  {
    const PAD_L = 0.10, PAD_R = 0.06;
    const lx = W * PAD_L,    rx = W * (1 - PAD_R);
    const ty = tSneH + lineH * 0.04;
    const by = H - lineH * 0.22;
    const sx = rx - lx, sy = by - ty;

    const pts = r.rolling;
    const N   = pts.length;
    if (N < 2) return;

    const revealN = Math.max(1, Math.ceil(progress * N));
    const px = (i: number) => lx + (i / (N - 1)) * sx;

    for (let kk = r.clusters.length - 1; kk >= 0; kk--) {
      const hex = CLUSTER_COLORS[kk].replace("#", "");
      const rr  = parseInt(hex.slice(0, 2), 16);
      const gg  = parseInt(hex.slice(2, 4), 16);
      const bb  = parseInt(hex.slice(4, 6), 16);

      const isHov     = hovered === kk;
      const fillAlpha = hovered === null ? 0.5 : isHov ? 0.8 : 0.08;
      const strkAlpha = hovered === null ? 0.7 : isHov ? 0.95 : 0.12;

      ctx.beginPath();
      for (let i = 0; i < revealN; i++) {
        let cumTop = 0; for (let q = 0; q <= kk; q++) cumTop += pts[i].proportions[q];
        const y = by - cumTop * sy;
        if (i === 0) ctx.moveTo(px(i), y); else ctx.lineTo(px(i), y);
      }
      for (let i = revealN - 1; i >= 0; i--) {
        let cumBot = 0; for (let q = 0; q < kk; q++) cumBot += pts[i].proportions[q];
        ctx.lineTo(px(i), by - cumBot * sy);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${rr},${gg},${bb},${fillAlpha})`;
      ctx.fill();

      ctx.strokeStyle = `rgba(${rr},${gg},${bb},${strkAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < revealN; i++) {
        let cumTop = 0; for (let q = 0; q <= kk; q++) cumTop += pts[i].proportions[q];
        const y = by - cumTop * sy;
        if (i === 0) ctx.moveTo(px(i), y); else ctx.lineTo(px(i), y);
      }
      ctx.stroke();
    }

    if (labelAlpha > 0) {
      ctx.globalAlpha = labelAlpha;
      const fs = Math.max(10, Math.round(W * 0.036));
      ctx.font = `${fs}px ${VT}`;

      ctx.setLineDash([2, 4]);
      for (const pct of [0.5, 1.0]) {
        const y = by - pct * sy;
        ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(rx, y); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(`${Math.round(pct * 100)}%`, lx - 2, y);
      }
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      let lastMo = -1;
      for (let i = 0; i < N; i++) {
        const mo = new Date(pts[i].date).getMonth();
        if (mo !== lastMo) { lastMo = mo; ctx.fillText(MONTH_ABBR[mo], px(i), by + 4); }
      }

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillText(`${ROLLING_WINDOW}D ROLL`, rx, ty + 2);

      ctx.globalAlpha = 1;
    }
  }
}

interface Props { result: ClusterResult | null }

export default function ClusterPanel({ result }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);
  const labelBoxesRef = useRef<LabelBox[]>([]);
  const hoveredRef    = useRef<number | null>(null);
  const animDoneRef   = useRef(false);
  const resultRef     = useRef<ClusterResult | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; cluster: number } | null>(null);

  useEffect(() => { resultRef.current = result; }, [result]);

  const redraw = useCallback(() => {
    const r = resultRef.current;
    if (!r || !animDoneRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFrame(ctx, W, H, r, labelBoxesRef.current, hoveredRef.current, 1, 1, 0);
  }, []);

  useEffect(() => {
    if (!result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelAnimationFrame(rafRef.current);
    animDoneRef.current = false;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const boxes: LabelBox[] = [];
    const REVEAL_DUR = 80, LABEL_START = 85;
    let frame = 0;

    function tick() {
      frame++;
      const progress   = Math.min(1, frame / REVEAL_DUR);
      const labelAlpha = Math.min(1, Math.max(0, (frame - LABEL_START) / 20));
      drawFrame(ctx, W, H, result!, boxes, hoveredRef.current, progress, labelAlpha, frame);
      if (!animDoneRef.current && progress >= 1 && labelAlpha >= 1) {
        labelBoxesRef.current = boxes;
        animDoneRef.current = true;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [result]);

  useEffect(() => {
    if (animDoneRef.current) redraw();
  }, [hovered, redraw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const domRect = canvas.getBoundingClientRect();
    const mx = e.clientX - domRect.left;
    const my = e.clientY - domRect.top;

    // 1. Check UMAP label boxes
    let found: number | null = null;
    for (const box of labelBoxesRef.current) {
      if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
        found = box.cluster;
        break;
      }
    }

    // 2. Check rolling window bands (mirror drawFrame timeline geometry)
    if (found === null) {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const tSneH = H * SPLIT;
      const lineH  = H - tSneH;
      const lxT = W * 0.10,          rxT = W * (1 - 0.06);
      const tyT = tSneH + lineH * 0.10, byT = H - lineH * 0.22;

      if (mx >= lxT && mx <= rxT && my >= tyT && my <= byT) {
        const r = resultRef.current;
        if (r && r.rolling.length > 1) {
          const N   = r.rolling.length;
          const idx = Math.max(0, Math.min(N - 1, Math.round((mx - lxT) / (rxT - lxT) * (N - 1))));
          const props = r.rolling[idx].proportions;
          const sy    = byT - tyT;
          for (let k = 0; k < props.length; k++) {
            let bot = 0; for (let q = 0; q < k; q++) bot += props[q];
            let top = 0; for (let q = 0; q <= k; q++) top += props[q];
            if (my >= byT - top * sy && my <= byT - bot * sy) { found = k; break; }
          }
        }
      }
    }

    if (found !== hoveredRef.current) {
      hoveredRef.current = found;
      setHovered(found);
    }
    if (found !== null) {
      const CW = canvas.clientWidth, CH = canvas.clientHeight;
      const TW = 260, TH = 200, M = 8;
      let tx = mx + 14;
      if (tx + TW > CW - M) tx = mx - TW - 14;
      tx = Math.max(M, Math.min(CW - TW - M, tx));
      const ty = Math.max(M, Math.min(CH - TH - M, my - 8));
      setTooltip({ x: tx, y: ty, cluster: found });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseLeave = () => {
    hoveredRef.current = null;
    setHovered(null);
    setTooltip(null);
  };

  if (!result) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: VT, fontSize: "0.9rem", letterSpacing: "2px",
        color: "rgba(255,255,255,0.15)", textTransform: "uppercase",
      }}>
        computing…
      </div>
    );
  }

  const hovCluster = tooltip !== null ? result.clusters[tooltip.cluster] : null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {tooltip && hovCluster && (
        <div style={{
          position: "absolute",
          left: tooltip.x,
          top: tooltip.y,
          background: "rgba(8,8,12,0.94)",
          border: `1px solid ${CLUSTER_COLORS[tooltip.cluster]}`,
          padding: "7px 11px",
          fontFamily: VT,
          fontSize: "0.85rem",
          letterSpacing: "1.5px",
          color: "rgba(255,255,255,0.75)",
          textTransform: "uppercase",
          pointerEvents: "none",
          zIndex: 20,
          lineHeight: 1.7,
          minWidth: "180px",
          maxWidth: "260px",
        }}>
          <div style={{ color: CLUSTER_COLORS[tooltip.cluster], marginBottom: "4px", fontSize: "0.95rem" }}>
            cluster {tooltip.cluster + 1}
          </div>
          {hovCluster.details.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div style={{ color: "rgba(255,255,255,0.25)", marginTop: "5px", fontSize: "0.75rem" }}>
            {hovCluster.size} days
          </div>
        </div>
      )}
    </div>
  );
}
