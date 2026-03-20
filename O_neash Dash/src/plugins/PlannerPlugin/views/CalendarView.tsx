import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import { getDotColor } from '../types';
import type { PlannerNode } from '../types';

/** Local calendar date key — always uses the local date (not UTC) so columns and events align in all timezones. */
function localKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PX_PER_HOUR = 64;
const LABEL_W = 52;
const COL_MIN_W = 110;
const GRID_START_H = 4; // 4am baseline

const TIME_LABELS = [4, 7, 9, 12, 15, 18, 21, 24, 26]; // 26 = 2am next day

function formatHour(h: number): string {
  const h24 = h % 24;
  const ampm = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 || 12;
  return `${h12}${ampm}`;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function weekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const y = sunday.getFullYear();
  return `${monday.toLocaleDateString('en-US', opts).toUpperCase()} – ${sunday.toLocaleDateString('en-US', { ...opts, year: 'numeric' }).toUpperCase()}`;
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────

function pixelFromDatetime(dt: Date, baseDate: Date): number {
  const fourAM = new Date(baseDate);
  fourAM.setHours(GRID_START_H, 0, 0, 0);
  return (dt.getTime() - fourAM.getTime()) / 3600000 * PX_PER_HOUR;
}

function pixelFromHour(h: number): number {
  return (h - GRID_START_H) * PX_PER_HOUR;
}

const TOTAL_PX = 24 * PX_PER_HOUR; // 4am to 4am = 24h

// ── Float tray node ───────────────────────────────────────────────────────────

function FloatDot({ node, onEdit }: { node: PlannerNode; onEdit: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onEdit}
        style={{
          width: 10, height: 10, borderRadius: '50%',
          backgroundColor: getDotColor(node),
          cursor: 'pointer', flexShrink: 0,
        }}
      />
      {hover && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          background: '#111', border: '1px solid rgba(255,255,255,0.15)',
          padding: '4px 8px', whiteSpace: 'nowrap', zIndex: 100,
          fontSize: '0.75rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.8)',
          pointerEvents: 'none',
        }}>
          {node.title}
        </div>
      )}
    </div>
  );
}

// ── Event block ───────────────────────────────────────────────────────────────

function EventBlock({ node, baseDate, onEdit }: { node: PlannerNode; baseDate: Date; onEdit: () => void }) {
  if (!node.planned_start_at) return null;
  // Date-only events default to 9am local so they appear visibly in the grid
  const start = node.planned_start_at.includes('T')
    ? new Date(node.planned_start_at)
    : new Date(node.planned_start_at + 'T09:00:00');
  const topPx = pixelFromDatetime(start, baseDate);
  const heightPx = Math.max(24, ((node.estimated_duration_minutes ?? 60) / 60) * PX_PER_HOUR);
  const color = getDotColor(node);

  return (
    <div
      onClick={onEdit}
      style={{
        position: 'absolute',
        top: topPx,
        left: 3, right: 3,
        height: heightPx,
        background: `${color}22`,
        border: `1px solid ${color}88`,
        padding: '2px 5px',
        overflow: 'hidden',
        cursor: 'pointer',
        zIndex: 2,
      }}
    >
      <div style={{ fontSize: '0.72rem', letterSpacing: '0.5px', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} {node.title}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function CalendarView() {
  const { nodes, capacity } = usePlannerStore();
  const { openTaskFormEdit, openTaskForm } = useViewStore();

  const now = new Date();
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(now));
  const scrollRef = useRef<HTMLDivElement>(null);

  const peakStart = capacity?.peak_start ?? '09:00';
  const peakEnd   = capacity?.peak_end   ?? '12:00';
  const peakStartH = parseInt(peakStart.split(':')[0]);
  const peakEndH   = parseInt(peakEnd.split(':')[0]);

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = pixelFromHour(8);
    }
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Bucket nodes by day and time type
  const buckets = useMemo(() => {
    const floats = new Map<string, PlannerNode[]>(); // date → nodes without time
    const timed  = new Map<string, PlannerNode[]>(); // date → nodes with time

    for (const day of days) {
      const key = localKey(day);
      floats.set(key, []);
      timed.set(key, []);
    }

    for (const n of nodes) {
      if (!n.planned_start_at) continue;
      // Parse date-only strings as local midnight; ISO strings parse as-is
      const dt = n.planned_start_at.includes('T')
        ? new Date(n.planned_start_at)
        : new Date(n.planned_start_at + 'T00:00:00');
      const key = localKey(dt); // local date — avoids UTC offset shifting the day
      if (!floats.has(key)) continue;

      // Events always go to the timed grid (blocks); tasks without time go to float tray
      if (n.node_type === 'event' || n.planned_start_at.includes('T')) {
        timed.get(key)!.push(n);
      } else {
        floats.get(key)!.push(n);
      }
    }

    return { floats, timed };
  }, [nodes, days]);

  // Current time position
  const nowDayKey = localKey(now);
  const nowTopPx  = pixelFromDatetime(now, days.find(d => localKey(d) === nowDayKey) ?? now);

  const isCurrentWeek = days.some(d => localKey(d) === nowDayKey);

  const handleEmptyCellClick = useCallback((day: Date, hourDecimal: number) => {
    const dt = new Date(day);
    dt.setHours(Math.floor(hourDecimal), (hourDecimal % 1) * 60, 0, 0);
    const isoStr = `${localKey(dt)}T${String(Math.floor(hourDecimal)).padStart(2, '0')}:${String(Math.round((hourDecimal % 1) * 60)).padStart(2, '0')}:00`;
    openTaskForm({ planned_start_at: isoStr, node_type: 'event' });
  }, [openTaskForm]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'VT323', monospace" }}>

      {/* Week header nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <button onClick={() => setWeekStart(w => addDays(w, -7))} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)' }}>
          {weekLabel(weekStart)}
        </span>
        <button
          onClick={() => setWeekStart(getMondayOf(now))}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', letterSpacing: '1.5px', padding: '2px 8px', cursor: 'pointer' }}
        >TODAY</button>
        <button onClick={() => setWeekStart(w => addDays(w, 7))} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>›</button>
        <button
          onClick={() => openTaskForm()}
          style={{ background: 'transparent', border: '1px solid rgba(0,196,167,0.4)', color: '#00c4a7', fontSize: '0.85rem', letterSpacing: '2px', padding: '2px 10px', cursor: 'pointer' }}
        >＋ task</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', background: '#000' }}>
        <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0 }} />
        {days.map(day => {
          const key = localKey(day);
          const isToday = key === nowDayKey;
          return (
            <div
              key={key}
              style={{
                flex: 1, minWidth: COL_MIN_W,
                padding: '6px 4px', textAlign: 'center',
                background: isToday ? 'rgba(0,196,167,0.04)' : 'transparent',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ fontSize: '0.65rem', letterSpacing: '2px', color: isToday ? '#00c4a7' : 'rgba(255,255,255,0.35)' }}>
                {day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </div>
              <div style={{ fontSize: '1.1rem', letterSpacing: '1px', color: isToday ? '#00c4a7' : 'rgba(255,255,255,0.65)' }}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* FLOAT tray */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.07)', minHeight: 32, background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ width: LABEL_W, minWidth: LABEL_W, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
          <span style={{ fontSize: '0.55rem', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>float</span>
        </div>
        {days.map(day => {
          const key = localKey(day);
          const floatNodes = buckets.floats.get(key) ?? [];
          return (
            <div key={key} style={{ flex: 1, minWidth: COL_MIN_W, borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '4px 6px' }}>
              {floatNodes.map(n => (
                <FloatDot key={n.id} node={n} onEdit={() => openTaskFormEdit(n)} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', position: 'relative', height: TOTAL_PX }}>

          {/* Time labels column */}
          <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, position: 'relative' }}>
            {TIME_LABELS.map(h => (
              <div key={h} style={{ position: 'absolute', top: pixelFromHour(h), left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8 }}>
                <span style={{ fontSize: '0.6rem', letterSpacing: '1px', color: h === 9 ? 'rgba(0,196,167,0.5)' : 'rgba(255,255,255,0.2)', marginTop: -8, whiteSpace: 'nowrap' }}>
                  {h === 9 ? '★' : ''}{formatHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const key = localKey(day);
            const isToday = key === nowDayKey;
            const timedNodes = buckets.timed.get(key) ?? [];

            return (
              <div
                key={key}
                style={{
                  flex: 1, minWidth: COL_MIN_W,
                  position: 'relative', height: TOTAL_PX,
                  borderLeft: '1px solid rgba(255,255,255,0.05)',
                  background: isToday ? 'rgba(0,196,167,0.015)' : 'transparent',
                }}
                onDoubleClick={e => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const relY = e.clientY - rect.top;
                  const hourDecimal = GRID_START_H + relY / PX_PER_HOUR;
                  handleEmptyCellClick(day, hourDecimal);
                }}
              >
                {/* Hour lines */}
                {TIME_LABELS.map(h => (
                  <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: pixelFromHour(h), borderTop: `1px solid rgba(255,255,255,${h % 3 === 0 ? '0.07' : '0.03'})`, pointerEvents: 'none' }} />
                ))}

                {/* Night owl zone: 00:00–04:00 = hour 20–24 in our coordinate space */}
                <div style={{ position: 'absolute', top: pixelFromHour(20), left: 0, right: 0, height: pixelFromHour(24) - pixelFromHour(20), background: 'rgba(255,59,59,0.025)', pointerEvents: 'none' }} />

                {/* Peak band */}
                {peakStartH >= GRID_START_H && (
                  <div style={{
                    position: 'absolute',
                    top: pixelFromHour(peakStartH),
                    left: 0, right: 0,
                    height: (peakEndH - peakStartH) * PX_PER_HOUR,
                    background: 'rgba(0,196,167,0.025)',
                    pointerEvents: 'none',
                  }} />
                )}

                {/* NOW line */}
                {isToday && isCurrentWeek && (
                  <div style={{ position: 'absolute', top: nowTopPx, left: 0, right: 0, borderTop: '1px solid #ff3b3b', pointerEvents: 'none', zIndex: 3 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3b3b', marginTop: -3, marginLeft: -3 }} />
                  </div>
                )}

                {/* Timed nodes / events */}
                {timedNodes.map(n => (
                  <EventBlock key={n.id} node={n} baseDate={day} onEdit={() => openTaskFormEdit(n)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
