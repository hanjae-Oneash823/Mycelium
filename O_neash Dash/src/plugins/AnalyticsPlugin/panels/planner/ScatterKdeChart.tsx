import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import type { ChronoResult, ChronoPoint } from "./chronoMath";

const CX = 180;
const CY = 180;
const INNER_R = 52;
const BAR_RANGE = 94;
const OUTER_R = INNER_R + BAR_RANGE;   // 146 — dot scatter ceiling / ring boundary
const KDE_OUTER = OUTER_R - 32;        // 114 — KDE peak stays below dot band (dots start at 120)
const BAR_MAX = OUTER_R - 28;          // 118 — bar max height, below dot cloud
const LABEL_R = OUTER_R + 18;          // 164 — labels outside dot cloud
const KEY_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const MAX_DOTS = 600;

const ANIM_CSS = `
  @keyframes cf-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes cf-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
  @keyframes cf-pop  { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }
  @keyframes cf-ring { from { transform: scale(0.5); opacity: 0 } to { transform: scale(1); opacity: 1 } }
  @keyframes cf-wiggle-a {
    0%,100% { transform: translate(0px,0px) }
    30%     { transform: translate(1.4px,-1.0px) }
    65%     { transform: translate(-0.9px,1.2px) }
  }
  @keyframes cf-wiggle-b {
    0%,100% { transform: translate(0px,0px) }
    35%     { transform: translate(-1.2px,0.8px) }
    70%     { transform: translate(1.0px,-1.3px) }
  }
  @keyframes cf-wiggle-c {
    0%,100% { transform: translate(0px,0px) }
    25%     { transform: translate(0.7px,1.5px) }
    75%     { transform: translate(-1.1px,-0.7px) }
  }
`;

function toXY(a: number, r: number): [number, number] {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function svgA(theta: number): number { return theta - Math.PI / 2; }
function anim(name: string, dur: number, delay: number, ease = "ease-out"): CSSProperties {
  return { animation: `${name} ${dur}ms ${ease} ${delay}ms both` };
}
function rand(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function barPath(h: number, innerR: number, outerR: number): string {
  const GAP = 1.0;
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

const OverallBars = memo(function OverallBars({ hourBins, maxBin, peaks }: {
  hourBins: number[]; maxBin: number; peaks: ChronoResult["peaks"];
}) {
  return (
    <>
      {hourBins.map((count, h) => {
        if (count === 0) return null;
        const barH = (count / maxBin) * (BAR_MAX - INNER_R);
        const isPeakH = peaks.some(
          (p) => Math.floor(((p.theta / (2 * Math.PI)) * 24 + 24) % 24) === h,
        );
        return (
          <path key={h} d={barPath(h, INNER_R, INNER_R + 0.5)}
            fill={isPeakH ? "rgba(0,196,167,0.45)" : "rgba(255,255,255,0.11)"}>
            <animate attributeName="d"
              from={barPath(h, INNER_R, INNER_R + 0.5)}
              to={barPath(h, INNER_R, INNER_R + barH)}
              dur="400ms" begin={`${300 + h * 10}ms`} fill="freeze"
              calcMode="spline" keyTimes="0;1" keySplines="0.25 0.1 0.25 1" />
          </path>
        );
      })}
    </>
  );
});

interface Props {
  result: ChronoResult;
  points: ChronoPoint[];
}

export default function ScatterKdeChart({ result, points }: Props) {
  const { evalAngles, kde, peaks, hourBins } = result;
  const maxKde = Math.max(...kde) || 1;
  const maxBin = Math.max(...hourBins, 1);

  const dots = useMemo(() => {
    const now = Date.now();
    const MS30 = 30 * 86_400_000;
    const src = points.length > MAX_DOTS
      ? points.filter((_, i) => i % Math.ceil(points.length / MAX_DOTS) === 0)
      : points;
    return src.map((p, i) => {
      const r = OUTER_R - rand(p.theta, i) * 26;
      const [x, y] = toXY(svgA(p.theta), r);
      const color = p.timestamp >= now - MS30
        ? "rgba(0,196,167,0.82)"
        : p.timestamp >= now - 2 * MS30
        ? "rgba(0,196,167,0.42)"
        : "rgba(0,196,167,0.18)";
      const delay = 320 + Math.floor(rand(i, p.theta) * 650);
      return { x, y, color, delay };
    });
  }, [points]);

  const kdeArea = evalAngles.map((theta, i) => {
    const r = INNER_R + (kde[i] / maxKde) * (KDE_OUTER - INNER_R);
    const [x, y] = toXY(svgA(theta), r);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";

  return (
    <svg viewBox="0 0 360 360" width="100%" height="100%" style={{ display: "block" }}>
      <defs><style>{ANIM_CSS}</style></defs>

      {/* Background rings */}
      <g style={{ transformOrigin: `${CX}px ${CY}px`, ...anim("cf-ring", 500, 0) }}>
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} cx={CX} cy={CY} r={INNER_R + f * BAR_RANGE}
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={0.6} />
        ))}
        <circle cx={CX} cy={CY} r={INNER_R}
          fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.0} />
      </g>

      {/* Spokes */}
      <g style={anim("cf-fade", 350, 150)}>
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

      {/* Hour bars */}
      <OverallBars hourBins={hourBins} maxBin={maxBin} peaks={peaks} />

      {/* KDE glow fill */}
      <path d={kdeArea} fill="rgba(0,196,167,0.07)" stroke="none"
        style={anim("cf-fade", 800, 180)} />

      {/* KDE outline */}
      <path d={kdeArea} fill="none" stroke="rgba(0,196,167,0.55)" strokeWidth={1.3}
        strokeLinejoin="round" pathLength={1}
        style={{ strokeDasharray: 1, ...anim("cf-draw", 950, 220, "cubic-bezier(0.4,0,0.2,1)") }} />

      {/* Scatter dots */}
      {dots.map((d, i) => {
        const WIGGLE_NAMES = ["cf-wiggle-a", "cf-wiggle-b", "cf-wiggle-c"] as const;
        const wName  = WIGGLE_NAMES[Math.floor(rand(i * 7, 13) * 3)];
        const wDur   = (3.5 + rand(i * 11, 17) * 2.5).toFixed(1);
        const wDelay = (-(rand(i * 13, 19) * parseFloat(wDur))).toFixed(1);
        return (
          <circle key={i} cx={d.x} cy={d.y} r={1.5}
            fill={d.color}
            style={{ animation: `cf-fade 180ms ease-out ${d.delay}ms both, ${wName} ${wDur}s ease-in-out ${wDelay}s infinite` }} />
        );
      })}

      {/* Peak markers */}
      {peaks.map((p, i) => {
        const [x, y] = toXY(svgA(p.theta), OUTER_R + 8);
        return (
          <circle key={i} cx={x} cy={y}
            r={p.isPrimary ? 4.5 : 2.5}
            fill={p.isPrimary ? "#f5c842" : "rgba(255,255,255,0.42)"}
            style={{ transformBox: "fill-box", transformOrigin: "center",
              ...anim("cf-pop", 220, 1200 + i * 60) }} />
        );
      })}

      {/* Hour labels */}
      <g style={anim("cf-fade", 400, 920)}>
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
        style={anim("cf-fade", 300, 80)} />
    </svg>
  );
}
