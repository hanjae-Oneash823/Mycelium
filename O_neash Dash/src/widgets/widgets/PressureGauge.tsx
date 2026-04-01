import { useMemo } from 'react';
import { SpeedSlow } from 'pixelarticons/react/SpeedSlow';
import { computePressureScore } from '../../plugins/PlannerPlugin/lib/logicEngine';
import { usePlannerStore } from '../../plugins/PlannerPlugin/store/usePlannerStore';
import type { WidgetProps } from '../types';
import type { PressureLevel } from '../../plugins/PlannerPlugin/lib/logicEngine';

const GOLD = '#d4a52a';

// ── Active level highlight colours ────────────────────────────────────────────
const LEVEL_COLOR: Record<PressureLevel, string> = {
  safe:     '#00c4a7',
  loaded:   '#d4a52a',
  heavy:    '#f97316',
  critical: '#ef4444',
};

const LEVEL_LABEL: Record<PressureLevel, string> = {
  safe:     'SAFE',
  loaded:   'LOADED',
  heavy:    'HEAVY',
  critical: 'CRIT.',
};

// ── Sector background colours (dim) & active (bright) ─────────────────────────
const SECTOR_DIM: Record<PressureLevel, string> = {
  safe:     '#0b2e1a',
  loaded:   '#2e2208',
  heavy:    '#2e1208',
  critical: '#1e0808',
};

const SECTOR_LIT: Record<PressureLevel, string> = {
  safe:     '#1a5c34',
  loaded:   '#6b5000',
  heavy:    '#7a2e08',
  critical: '#5c1010',
};

// ── SVG gauge geometry ─────────────────────────────────────────────────────────
// Half-circle from 180° (left) to 0° (right) through top (90°).
// Math convention: 0° = right, angles increase counter-clockwise.
// In SVG: x = cx + r·cos(rad), y = cy − r·sin(rad)  (y flipped)
const CX = 100, CY = 105, R = 90;

function toXY(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: +(CX + R * Math.cos(rad)).toFixed(2),
    y: +(CY - R * Math.sin(rad)).toFixed(2),
  };
}

// clockwise arc through the top (sweep-flag=1)
function sectorPath(fromDeg: number, toDeg: number): string {
  const p1 = toXY(fromDeg);
  const p2 = toXY(toDeg);
  return `M ${CX} ${CY} L ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y} Z`;
}

// 4 equal sectors of 45° each: SAFE 180→135, LOADED 135→90, HEAVY 90→45, CRIT 45→0
const SECTORS: Array<{ level: PressureLevel; from: number; to: number }> = [
  { level: 'safe',     from: 180, to: 135 },
  { level: 'loaded',   from: 135, to: 90  },
  { level: 'heavy',    from: 90,  to: 45  },
  { level: 'critical', from: 45,  to: 0   },
];

// Label anchor positions (placed near mid-arc of each sector)
const LABELS: Array<{ level: PressureLevel; x: number; y: number; anchor: string }> = [
  { level: 'safe',     x: 14,  y: 100, anchor: 'start' },
  { level: 'loaded',   x: 34,  y: 36,  anchor: 'middle' },
  { level: 'heavy',    x: 166, y: 36,  anchor: 'middle' },
  { level: 'critical', x: 186, y: 100, anchor: 'end'   },
];

export function PressureGauge({ }: WidgetProps) {
  const nodes = usePlannerStore(s => s.nodes);
  const now   = new Date();

  const result = useMemo(
    () => computePressureScore(nodes, 360, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes],
  );

  const { score, level } = result;
  const activeColor = LEVEL_COLOR[level];

  // Needle angle: score 0 → 180° (left), score 100 → 0° (right)
  const needleAngleDeg = 180 - (score / 100) * 180;
  const needleRad = (needleAngleDeg * Math.PI) / 180;
  const needleLen = R - 10;
  const nx = +(CX + needleLen * Math.cos(needleRad)).toFixed(2);
  const ny = +(CY - needleLen * Math.sin(needleRad)).toFixed(2);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'VT323', monospace",
      padding: '10px 12px',
      boxSizing: 'border-box',
      gap: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <SpeedSlow width={14} height={14} style={{ color: GOLD }} />
        <span style={{ fontSize: '0.82rem', letterSpacing: '2px', color: GOLD, lineHeight: 1 }}>
          PRESSURE-GAUGE
        </span>
      </div>

      {/* SVG Gauge */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end' }}>
        <svg
          viewBox="0 0 200 115"
          width="100%"
          style={{ overflow: 'visible', display: 'block' }}
        >
          {/* Sector fills */}
          {SECTORS.map(({ level: sl, from, to }) => (
            <path
              key={sl}
              d={sectorPath(from, to)}
              fill={sl === level ? SECTOR_LIT[sl] : SECTOR_DIM[sl]}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="1"
            />
          ))}

          {/* Sector labels */}
          {LABELS.map(({ level: ll, x, y, anchor }) => (
            <text
              key={ll}
              x={x} y={y}
              textAnchor={anchor}
              fontSize="9"
              fontFamily="'VT323', monospace"
              letterSpacing="1"
              fill={ll === level ? LEVEL_COLOR[ll] : 'rgba(255,255,255,0.25)'}
            >
              {LEVEL_LABEL[ll]}
            </text>
          ))}

          {/* Needle */}
          <line
            x1={CX} y1={CY}
            x2={nx} y2={ny}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Needle pivot dot */}
          <circle cx={CX} cy={CY} r="4" fill="rgba(255,255,255,0.75)" />
        </svg>
      </div>

      {/* Score readout */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 8,
      }}>
        <div style={{
          border: `1px solid ${activeColor}55`,
          padding: '3px 10px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: '1.6rem', color: activeColor, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>pts.</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: activeColor, letterSpacing: '2px', lineHeight: 1 }}>
            [{LEVEL_LABEL[level]}]
          </span>
        </div>

        <div style={{
          fontSize: '0.72rem',
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: '1px',
          lineHeight: 1.4,
          textAlign: 'right',
          paddingTop: 4,
        }}>
          see<br />
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>[summary]</span>
        </div>
      </div>
    </div>
  );
}
