import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import type { SleepEntry } from '../lib/sleepDb';

const VT  = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#6366f1';

// ── Time bar: 22:00 → 12:00 (14 hours) ───────────────────────────────────────
const BAR_START  = 22 * 60;  // 1320 min from midnight
const BAR_SPAN   = 14 * 60;  // 840 min
const SNAP_MIN   = 5;        // 5-minute increments

const TICK_HOURS    = [22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LABELED_HOURS = new Set([22, 0, 3, 6, 9, 12]);

function hourToPos(h: number): number {
  const abs = h >= 22 ? h : h + 24;
  return (abs * 60 - BAR_START) / BAR_SPAN;
}

// Snap raw position to nearest 5-minute grid
function snapPos(pos: number): number {
  const mins    = pos * BAR_SPAN;
  const snapped = Math.round(mins / SNAP_MIN) * SNAP_MIN;
  return Math.max(0, Math.min(1, snapped / BAR_SPAN));
}

function posToHHMM(pos: number): string {
  const totalMin = BAR_START + Math.round(pos * BAR_SPAN);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function durLabel(a: number, b: number): string {
  const mins = Math.round(Math.abs(b - a) * BAR_SPAN);
  return `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, '0')}m`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildDatetimes(date: string, sleepHHMM: string, wakeHHMM: string) {
  const [sh] = sleepHHMM.split(':').map(Number);
  const [wh] = wakeHHMM.split(':').map(Number);
  const sleepDate = sh < 14 ? addDays(date, 1) : date;
  const wakeDate  =
    (sh >= 14 && wh < 14) || (wh < sh && wh < 14)
      ? addDays(sleepDate, 1)
      : sleepDate;
  return {
    sleep_start: `${sleepDate}T${sleepHHMM}:00`,
    wake_time:   `${wakeDate}T${wakeHHMM}:00`,
  };
}

function fmtDateBtn(d: Date | undefined): string {
  if (!d) return 'select date';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Sleep time bar ────────────────────────────────────────────────────────────
interface SleepBarProps {
  onChange: (sleepHHMM: string | null, wakeHHMM: string | null) => void;
}

function SleepBar({ onChange }: SleepBarProps) {
  const barRef      = useRef<HTMLDivElement>(null);
  const dragging    = useRef(false);
  const anchorRef   = useRef(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const [selA,  setSelA]  = useState<number | null>(null);
  const [selB,  setSelB]  = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null); // raw, used for line + tooltip

  const getRawPos = useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const raw = getRawPos(e.clientX);
      setHover(raw);
      if (!dragging.current) return;
      setSelA(anchorRef.current);
      setSelB(snapPos(raw));
    };
    const onUp = (e: MouseEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      setSelB(snapPos(getRawPos(e.clientX)));
      setHover(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [getRawPos]);

  const selStart = selA !== null && selB !== null ? Math.min(selA, selB) : null;
  const selEnd   = selA !== null && selB !== null ? Math.max(selA, selB) : null;
  const hasSelection = selStart !== null && selEnd !== null && selEnd > selStart + 0.005;

  useEffect(() => {
    if (hasSelection) {
      onChangeRef.current(posToHHMM(selStart!), posToHHMM(selEnd!));
    } else {
      onChangeRef.current(null, null);
    }
  }, [selStart, selEnd, hasSelection]);

  const snappedHover = hover !== null ? snapPos(hover) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, userSelect: 'none' }}>

      {/* Bar + hover tooltip layer */}
      <div style={{ position: 'relative' }}>

        {/* Hover time tooltip — above bar, follows cursor */}
        {snappedHover !== null && !dragging.current && (
          <div style={{
            position:      'absolute',
            bottom:        '100%',
            left:          `${snappedHover * 100}%`,
            transform:     'translateX(-50%)',
            marginBottom:  4,
            background:    '#0d0d20',
            border:        `1px solid ${ACC}55`,
            padding:       '1px 6px',
            fontFamily:    VT,
            fontSize:      '1.1rem',
            letterSpacing: 1,
            color:         'rgba(255,255,255,0.9)',
            whiteSpace:    'nowrap',
            pointerEvents: 'none',
            zIndex:        10,
          }}>
            {posToHHMM(snappedHover)}
          </div>
        )}

        {/* The bar */}
        <div
          ref={barRef}
          onMouseDown={e => {
            const p = snapPos(getRawPos(e.clientX));
            anchorRef.current = p;
            dragging.current  = true;
            setSelA(p); setSelB(p);
          }}
          onMouseMove={e => setHover(getRawPos(e.clientX))}
          onMouseLeave={() => { if (!dragging.current) setHover(null); }}
          style={{
            position:   'relative',
            width:      '100%',
            height:     28,
            background: 'rgba(255,255,255,0.04)',
            border:     '1px solid rgba(255,255,255,0.1)',
            cursor:     'crosshair',
            boxSizing:  'border-box',
          }}
        >
          {/* Tick marks */}
          {TICK_HOURS.map(h => {
            const pos     = hourToPos(h);
            const labeled = LABELED_HOURS.has(h);
            return (
              <div key={h} style={{
                position:      'absolute',
                left:          `${pos * 100}%`,
                top:           0,
                width:         1,
                height:        labeled ? '100%' : '40%',
                background:    labeled ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
                pointerEvents: 'none',
              }} />
            );
          })}

          {/* Selection fill */}
          {hasSelection && (
            <div style={{
              position:      'absolute',
              left:          `${selStart! * 100}%`,
              width:         `${(selEnd! - selStart!) * 100}%`,
              top:           0, bottom: 0,
              background:    'rgba(250,204,21,0.18)',
              borderLeft:    '2px solid #facc15',
              borderRight:   '2px solid #facc15',
              pointerEvents: 'none',
            }} />
          )}

          {/* Hover line (snapped) */}
          {snappedHover !== null && (
            <div style={{
              position:      'absolute',
              left:          `${snappedHover * 100}%`,
              top:           0, bottom: 0,
              width:         1,
              background:    'rgba(255,255,255,0.3)',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      </div>

      {/* Hour labels */}
      <div style={{ position: 'relative', height: 14, flexShrink: 0 }}>
        {TICK_HOURS.filter(h => LABELED_HOURS.has(h)).map(h => (
          <span key={h} style={{
            position:      'absolute',
            left:          `${hourToPos(h) * 100}%`,
            transform:     'translateX(-50%)',
            fontFamily:    VT,
            fontSize:      '0.95rem',
            color:         'rgba(255,255,255,0.55)',
            whiteSpace:    'nowrap',
            letterSpacing: 0.5,
          }}>
            {h.toString().padStart(2, '0')}
          </span>
        ))}
      </div>

      {/* Selection readout — right-aligned */}
      <div style={{
        display:        'flex',
        justifyContent: 'flex-end',
        fontFamily:     VT,
        fontSize:       '1.4rem',
        letterSpacing:  1.5,
        minHeight:      28,
      }}>
        {hasSelection ? (
          <span>
            <span style={{ color: '#facc15' }}>{posToHHMM(selStart!)}</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}> → </span>
            <span style={{ color: '#facc15' }}>{posToHHMM(selEnd!)}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 10 }}>
              [{durLabel(selStart!, selEnd!)}]
            </span>
          </span>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>drag to select</span>
        )}
      </div>
    </div>
  );
}

// ── Date picker (popup) ───────────────────────────────────────────────────────
interface DatePickerProps {
  date:       Date | undefined;
  onSelect:   (d: Date) => void;
  isDisabled: (d: Date) => boolean;
}

function DatePicker({ date, onSelect, isDisabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background:    open ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)',
          border:        `1px solid ${open ? ACC : 'rgba(99,102,241,0.3)'}`,
          color:         date ? '#fff' : 'rgba(255,255,255,0.35)',
          fontFamily:    VT,
          fontSize:      '1rem',
          letterSpacing: 1.5,
          padding:       '5px 14px',
          cursor:        'pointer',
          outline:       'none',
          transition:    'background 0.12s, border-color 0.12s',
        }}
      >
        {fmtDateBtn(date)}
      </button>

      {open && (
        <div style={{
          position:  'absolute',
          top:       'calc(100% + 4px)',
          left:      0,
          zIndex:    200,
          background:'#06060f',
          border:    `1px solid rgba(99,102,241,0.3)`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        }}
        className="dark"
        >
          <Calendar
            mode="single"
            selected={date}
            onSelect={d => {
              if (d && !isDisabled(d)) {
                onSelect(d);
                setOpen(false);
              }
            }}
            disabled={isDisabled}
            modifiersStyles={{
              disabled: { opacity: 0.2, cursor: 'not-allowed' },
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface SubmitPayload {
  date:        string;
  sleep_start: string;
  wake_time:   string;
  notes:       string;
}

interface Props {
  existingEntries: SleepEntry[];
  onSubmit: (entry: SubmitPayload) => void;
  onClose:  () => void;
}

export default function LogEntryModal({ existingEntries, onSubmit, onClose }: Props) {
  const [date,      setDate]      = useState<Date | undefined>(new Date());
  const [sleepHHMM, setSleepHHMM] = useState<string | null>(null);
  const [wakeHHMM,  setWakeHHMM]  = useState<string | null>(null);
  const [notes,     setNotes]     = useState('');
  const [visible,   setVisible]   = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(onClose, 180);
  }

  const loggedDates = new Set(existingEntries.map(e => e.date));
  const toLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = toLocalDate(new Date());
  const isDisabled  = (d: Date) => toLocalDate(d) > today || loggedDates.has(toLocalDate(d));

  const canSave = date !== undefined && sleepHHMM !== null && wakeHHMM !== null;

  function handleSave() {
    if (!canSave) return;
    const dateStr = toLocalDate(date!);
    const { sleep_start, wake_time } = buildDatetimes(dateStr, sleepHHMM!, wakeHHMM!);
    onSubmit({ date: dateStr, sleep_start, wake_time, notes });
  }

  const handleBarChange = useCallback((s: string | null, w: string | null) => {
    setSleepHHMM(s);
    setWakeHHMM(w);
  }, []);

  return (
    <div
      style={{
        position:   'fixed', inset: 0, zIndex: 9000,
        background: visible ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0)',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.18s ease',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div style={{
        background:    '#06060f',
        border:        `1px solid rgba(99,102,241,0.3)`,
        padding:       '28px 32px',
        width:         520,
        display:       'flex',
        flexDirection: 'column',
        gap:           22,
        maxHeight:     '90vh',
        overflowY:     'auto',
        boxSizing:     'border-box',
        opacity:       visible ? 1 : 0,
        transform:     visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
        transition:    'opacity 0.18s ease, transform 0.18s ease',
      }}>

        {/* ── Date ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>date</SectionLabel>
          <DatePicker date={date} onSelect={setDate} isDisabled={isDisabled} />
        </section>

        {/* ── Sleep log ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>sleep log</SectionLabel>
          <SleepBar onChange={handleBarChange} />
        </section>

        {/* ── Notes ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>notes (optional)</SectionLabel>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') dismiss();
            }}
            placeholder="..."
            style={{
              background:    'rgba(99,102,241,0.06)',
              border:        '1px solid rgba(99,102,241,0.22)',
              color:         '#fff',
              fontFamily:    VT,
              fontSize:      '1rem',
              letterSpacing: 1,
              padding:       '5px 10px',
              outline:       'none',
              width:         '100%',
              boxSizing:     'border-box',
            }}
          />
        </section>

        {/* ── Actions ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 4 }}>
          <Btn label="CANCEL" onClick={dismiss} dim />
          <Btn label="SAVE"   onClick={handleSave} disabled={!canSave} />
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    VT,
      fontSize:      '1.1rem',
      letterSpacing: 3,
      color:         'rgba(99,102,241,0.9)',
      textTransform: 'uppercase',
      borderBottom:  '1px solid rgba(99,102,241,0.2)',
      paddingBottom: 5,
    }}>
      [{children}]
    </div>
  );
}

function Btn({ label, onClick, dim, disabled }: {
  label:     string;
  onClick:   () => void;
  dim?:      boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        all:           'unset',
        fontFamily:    VT,
        fontSize:      '1rem',
        letterSpacing: 2,
        color:         dim ? 'rgba(255,255,255,0.28)' : disabled ? 'rgba(99,102,241,0.25)' : ACC,
        cursor:        disabled ? 'default' : 'pointer',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </button>
  );
}
