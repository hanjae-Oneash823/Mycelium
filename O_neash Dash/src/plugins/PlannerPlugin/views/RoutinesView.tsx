import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'pixelarticons/react/Plus';
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft';
import { ChevronRight } from 'pixelarticons/react/ChevronRight';
import { useRoutineStore } from '../store/useRoutineStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { loadRoutineCompletedCounts, deleteRoutineNodeByDate } from '../lib/routineDb';
import { loadRoutineNodesForWeek } from '../lib/plannerDb';
import RoutineForm from '../components/RoutineForm';
import type { Routine, PlannerNode, PlannerGroup } from '../types';
import type { RoutineFormData } from '../components/RoutineForm';

// ── date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function getWeekMon(offset: number): Date {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  return addDays(today, (dow === 0 ? -6 : 1 - dow) + offset * 7);
}
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtDate(d: Date): string {
  return `${DAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

// ── recurrence text ───────────────────────────────────────────────────────────

function recurrenceLabel(r: Routine): string {
  const rule = r.rules?.[0];
  if (!rule) return 'manual';
  if (rule.freq === 'daily')   return rule.repeat_interval === 1 ? 'every day' : `every ${rule.repeat_interval} days`;
  if (rule.freq === 'monthly') return rule.repeat_interval === 1 ? 'every month' : `every ${rule.repeat_interval} months`;
  if (rule.freq === 'weekly') {
    if (rule.days?.length) return `every ${rule.days.map(d => DAY_SHORT[d]).join(', ')}`;
    return rule.repeat_interval === 1 ? 'every week' : `every ${rule.repeat_interval} weeks`;
  }
  return 'fixed';
}

function normalizeTime(t: string): string {
  if (t.includes(':')) return t;
  if (t.length === 4) return `${t.slice(0,2)}:${t.slice(2)}`;
  if (t.length === 3) return `0${t.slice(0,1)}:${t.slice(1)}`;
  return t;
}

function addMins(time: string, mins: number): string {
  const [h, m] = normalizeTime(time).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

// ── RoutineCard ───────────────────────────────────────────────────────────────

interface CardProps {
  routine:      Routine;
  nodes:        PlannerNode[];
  done:         number;
  arcName?:     string;
  arcColor?:    string;
  projectName?: string;
  groups:       PlannerGroup[];
  highlighted?: boolean;
  onEdit:       () => void;
  onDelete:     () => void;
}

function RoutineCard({ routine, nodes, done, arcName, arcColor, projectName, groups, highlighted, onEdit, onDelete }: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Next upcoming occurrence
  const today    = toDateStr(new Date());
  const tomorrow = toDateStr(addDays(new Date(), 1));
  const nextDate = nodes
    .map(n => (n.planned_start_at ?? '').slice(0, 10))
    .filter(d => d >= today)
    .sort()[0];

  let statusLabel = '';
  let statusColor = 'rgba(255,255,255,0.28)';
  if (nextDate === today) {
    statusLabel = 'TODAY';
    statusColor = 'var(--teal)';
  } else if (nextDate === tomorrow) {
    statusLabel = 'TOMORROW';
    statusColor = 'rgba(255,255,255,0.55)';
  } else if (nextDate) {
    const d = new Date(nextDate + 'T12:00:00');
    statusLabel = DAY_SHORT[d.getDay()].toUpperCase();
    statusColor = 'rgba(255,255,255,0.38)';
  }

  // Time range from first rule
  const rule = routine.rules?.[0];
  const timeRange = (() => {
    if (!rule?.start_time) return '';
    const t = normalizeTime(rule.start_time);
    return rule.duration_minutes ? `${t}–${addMins(t, rule.duration_minutes)}` : t;
  })();

  const pending = nodes.length;
  const total   = done + pending;
  const pct     = total > 0 ? done / total : 0;

  const infoLine = [recurrenceLabel(routine), timeRange]
    .filter(Boolean).join(' · ');

  const contextLine = [arcName, projectName].filter(Boolean).join(' › ');

  const cardGroups = groups.filter(g => (routine.group_ids ?? []).includes(g.id) && g.name);

  return (
    <div className="routine-card" style={{
      border: `1px solid ${highlighted ? 'rgba(192,132,252,0.5)' : 'rgba(255,255,255,0.18)'}`,
      background: highlighted ? 'rgba(192,132,252,0.07)' : nextDate === today ? 'rgba(0,196,167,0.04)' : 'rgba(255,255,255,0.018)',
      padding: '12px 12px',
      display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      {/* Top row: type badge + status badge + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.85rem', letterSpacing: 1,
            color: routine.node_type === 'event' ? 'rgba(192,132,252,0.7)' : 'rgba(0,196,167,0.6)',
          }}>
            {routine.node_type.toUpperCase()}
          </span>
          <div
            className={nextDate === today ? 'routine-today-blink' : undefined}
            style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1rem', color: statusColor, letterSpacing: 1 }}
          >
            {statusLabel ? `[ ${statusLabel} ]` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={onEdit} className="routine-edit-btn" style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '1px 10px',
            color: 'rgba(255,255,255,0.4)', fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            fontSize: '1rem', cursor: 'pointer', letterSpacing: 1,
            transition: 'border-color 0.15s, color 0.15s',
          }}>[ edit ]</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(p => !p)} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '1px 8px',
              color: 'rgba(255,255,255,0.28)', fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: '1rem', cursor: 'pointer',
            }}>▼</button>
            {menuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 50,
                background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', minWidth: 100,
              }}>
                <button onClick={() => { setMenuOpen(false); onDelete(); }} style={{
                  display: 'block', width: '100%', background: 'none', border: 'none',
                  color: 'var(--cr)', fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                  fontSize: '1rem', padding: '5px 10px', cursor: 'pointer', textAlign: 'left',
                }}>delete</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.3rem', letterSpacing: 1,
        color: routine.importance_level ? 'var(--yellow)' : '#fff',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {routine.importance_level ? '★ ' : ''}{routine.title}
      </div>

      {/* Recurrence + time */}
      <div style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.95rem', color: 'rgba(255,255,255,0.32)', letterSpacing: 0.5 }}>
        {infoLine || recurrenceLabel(routine)}
      </div>

      {/* Arc / project */}
      {contextLine && (
        <div style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.95rem', letterSpacing: 0.5 }}>
          {arcName && <span style={{ color: arcColor ?? 'rgba(255,255,255,0.35)' }}>{arcName}</span>}
          {arcName && projectName && <span style={{ color: 'rgba(255,255,255,0.2)' }}> › </span>}
          {projectName && <span style={{ color: arcColor ? `${arcColor}99` : 'rgba(255,255,255,0.25)' }}>{projectName}</span>}
        </div>
      )}

      {/* Group badges — hidden */}
      {false && cardGroups.length > 0 && (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {cardGroups.map(g => (
            <span key={g.id} style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.82rem', letterSpacing: '0.5px',
              padding: '0.1rem 0.45rem', background: g.color_hex, color: '#fff',
            }}>
              {g.name}
            </span>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <div style={{
          flex: 1, height: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct * 100}%`,
            background: pct >= 1 ? 'var(--c2)' : nextDate === today ? 'var(--teal)' : 'rgba(255,255,255,0.25)',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{
          fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.05rem',
          color: 'rgba(255,255,255,0.65)', flexShrink: 0,
        }}>
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

// ── WeekTimeView ──────────────────────────────────────────────────────────────

const HOUR_H = 48; // px per hour

interface WeekTimeViewProps {
  weekOffset:       number;
  setOffset:        (n: number) => void;
  nodes:            PlannerNode[];
  hoveredRoutineId: string | null;
  onHoverRoutine:   (id: string | null) => void;
  arcs:             { id: string; color_hex: string }[];
  projects:         { id: string; arc_id?: string | null }[];
}

function getArcColor(n: PlannerNode, arcs: { id: string; color_hex: string }[], projects: { id: string; arc_id?: string | null }[]): string {
  if (n.arc_id) return arcs.find(a => a.id === n.arc_id)?.color_hex ?? '#c084fc';
  if (n.project_id) {
    const proj = projects.find(p => p.id === n.project_id);
    if (proj?.arc_id) return arcs.find(a => a.id === proj.arc_id)?.color_hex ?? '#c084fc';
  }
  return n.node_type === 'event' ? '#c084fc' : 'var(--teal)';
}

function WeekTimeView({ weekOffset, setOffset, nodes, hoveredRoutineId, onHoverRoutine, arcs, projects }: WeekTimeViewProps) {
  const [now, setNow] = useState(new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ title: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const END_HOUR   = 24; // midnight

  const mon   = getWeekMon(weekOffset);
  const days  = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const today = toDateStr(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, PlannerNode[]>();
    for (const d of days) map.set(toDateStr(d), []);
    for (const n of nodes) {
      const k = (n.planned_start_at ?? '').slice(0, 10);
      if (map.has(k)) map.get(k)!.push(n);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, weekOffset]);

  // Dynamically lower START_HOUR if any node this week starts before 9AM
  const START_HOUR = useMemo(() => {
    let earliest = 9;
    for (const dayNodes of byDay.values()) {
      for (const n of dayNodes) {
        const t = n.planned_start_at;
        if (t && t.length > 10) {
          const h = parseInt(t.slice(11, 13), 10);
          if (!isNaN(h) && h < earliest) earliest = h;
        }
      }
    }
    return earliest;
  }, [byDay]);

  const TOTAL_HRS  = END_HOUR - START_HOUR;
  const LABEL_W = 32;

  // Compute HOUR_H dynamically so the grid fills available height exactly
  const [hourH, setHourH] = useState(36);
  useEffect(() => {
    if (!gridRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setHourH(Math.max(20, entry.contentRect.height / TOTAL_HRS));
    });
    obs.observe(gridRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid rgba(255,255,255,0.18)', padding: '0.75rem 1rem' }}>

      {/* Week nav: this-week left, nav centred */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
        <button
          onClick={() => setOffset(0)}
          style={{
            background: weekOffset === 0 ? 'rgba(0,196,167,0.12)' : 'none',
            border: `1px solid ${weekOffset === 0 ? 'rgba(0,196,167,0.4)' : 'rgba(255,255,255,0.12)'}`,
            color: weekOffset === 0 ? 'var(--teal)' : 'rgba(255,255,255,0.4)',
            fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1rem',
            padding: '1px 10px', cursor: 'pointer', letterSpacing: 1,
            transition: 'all 0.12s',
          }}
        >this week</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <button onClick={() => setOffset(weekOffset - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 0 }}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>
            {MONTH_SHORT[mon.getMonth()]} {mon.getDate()} – {fmtDate(addDays(mon, 6))}
          </span>
          <button onClick={() => setOffset(weekOffset + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 0 }}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'flex', paddingLeft: LABEL_W, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>
        {days.map(d => {
          const key = toDateStr(d);
          const isToday = key === today;
          return (
            <div key={key} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.95rem', color: isToday ? 'var(--teal)' : 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
                {DAY_SHORT[d.getDay()].toUpperCase()}
              </div>
              <div style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.3rem', color: isToday ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed-height time grid — no scroll */}
      <div ref={gridRef} style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>

          {/* Hour labels */}
          <div style={{ width: LABEL_W, flexShrink: 0, position: 'relative' }}>
            {Array.from({ length: TOTAL_HRS }, (_, i) => {
              const h = i + START_HOUR;
              return (
                <div key={h} style={{
                  position: 'absolute', top: i * hourH - 7,
                  right: 5, fontSize: '0.9rem',
                  fontFamily: "'VT323', 'HBIOS-SYS', monospace",
                  color: 'rgba(255,255,255,0.35)',
                  lineHeight: 1, userSelect: 'none',
                }}>
                  {String(h).padStart(2, '0')}
                </div>
              );
            })}
          </div>

          {/* Grid + day columns */}
          <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
            {/* Hour lines */}
            {Array.from({ length: TOTAL_HRS }, (_, i) => {
              const h = i + START_HOUR;
              return (
                <div key={h} style={{
                  position: 'absolute', top: i * hourH, left: 0, right: 0,
                  height: h % 3 === 0 ? 2 : 1,
                  background: h % 3 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
                  pointerEvents: 'none',
                }} />
              );
            })}

            {days.map((d, di) => {
              const key = toDateStr(d);
              const isToday = key === today;
              const dayNodes = byDay.get(key) ?? [];

              return (
                <div key={key} style={{
                  flex: 1, position: 'relative',
                  borderLeft: di === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  background: isToday ? 'rgba(255,255,255,0.02)' : 'transparent',
                }}>
                  {/* Current-time red line */}
                  {isToday && (() => {
                    const topPct = (now.getHours() * 60 + now.getMinutes()) / 60 - START_HOUR;
                    if (topPct < 0 || topPct > TOTAL_HRS) return null;
                    return (
                      <div style={{
                        position: 'absolute',
                        top: topPct * hourH,
                        left: 0, right: 0, height: 2,
                        background: '#ff3b3b', zIndex: 5, pointerEvents: 'none',
                      }}>
                        <div style={{
                          position: 'absolute', left: -3, top: -3,
                          width: 8, height: 8, borderRadius: '50%',
                          background: '#ff3b3b',
                        }} />
                      </div>
                    );
                  })()}

                  {/* Event/task blocks — no text, no buttons */}
                  {dayNodes.map(n => {
                    const timeStr = n.planned_start_at && n.planned_start_at.length > 10
                      ? n.planned_start_at.slice(11, 16)
                      : null;
                    if (!timeStr) return null;
                    const [h, m] = timeStr.split(':').map(Number);
                    const topPx = (h + m / 60 - START_HOUR) * hourH;
                    if (topPx < 0) return null;
                    const dur = n.estimated_duration_minutes ?? 30;
                    const heightPx = Math.max(4, dur / 60 * hourH);
                    const isHov = hoveredRoutineId === n.routine_id;
                    const nodeColor = getArcColor(n, arcs, projects);

                    return (
                      <div
                        key={n.id}
                        onMouseEnter={e => {
                          onHoverRoutine(n.routine_id ?? null);
                          setTooltip({ title: n.title, x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                        onMouseLeave={() => { onHoverRoutine(null); setTooltip(null); }}
                        style={{
                          position: 'absolute',
                          top: topPx, left: 2, right: 2, height: heightPx,
                          background: nodeColor,
                          opacity: n.is_completed ? 0.3 : isHov ? 1 : 0.82,
                          zIndex: 2,
                          transition: 'opacity 0.1s',
                          cursor: 'default',
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hover tooltip — portalled to body to escape any fixed/transformed ancestors */}
      {tooltip && createPortal(
        <div style={{
          position: 'fixed',
          left: tooltip.x + 12,
          top: tooltip.y - 28,
          background: '#111',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
          fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          fontSize: '1rem',
          letterSpacing: '0.5px',
          padding: '2px 10px',
          pointerEvents: 'none',
          zIndex: 9999,
          whiteSpace: 'nowrap',
        }}>
          {tooltip.title}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── RoutinesView ──────────────────────────────────────────────────────────────

export default function RoutinesView() {
  const { routines, loadAll, deleteRoutine, createRoutineComplete, updateRoutineWithRules } = useRoutineStore();
  const { nodes, groups, arcs, projects, completeNode, deleteNode, loadAll: reloadNodes } = usePlannerStore();
  const [completedCounts, setCompletedCounts] = useState<Record<string, number>>({});

  const [weekOffset,       setWeekOffset]       = useState(0);
  const [formOpen,         setFormOpen]         = useState(false);
  const [editRoutine,      setEditRoutine]      = useState<Routine | null>(null);
  const [hoveredRoutineId, setHoveredRoutineId] = useState<string | null>(null);

  useEffect(() => {
    loadAll().then(() => reloadNodes());
    loadRoutineCompletedCounts().then(setCompletedCounts);
  }, []);

  // Routine nodes grouped by routine_id
  const nodesByRoutine = useMemo(() => {
    const m = new Map<string, PlannerNode[]>();
    for (const n of nodes) {
      if (!n.is_routine || !n.routine_id) continue;
      if (!m.has(n.routine_id)) m.set(n.routine_id, []);
      m.get(n.routine_id)!.push(n);
    }
    return m;
  }, [nodes]);

  // Routine nodes in the selected week — includes completed ones via direct DB query
  const [weekNodes, setWeekNodes] = useState<PlannerNode[]>([]);
  useEffect(() => {
    const mon  = getWeekMon(weekOffset);
    const from = toDateStr(mon);
    const to   = toDateStr(addDays(mon, 6));
    loadRoutineNodesForWeek(from, to).then(setWeekNodes);
  }, [weekOffset, nodes]); // re-fetch when nodes change (completions etc.)

  const handleSave = async (data: RoutineFormData) => {
    const { group_ids, rules, ...routineData } = data;
    if (editRoutine) {
      await updateRoutineWithRules(editRoutine.id, routineData, rules ?? [], group_ids ?? []);
    } else {
      await createRoutineComplete(routineData, rules ?? [], group_ids);
    }
    await reloadNodes();
    loadRoutineCompletedCounts().then(setCompletedCounts);
    setFormOpen(false);
    setEditRoutine(null);
  };

  const handleComplete = async (nodeId: string) => {
    await completeNode(nodeId);
  };

  const handleDelete = async (nodeId: string) => {
    await deleteNode(nodeId);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        .routine-card:hover { border-color: rgba(255,255,255,0.35) !important; background: rgba(255,255,255,0.035) !important; }
        .routine-edit-btn:hover { border-color: rgba(255,255,255,0.3) !important; color: rgba(255,255,255,0.85) !important; }
        .routine-add-btn:hover { border-color: rgba(0,196,167,0.75) !important; background: rgba(0,196,167,0.06) !important; }
        @keyframes routine-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.12; } }
        .routine-today-blink { animation: routine-blink 1.1s infinite; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setEditRoutine(null); setFormOpen(true); }}
          className="routine-add-btn"
          style={{
            background: 'none', border: '1px solid rgba(0,196,167,0.4)',
            color: 'var(--teal)', fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1rem',
            padding: '2px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <Plus size={14} /> new routine
        </button>
      </div>

      {/* Main: left=week timeline, right=3-col grid */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20, overflow: 'hidden' }}>

        {/* Left: week time view */}
        <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <WeekTimeView
            weekOffset={weekOffset}
            setOffset={setWeekOffset}
            nodes={weekNodes}
            hoveredRoutineId={hoveredRoutineId}
            onHoverRoutine={setHoveredRoutineId}
            arcs={arcs}
            projects={projects}
          />
        </div>

        {/* Right: 3-column grid */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {routines.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1rem' }}>
              no routines yet — create one with [ new routine ]
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[...routines].sort((a, b) => {
              const today = toDateStr(new Date());
              const nextFor = (id: string) => (nodesByRoutine.get(id) ?? [])
                .map(n => (n.planned_start_at ?? '').slice(0, 10))
                .filter(d => d >= today)
                .sort()[0] ?? '9999-99-99';
              return nextFor(a.id).localeCompare(nextFor(b.id));
            }).map(r => {
              const arc     = arcs.find(a => a.id === r.arc_id);
              const project = projects.find(p => p.id === r.project_id);
              return (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  nodes={nodesByRoutine.get(r.id) ?? []}
                  done={completedCounts[r.id] ?? 0}
                  arcName={arc?.name}
                  arcColor={arc?.color_hex}
                  projectName={project?.name}
                  groups={groups}
                  highlighted={hoveredRoutineId === r.id}
                  onEdit={() => { setEditRoutine(r); setFormOpen(true); }}
                  onDelete={() => deleteRoutine(r.id).then(() => {
                    reloadNodes();
                    loadRoutineCompletedCounts().then(setCompletedCounts);
                  })}
                />
              );
            })}
          </div>
        </div>
      </div>

      {formOpen && (
        <RoutineForm
          initial={editRoutine}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditRoutine(null); }}
          onRemoveManualOcc={editRoutine ? async (date) => {
            await deleteRoutineNodeByDate(editRoutine.id, date);
            await reloadNodes();
          } : undefined}
        />
      )}
    </div>
  );
}
