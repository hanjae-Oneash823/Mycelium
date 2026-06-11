import { useRef, useEffect, useState } from "react";
import { getEntries } from "../../../SleepTrackerPlugin/lib/sleepDb";
import { computeDebt, buildDebtInsights, findNeutralTarget } from "./sleepDebtMath";
import type { DebtResult } from "./sleepDebtMath";

const VT   = "'VT323', 'HBIOS-SYS', monospace";
const BLUE = "#60a5fa";
const AMBR = "#f0b030";
const RED  = "#f87171";
const GRN  = "#4ade80";

function hexAlpha(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: DebtResult,
  progress: number,
  labelAlpha: number,
  targetH: number,
): void {
  ctx.clearRect(0, 0, W, H);

  const { points, nights, tNow } = r;
  if (points.length === 0) return;

  const PAD_L = 0.09, PAD_R = 0.04, PAD_T = 0.07, PAD_B = 0.05;
  const leftX  = PAD_L * W;
  const rightX = (1 - PAD_R) * W;
  const topY   = PAD_T * H;
  const botY   = (1 - PAD_B) * H;
  const innerH = botY - topY;
  const spanX  = rightX - leftX;

  const sMidY = topY + innerH * 0.53;
  const dTopY = sMidY + innerH * 0.06;
  const sPanH = sMidY - topY;
  const dPanH = botY - dTopY;

  const tMin  = points[0].t;
  const tMax  = points[points.length - 1].t;
  const tSpan = tMax - tMin;

  const cx = (t: number) => leftX + ((t - tMin) / tSpan) * spanX;

  const tNowX = cx(Math.min(tNow, tMax));

  const cumDebs = nights.map(n => n.cumDebtH);
  const dMin = Math.min(...cumDebs, -2) - 1;
  const dMax = Math.max(...cumDebs,  2) + 1;
  const cyD   = (d: number) => botY - ((d - dMin) / (dMax - dMin)) * dPanH;
  const zeroY = cyD(0);

  // ── Bar chart scale ───────────────────────────────────────────────────────
  const barYMin = nights.length ? Math.min(...nights.map(n => n.onsetH)) - 0.3 : 20;
  const barYMax = nights.length ? Math.max(...nights.map(n => n.wakeH))  + 0.3 : 36;
  const cyBar   = (h: number) => topY + ((h - barYMin) / (barYMax - barYMin)) * sPanH;
  const dnxBar  = (n: typeof nights[0]) => cx(new Date(n.date).getTime() + 12 * 3_600_000);
  const barW    = Math.max(2, (spanX / Math.max(nights.length, 1)) * 0.65);

  // ── Sleep bars ────────────────────────────────────────────────────────────
  const barsN = Math.ceil(progress * nights.length);
  for (let i = 0; i < barsN; i++) {
    const n = nights[i];
    const bx = dnxBar(n);
    ctx.fillStyle = (n.debtH <= 0 ? GRN : RED) + hexAlpha(0.5);
    ctx.fillRect(bx - barW / 2, cyBar(n.onsetH), barW, cyBar(n.wakeH) - cyBar(n.onsetH));
  }

  // ── Today line ────────────────────────────────────────────────────────────
  if (tNowX <= rightX) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(tNowX, topY - 6);
    ctx.lineTo(tNowX, botY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Debt panel divider ────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, dTopY);
  ctx.lineTo(rightX, dTopY);
  ctx.stroke();

  // ── Debt zero line ────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, zeroY);
  ctx.lineTo(rightX, zeroY);
  ctx.stroke();

  // ── Debt fills + curve ────────────────────────────────────────────────────
  const revNightN = Math.ceil(progress * nights.length);
  const visNights = nights.slice(0, revNightN);

  if (visNights.length > 1) {
    const dnx = (n: typeof nights[0]) => cx(new Date(n.date).getTime() + 12 * 3_600_000);

    ctx.save();
    ctx.beginPath();
    ctx.rect(leftX, dTopY, spanX, zeroY - dTopY);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(dnx(visNights[0]), zeroY);
    for (const n of visNights) ctx.lineTo(dnx(n), cyD(n.cumDebtH));
    ctx.lineTo(dnx(visNights[visNights.length - 1]), zeroY);
    ctx.closePath();
    ctx.fillStyle = RED + hexAlpha(0.22);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(leftX, zeroY, spanX, botY - zeroY);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(dnx(visNights[0]), zeroY);
    for (const n of visNights) ctx.lineTo(dnx(n), cyD(n.cumDebtH));
    ctx.lineTo(dnx(visNights[visNights.length - 1]), zeroY);
    ctx.closePath();
    ctx.fillStyle = GRN + hexAlpha(0.22);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    visNights.forEach((n, i) => {
      const x = dnx(n), y = cyD(n.cumDebtH);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (progress >= 1) {
      const last = nights[nights.length - 1];
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth   = 1.2;
      ctx.beginPath();
      ctx.moveTo(dnx(last), cyD(last.cumDebtH));
      ctx.lineTo(cx(tMax), cyD(r.projectedDebt));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (labelAlpha <= 0) return;
  ctx.globalAlpha = labelAlpha;

  const fs = Math.max(9, Math.round(Math.min(W, H) * 0.032));
  ctx.font = `${fs}px ${VT}`;

  // ── Y labels (bar chart) ─────────────────────────────────────────────────
  const barFs = Math.max(11, Math.round(Math.min(W, H) * 0.042));
  ctx.font         = `${barFs}px ${VT}`;
  ctx.fillStyle    = "rgba(255,255,255,0.7)";
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  for (let h = Math.ceil(barYMin); h <= Math.floor(barYMax); h++) {
    if (h % 2 !== 0) continue;
    const clock = h % 24;
    const label = clock === 0 ? "12A" : clock > 12 ? `${clock - 12}P` : `${clock}A`;
    ctx.fillText(label, leftX - 8, cyBar(h));
  }
  ctx.font = `${fs}px ${VT}`;

  // ── Current debt label ────────────────────────────────────────────────────
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle    = r.currentDebt > 0 ? RED + hexAlpha(0.8) : GRN + hexAlpha(0.8);
  ctx.fillText(
    `${r.currentDebt > 0 ? "+" : ""}${r.currentDebt.toFixed(1)}H`,
    rightX - 4,
    zeroY - 9,
  );

  // ── TODAY label ───────────────────────────────────────────────────────────
  if (tNowX <= rightX - 28) {
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle    = "rgba(255,255,255,0.28)";
    ctx.fillText("TODAY", tNowX, topY - 1);
  }

  ctx.globalAlpha = 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onInsights: (lines: string[]) => void }

export default function SleepDebtCurve({ onInsights }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const rafRef         = useRef<number>(0);
  const initialAnimDone = useRef(false);
  const [entries, setEntries]   = useState<import("../../../SleepTrackerPlugin/lib/sleepDb").SleepEntry[]>([]);
  const [targetMin, setTargetMin] = useState(480); // 8h in minutes
  const [result, setResult]     = useState<DebtResult | null>(null);
  const [noData, setNoData]     = useState(false);

  // fetch once
  useEffect(() => {
    getEntries(90).then(e => {
      if (!e.length) { setNoData(true); return; }
      const neutralH = findNeutralTarget(e);
      setTargetMin(Math.round(neutralH * 60 / 5) * 5); // snap to 5-min step
      setEntries(e);
    });
  }, []);

  // recompute when entries or targetMin changes
  useEffect(() => {
    if (!entries.length) return;
    const r = computeDebt(entries, targetMin / 60);
    if (!r) { setNoData(true); return; }
    setResult(r);
    onInsights(buildDebtInsights(r));
  }, [entries, targetMin]);

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

    if (initialAnimDone.current) {
      drawFrame(ctx, W, H, result, 1, 1, targetMin / 60);
      return;
    }

    let frame = 0;
    function tick() {
      frame++;
      const progress   = Math.min(1, frame / 110);
      const labelAlpha = Math.min(1, Math.max(0, (frame - 120) / 20));
      drawFrame(ctx, W, H, result!, progress, labelAlpha, targetMin / 60);
      if (progress < 1 || labelAlpha < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        initialAnimDone.current = true;
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
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <style>{`
        .debt-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 3px;
          background: rgba(248,113,113,0.25);
          outline: none;
          cursor: pointer;
        }
        .debt-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #f87171;
          border: 2px solid rgba(255,255,255,0.6);
          cursor: pointer;
        }
        .debt-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #f87171;
          border: 2px solid rgba(255,255,255,0.6);
          cursor: pointer;
        }
      `}</style>
      <canvas ref={canvasRef} style={{ width: "100%", flex: 1, display: "block", minHeight: 0 }} />
      <div style={{
        padding: "6px 10px 8px",
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(0,0,0,0.25)",
      }}>
        <span style={{ fontFamily: VT, fontSize: "0.85rem", letterSpacing: "1px", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
          GOAL
        </span>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <input
            type="range"
            className="debt-slider"
            value={targetMin}
            min={360} max={540} step={5}
            onChange={e => setTargetMin(parseInt(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 7px", marginTop: "2px" }}>
            {[360, 420, 480, 540].map(m => (
              <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <div style={{ width: "1px", height: "5px", background: "rgba(248,113,113,0.45)" }} />
                <span style={{ fontFamily: VT, fontSize: "0.7rem", letterSpacing: "0.5px", color: "rgba(255,255,255,0.3)" }}>
                  {m / 60}h
                </span>
              </div>
            ))}
          </div>
        </div>
        <span style={{ fontFamily: VT, fontSize: "0.95rem", letterSpacing: "1px", color: "#f87171", whiteSpace: "nowrap", minWidth: "4rem", textAlign: "right" }}>
          {Math.floor(targetMin / 60)}h {String(targetMin % 60).padStart(2, "0")}m
        </span>
      </div>
    </div>
  );
}
