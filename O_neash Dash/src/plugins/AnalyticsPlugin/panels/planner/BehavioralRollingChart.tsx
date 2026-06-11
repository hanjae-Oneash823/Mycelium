import { useRef, useEffect } from "react";
import type { StateSpaceResult } from "./behaviorMath";

const VT = "'VT323', 'HBIOS-SYS', monospace";

interface Props {
  result: StateSpaceResult | null;
}

export default function BehavioralRollingChart({ result }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    let rafId: number;
    let progress = 0;

    function draw(prog: number) {
      if (!result || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = canvas.width  / dpr;
      const H = canvas.height / dpr;
      const { rolling, clusterColors, clusterLabels } = result;
      const N = rolling.length;
      const k = clusterColors.length;
      if (N < 2) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const PAD_L = 0.055, PAD_R = 0.015, PAD_T = 0.06, PAD_B = 0.26;
      const lx = W * PAD_L, rx = W * (1 - PAD_R);
      const ty = H * PAD_T, by = H * (1 - PAD_B);
      const sx = rx - lx, sy = by - ty;

      const revealN = Math.max(2, Math.ceil(prog * N));
      const px = (i: number) => lx + (i / (N - 1)) * sx;

      // Stacked area — draw from top cluster down so lower ones render on top
      for (let kk = k - 1; kk >= 0; kk--) {
        const color = clusterColors[kk];
        const hex   = color.replace("#", "");
        const rr    = parseInt(hex.slice(0, 2), 16);
        const gg    = parseInt(hex.slice(2, 4), 16);
        const bb    = parseInt(hex.slice(4, 6), 16);

        ctx.beginPath();
        for (let i = 0; i < revealN; i++) {
          let top = 0;
          for (let q = 0; q <= kk; q++) top += rolling[i].proportions[q];
          const y = by - top * sy;
          if (i === 0) ctx.moveTo(px(i), y); else ctx.lineTo(px(i), y);
        }
        for (let i = revealN - 1; i >= 0; i--) {
          let bot = 0;
          for (let q = 0; q < kk; q++) bot += rolling[i].proportions[q];
          ctx.lineTo(px(i), by - bot * sy);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${rr},${gg},${bb},0.42)`;
        ctx.fill();

        ctx.beginPath();
        for (let i = 0; i < revealN; i++) {
          let top = 0;
          for (let q = 0; q <= kk; q++) top += rolling[i].proportions[q];
          const y = by - top * sy;
          if (i === 0) ctx.moveTo(px(i), y); else ctx.lineTo(px(i), y);
        }
        ctx.strokeStyle = `rgba(${rr},${gg},${bb},0.65)`;
        ctx.lineWidth   = 1;
        ctx.stroke();
      }

      // 50% / 100% gridlines
      const fs = Math.round(H * 0.19);
      ctx.font = `${fs}px ${VT}`;
      for (const pct of [0.5, 1.0]) {
        const y = by - pct * sy;
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(rx, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle    = "rgba(255,255,255,0.28)";
        ctx.textAlign    = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${Math.round(pct * 100)}%`, lx - 3, y);
      }
      ctx.setLineDash([]);

      // Month labels
      ctx.fillStyle    = "rgba(255,255,255,0.28)";
      ctx.textAlign    = "center";
      ctx.textBaseline = "top";
      let lastMo = "";
      for (let i = 0; i < N; i++) {
        const mo = new Date(rolling[i].date).toLocaleString("default", { month: "short" }).toUpperCase();
        if (mo !== lastMo) {
          ctx.fillText(mo, px(i), by + 2);
          lastMo = mo;
        }
      }

      // Cluster name labels pinned to right edge at their midpoint proportion
      if (prog >= 1) {
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        const last = rolling[N - 1];
        let cumBot = 0;
        for (let c = 0; c < k; c++) {
          const prop = last.proportions[c];
          if (prop > 0.05) {
            const midY = by - (cumBot + prop / 2) * sy;
            ctx.fillStyle = clusterColors[c];
            ctx.fillText(clusterLabels[c].split(" ")[0], rx + 4, midY);
          }
          cumBot += prop;
        }
      }

      ctx.restore();
    }

    function animate() {
      progress = Math.min(1, progress + 1 / 60);
      canvas!.width  = container!.clientWidth  * dpr;
      canvas!.height = container!.clientHeight * dpr;
      draw(progress);
      if (progress < 1) rafId = requestAnimationFrame(animate);
    }

    const obs = new ResizeObserver(() => {
      canvas.width  = container.clientWidth  * dpr;
      canvas.height = container.clientHeight * dpr;
      draw(progress);
    });
    obs.observe(container);

    rafId = requestAnimationFrame(animate);
    return () => { obs.disconnect(); cancelAnimationFrame(rafId); };
  }, [result]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {!result && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontFamily: VT, fontSize: "0.8rem", letterSpacing: "2px",
          color: "rgba(255,255,255,0.1)", textTransform: "uppercase",
          pointerEvents: "none",
        }}>
          computing…
        </div>
      )}
    </div>
  );
}
