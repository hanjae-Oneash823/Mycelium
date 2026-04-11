import { useEffect, useRef, useState } from 'react';
import { CalendarRange } from 'pixelarticons/react';
import type { SleepEntry, SleepTarget } from '../lib/sleepDb';

const VT     = "'VT323', 'HBIOS-SYS', monospace";
const YELLOW = '#f5c842';

// Y-axis: 22:00 → 13:00 next day (900 min total)
const Y_RANGE = 900;

// Grid every 3 hours
const GRID = [
  { label: '2200', min: 0   },
  { label: '0100', min: 180 },
  { label: '0400', min: 360 },
  { label: '0700', min: 540 },
  { label: '1000', min: 720 },
  { label: '1300', min: 900 },
];

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

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

// TT met = slept within 30 min of target start (or early)
function ttMet(entry: SleepEntry, target: SleepTarget): boolean {
  return (toM(entry.sleep_start) - toM(target.target_sleep_start)) <= 30;
}

function barColor(entry: SleepEntry, target: SleepTarget): string {
  const diff = durationMin(entry) - target.target_duration * 60;
  const tt   = ttMet(entry, target);
  if (diff > 60)        return '#60a5fa';  // > TD+1h
  if (diff >= 0 && tt)  return '#4ade80';  // TD~TD+1h, on time
  if (diff >= 0 && !tt) return '#facc15';  // TD~TD+1h, late start
  if (diff < 0 && tt)   return '#fb923c';  // < TD, on time
  return '#f43f5e';                        // < TD, late start
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

// ── Catmull-Rom spline ───────────────────────────────────────────────────────

type Pt = { x: number; y: number };

function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (2*p1.x + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5 * (2*p1.y + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
  };
}

function getLast7Dates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Maximise saturation of a hex color
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
  // rebuild with S=1
  const hue2rgb=(p:number,q:number,t:number)=>{
    if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;
    return p;
  };
  const q=l<0.5?l*2:l+1-l; const p=2*l-q;
  return `rgb(${[h+1/3,h,h-1/3].map(t=>Math.round(hue2rgb(p,q,t)*255)).join(',')})`;
}

interface BarHit {
  x: number; y: number; w: number; h: number;
  entry: SleepEntry;
  color: string;
}

interface TooltipState {
  x: number; y: number;
  entry: SleepEntry;
  color: string;
}

interface Props {
  sessions:   SleepEntry[];
  target:     SleepTarget | null;
  hideTitle?: boolean;
  compact?:   boolean; // widget mode: no Y-axis labels, day-only column labels
}

export default function SleepChart({ sessions, target, hideTitle = false, compact = false }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const barsRef    = useRef<BarHit[]>([]);
  const [tooltip, setTooltip]         = useState<TooltipState | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W  = canvas.width;
    const H  = canvas.height;
    const ML = compact ? 24 : 80;
    const MR = compact ? 24 : 140;
    const MT = 24;
    const MB = compact ? 72 : 60;
    const CW = W - ML - MR;
    const CH = H - MT - MB;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const yFor = (min: number) =>
      MT + (Math.min(Y_RANGE, Math.max(0, min)) / Y_RANGE) * CH;

    const goalMin      = target ? toM(target.target_sleep_start) : null;
    const wakeChartMin = target && goalMin !== null
      ? (() => {
          const absWake = goalMin + target.target_duration * 60;
          return absWake % Y_RANGE;
        })()
      : null;

    // ── Grid lines ───────────────────────────────────────────────────────────
    for (const g of GRID) {
      const y = yFor(g.min);
      ctx.beginPath();
      ctx.moveTo(ML, y);
      ctx.lineTo(ML + CW, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();

      if (!compact) {
        ctx.font      = '28px VT323, monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'right';
        ctx.fillText(g.label, ML - 10, y + 9);
      }
    }

    // ── Goal line (solid blue) ────────────────────────────────────────────────
    if (target && goalMin !== null) {
      const gy  = yFor(goalMin);
      const lbl = `GOAL: ${toLabel(target.target_sleep_start)}`;

      ctx.beginPath();
      ctx.moveTo(ML, gy);
      ctx.lineTo(ML + CW, gy);
      ctx.strokeStyle = '#4f72f5';
      ctx.lineWidth   = 1.8;
      ctx.stroke();

      if (!compact) {
        ctx.font      = '28px VT323, monospace';
        ctx.fillStyle = '#4f72f5';
        ctx.textAlign = 'left';
        ctx.fillText(lbl, ML + CW + 10, gy + 9);
      }
    }

    // ── Wake line (dashed green) ──────────────────────────────────────────────
    if (target && wakeChartMin !== null) {
      const wy        = yFor(wakeChartMin);
      const wakeAbsM  = goalMin! + target.target_duration * 60;
      const wakeH     = Math.floor((wakeAbsM / 60 + 22) % 24);
      const wakeM     = Math.round(wakeAbsM % 60);
      const wakeLbl   = `WAKE: ${wakeH.toString().padStart(2,'0')}${wakeM.toString().padStart(2,'0')}`;

      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.moveTo(ML, wy);
      ctx.lineTo(ML + CW, wy);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth   = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);

      if (!compact) {
        ctx.font      = '28px VT323, monospace';
        ctx.fillStyle = '#4ade80';
        ctx.textAlign = 'left';
        ctx.fillText(wakeLbl, ML + CW + 10, wy + 9);
      }
    }

    // ── Vertical center lines ─────────────────────────────────────────────────
    const days = getLast7Dates();
    const colW = CW / 7;
    const OVERHANG = 20;
    for (let i = 0; i < 7; i++) {
      const cx = ML + (i + 0.5) * colW;
      ctx.beginPath();
      ctx.moveTo(cx, MT - OVERHANG);
      ctx.lineTo(cx, MT + CH + OVERHANG);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }

    // ── Catmull-Rom trend lines ───────────────────────────────────────────────
    const entryByDate = new Map(sessions.map(s => [s.date, s]));

    const sleepPts: Pt[] = [];
    const wakePts:  Pt[] = [];
    days.forEach((date, i) => {
      const entry = entryByDate.get(date);
      if (!entry) return;
      const cx = ML + (i + 0.5) * colW;
      sleepPts.push({ x: cx, y: yFor(toM(entry.sleep_start)) });
      wakePts.push({  x: cx, y: yFor(toM(entry.wake_time))   });
    });

    const extendToEnds = (pts: Pt[]): Pt[] => {
      if (pts.length < 2) return pts;
      let result = [...pts];
      const leftX = ML;
      if (result[0].x > leftX + 1) {
        const slope = (result[1].y - result[0].y) / (result[1].x - result[0].x);
        result = [{ x: leftX, y: Math.max(MT, Math.min(MT + CH, result[0].y + slope * (leftX - result[0].x))) }, ...result];
      }
      const rightX = ML + CW;
      const last = result[result.length - 1];
      if (last.x < rightX - 1) {
        const prev = result[result.length - 2];
        const slope = (last.y - prev.y) / (last.x - prev.x);
        result = [...result, { x: rightX, y: Math.max(MT, Math.min(MT + CH, last.y + slope * (rightX - last.x))) }];
      }
      return result;
    };

    const drawTrend = (rawPts: Pt[]) => {
      if (rawPts.length < 2) return;
      const pts = extendToEnds(rawPts);
      const p = [pts[0], ...pts, pts[pts.length - 1]];
      ctx.beginPath();
      for (let i = 1; i < p.length - 2; i++) {
        const steps = 24;
        for (let s = 0; s <= steps; s++) {
          const pt = catmullRom(p[i-1], p[i], p[i+1], p[i+2], s / steps);
          i === 1 && s === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth   = 2;
      ctx.stroke();
    };

    drawTrend(sleepPts);
    drawTrend(wakePts);

    // ── Bars + day labels ─────────────────────────────────────────────────────
    const barW = colW * 0.38;
    const newBars: BarHit[] = [];

    days.forEach((date, i) => {
      const cx      = ML + (i + 0.5) * colW;
      const dObj    = new Date(`${date}T12:00:00`);
      const isToday = date === new Date().toISOString().slice(0, 10);
      const color   = isToday ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.25)';

      ctx.font      = compact ? '44px VT323, monospace' : '26px VT323, monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(DAYS[dObj.getDay()], cx, H - MB + 38);

      if (!compact) {
        ctx.font      = '22px VT323, monospace';
        ctx.fillStyle = isToday ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.18)';
        ctx.fillText(`${MONTHS[dObj.getMonth()]} ${dObj.getDate()}`, cx, H - MB + 60);
      }

      const entry = entryByDate.get(date);
      if (!entry) return;

      const startM = toM(entry.sleep_start);
      const endM   = toM(entry.wake_time);
      const top    = yFor(Math.min(startM, endM));
      const bot    = yFor(Math.max(startM, endM));
      const barH   = Math.max(4, bot - top);
      const barClr   = target ? barColor(entry, target) : '#60a5fa';
      const isHovered = entry.date === hoveredDate;
      const drawClr   = isHovered ? saturate(barClr) : barClr;

      ctx.globalAlpha = isHovered ? 1 : 0.9;
      ctx.fillStyle   = drawClr;
      ctx.fillRect(cx - barW / 2, top, barW, barH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#000';
      ctx.lineWidth   = 2;
      ctx.strokeRect(cx - barW / 2, top, barW, barH);

      newBars.push({ x: cx - barW / 2, y: top, w: barW, h: barH, entry, color: barClr });
    });

    barsRef.current = newBars;
  }, [sessions, target, compact, hoveredDate]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;

    const hit = barsRef.current.find(b =>
      mx >= b.x && mx <= b.x + b.w &&
      my >= b.y && my <= b.y + b.h
    );

    if (hit) {
      setHoveredDate(hit.entry.date);
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        entry: hit.entry,
        color: hit.color,
      });
    } else {
      setHoveredDate(null);
      setTooltip(null);
    }
  }

  function fmtDuration(entry: SleepEntry): string {
    const d = durationMin(entry);
    return `${Math.floor(d / 60)}h ${d % 60}m`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      {/* ── Section title ── */}
      {!hideTitle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: YELLOW, display: 'flex', alignItems: 'center' }}>
            <CalendarRange size={22} />
          </span>
          <span style={{
            fontFamily: VT, fontSize: '1.6rem', letterSpacing: '4px',
            color: YELLOW, textTransform: 'uppercase', lineHeight: 1,
          }}>weekly review</span>
        </div>
      )}

      {/* ── Canvas + tooltip wrapper ── */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
              position: 'absolute',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, calc(-100% - 14px))',
              background: 'rgba(10,10,10,0.92)',
              border: `1px solid ${tooltip.color}44`,
              padding: '8px 14px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}>
              <div style={{
                fontFamily: VT, fontSize: '1.3rem', letterSpacing: '2px',
                color: '#fff', lineHeight: 1.2,
              }}>
                {fmtTime(tooltip.entry.sleep_start)} – {fmtTime(tooltip.entry.wake_time)}
              </div>
              <div style={{
                fontFamily: VT, fontSize: '1.1rem', letterSpacing: '2px',
                color: 'rgba(255,255,255,0.55)', lineHeight: 1.2,
              }}>
                {fmtDuration(tooltip.entry)}
              </div>
              <div style={{
                fontFamily: "'Georgia', serif", fontSize: '0.68rem',
                fontStyle: 'italic', color: status.color,
                marginTop: 4, lineHeight: 1,
              }}>
                {status.text}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
