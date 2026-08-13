import { useState, useEffect, useMemo } from 'react';
import { Plus } from 'pixelarticons/react/Plus';
import { useRoutineStore } from '../store/useRoutineStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { useArcVisibilityStore } from '../../../store/useArcVisibilityStore';
import { loadRoutineCompletedCounts, deleteRoutineNodeByDate } from '../lib/routineDb';
import { loadRoutineNodesForWeek } from '../lib/plannerDb';
import RoutineForm from '../components/RoutineForm';
import type { Routine, PlannerNode } from '../types';
import type { RoutineFormData } from '../components/RoutineForm';

// ── date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

// ── RoutineRow — dense list row w/ inline habit heatmap ────────────────────────

const HEATMAP_DAYS = 21;
const VT = "var(--font-main), var(--font-kr), monospace";

interface RowProps {
  routine:      Routine;
  nodes:        PlannerNode[];
  done:         number;
  arcName?:     string;
  arcColor?:    string;
  projectName?: string;
  dayMap?:      Map<string, boolean>;
  onEdit:       () => void;
  onDelete:     () => void;
}

function RoutineRow({ routine, nodes, done, arcName, arcColor, projectName, dayMap, onEdit, onDelete }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hov, setHov] = useState(false);

  const today    = toDateStr(new Date());
  const tomorrow = toDateStr(addDays(new Date(), 1));
  const nextDate = nodes
    .map(n => (n.planned_start_at ?? '').slice(0, 10))
    .filter(d => d >= today)
    .sort()[0];

  let statusLabel = '';
  let statusColor = 'rgba(255,255,255,0.25)';
  if (nextDate === today) {
    statusLabel = 'TODAY';
    statusColor = 'var(--teal)';
  } else if (nextDate === tomorrow) {
    statusLabel = 'TMRW';
    statusColor = 'rgba(255,255,255,0.5)';
  } else if (nextDate) {
    const d = new Date(nextDate + 'T12:00:00');
    statusLabel = DAY_SHORT[d.getDay()].toUpperCase();
    statusColor = 'rgba(255,255,255,0.35)';
  }

  const rule = routine.rules?.[0];
  const timeRange = (() => {
    if (!rule?.start_time) return '';
    const t = normalizeTime(rule.start_time);
    return rule.duration_minutes ? `${t}–${addMins(t, rule.duration_minutes)}` : t;
  })();

  const pending = nodes.length;
  const total   = done + pending;

  const infoLine = [recurrenceLabel(routine), timeRange].filter(Boolean).join(' · ');
  const rowColor = routine.node_type === 'event' ? '#c084fc' : 'var(--teal)';

  const days = Array.from({ length: HEATMAP_DAYS }, (_, i) => toDateStr(addDays(new Date(), -(HEATMAP_DAYS - 1 - i))));

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '5px 10px',
        border: `1px solid ${hov ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.13)'}`,
        background: nextDate === today ? 'rgba(0,196,167,0.03)' : hov ? 'rgba(255,255,255,0.02)' : 'transparent',
        fontFamily: VT, fontSize: '1rem', letterSpacing: 0.5,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Status dot */}
      <span
        className={nextDate === today ? 'routine-today-blink' : undefined}
        title={statusLabel}
        style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }}
      />

      {/* Title */}
      <span style={{
        flex: '1 1 140px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: routine.importance_level ? 'var(--yellow)' : '#fff',
      }}>
        {routine.importance_level ? '★ ' : ''}{routine.title}
      </span>

      {/* Recurrence + time */}
      <span style={{
        flexShrink: 0, width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'rgba(255,255,255,0.32)', fontSize: '0.85rem',
      }}>
        {infoLine}
      </span>

      {/* Arc / project */}
      <span style={{ flexShrink: 0, width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
        {arcName && <span style={{ color: arcColor ?? 'rgba(255,255,255,0.35)' }}>{arcName}</span>}
        {arcName && projectName && <span style={{ color: 'rgba(255,255,255,0.2)' }}> › </span>}
        {projectName && <span style={{ color: arcColor ? `${arcColor}99` : 'rgba(255,255,255,0.25)' }}>{projectName}</span>}
      </span>

      {/* Habit heatmap — last 21 days */}
      <span style={{ display: 'flex', gap: 2, flexShrink: 0 }} title={`${HEATMAP_DAYS}-day history`}>
        {days.map(d => {
          const completed = dayMap?.get(d) === true;
          const scheduled = dayMap?.has(d) ?? false;
          const isToday = d === today;
          const color = completed ? rowColor : scheduled ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)';
          return (
            <span
              key={d}
              title={d}
              style={{
                width: 5, height: 14, background: color, flexShrink: 0,
                outline: isToday ? '1px solid rgba(255,255,255,0.4)' : 'none',
                outlineOffset: -1,
              }}
            />
          );
        })}
      </span>

      {/* Done / total */}
      <span style={{ flexShrink: 0, width: 48, textAlign: 'right', color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem' }}>
        {done}/{total}
      </span>

      {/* Actions */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button onClick={onEdit} className="routine-edit-btn" style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '1px 8px',
          color: 'rgba(255,255,255,0.4)', fontFamily: VT,
          fontSize: '0.85rem', cursor: 'pointer', letterSpacing: 1,
          transition: 'border-color 0.15s, color 0.15s',
        }}>edit</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(p => !p)} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '1px 8px',
            color: 'rgba(255,255,255,0.28)', fontFamily: VT,
            fontSize: '0.9rem', cursor: 'pointer',
          }}>▼</button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 50,
              background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', minWidth: 100,
            }}>
              <button onClick={() => { setMenuOpen(false); onDelete(); }} style={{
                display: 'block', width: '100%', background: 'none', border: 'none',
                color: 'var(--cr)', fontFamily: VT,
                fontSize: '1rem', padding: '5px 10px', cursor: 'pointer', textAlign: 'left',
              }}>delete</button>
            </div>
          )}
        </div>
      </span>
    </div>
  );
}

// ── RoutinesView ──────────────────────────────────────────────────────────────

export default function RoutinesView() {
  const { routines, loadAll, deleteRoutine, createRoutineComplete, updateRoutineWithRules } = useRoutineStore();
  const { nodes, arcs: allArcs, projects, loadAll: reloadNodes } = usePlannerStore();
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const arcs = allArcs.filter(a => !hiddenArcIds.includes(a.id));
  const [completedCounts, setCompletedCounts] = useState<Record<string, number>>({});

  const [formOpen,         setFormOpen]         = useState(false);
  const [editRoutine,      setEditRoutine]      = useState<Routine | null>(null);
  const [collapsedArcs,    setCollapsedArcs]    = useState<Set<string>>(new Set());

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

  // Habit heatmap — last HEATMAP_DAYS days of routine occurrences (incl. completed, which loadNodes excludes)
  const [heatmapNodes, setHeatmapNodes] = useState<PlannerNode[]>([]);
  useEffect(() => {
    const to   = toDateStr(new Date());
    const from = toDateStr(addDays(new Date(), -(HEATMAP_DAYS - 1)));
    loadRoutineNodesForWeek(from, to).then(setHeatmapNodes);
  }, [nodes]); // re-fetch when nodes change (completions etc.)

  const heatmapByRoutine = useMemo(() => {
    const m = new Map<string, Map<string, boolean>>();
    for (const n of heatmapNodes) {
      if (!n.routine_id) continue;
      const day = (n.planned_start_at ?? '').slice(0, 10);
      if (!day) continue;
      if (!m.has(n.routine_id)) m.set(n.routine_id, new Map());
      const dayMap = m.get(n.routine_id)!;
      dayMap.set(day, (dayMap.get(day) ?? false) || n.is_completed);
    }
    return m;
  }, [heatmapNodes]);

  // Hide routines whose arc or project is finished ('done') or archived
  const visibleRoutines = useMemo(() => {
    const inactiveStatuses = new Set(['done', 'archived']);
    const isArcActive = (arcId?: string | null) => {
      if (!arcId) return true;
      const arc = allArcs.find(a => a.id === arcId);
      return !arc?.status || !inactiveStatuses.has(arc.status);
    };
    const isProjectActive = (projectId?: string | null) => {
      if (!projectId) return true;
      const project = projects.find(p => p.id === projectId);
      return !project?.status || !inactiveStatuses.has(project.status);
    };
    return routines.filter(r => isArcActive(r.arc_id) && isProjectActive(r.project_id));
  }, [routines, allArcs, projects]);

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        .routine-edit-btn:hover { border-color: rgba(255,255,255,0.3) !important; color: rgba(255,255,255,0.85) !important; }
        .routine-add-btn:hover { border-color: rgba(0,196,167,0.75) !important; background: rgba(0,196,167,0.06) !important; }
        @keyframes routine-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.12; } }
        .routine-today-blink { animation: routine-blink 1.1s infinite; }
        .routine-scroll::-webkit-scrollbar { display: none; }
        .routine-scroll { scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setEditRoutine(null); setFormOpen(true); }}
          className="routine-add-btn"
          style={{
            background: 'none', border: '1px solid rgba(0,196,167,0.4)',
            color: 'var(--teal)', fontFamily: "var(--font-main), var(--font-kr), monospace", fontSize: '1rem',
            padding: '2px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <Plus size={14} /> new routine
        </button>
      </div>

      {/* Main: arc-grouped sections */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div className="routine-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {visibleRoutines.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "var(--font-main), var(--font-kr), monospace", fontSize: '1rem' }}>
              no routines yet — create one with [ new routine ]
            </div>
          )}
          {(() => {
            const today = toDateStr(new Date());
            const sortByNext = (a: Routine, b: Routine) => {
              const nextFor = (id: string) => (nodesByRoutine.get(id) ?? [])
                .map(n => (n.planned_start_at ?? '').slice(0, 10))
                .filter(d => d >= today)
                .sort()[0] ?? '9999-99-99';
              return nextFor(a.id).localeCompare(nextFor(b.id));
            };

            const renderRow = (r: Routine) => {
              const arc     = arcs.find(a => a.id === r.arc_id);
              const project = projects.find(p => p.id === r.project_id);
              return (
                <RoutineRow
                  key={r.id}
                  routine={r}
                  nodes={nodesByRoutine.get(r.id) ?? []}
                  done={completedCounts[r.id] ?? 0}
                  arcName={arc?.name}
                  arcColor={arc?.color_hex}
                  projectName={project?.name}
                  dayMap={heatmapByRoutine.get(r.id)}
                  onEdit={() => { setEditRoutine(r); setFormOpen(true); }}
                  onDelete={() => deleteRoutine(r.id).then(() => {
                    reloadNodes();
                    loadRoutineCompletedCounts().then(setCompletedCounts);
                  })}
                />
              );
            };

            const toggleArc = (key: string) =>
              setCollapsedArcs(prev => {
                const next = new Set(prev);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              });

            // Arcs that have at least one routine, in arcs-array order
            const arcSections = arcs
              .map(arc => ({ arc, items: [...visibleRoutines].filter(r => r.arc_id === arc.id).sort(sortByNext) }))
              .filter(s => s.items.length > 0);

            const noArcItems = [...visibleRoutines].filter(r => !r.arc_id).sort(sortByNext);

            const renderSection = (key: string, label: string, color: string, items: Routine[]) => {
              const collapsed = collapsedArcs.has(key);
              return (
                <div key={key} style={{ marginBottom: 16 }}>
                  {/* Section header */}
                  <button
                    onClick={() => toggleArc(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px 0', marginBottom: collapsed ? 0 : 8,
                      borderBottom: `1px solid ${collapsed ? 'rgba(255,255,255,0.06)' : color + '33'}`,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 0, background: color, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{
                      fontFamily: "var(--font-main), var(--font-kr), monospace", fontSize: '1rem',
                      letterSpacing: 2, color, textTransform: 'uppercase',
                    }}>{label}</span>
                    <span style={{
                      fontFamily: "var(--font-main), var(--font-kr), monospace", fontSize: '0.82rem',
                      color: 'rgba(255,255,255,0.22)', letterSpacing: 1,
                    }}>[{items.length}]</span>
                    <span style={{ marginLeft: 'auto', fontFamily: "var(--font-main), var(--font-kr), monospace", fontSize: '0.9rem', color: 'rgba(255,255,255,0.28)' }}>
                      {collapsed ? '▶' : '▼'}
                    </span>
                  </button>
                  {!collapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {items.map(renderRow)}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {arcSections.map(({ arc, items }) =>
                  renderSection(arc.id, arc.name, arc.color_hex, items)
                )}
                {noArcItems.length > 0 &&
                  renderSection('__none__', 'no arc', 'rgba(255,255,255,0.28)', noArcItems)
                }
              </div>
            );
          })()}
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
