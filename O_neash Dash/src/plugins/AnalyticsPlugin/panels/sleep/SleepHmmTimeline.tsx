import { useRef, useEffect, useState } from "react";
import type { SleepEntry } from "../../../SleepTrackerPlugin/lib/sleepDb";
import { getEntries } from "../../../SleepTrackerPlugin/lib/sleepDb";
import { computeHmm, buildHmmInsights } from "./sleepHmmMath";
import type { HmmResult } from "./sleepHmmMath";

const VT = "'VT323', 'HBIOS-SYS', monospace";

function hexAlpha(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
}

function fmtOnset(x: number): string {
  const h   = (x + 20) % 24;
  const h12 = Math.floor(h) % 12 || 12;
  const suf = Math.floor(h) >= 12 ? "PM" : "AM";
  return `${h12}${suf}`;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: HmmResult,
  progress: number,
  labelAlpha: number,
  hoveredState: number | null,
): void {
  ctx.clearRect(0, 0, W, H);

  const { nights, states, stateColors, stateLabels, stateDescriptors, k } = r;
  const T = nights.length;
  if (T === 0) return;

  const PAD_L  = 0.1;
  const PAD_R  = 0.04;
  const PAD_T  = 0.09;
  const PAD_B  = 0.28;
  const leftX  = PAD_L * W;
  const rightX = (1 - PAD_R) * W;
  const topY   = PAD_T * H;
  const botY   = (1 - PAD_B) * H;
  const spanX  = rightX - leftX;
  const spanY  = botY - topY;

  const onsets  = nights.map(n => n.onsetX);
  const oMin    = Math.min(...onsets) - 0.4;
  const oMax    = Math.max(...onsets) + 0.4;
  const barStep = T > 1 ? spanX / (T - 1) : spanX;

  const cx = (i: number) => leftX + (T > 1 ? (i / (T - 1)) * spanX : spanX / 2);
  const cy = (x: number) => botY - ((x - oMin) / (oMax - oMin)) * spanY;

  const revealedT = Math.min(T, Math.ceil(progress * T));

  // ── state background strips ──────────────────────────────────────────────
  {
    let rStart = 0;
    for (let i = 1; i <= T; i++) {
      if (i === T || states[i] !== states[rStart]) {
        const end = Math.min(i - 1, revealedT - 1);
        if (end >= rStart) {
          const x1    = cx(rStart) - barStep * 0.5;
          const x2    = cx(end)    + barStep * 0.5;
          const dimmed = hoveredState !== null && hoveredState !== states[rStart];
          ctx.fillStyle = stateColors[states[rStart]] + hexAlpha(dimmed ? 0.04 : 0.18);
          ctx.fillRect(x1, topY, x2 - x1, spanY);
        }
        rStart = i;
      }
    }
  }

  // ── connecting line ──────────────────────────────────────────────────────
  for (let i = 1; i < revealedT; i++) {
    ctx.beginPath();
    ctx.moveTo(cx(i - 1), cy(nights[i - 1].onsetX));
    ctx.lineTo(cx(i),     cy(nights[i].onsetX));
    const lineDim = hoveredState !== null && hoveredState !== states[i];
    ctx.strokeStyle = stateColors[states[i]] + hexAlpha(lineDim ? 0.07 : 0.38);
    ctx.lineWidth   = 1.2;
    ctx.stroke();
  }

  // ── dots ─────────────────────────────────────────────────────────────────
  for (let i = 0; i < revealedT; i++) {
    const dotDim = hoveredState !== null && hoveredState !== states[i];
    ctx.beginPath();
    ctx.arc(cx(i), cy(nights[i].onsetX), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = stateColors[states[i]] + hexAlpha(dotDim ? 0.15 : 0.88);
    ctx.fill();
  }

  // ── transition ticks ─────────────────────────────────────────────────────
  for (let i = 1; i < revealedT; i++) {
    if (states[i] !== states[i - 1]) {
      const tx = (cx(i - 1) + cx(i)) / 2;
      ctx.beginPath();
      ctx.moveTo(tx, topY - 4);
      ctx.lineTo(tx, topY + 6);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
  }

  if (labelAlpha <= 0) return;

  const fs = Math.max(9, Math.round(Math.min(W, H) * 0.034));
  ctx.globalAlpha = labelAlpha;

  // ── Y-axis labels ────────────────────────────────────────────────────────
  ctx.font         = `${fs}px ${VT}`;
  ctx.fillStyle    = "rgba(255,255,255,0.52)";
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  for (let x = Math.ceil(oMin); x <= Math.floor(oMax); x++) {
    ctx.fillText(fmtOnset(x), leftX - 5, cy(x));
  }

  // ── legend (2-column, 2 lines per item) ─────────────────────────────────
  const legFs    = Math.max(9, Math.round(Math.min(W, H) * 0.034));
  const legLineH = legFs * 3.2;
  const rowsPer  = Math.ceil(k / 2);
  const colW     = spanX / 2;
  const legTopY  = botY + (PAD_B * H - rowsPer * legLineH) / 2;
  const descFs   = Math.max(8, legFs - 1);

  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";

  for (let ki = 0; ki < k; ki++) {
    const col   = Math.floor(ki / rowsPer);
    const row   = ki % rowsPer;
    const lx    = leftX + col * colW;
    const ly1   = legTopY + row * legLineH + legFs * 0.8;
    const ly2   = legTopY + row * legLineH + legFs * 2.2;
    const count = states.filter(s => s === ki).length;
    const pct   = Math.round((count / T) * 100);
    const dim   = hoveredState !== null && hoveredState !== ki;

    ctx.globalAlpha = labelAlpha * (dim ? 0.2 : 1.0);

    ctx.font = `${legFs}px ${VT}`;
    ctx.beginPath();
    ctx.arc(lx + 5, ly1, 4, 0, Math.PI * 2);
    ctx.fillStyle = stateColors[ki];
    ctx.fill();
    ctx.fillStyle = stateColors[ki];
    ctx.fillText(`${stateLabels[ki]} · ${pct}%`, lx + 14, ly1);

    ctx.font      = `${descFs}px ${VT}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(stateDescriptors[ki], lx + 14, ly2);
  }

  ctx.globalAlpha = 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onInsights: (lines: string[]) => void }

export default function SleepHmmTimeline({ onInsights }: Props) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const rafRef          = useRef<number>(0);
  const hoveredStateRef = useRef<number | null>(null);

  const [entries, setEntries]   = useState<SleepEntry[]>([]);
  const [kCount, setKCount]     = useState(2);
  const [result, setResult]     = useState<HmmResult | null>(null);
  const [noData, setNoData]     = useState(false);

  // fetch once
  useEffect(() => {
    getEntries(90).then(e => {
      if (!e.length) { setNoData(true); return; }
      setEntries(e);
    });
  }, []);

  // recompute when entries or kCount changes
  useEffect(() => {
    if (!entries.length) return;
    const r = computeHmm(entries, kCount);
    if (!r) { setNoData(true); return; }
    setResult(r);
    onInsights(buildHmmInsights(r));
  }, [entries, kCount]);

  // redraw animation when result changes
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
    const REVEAL_DUR  = 90;
    const LABEL_START = 100;
    let frame = 0;

    function tick() {
      frame++;
      const progress   = Math.min(1, frame / REVEAL_DUR);
      const labelAlpha = Math.min(1, Math.max(0, (frame - LABEL_START) / 25));
      drawFrame(ctx, W, H, result!, progress, labelAlpha, hoveredStateRef.current);
      rafRef.current = requestAnimationFrame(tick);
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const rect   = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W  = canvas.clientWidth;
    const H  = W;
    const PAD_L = 0.1, PAD_R = 0.04, PAD_B = 0.28;
    const leftX  = PAD_L * W;
    const rightX = (1 - PAD_R) * W;
    const botY   = (1 - PAD_B) * H;
    const spanX  = rightX - leftX;
    const legFs    = Math.max(9, Math.round(Math.min(W, H) * 0.034));
    const legLineH = legFs * 3.2;
    const rowsPer  = Math.ceil(result.k / 2);
    const colW     = spanX / 2;
    const legTopY  = botY + (PAD_B * H - rowsPer * legLineH) / 2;

    let hit: number | null = null;
    for (let ki = 0; ki < result.k; ki++) {
      const col = Math.floor(ki / rowsPer);
      const row = ki % rowsPer;
      const lx  = leftX + col * colW;
      if (mx >= lx && mx <= lx + colW &&
          my >= legTopY + row * legLineH &&
          my <= legTopY + (row + 1) * legLineH) {
        hit = ki;
        break;
      }
    }
    hoveredStateRef.current = hit;
    if (containerRef.current) {
      containerRef.current.style.cursor = hit !== null ? "pointer" : "default";
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { hoveredStateRef.current = null; }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {/* K selector */}
      <div style={{
        position: "absolute", top: 7, left: 8,
        display: "flex", gap: 3,
      }}>
        {[2, 3, 4].map(n => (
          <button
            key={n}
            onClick={() => setKCount(n)}
            style={{
              fontFamily: VT,
              fontSize: "0.85rem",
              letterSpacing: "1px",
              padding: "1px 7px",
              border: `1px solid ${kCount === n ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)"}`,
              background: kCount === n ? "rgba(255,255,255,0.12)" : "transparent",
              color: kCount === n ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
              cursor: "pointer",
              transition: "all 0.12s",
              lineHeight: 1.4,
              borderRadius: 0,
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
