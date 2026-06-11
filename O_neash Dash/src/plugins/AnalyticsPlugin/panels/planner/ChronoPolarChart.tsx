import { memo } from "react";
import type { CSSProperties } from "react";
import type { ChronoResult, ArcFingerprint } from "./chronoMath";

const CX = 180;
const CY = 180;
const INNER_R = 52;
const OUTER_R = 148;
const BAR_RANGE = OUTER_R - INNER_R;
const ARC_KDE_RANGE = OUTER_R - 32 - INNER_R; // 64 — KDE peak at 116, dots start at 122
const LABEL_R = OUTER_R + 16;
const KEY_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

const ANIM_CSS = `
  @keyframes cf-fade { from { opacity: 0 }                        to { opacity: 1 } }
  @keyframes cf-draw { from { stroke-dashoffset: 1 }              to { stroke-dashoffset: 0 } }
  @keyframes cf-pop  { from { transform: scale(0); opacity: 0 }   to { transform: scale(1); opacity: 1 } }
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

function toXY(angleRad: number, r: number): [number, number] {
  return [CX + r * Math.cos(angleRad), CY + r * Math.sin(angleRad)];
}

function svgAngle(theta: number): number {
  return theta - Math.PI / 2;
}

function barSegmentPath(h: number, innerR: number, outerR: number): string {
  const GAP = 1.0;
  const startT = (h / 24) * 2 * Math.PI;
  const endT   = ((h + GAP) / 24) * 2 * Math.PI;
  const [x1, y1] = toXY(svgAngle(startT), innerR);
  const [x2, y2] = toXY(svgAngle(startT), outerR);
  const [x3, y3] = toXY(svgAngle(endT), outerR);
  const [x4, y4] = toXY(svgAngle(endT), innerR);
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `L ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 0 1 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `L ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 0 0 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`,
  ].join(" ");
}

function anim(name: string, duration: number, delay: number, easing = "ease-out"): CSSProperties {
  return { animation: `${name} ${duration}ms ${easing} ${delay}ms both` };
}
function rand(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function KdeCurve({
  evalAngles, kde, maxKde, color, opacity = 1, delay = 0, rangeR = BAR_RANGE,
}: {
  evalAngles: number[]; kde: number[]; maxKde: number;
  color: string; opacity?: number; delay?: number; rangeR?: number;
}) {
  const d = evalAngles
    .map((theta, i) => {
      const r = INNER_R + (maxKde > 0 ? kde[i] / maxKde : 0) * rangeR;
      const [x, y] = toXY(svgAngle(theta), r);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ") + " Z";
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      opacity={opacity}
      strokeLinejoin="round"
      pathLength={1}
      style={{ strokeDasharray: 1, ...anim("cf-draw", 900, delay, "cubic-bezier(0.4,0,0.2,1)") }}
    />
  );
}

// Memoized so view-mode toggles (showArcs/showSession) don't re-render bars
// and reset React's `d` prop, which would fight the SMIL freeze state.
const HourBars = memo(function HourBars({
  hourBins, maxBin, peaks,
}: {
  hourBins: number[]; maxBin: number; peaks: ChronoResult["peaks"];
}) {
  return (
    <>
      {hourBins.map((count, h) => {
        if (count === 0) return null;
        const barH = (count / maxBin) * BAR_RANGE;
        const isPeakH = peaks.some(
          (p) => Math.floor(((p.theta / (2 * Math.PI)) * 24 + 24) % 24) === h,
        );
        const delay = 300 + h * 10;
        // Initial d is zero-height so nothing is visible before SMIL fires.
        // fill="freeze" keeps the bar at full height after the animation ends.
        return (
          <path
            key={h}
            d={barSegmentPath(h, INNER_R, INNER_R + 0.5)}
            fill={isPeakH ? "rgba(0,196,167,0.45)" : "rgba(255,255,255,0.11)"}
          >
            <animate
              attributeName="d"
              from={barSegmentPath(h, INNER_R, INNER_R + 0.5)}
              to={barSegmentPath(h, INNER_R, INNER_R + barH)}
              dur="400ms"
              begin={`${delay}ms`}
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.25 0.1 0.25 1"
            />
          </path>
        );
      })}
    </>
  );
});

interface Props {
  result: ChronoResult;
  arcColors: Map<string, string>;
  arcNames: Map<string, string>;
  showArcs: boolean;
  showSession: boolean;
}

export default function ChronoPolarChart({ result, arcColors, arcNames, showArcs, showSession }: Props) {
  const { hourBins, kde, evalAngles, peaks, kdeIn, kdeOut, arcResults } = result;

  const maxBin    = Math.max(...hourBins, 1);
  const maxKde    = Math.max(...kde) || 1;
  const maxKdeIn  = kdeIn.length  > 0 ? (Math.max(...kdeIn)  || 1) : 1;
  const maxKdeOut = kdeOut.length > 0 ? (Math.max(...kdeOut) || 1) : 1;

  return (
    <svg viewBox="0 0 360 360" width="100%" height="100%" style={{ display: "block" }}>
      <defs><style>{ANIM_CSS}</style></defs>

      {/* Background rings — expand from center */}
      <g style={{ transformOrigin: `${CX}px ${CY}px`, ...anim("cf-ring", 500, 0) }}>
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} cx={CX} cy={CY} r={INNER_R + f * BAR_RANGE}
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={0.8} />
        ))}
        <circle cx={CX} cy={CY} r={INNER_R}
          fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.0} />
      </g>

      {/* Radial spokes — fade in after rings */}
      <g style={anim("cf-fade", 350, 200)}>
        {Array.from({ length: 24 }, (_, h) => {
          const a = svgAngle((h / 24) * 2 * Math.PI);
          const [xi, yi] = toXY(a, INNER_R);
          const [xo, yo] = toXY(a, OUTER_R + 4);
          const isKey = KEY_HOURS.includes(h);
          return (
            <line key={h} x1={xi} y1={yi} x2={xo} y2={yo}
              stroke={h === 0 ? "rgba(200,50,50,0.80)" : isKey ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}
              strokeWidth={h === 0 ? 1.0 : isKey ? 0.8 : 0.6} />
          );
        })}
      </g>

      {/* Hourly bar segments — hidden in arc mode (dots serve that purpose) */}
      {!showArcs && <HourBars hourBins={hourBins} maxBin={maxBin} peaks={peaks} />}

      {/* Arc scatter dots */}
      {showArcs && Array.from(arcResults.entries()).map(([arcId, af]: [string, ArcFingerprint], arcIdx) => {
        const color = arcColors.get(arcId) ?? "#888888";
        const WIGGLE_NAMES = ["cf-wiggle-a", "cf-wiggle-b", "cf-wiggle-c"] as const;
        return af.thetas.map((theta, j) => {
          const r = OUTER_R - rand(theta, j) * 26;
          const [x, y] = toXY(svgAngle(theta), r);
          const fadeDelay = 320 + arcIdx * 60 + Math.floor(rand(j, theta) * 500);
          const dotIdx    = arcIdx * 200 + j;
          const wName     = WIGGLE_NAMES[Math.floor(rand(dotIdx * 7, 13) * 3)];
          const wDur      = (3.5 + rand(dotIdx * 11, 17) * 2.5).toFixed(1);
          const wDelay    = (-(rand(dotIdx * 13, 19) * parseFloat(wDur))).toFixed(1);
          return (
            <circle key={`${arcId}-${j}`} cx={x} cy={y} r={1.8}
              fill={color} opacity={0.72}
              style={{ animation: `cf-fade 180ms ease-out ${fadeDelay}ms both, ${wName} ${wDur}s ease-in-out ${wDelay}s infinite` }} />
          );
        });
      })}

      {/* Per-arc KDE curves — each normalized to its own max, capped below dot band */}
      {showArcs && Array.from(arcResults.entries()).map(([arcId, af]: [string, ArcFingerprint], i) => (
        <KdeCurve key={arcId}
          evalAngles={evalAngles} kde={af.kde} maxKde={Math.max(...af.kde) || 1}
          color={arcColors.get(arcId) ?? "#888888"} opacity={0.75}
          delay={500 + i * 80} rangeR={ARC_KDE_RANGE} />
      ))}

      {/* Session split KDE */}
      {showSession && kdeIn.length > 0 && (
        <KdeCurve evalAngles={evalAngles} kde={kdeIn} maxKde={maxKdeIn} color="#00c4a7" opacity={0.9} delay={500} />
      )}
      {showSession && kdeOut.length > 0 && (
        <KdeCurve evalAngles={evalAngles} kde={kdeOut} maxKde={maxKdeOut} color="rgba(255,255,255,0.45)" opacity={0.7} delay={620} />
      )}

      {/* Main KDE curve — only in default (non-arc, non-session) mode */}
      {!showArcs && !showSession && (
        <KdeCurve evalAngles={evalAngles} kde={kde} maxKde={maxKde} color="#00c4a7" delay={500} />
      )}

      {/* Peak markers — pop in last */}
      {peaks.map((p, i) => {
        const [x, y] = toXY(svgAngle(p.theta), OUTER_R + 7);
        return (
          <circle key={i} cx={x} cy={y}
            r={p.isPrimary ? 4.5 : 2.5}
            fill={p.isPrimary ? "#f5c842" : "rgba(255,255,255,0.45)"}
            style={{ transformBox: "fill-box", transformOrigin: "center", ...anim("cf-pop", 220, 1200 + i * 60) }}
          />
        );
      })}

      {/* Key hour labels */}
      <g style={anim("cf-fade", 400, 900)}>
        {KEY_HOURS.map((h) => {
          const [x, y] = toXY(svgAngle((h / 24) * 2 * Math.PI), LABEL_R);
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

      {/* Arc peak labels */}
      {showArcs && Array.from(arcResults.entries()).map(([arcId, af]: [string, ArcFingerprint]) => {
        if (!af.peaks[0]) return null;
        const [x, y] = toXY(svgAngle(af.peaks[0].theta), LABEL_R + 14);
        return (
          <text key={arcId} x={x} y={y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={8} fontFamily="'VT323','HBIOS-SYS',monospace"
            fill={arcColors.get(arcId) ?? "#888"} opacity={0.7} letterSpacing={0.5}
            style={anim("cf-fade", 300, 1000)}>
            {(arcNames.get(arcId) ?? arcId.slice(0, 5)).toUpperCase()}
          </text>
        );
      })}

      {/* Center */}
      <circle cx={CX} cy={CY} r={3} fill="rgba(255,255,255,0.12)"
        style={anim("cf-fade", 300, 100)} />
    </svg>
  );
}
