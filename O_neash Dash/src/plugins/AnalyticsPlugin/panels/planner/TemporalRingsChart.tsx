import { memo } from "react";
import type { CSSProperties } from "react";
import type { ChronoResult, RingSlice } from "./chronoMath";

const CX = 180;
const CY = 180;
const INNER_R = 42;
const BAND_H = 36;
const OUTER_R = INNER_R + 3 * BAND_H; // 150
const LABEL_R = OUTER_R + 16;         // 166
const KEY_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

// index 0 = most recent (outermost), 2 = oldest (innermost)
const RING_STYLE = [
  { barFill: "rgba(0,196,167,0.50)", kde: "#00c4a7",               peak: "#f5c842",                label: "NOW" },
  { barFill: "rgba(0,196,167,0.25)", kde: "rgba(0,196,167,0.60)",  peak: "rgba(245,200,66,0.55)",  label: "30D" },
  { barFill: "rgba(0,196,167,0.11)", kde: "rgba(0,196,167,0.32)",  peak: "rgba(245,200,66,0.28)",  label: "60D" },
] as const;

const ANIM_CSS = `
  @keyframes cf-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes cf-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
  @keyframes cf-pop  { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }
  @keyframes cf-ring { from { transform: scale(0.5); opacity: 0 } to { transform: scale(1); opacity: 1 } }
`;

function toXY(a: number, r: number): [number, number] {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function svgA(theta: number): number { return theta - Math.PI / 2; }
function ringInner(i: number): number { return INNER_R + (2 - i) * BAND_H; }
function ringOuter(i: number): number { return ringInner(i) + BAND_H; }

function barPath(h: number, innerR: number, outerR: number): string {
  const GAP = 0.82;
  const s = (h / 24) * 2 * Math.PI;
  const e = ((h + GAP) / 24) * 2 * Math.PI;
  const [x1, y1] = toXY(svgA(s), innerR);
  const [x2, y2] = toXY(svgA(s), outerR);
  const [x3, y3] = toXY(svgA(e), outerR);
  const [x4, y4] = toXY(svgA(e), innerR);
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `L ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 0 1 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `L ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 0 0 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`,
  ].join(" ");
}

function anim(name: string, dur: number, delay: number, ease = "ease-out"): CSSProperties {
  return { animation: `${name} ${dur}ms ${ease} ${delay}ms both` };
}

function RingKde({ slice, ringIdx, delay }: { slice: RingSlice; ringIdx: number; delay: number }) {
  const inner = ringInner(ringIdx);
  const maxK = Math.max(...slice.kde) || 1;
  const d = slice.kde.map((v, i) => {
    const theta = (i / slice.kde.length) * 2 * Math.PI;
    const r = inner + (v / maxK) * BAND_H;
    const [x, y] = toXY(svgA(theta), r);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
  return (
    <path d={d} fill="none" stroke={RING_STYLE[ringIdx].kde} strokeWidth={1.2}
      strokeLinejoin="round" pathLength={1}
      style={{ strokeDasharray: 1, ...anim("cf-draw", 900, delay, "cubic-bezier(0.4,0,0.2,1)") }} />
  );
}

const RingBars = memo(function RingBars({ slice, ringIdx }: { slice: RingSlice; ringIdx: number }) {
  const inner = ringInner(ringIdx);
  const maxBin = Math.max(...slice.hourBins, 1);
  const baseDelay = 200 + (2 - ringIdx) * 50;
  return (
    <>
      {slice.hourBins.map((count, h) => {
        if (count === 0) return null;
        const barH = (count / maxBin) * BAND_H;
        const delay = baseDelay + h * 8;
        return (
          <path key={h} d={barPath(h, inner, inner + 0.5)} fill={RING_STYLE[ringIdx].barFill}>
            <animate attributeName="d"
              from={barPath(h, inner, inner + 0.5)}
              to={barPath(h, inner, inner + barH)}
              dur="380ms" begin={`${delay}ms`} fill="freeze"
              calcMode="spline" keyTimes="0;1" keySplines="0.25 0.1 0.25 1" />
          </path>
        );
      })}
    </>
  );
});

interface Props { result: ChronoResult }

export default function TemporalRingsChart({ result }: Props) {
  const { rings } = result;

  // Drift connector: dashed line from oldest peak → mid → recent
  const peakPts = ([2, 1, 0] as const).map((i) => {
    const p = rings[i].peaks[0];
    return p ? toXY(svgA(p.theta), ringOuter(i) - 3) : null;
  });
  const allPeaks = peakPts.every(Boolean);

  return (
    <svg viewBox="0 0 360 360" width="100%" height="100%" style={{ display: "block" }}>
      <defs><style>{ANIM_CSS}</style></defs>

      {/* Ring separator circles */}
      <g style={{ transformOrigin: `${CX}px ${CY}px`, ...anim("cf-ring", 500, 0) }}>
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={CX} cy={CY} r={INNER_R + i * BAND_H}
            fill="none"
            stroke={i === 0 ? "rgba(255,255,255,0.55)" : i === 3 ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.05)"}
            strokeWidth={i === 0 ? 1.0 : i === 3 ? 0.8 : 0.5} />
        ))}
      </g>

      {/* Spokes */}
      <g style={anim("cf-fade", 350, 200)}>
        {Array.from({ length: 24 }, (_, h) => {
          const a = svgA((h / 24) * 2 * Math.PI);
          const [xi, yi] = toXY(a, INNER_R);
          const [xo, yo] = toXY(a, OUTER_R + 4);
          return (
            <line key={h} x1={xi} y1={yi} x2={xo} y2={yo}
              stroke={h === 0 ? "rgba(200,50,50,0.80)" : KEY_HOURS.includes(h) ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}
              strokeWidth={h === 0 ? 1.0 : KEY_HOURS.includes(h) ? 0.8 : 0.6} />
          );
        })}
      </g>

      {/* Bars: oldest renders first (below recent) */}
      {([2, 1, 0] as const).map((i) => (
        <RingBars key={i} slice={rings[i]} ringIdx={i} />
      ))}

      {/* KDE curves: oldest first */}
      {([2, 1, 0] as const).map((i) =>
        rings[i].kde.some((v) => v > 0) ? (
          <RingKde key={i} slice={rings[i]} ringIdx={i} delay={480 + (2 - i) * 130} />
        ) : null
      )}

      {/* Drift connector through primary peaks oldest→recent */}
      {allPeaks && (
        <polyline
          points={peakPts.map((p) => `${p![0].toFixed(1)},${p![1].toFixed(1)}`).join(" ")}
          fill="none" stroke="rgba(245,200,66,0.28)" strokeWidth={0.8}
          strokeDasharray="2 3"
          style={anim("cf-fade", 500, 1150)} />
      )}

      {/* Peak markers per ring, recent largest */}
      {([0, 1, 2] as const).map((i) => {
        const p = rings[i].peaks[0];
        if (!p) return null;
        const [x, y] = toXY(svgA(p.theta), ringOuter(i) - 3);
        return (
          <circle key={i} cx={x} cy={y}
            r={i === 0 ? 4 : i === 1 ? 3 : 2}
            fill={RING_STYLE[i].peak}
            style={{ transformBox: "fill-box", transformOrigin: "center",
              ...anim("cf-pop", 200, 1000 + (2 - i) * 80) }} />
        );
      })}

      {/* Ring labels at ~1:30am — typically low-data zone */}
      {([0, 1, 2] as const).map((i) => {
        const [x, y] = toXY(svgA((1.5 / 24) * 2 * Math.PI), ringInner(i) + BAND_H * 0.5);
        return (
          <text key={i} x={x} y={y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={7.5} fontFamily="'VT323','HBIOS-SYS',monospace"
            fill={i === 0 ? "rgba(0,196,167,0.65)" : "rgba(255,255,255,0.2)"}
            letterSpacing={0.5}
            style={anim("cf-fade", 300, 850 + i * 60)}>
            {RING_STYLE[i].label}
          </text>
        );
      })}

      {/* Hour labels */}
      <g style={anim("cf-fade", 400, 750)}>
        {KEY_HOURS.map((h) => {
          const [x, y] = toXY(svgA((h / 24) * 2 * Math.PI), LABEL_R);
          return (
            <g key={h}>
              {h % 6 === 0
                ? <rect x={x - 10} y={y - 7} width={20} height={14} fill="#f5c842" />
                : <rect x={x - 8.5} y={y - 6} width={17} height={12} fill="rgba(245,200,66,0.5)" />}
              <text x={x} y={y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={h % 6 === 0 ? 14 : 12} fontFamily="'VT323','HBIOS-SYS',monospace"
                fill="black" letterSpacing={1}>
                {h === 0 ? "00" : String(h).padStart(2, "0")}
              </text>
            </g>
          );
        })}
      </g>

      <circle cx={CX} cy={CY} r={2.5} fill="rgba(255,255,255,0.1)"
        style={anim("cf-fade", 300, 100)} />
    </svg>
  );
}
