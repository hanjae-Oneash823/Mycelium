// cspell:ignore HBIOS
import { useEffect, useRef, useState, useMemo } from 'react';
import { CalendarRange } from 'pixelarticons/react';
import type { SleepEntry, SleepTarget } from '../lib/sleepDb';
import {
  getEntriesForMonth, avgDuration, avgStartTime, formatDuration,
} from '../lib/sleepDb';

const VT      = "'VT323', 'HBIOS-SYS', monospace";
const YELLOW  = '#f5c842';
const ACC     = '#6366f1';
const Y_RANGE = 900;

const GRID = [
  { label: '2200', min: 0   },
  { label: '0100', min: 180 },
  { label: '0400', min: 360 },
  { label: '0700', min: 540 },
  { label: '1000', min: 720 },
  { label: '1300', min: 900 },
];

const MONTH_NAMES = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER',
];

// ── Shared helpers (mirrors SleepChart) ──────────────────────────────────────

function toM(timeStr: string): number {
  let h: number, m: number;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    h = d.getHours(); m = d.getMinutes();
  } else {
    [h, m] = timeStr.split(':').map(Number);
  }
  return h >= 22 ? (h - 22) * 60 + m : (h + 2) * 60 + m;
}

function toLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}`;
}

function fmtTime(timeStr: string): string {
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  const [h, m] = timeStr.split(':').map(Number);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function durationMin(entry: SleepEntry): number {
  return Math.abs(toM(entry.wake_time) - toM(entry.sleep_start));
}

function ttMet(entry: SleepEntry, target: SleepTarget): boolean {
  return (toM(entry.sleep_start) - toM(target.target_sleep_start)) <= 30;
}

function barColor(entry: SleepEntry, target: SleepTarget): string {
  const diff = durationMin(entry) - target.target_duration * 60;
  const tt   = ttMet(entry, target);
  if (diff > 60)        return '#60a5fa';
  if (diff >= 0 && tt)  return '#4ade80';
  if (diff >= 0 && !tt) return '#facc15';
  if (diff < 0 && tt)   return '#fb923c';
  return '#f43f5e';
}

function statusLabel(entry: SleepEntry, target: SleepTarget): { text: string; color: string } {
  const diff = durationMin(entry) - target.target_duration * 60;
  const tt   = ttMet(entry, target);
  if (diff > 60)        return { text: 'child of a new world',       color: '#60a5fa' };
  if (diff >= 0 && tt)  return { text: 'perfect',                    color: '#4ade80' };
  if (diff >= 0 && !tt) return { text: 'you an owl?',                color: '#facc15' };
  if (diff < 0 && tt)   return { text: 'nice try...',                color: '#fb923c' };
  return                       { text: 'sleep... more... please...', color: '#f43f5e' };
}

function saturate(hex: string): string {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2;
  let h = 0;
  if (max !== min) {
    const d = max-min;
    if (max===r) h=(g-b)/d+(g<b?6:0);
    else if (max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h/=6;
  }
  const hue2rgb=(p:number,q:number,t:number)=>{
    if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6; return p;
  };
  const q=l<0.5?l*2:l+1-l; const p=2*l-q;
  return `rgb(${[h+1/3,h,h-1/3].map(t=>Math.round(hue2rgb(p,q,t)*255)).join(',')})`;
}

type Pt = { x: number; y: number };


// ── Component ─────────────────────────────────────────────────────────────────

interface BarHit {
  x: number; y: number; w: number; h: number;
  entry: SleepEntry; color: string;
}

interface TooltipState {
  x: number; y: number; entry: SleepEntry; color: string;
}

interface Props { target: SleepTarget | null }

export default function MonthlyChart({ target }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef   = useRef<BarHit[]>([]);
  const [monthOffset, setMonthOffset] = useState(0);
  const [entries,     setEntries]     = useState<SleepEntry[]>([]);
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const { year, month } = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, [monthOffset]);

  const numDays        = new Date(year, month, 0).getDate();
  const isCurrentMonth = monthOffset === 0;
  const todayDay       = new Date().getDate();

  useEffect(() => {
    getEntriesForMonth(year, month).then(setEntries);
  }, [year, month]);

  const avgDur   = entries.length ? formatDuration(avgDuration(entries)) : '--';
  const avgStart = entries.length ? avgStartTime(entries) : '--:--';

  function fmtAmPm(hhmm: string): string {
    if (hhmm === '--:--') return '--:--';
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  // ── Canvas draw ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W  = canvas.width,  H  = canvas.height;
    const ML = 80, MR = 130, MT = 24, MB = 60;
    const CW = W - ML - MR,   CH = H - MT - MB;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const yFor = (min: number) =>
      MT + (Math.min(Y_RANGE, Math.max(0, min)) / Y_RANGE) * CH;

    const entryByDay = new Map<number, SleepEntry>();
    for (const e of entries) {
      entryByDay.set(new Date(e.date + 'T12:00:00').getDate(), e);
    }

    const goalMin      = target ? toM(target.target_sleep_start) : null;
    const wakeChartMin = target && goalMin !== null
      ? (() => { const w = goalMin + target.target_duration * 60; return w % Y_RANGE; })()
      : null;

    // ── Grid ────────────────────────────────────────────────────────────────
    for (const g of GRID) {
      const y = yFor(g.min);
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + CW, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.font = '28px VT323, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'right';
      ctx.fillText(g.label, ML - 10, y + 9);
    }

    // ── Goal line ────────────────────────────────────────────────────────────
    if (target && goalMin !== null) {
      const gy = yFor(goalMin);
      ctx.beginPath(); ctx.moveTo(ML, gy); ctx.lineTo(ML + CW, gy);
      ctx.strokeStyle = '#4f72f5'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.font = '28px VT323, monospace'; ctx.fillStyle = '#4f72f5'; ctx.textAlign = 'left';
      ctx.fillText(`GOAL: ${toLabel(target.target_sleep_start)}`, ML + CW + 10, gy + 9);
    }

    // ── Wake line ────────────────────────────────────────────────────────────
    if (target && wakeChartMin !== null) {
      const wy       = yFor(wakeChartMin);
      const wakeAbsM = goalMin! + target.target_duration * 60;
      const wakeH    = Math.floor((wakeAbsM / 60 + 22) % 24);
      const wakeMin  = Math.round(wakeAbsM % 60);
      ctx.beginPath(); ctx.setLineDash([6, 4]);
      ctx.moveTo(ML, wy); ctx.lineTo(ML + CW, wy);
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '28px VT323, monospace'; ctx.fillStyle = '#4ade80'; ctx.textAlign = 'left';
      ctx.fillText(`WAKE: ${wakeH.toString().padStart(2,'0')}${wakeMin.toString().padStart(2,'0')}`, ML + CW + 10, wy + 9);
    }

    // ── Vertical column lines ────────────────────────────────────────────────
    const colW = CW / numDays;
    for (let d = 1; d <= numDays; d++) {
      const cx = ML + (d - 0.5) * colW;
      ctx.beginPath(); ctx.moveTo(cx, MT - 16); ctx.lineTo(cx, MT + CH + 16);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5; ctx.stroke();
    }

    // ── Trend lines ──────────────────────────────────────────────────────────
    const sleepPts: Pt[] = [], wakePts: Pt[] = [];
    for (let d = 1; d <= numDays; d++) {
      const entry = entryByDay.get(d);
      if (!entry) continue;
      const cx = ML + (d - 0.5) * colW;
      sleepPts.push({ x: cx, y: yFor(toM(entry.sleep_start)) });
      wakePts.push({  x: cx, y: yFor(toM(entry.wake_time))   });
    }

    // 7-night centered moving average
    const MA_HALF = 3;
    const movingAvg = (pts: Pt[]): Pt[] =>
      pts.map((pt, i) => {
        const slice = pts.slice(Math.max(0, i - MA_HALF), Math.min(pts.length, i + MA_HALF + 1));
        return { x: pt.x, y: slice.reduce((s, p) => s + p.y, 0) / slice.length };
      });

    const drawMA = (rawPts: Pt[]) => {
      if (rawPts.length < 2) return;
      const pts = movingAvg(rawPts);
      ctx.beginPath();
      pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.stroke();
    };

    drawMA(sleepPts);
    drawMA(wakePts);

    // ── Bars + day labels ────────────────────────────────────────────────────
    const barW    = colW * 0.78;
    const newBars: BarHit[] = [];

    for (let d = 1; d <= numDays; d++) {
      const cx      = ML + (d - 0.5) * colW;
      const isToday = isCurrentMonth && d === todayDay;
      ctx.font      = '22px VT323, monospace';
      ctx.fillStyle = isToday ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.25)';
      ctx.textAlign = 'center';
      ctx.fillText(d.toString(), cx, H - MB + 34);

      const entry = entryByDay.get(d);
      if (!entry) continue;

      const startM = toM(entry.sleep_start);
      const endM   = toM(entry.wake_time);
      const top    = yFor(Math.min(startM, endM));
      const bot    = yFor(Math.max(startM, endM));
      const barH   = Math.max(4, bot - top);
      const barClr = target ? barColor(entry, target) : '#60a5fa';
      const isHov  = entry.date === hoveredDate;
      const drawClr = isHov ? saturate(barClr) : barClr;

      ctx.globalAlpha = isHov ? 1 : 0.9;
      ctx.fillStyle   = drawClr;
      ctx.fillRect(cx - barW / 2, top, barW, barH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - barW / 2, top, barW, barH);

      newBars.push({ x: cx - barW / 2, y: top, w: barW, h: barH, entry, color: barClr });
    }

    barsRef.current = newBars;
  }, [entries, target, hoveredDate, numDays, isCurrentMonth, todayDay]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;

    const hit = barsRef.current.find(b =>
      mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h
    );
    if (hit) {
      setHoveredDate(hit.entry.date);
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, entry: hit.entry, color: hit.color });
    } else {
      setHoveredDate(null); setTooltip(null);
    }
  }

  function fmtDur(entry: SleepEntry): string {
    const d = durationMin(entry);
    return `${Math.floor(d / 60)}h ${d % 60}m`;
  }

  return (
    <div style={{ display: 'flex', gap: 16, width: '100%' }}>

      {/* ── Left panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, flexShrink: 0, width: 420, paddingLeft: 24 }}>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: YELLOW, display: 'flex', alignItems: 'center' }}>
            <CalendarRange size={22} />
          </span>
          <span style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: '4px', color: YELLOW, textTransform: 'uppercase', lineHeight: 1 }}>
            monthly review
          </span>
        </div>

        {/* Month navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NavArrow onClick={() => setMonthOffset(o => o - 1)}>←</NavArrow>
            <span style={{ fontFamily: VT, fontSize: '1.7rem', letterSpacing: '2px', color: '#fff', lineHeight: 1, flex: 1, textAlign: 'center' }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <NavArrow onClick={() => setMonthOffset(o => o + 1)} disabled={isCurrentMonth}>→</NavArrow>
          </div>
          <div>
            <ThisMonthBtn disabled={isCurrentMonth} onClick={() => setMonthOffset(0)} />
          </div>
        </div>

        {/* Stats */}
        <StatCard label="AVG DURATION"    value={avgDur} />
        <StatCard label="AVG SLEEP START" value={fmtAmPm(avgStart)} />
        <StatCard label="NIGHTS LOGGED"   value={`${entries.length} / ${numDays}`} />

      </div>

      {/* ── Right: canvas ── */}
      <div style={{ width: 800, flexShrink: 0, height: 476, paddingLeft: 24, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={1100}
          height={532}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setTooltip(null); setHoveredDate(null); }}
        />

        {tooltip && (() => {
          const status = target
            ? statusLabel(tooltip.entry, target)
            : { text: 'child of a new world', color: '#60a5fa' };
          return (
            <div style={{
              position:      'absolute',
              left:          tooltip.x,
              top:           tooltip.y,
              transform:     'translate(-50%, calc(-100% - 14px))',
              background:    'rgba(10,10,10,0.92)',
              border:        `1px solid ${tooltip.color}44`,
              padding:       '8px 14px',
              pointerEvents: 'none',
              whiteSpace:    'nowrap',
            }}>
              <div style={{ fontFamily: VT, fontSize: '1.3rem', letterSpacing: '2px', color: '#fff', lineHeight: 1.2 }}>
                {fmtTime(tooltip.entry.sleep_start)} – {fmtTime(tooltip.entry.wake_time)}
              </div>
              <div style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.2 }}>
                {fmtDur(tooltip.entry)}
              </div>
              <div style={{ fontFamily: "'Georgia', serif", fontSize: '0.68rem', fontStyle: 'italic', color: status.color, marginTop: 4, lineHeight: 1 }}>
                {status.text}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: '4px', color: YELLOW, textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: VT, color: '#fff', lineHeight: 1, letterSpacing: 1, paddingLeft: 20 }}>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '1.2rem' }}>▶</span>
        <span style={{ fontSize: '2.6rem' }}>{value}</span>
      </div>
    </div>
  );
}

function NavArrow({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all:        'unset',
        fontFamily: VT,
        fontSize:   '1.8rem',
        lineHeight: 1,
        color:      disabled ? 'rgba(255,255,255,0.12)' : hov ? '#fff' : 'rgba(255,255,255,0.45)',
        cursor:     disabled ? 'default' : 'pointer',
        transition: 'color 0.1s',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function ThisMonthBtn({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all:           'unset',
        fontFamily:    VT,
        fontSize:      '0.95rem',
        letterSpacing: 2,
        textTransform: 'uppercase',
        color:         disabled ? 'rgba(99,102,241,0.2)' : hov ? '#fff' : ACC,
        border:        `1px solid ${disabled ? 'rgba(99,102,241,0.1)' : hov ? 'rgba(99,102,241,0.7)' : 'rgba(99,102,241,0.4)'}`,
        padding:       '4px 14px',
        cursor:        disabled ? 'default' : 'pointer',
        transition:    'color 0.1s, border-color 0.1s',
      }}
    >
      THIS MONTH
    </button>
  );
}
