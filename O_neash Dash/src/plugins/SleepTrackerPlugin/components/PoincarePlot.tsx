// cspell:ignore poincare HBIOS
import { useEffect, useRef, useState, useMemo } from 'react';
import { CalendarRange } from 'pixelarticons/react';
import type { SleepEntry } from '../lib/sleepDb';

const VT     = "'VT323', 'HBIOS-SYS', monospace";
const ACC    = '#6366f1';
const YELLOW = '#f5c842';

function durationH(entry: SleepEntry): number {
  const s = new Date(entry.sleep_start).getTime();
  const e = new Date(entry.wake_time).getTime();
  return Math.abs(e - s) / 3_600_000;
}

function sampleStd(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mu = arr.reduce((s, x) => s + x, 0) / arr.length;
  const v  = arr.reduce((s, x) => s + (x - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function arrMean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

function fmtH(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2, '0')}m`;
}

interface PointHit { cx: number; cy: number; idx: number }

interface TooltipState {
  x: number; y: number;
  dn: number; dn1: number;
  dateN: string; dateN1: string;
}

interface Props { entries: SleepEntry[] }

export default function PoincarePlot({ entries }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef   = useRef<PointHit[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hovIdx,  setHovIdx]  = useState<number | null>(null);

  const { pairs, durations, sd1, sd2, mu } = useMemo(() => {
    const sorted    = [...entries].sort((a, b) => a.sleep_start.localeCompare(b.sleep_start));
    const durations = sorted.map(durationH);
    const pairs     = sorted.slice(0, -1).map((e, i) => ({
      n: e, n1: sorted[i + 1], dn: durations[i], dn1: durations[i + 1],
    }));
    const diffs = pairs.map(p => p.dn1 - p.dn);
    const sums  = pairs.map(p => p.dn1 + p.dn);
    const sd1   = sampleStd(diffs) / Math.SQRT2;
    const sd2   = sampleStd(sums)  / Math.SQRT2;
    const mu    = arrMean(durations);
    return { pairs, durations, sd1, sd2, mu };
  }, [entries]);

  const hasData = pairs.length >= 2;
  const ratio   = sd2 > 0.01 ? sd1 / sd2 : 0;
  const { shapeLabel, shapeColor, shapeDesc } =
    ratio < 0.35
      ? { shapeLabel: 'CIGAR',    shapeColor: '#60a5fa', shapeDesc: 'stable but slow-moving trend — low night-to-night jitter' }
      : ratio > 0.75
      ? { shapeLabel: 'CIRCLE',   shapeColor: '#f43f5e', shapeDesc: 'disrupted circadian rhythm — no correlation night to night' }
      : { shapeLabel: 'BALANCED', shapeColor: '#4ade80', shapeDesc: 'healthy autonomic regulation' };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const ML = 96, MR = 48, MT = 36, MB = 60;
    const CW = W - ML - MR;
    const CH = H - MT - MB;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const dMin  = Math.max(0, Math.floor(Math.min(...durations) - 0.5));
    const dMax  = Math.ceil(Math.max(...durations) + 0.5);
    const range = Math.max(dMax - dMin, 1);

    const toX = (d: number) => ML + ((d - dMin) / range) * CW;
    const toY = (d: number) => MT + CH - ((d - dMin) / range) * CH;

    // ── Grid ─────────────────────────────────────────────────────────────────
    for (let h = dMin; h <= dMax; h++) {
      const gx = toX(h), gy = toY(h);
      ctx.beginPath(); ctx.moveTo(gx, MT); ctx.lineTo(gx, MT + CH);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ML, gy); ctx.lineTo(ML + CW, gy); ctx.stroke();

      ctx.font = '28px VT323, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.textAlign = 'center';
      ctx.fillText(`${h}h`, gx, MT + CH + 42);
      ctx.textAlign = 'right';
      ctx.fillText(`${h}h`, ML - 10, gy + 9);
    }

    // ── Identity line y = x ──────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(toX(dMin), toY(dMin));
    ctx.lineTo(toX(dMax), toY(dMax));
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth   = 1.4;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Ellipse (SD2 along y=x, SD1 perpendicular, 45° rotation) ────────────
    if (sd1 > 0.01 && sd2 > 0.01) {
      const S = Math.SQRT2;

      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const t  = (i / 120) * Math.PI * 2;
        const ex = mu + (sd2 * Math.cos(t) - sd1 * Math.sin(t)) / S;
        const ey = mu + (sd2 * Math.cos(t) + sd1 * Math.sin(t)) / S;
        i === 0 ? ctx.moveTo(toX(ex), toY(ey)) : ctx.lineTo(toX(ex), toY(ey));
      }
      ctx.closePath();
      ctx.strokeStyle = `${YELLOW}cc`; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle   = `${YELLOW}16`; ctx.fill();

      // SD1 dashed axis (perpendicular)
      ctx.beginPath();
      ctx.moveTo(toX(mu + sd1 / S), toY(mu - sd1 / S));
      ctx.lineTo(toX(mu - sd1 / S), toY(mu + sd1 / S));
      ctx.strokeStyle = `${YELLOW}55`; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

      // SD2 dashed axis (along y=x)
      ctx.beginPath();
      ctx.moveTo(toX(mu - sd2 / S), toY(mu - sd2 / S));
      ctx.lineTo(toX(mu + sd2 / S), toY(mu + sd2 / S));
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

      // Axis labels
      ctx.font = '24px VT323, monospace'; ctx.fillStyle = `${YELLOW}bb`; ctx.textAlign = 'center';
      ctx.fillText('SD1', toX(mu - sd1 / S - 0.12), toY(mu + sd1 / S + 0.12) + 9);
      ctx.fillText('SD2', toX(mu + sd2 / S + 0.12), toY(mu + sd2 / S) - 6);
    }

    // ── Dots ─────────────────────────────────────────────────────────────────
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const newHits: PointHit[] = [];
    pairs.forEach((p, i) => {
      const cx    = toX(p.dn);
      const cy    = toY(p.dn1);
      const isHov = i === hovIdx;
      const r     = isHov ? 9 : 5.5;

      const pairDate = new Date(p.n1.date + 'T00:00:00');
      const daysAgo  = Math.floor((today.getTime() - pairDate.getTime()) / 86_400_000);

      let fill: string;
      if (daysAgo <= 7)       fill = isHov ? 'rgba(255,30,30,1)'    : 'rgba(255,30,30,0.88)';
      else if (daysAgo <= 14) fill = isHov ? 'rgba(180,30,30,0.75)' : 'rgba(160,20,20,0.45)';
      else                    fill = isHov ? 'rgba(160,160,160,0.8)' : 'rgba(110,110,110,0.35)';

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (isHov) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
      newHits.push({ cx, cy, idx: i });
    });
    hitsRef.current = newHits;

    // ── Axis borders ─────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(ML, MT); ctx.lineTo(ML, MT + CH); ctx.lineTo(ML + CW, MT + CH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();

    // ── Axis titles ──────────────────────────────────────────────────────────
    ctx.font = '26px VT323, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.textAlign = 'center';
    ctx.fillText('Sleep(n)  duration', ML + CW / 2, MT + CH + 56);

    ctx.save();
    ctx.translate(ML - 68, MT + CH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Sleep(n+1)', 0, 0);
    ctx.restore();

  }, [pairs, durations, sd1, sd2, mu, hasData, hovIdx]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx   = canvas.width  / rect.width;
    const sy   = canvas.height / rect.height;
    const mx   = (e.clientX - rect.left) * sx;
    const my   = (e.clientY - rect.top)  * sy;

    let best: { idx: number; dist: number } | null = null;
    hitsRef.current.forEach(h => {
      const dist = Math.hypot(mx - h.cx, my - h.cy);
      if (dist < 28 && (!best || dist < best.dist)) best = { idx: h.idx, dist };
    });

    if (best !== null) {
      const p = pairs[best.idx];
      setHovIdx(best.idx);
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, dn: p.dn, dn1: p.dn1, dateN: p.n.date, dateN1: p.n1.date });
    } else {
      setHovIdx(null); setTooltip(null);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, width: '100%' }}>

      {/* ── Left: stats panel (mirrors dashboard left column) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, flexShrink: 0, width: 420, paddingLeft: 24 }}>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: YELLOW, display: 'flex', alignItems: 'center' }}>
            <CalendarRange size={22} />
          </span>
          <span style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: '4px', color: YELLOW, textTransform: 'uppercase', lineHeight: 1 }}>
            poincaré plot
          </span>
        </div>

        {/* SD1 */}
        <StatCard label="SHORT-TERM VARIABILITY  (SD1)" value={hasData ? fmtH(sd1) : '--'} />

        <p style={{ fontFamily: "'Georgia', serif", fontSize: '0.72rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.28)', lineHeight: 1.55, margin: '-24px 0 0', maxWidth: 320, paddingLeft: 20 }}>
          How much your sleep duration fluctuates from one night to the next.
          Width of the cloud perpendicular to the y=x line.
        </p>

        {/* SD2 */}
        <StatCard label="LONG-TERM VARIABILITY  (SD2)" value={hasData ? fmtH(sd2) : '--'} />

        {/* Ratio + shape */}
        <StatCard
          label="SD1 / SD2 RATIO"
          value={hasData ? ratio.toFixed(2) : '--'}
          sub={hasData ? (
            <span style={{ fontFamily: "'Georgia', serif", fontSize: '0.7rem', fontStyle: 'italic', color: shapeColor, lineHeight: 1 }}>
              {shapeLabel} — {shapeDesc}
            </span>
          ) : null}
        />

      </div>

      {/* ── Right: canvas (mirrors dashboard chart column) ── */}
      <div style={{ width: 704, flexShrink: 0, height: 640, paddingLeft: 24, position: 'relative' }}>
        {!hasData ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 3, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>
              log ≥ 3 nights to generate plot
            </span>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={1100}
              height={1100}
              style={{ width: '100%', height: '100%', display: 'block' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => { setHovIdx(null); setTooltip(null); }}
            />
            {tooltip && (
              <div style={{
                position:      'absolute',
                left:          tooltip.x,
                top:           tooltip.y,
                transform:     'translate(-50%, calc(-100% - 12px))',
                background:    'rgba(8,8,16,0.94)',
                border:        `1px solid ${ACC}44`,
                padding:       '8px 14px',
                pointerEvents: 'none',
                whiteSpace:    'nowrap',
              }}>
                <div style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                  night n&nbsp;&nbsp;&nbsp;&nbsp;
                  <span style={{ color: '#fff' }}>{fmtH(tooltip.dn)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 10, fontSize: '0.9rem' }}>{tooltip.dateN}</span>
                </div>
                <div style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                  night n+1&nbsp;
                  <span style={{ color: '#fff' }}>{fmtH(tooltip.dn1)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 10, fontSize: '0.9rem' }}>{tooltip.dateN1}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: VT, fontSize: '1.6rem', letterSpacing: '4px', color: YELLOW, textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: VT, color: '#fff', lineHeight: 1, letterSpacing: 1, paddingLeft: 20 }}>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '1.2rem' }}>▶</span>
        <span style={{ fontSize: '2.6rem' }}>{value}</span>
      </div>
      {sub && <div style={{ paddingLeft: 20 }}>{sub}</div>}
    </div>
  );
}
