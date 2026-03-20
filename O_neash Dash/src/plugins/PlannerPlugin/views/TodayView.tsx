import React, { useMemo, useState, useEffect } from 'react';
import { CheckboxOn, PenSquare, SkullSharp, Frown, HumanArmsUp, ArrowBarUp, ChevronDown, Tea, Analytics, Forward, Undo } from 'pixelarticons/react';
import { getDotColor } from '../types';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import { scoreSuggestion, isSameDay, toDateString, formatEffortLabel } from '../lib/logicEngine';
import {
  loadTodayDoneSummary, loadSevenDayCompletions, loadArcNodeCounts, loadTodayCompletedNodes,
  type TodayDoneSummary, type DayCompletion, type ArcNodeCount,
} from '../lib/plannerDb';
import DotNode from '../components/DotNode';
import type { PlannerNode } from '../types';

const SUGGESTION_LIMIT = 3;

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function TodayView() {
  const { nodes, capacity, completeNode, uncompleteNode, deleteNode, rescheduleNode } = usePlannerStore();
  const { openTaskForm, openTaskFormEdit } = useViewStore();
  const [now, setNow]                     = useState(() => new Date());
  const [overdueCollapsed, setOverdueCollapsed] = useState(false);
  const [doneSummary, setDoneSummary]     = useState<TodayDoneSummary>({ count: 0, effortMinutes: 0 });
  const [sevenDay, setSevenDay]           = useState<DayCompletion[]>([]);
  const [todayDone, setTodayDone]         = useState<import('../types').PlannerNode[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Reload analytics whenever nodes change (completions trigger store refresh)
  useEffect(() => {
    loadTodayDoneSummary().then(setDoneSummary).catch(() => {});
    loadSevenDayCompletions().then(setSevenDay).catch(() => {});
    loadTodayCompletedNodes().then(setTodayDone).catch(() => {});
  }, [nodes]);

  const today    = toDateString(now);
  const tomorrow = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  const overdue = useMemo(() =>
    nodes
      .filter(n => (n.is_overdue || n.is_missed_schedule) && !n.is_completed)
      .sort((a, b) => (a.due_at ?? a.planned_start_at ?? '').localeCompare(b.due_at ?? b.planned_start_at ?? '')),
    [nodes],
  );

  const todayNodes = useMemo(() =>
    nodes.filter(n =>
      n.node_type !== 'event' &&
      !n.is_overdue && !n.is_missed_schedule && !n.is_completed &&
      (isSameDay(n.planned_start_at, now) || isSameDay(n.due_at, now)),
    ),
    [nodes, now],
  );

  const suggestions = useMemo(() => {
    const candidates = nodes.filter(n =>
      n.node_type !== 'event' &&
      !n.is_completed && !n.is_overdue && !n.is_missed_schedule &&
      !isSameDay(n.planned_start_at, now) &&
      !isSameDay(n.due_at, now),
    );
    return candidates
      .map(n => ({ node: n, score: scoreSuggestion(n, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, SUGGESTION_LIMIT)
      .map(s => s.node);
  }, [nodes, now]);

  const todayMinutes = todayNodes.reduce((s, n) => s + (n.estimated_duration_minutes ?? 0), 0);
  const capacityMins = capacity?.daily_minutes ?? 480;
  const pct          = Math.min(100, (todayMinutes / capacityMins) * 100);
  const barColor     = pct >= 100 ? '#ff3b3b' : pct > 75 ? '#f5c842' : '#00c4a7';

  const cardProps = (node: PlannerNode) => ({
    node, now,
    onComplete:   () => completeNode(node.id),
    onUncomplete: () => uncompleteNode(node.id),
    onDelete:     () => deleteNode(node.id),
    onEdit:       () => openTaskFormEdit(node),
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: '1.25rem 2rem 1rem',
        display: 'flex', alignItems: 'center', gap: '1.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ fontSize: '1.6rem', letterSpacing: '4px', color: '#fff', lineHeight: 1 }}>
          {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '0.9rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.28)' }}>
            {(todayMinutes / 60).toFixed(1)}h / {(capacityMins / 60).toFixed(0)}h
          </span>
          <div style={{ width: 88, height: 3, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%',
              width: `${pct}%`, background: barColor,
              transition: 'width 0.35s ease, background 0.35s ease',
            }} />
          </div>
        </div>
        <button
          onClick={() => openTaskForm({ planned_start_at: today })}
          style={{
            background: 'transparent', border: '1px solid rgba(245,200,66,0.5)',
            color: '#f5c842', padding: '0.3rem 1.1rem',
            fontSize: '0.95rem', letterSpacing: '2px', cursor: 'pointer',
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          }}
        >
          + task
        </button>
      </div>

      {/* ── Two-column body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: '1.5rem', padding: '1.25rem 1.5rem 1.25rem 0' }}>

        {/* Left: task column */}
        <div className="today-task-col" style={{
          flex: 1, overflowY: 'auto',
          padding: '1.75rem 1.5rem 1.75rem 1.5rem',
          display: 'flex', flexDirection: 'column', gap: '2.25rem',
        }}>

          {/* OVERDUE */}
          {overdue.length > 0 && (
            <section>
              <div
                onClick={() => setOverdueCollapsed(c => !c)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem', color: '#ff3b3b', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', opacity: 0.9 }}><Frown size={20} /></span>
                <span style={{ fontSize: '1.45rem', letterSpacing: '4px', textTransform: 'uppercase', lineHeight: 1, fontFamily: "'VT323', 'HBIOS-SYS', monospace" }}>
                  overdue · {overdue.length}
                </span>
                <div style={{ flex: 1, height: 1, background: '#ff3b3b', opacity: 0.4 }} />
                <ChevronDown size={16} style={{ transition: 'transform 0.18s', transform: overdueCollapsed ? 'rotate(-90deg)' : 'none', opacity: 0.5 }} />
              </div>
              {!overdueCollapsed && (
                <CardGrid>
                  {overdue.map(node => <OverdueCard key={node.id} {...cardProps(node)} now={now} />)}
                </CardGrid>
              )}
            </section>
          )}

          {/* TODAY */}
          <section>
            <SectionLabel icon={<HumanArmsUp size={20} />} label={`today · ${todayNodes.length}`} color="#00c4a7" />
            {todayNodes.length === 0 && todayDone.length === 0 ? (
              <div style={{ padding: '0.75rem 0', fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.15)' }}>
                nothing scheduled
              </div>
            ) : (
              <CardGrid>
                {todayNodes.map(node => (
                  <TaskCard
                    key={node.id} {...cardProps(node)}
                    rescheduleTomorrow={() => rescheduleNode(node.id, tomorrow)}
                  />
                ))}
                {todayDone.map(node => (
                  <TaskCard
                    key={node.id} {...cardProps(node)}
                    isDone
                  />
                ))}
              </CardGrid>
            )}
          </section>

          {/* SUGGESTIONS */}
          {suggestions.length > 0 && (
            <section>
              <SectionLabel icon={<ArrowBarUp size={20} />} label="bring to today?" color="rgba(255,255,255,0.55)" />
              <CardGrid>
                {suggestions.map(node => (
                  <SuggestionCard
                    key={node.id} {...cardProps(node)}
                    rescheduleToday={() => rescheduleNode(node.id, today)}
                  />
                ))}
              </CardGrid>
            </section>
          )}

          {/* Empty state */}
          {overdue.length === 0 && todayNodes.length === 0 && todayDone.length === 0 && suggestions.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              flex: 1, gap: '0.5rem', paddingTop: '6rem',
            }}>
              <div style={{ fontSize: '2rem', letterSpacing: '5px', color: 'rgba(255,255,255,0.08)' }}>
                nothing today
              </div>
              <div style={{ fontSize: '0.9rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.07)' }}>
                press + task to add something
              </div>
            </div>
          )}
        </div>

        {/* Right: analytics sidebar */}
        <div style={{
          width: '28%', flexShrink: 0,
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <TodayEffortPanel todayNodes={todayNodes} doneSummary={doneSummary} />
          <OngoingArcsPanel />
          <SevenDayPanel data={sevenDay} now={now} />
        </div>

      </div>
    </div>
  );
}

// ─── Card grid ────────────────────────────────────────────────────────────────

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '0.65rem',
      marginTop: '0.55rem',
    }}>
      {children}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem', color }}>
      <span style={{ display: 'flex', alignItems: 'center', opacity: 0.9 }}>{icon}</span>
      <span style={{
        fontSize: '1.45rem', letterSpacing: '4px',
        textTransform: 'uppercase', lineHeight: 1,
        fontFamily: "'VT323', 'HBIOS-SYS', monospace",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: color, opacity: 0.4 }} />
    </div>
  );
}

// ─── Mini card (shared by OverdueCard + SuggestionCard) ───────────────────────

function MiniCard({ node, now, onComplete, onDelete, onEdit, badge, primaryAction }: {
  node: PlannerNode; now: Date;
  onComplete: () => void; onDelete: () => void; onEdit: () => void;
  badge: { label: string; color: string };
  primaryAction?: { label: string; onClick: () => void };
}) {
  const { arcs, projects } = usePlannerStore();
  const [hovered, setHovered] = useState(false);

  const arc  = node.arc_id     ? arcs.find(a => a.id === node.arc_id)         : null;
  const proj = node.project_id ? projects.find(p => p.id === node.project_id) : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: '0.4rem',
        padding: '0.6rem 0.75rem 2.75rem',
        background: hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {/* Title + badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{
          fontSize: '1.35rem', lineHeight: 1.15, letterSpacing: '0.5px',
          color: 'rgba(255,255,255,0.8)', fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          wordBreak: 'break-word', flex: 1,
        }}>
          {node.title}
        </span>
        <span style={{
          fontSize: '0.95rem', letterSpacing: '1px', flexShrink: 0,
          color: `${badge.color}88`, fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          paddingTop: '0.1rem',
        }}>
          {badge.label}
        </span>
      </div>

      {/* Arc / project */}
      {(arc || proj) && (
        <div style={{
          fontSize: '0.82rem', letterSpacing: '0.3px',
          color: 'rgba(255,255,255,0.25)', fontFamily: "'VT323', 'HBIOS-SYS', monospace",
        }}>
          {'> '}
          {arc  && <span style={{ color: arc.color_hex }}>{arc.name}</span>}
          {arc && proj && <span style={{ color: 'rgba(255,255,255,0.2)' }}>{' > '}</span>}
          {proj && <span style={{ color: proj.color_hex ?? arc?.color_hex ?? '#00c4a7' }}>{proj.name}</span>}
        </div>
      )}

      {/* Actions — absolute bottom-right */}
      <div style={{
        position: 'absolute', bottom: 6, right: 6,
        display: 'flex', alignItems: 'center', gap: '0.1rem',
        opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
        pointerEvents: hovered ? 'auto' : 'none',
      }}>
        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.55)', padding: '0.05rem 0.5rem',
              fontSize: '0.9rem', letterSpacing: '1px', cursor: 'pointer',
              fontFamily: "'VT323', 'HBIOS-SYS', monospace", marginRight: '0.15rem',
            }}
          >
            {primaryAction.label}
          </button>
        )}
        <button onClick={onComplete} title="done"   style={actionBtn('#4ade80')}><CheckboxOn size={11} /></button>
        <button onClick={onEdit}     title="edit"   style={actionBtn('rgba(255,255,255,0.7)')}><PenSquare size={11} /></button>
        <button onClick={onDelete}   title="delete" style={actionBtn('#ef4444')}><SkullSharp size={11} /></button>
      </div>
    </div>
  );
}

function OverdueCard({ node, now, onComplete, onDelete, onEdit }: {
  node: PlannerNode; now: Date;
  onComplete: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const badge = (() => {
    if (node.is_missed_schedule) return { label: 'missed', color: '#f5c842' };
    const days = node.due_at
      ? Math.round((now.getTime() - new Date(node.due_at + 'T12:00:00').getTime()) / 86400000)
      : null;
    return { label: days ? `${days}d ago` : 'overdue', color: '#ff3b3b' };
  })();
  return <MiniCard node={node} now={now} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} badge={badge} />;
}

function SuggestionCard({ node, now, onComplete, onDelete, onEdit, rescheduleToday }: {
  node: PlannerNode; now: Date;
  onComplete: () => void; onDelete: () => void; onEdit: () => void;
  rescheduleToday: () => void;
}) {
  const badge = (() => {
    if (!node.due_at) return { label: '', color: 'rgba(255,255,255,0.3)' };
    const daysUntil = Math.round((new Date(node.due_at + 'T12:00:00').getTime() - now.getTime()) / 86400000);
    if (daysUntil <= 1) return { label: 'due soon', color: '#ff6b35' };
    if (daysUntil <= 3) return { label: `due in ${daysUntil}d`, color: '#f5a623' };
    return { label: `due in ${daysUntil}d`, color: 'rgba(255,255,255,0.3)' };
  })();
  return (
    <MiniCard
      node={node} now={now}
      onComplete={onComplete} onDelete={onDelete} onEdit={onEdit}
      badge={badge}
      primaryAction={{ label: '+ today', onClick: rescheduleToday }}
    />
  );
}

// ─── Task card (today section) ────────────────────────────────────────────────

function TaskCard({ node, now, onComplete, onUncomplete, onDelete, onEdit, rescheduleTomorrow, isDone }: {
  node: PlannerNode;
  now: Date;
  onComplete: () => void;
  onUncomplete?: () => void;
  onDelete: () => void;
  onEdit: () => void;
  rescheduleTomorrow?: () => void;
  isDone?: boolean;
}) {
  const { arcs, projects } = usePlannerStore();
  const [hovered, setHovered] = useState(false);

  const arc      = node.arc_id     ? arcs.find(a => a.id === node.arc_id)         : null;
  const proj     = node.project_id ? projects.find(p => p.id === node.project_id) : null;
  const isEvent  = node.node_type === 'event';
  const eventTime = isEvent && node.planned_start_at?.includes('T')
    ? node.planned_start_at.slice(11, 16) : null;
  const typeLabel = isEvent ? 'event' : node.due_at ? 'assign' : 'task';
  const typeLabelColor = isEvent ? 'rgba(192,132,252,0.4)' : node.due_at ? 'rgba(245,166,35,0.4)' : 'rgba(0,196,167,0.4)';

  const effortLabel = formatEffortLabel(node.estimated_duration_minutes);
  const namedGroups = (node.groups ?? []).filter(g => !g.is_ungrouped);

  const dueBadge = (() => {
    if (node.is_overdue) {
      const days = node.due_at
        ? Math.round((now.getTime() - new Date(node.due_at + 'T12:00:00').getTime()) / 86400000)
        : null;
      return { label: days ? `${days}d ago` : 'overdue', color: '#ff3b3b' };
    }
    if (node.is_missed_schedule) return { label: 'missed', color: '#f5c842' };
    if (!node.due_at) return null;
    const daysUntil = Math.round(
      (new Date(node.due_at + 'T12:00:00').getTime() - now.getTime()) / 86400000,
    );
    if (daysUntil < 0)   return { label: `${Math.abs(daysUntil)}d ago`, color: '#ff3b3b' };
    if (daysUntil === 0) return { label: 'due today', color: '#ff6b35' };
    if (daysUntil === 1) return { label: 'due tmrw',  color: '#ff6b35' };
    return { label: `due in ${daysUntil}d`, color: daysUntil <= 3 ? '#ff6b35' : 'rgba(255,255,255,0.38)' };
  })();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
        border: isDone
          ? '1px solid rgba(255,255,255,0.12)'
          : `1px solid ${hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'}`,
        transition: 'background 0.12s, border-color 0.12s',
        minHeight: 180,
      }}
    >
      {/* ── Dimmed content wrapper (opacity only applies here) ── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        padding: '0.9rem 1rem 0.75rem',
        gap: '0.6rem',
        opacity: isDone ? 0.45 : 1,
        filter: isDone ? 'grayscale(1)' : 'none',
      }}>
        {/* ── Top bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <DotNode node={node} scale={1.6} noPopups onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} />
            <span style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.8rem',
              letterSpacing: '2px', textTransform: 'uppercase', color: typeLabelColor,
            }}>{typeLabel}</span>
            {eventTime && (
              <span style={{ fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.35)', fontFamily: "'VT323', 'HBIOS-SYS', monospace" }}>
                {eventTime}
              </span>
            )}
          </div>
          {dueBadge && (
            <div style={{
              border: `1px solid ${dueBadge.color}55`, color: `${dueBadge.color}99`,
              padding: '0.1rem 0.45rem', fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: '1.15rem', letterSpacing: '1.5px', lineHeight: 1.3,
            }}>
              {dueBadge.label}
            </div>
          )}
        </div>

        {/* ── Title ── */}
        <div style={{
          fontSize: '1.75rem', lineHeight: 1.15, letterSpacing: '0.5px',
          color: isEvent ? 'rgba(255,255,255,0.5)' : '#fff',
          fontFamily: "'VT323', 'HBIOS-SYS', monospace", wordBreak: 'break-word',
        }}>
          {node.title}
        </div>

        {/* ── Arc / project ── */}
        {(arc || proj) && (
          <div style={{ fontSize: '0.88rem', letterSpacing: '0.3px', color: 'rgba(255,255,255,0.25)', fontFamily: "'VT323', 'HBIOS-SYS', monospace" }}>
            {'> '}
            {arc  && <span style={{ color: arc.color_hex }}>{arc.name}</span>}
            {arc && proj && <span style={{ color: 'rgba(255,255,255,0.2)' }}>{' > '}</span>}
            {proj && <span style={{ color: proj.color_hex ?? arc?.color_hex ?? '#00c4a7' }}>{proj.name}</span>}
          </div>
        )}

        {/* ── Footer: groups ── */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {namedGroups.map(g => (
            <span key={g.id} style={{
              fontSize: '0.82rem', letterSpacing: '0.5px', padding: '0.1rem 0.45rem',
              border: `1px solid ${g.color_hex}55`, color: g.color_hex,
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            }}>
              {g.name}
            </span>
          ))}
        </div>
      </div>

      {/* Red X overlay — above content/dots, below actions */}
      {isDone && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          preserveAspectRatio="none"
        >
          <line x1="0" y1="0" x2="100%" y2="100%" stroke="rgba(255,59,59,0.5)" strokeWidth="1.5" />
          <line x1="100%" y1="0" x2="0" y2="100%" stroke="rgba(255,59,59,0.5)" strokeWidth="1.5" />
        </svg>
      )}

      {/* ── Actions: outside the dimmed wrapper, hover only ── */}
      <div style={{
        position: 'absolute', bottom: 8, right: 8,
        display: 'flex', alignItems: 'center', gap: '0.25rem',
        opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
        pointerEvents: hovered ? 'auto' : 'none',
      }}>
        {!isDone && rescheduleTomorrow && (
          <button onClick={rescheduleTomorrow} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.45)', padding: '0.1rem 0.5rem',
            fontSize: '0.9rem', letterSpacing: '1px', cursor: 'pointer',
            fontFamily: "'VT323', 'HBIOS-SYS', monospace", marginRight: '0.15rem',
          }}>
            tmrw →
          </button>
        )}
        {isDone ? (
          <button onClick={onUncomplete} title="undo" style={{
            background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.25)',
            color: '#f5c842', cursor: 'pointer', padding: '0.3rem',
            display: 'flex', alignItems: 'center', lineHeight: 1,
          }}><Undo size={22} /></button>
        ) : (
          <>
            <button onClick={onComplete} title="done"   style={actionBtn('#4ade80')}><CheckboxOn size={13} /></button>
            <button onClick={onEdit}     title="edit"   style={actionBtn('rgba(255,255,255,0.7)')}><PenSquare size={13} /></button>
            <button onClick={onDelete}   title="delete" style={actionBtn('#ef4444')}><SkullSharp size={13} /></button>
          </>
        )}
      </div>
    </div>
  );
}

function actionBtn(color: string): React.CSSProperties {
  return {
    background: 'transparent', border: 'none', color,
    cursor: 'pointer', padding: '0.2rem 0.25rem',
    display: 'flex', alignItems: 'center', lineHeight: 1,
    opacity: 0.65,
  };
}

// ─── Analytics sidebar ────────────────────────────────────────────────────────

function SidebarPanel({ title, icon: Icon, children }: { title: string; icon?: React.FC<{ size?: number }>; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '1.25rem 1.25rem 1.1rem',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.7rem',
        marginBottom: '0.9rem',
      }}>
        {Icon && <Icon size={15} style={{ color: '#f5c842', flexShrink: 0 }} />}
        <span style={{
          fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.05rem',
          letterSpacing: '3px', textTransform: 'uppercase',
          color: '#f5c842',
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// Panel 1 — Today's Effort
function TodayEffortPanel({ todayNodes, doneSummary }: {
  todayNodes: PlannerNode[];
  doneSummary: TodayDoneSummary;
}) {
  const remainingMins = todayNodes.reduce((s, n) => s + (n.estimated_duration_minutes ?? 0), 0);
  const doneMins      = doneSummary.effortMinutes;
  const scheduledMins = remainingMins + doneMins;
  const totalCount    = todayNodes.length + doneSummary.count;

  const fmtMins = (m: number) => m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`;

  const pct = scheduledMins > 0 ? Math.round((doneMins / scheduledMins) * 100) : 0;

  return (
    <SidebarPanel title="today's effort" icon={Tea}>
      {/* big percentage + task count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{
          border: `2px solid ${pct === 100 ? '#4ade8066' : pct > 0 ? '#00c4a766' : 'rgba(255,255,255,0.12)'}`,
          padding: '0.05rem 0.55rem 0.1rem',
          lineHeight: 1,
        }}>
          <span style={{
            fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.8rem', lineHeight: 1,
            color: pct === 100 ? '#4ade80' : pct > 0 ? '#00c4a7' : 'rgba(255,255,255,0.2)',
            textShadow: pct > 0 ? `0 0 18px ${pct === 100 ? '#4ade8066' : '#00c4a766'}` : 'none',
            letterSpacing: '1px',
          }}>
            {pct}%
          </span>
        </div>
        <span style={{
          fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.1rem',
          letterSpacing: '2px', color: 'rgba(255,255,255,0.25)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>[ </span>
          <span style={{ color: '#4ade80' }}>{doneSummary.count}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}> / </span>
          <span style={{ color: '#fff' }}>{totalCount}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}> tasks ]</span>
        </span>
      </div>

      {/* stacked bar */}
      <div style={{
        display: 'flex', height: 14, marginBottom: '0.5rem',
        background: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>
        {pct > 0 && (
          <div style={{
            width: `${pct}%`, height: '100%',
            background: '#4ade80',
            boxShadow: '0 0 10px #4ade8066',
            transition: 'width 0.4s ease',
            position: 'relative', overflow: 'hidden',
          }}>
            {[
              { duration: '2.1s', delay: '0s',    top: 2  },
              { duration: '3.0s', delay: '-0.8s', top: 7  },
              { duration: '1.7s', delay: '-1.5s', top: 4  },
              { duration: '2.6s', delay: '-0.3s', top: 10 },
              { duration: '1.4s', delay: '-1.1s', top: 6  },
              { duration: '3.4s', delay: '-2.0s', top: 1  },
              { duration: '2.3s', delay: '-0.6s', top: 9  },
              { duration: '1.9s', delay: '-1.8s', top: 3  },
              { duration: '2.8s', delay: '-1.3s', top: 11 },
              { duration: '1.6s', delay: '-0.4s', top: 5  },
            ].map((p, i) => (
              <div
                key={i}
                className="effort-particle"
                style={{ animationDuration: p.duration, animationDelay: p.delay, top: p.top }}
              />
            ))}
          </div>
        )}
      </div>

      {/* legend row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1rem',
        letterSpacing: '1.5px',
      }}>
        <span style={{ color: '#4ade8066', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <CheckboxOn size={14} />{doneMins > 0 ? fmtMins(doneMins) : '—'}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.55)' }}>
          {remainingMins > 0 ? fmtMins(remainingMins) : '—'} left
        </span>
      </div>
    </SidebarPanel>
  );
}


// Panel 2 — Ongoing Arcs
function OngoingArcsPanel() {
  const { arcs, nodes } = usePlannerStore();
  const activeArcs = arcs.filter(a => !a.is_archived);
  const [arcCounts, setArcCounts] = useState<ArcNodeCount[]>([]);

  useEffect(() => {
    loadArcNodeCounts().then(setArcCounts);
  }, [nodes]); // re-query whenever nodes change (complete, delete, create)

  if (activeArcs.length === 0) return null;

  return (
    <SidebarPanel title="ongoing arcs" icon={Forward}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.02rem' }}>
        {activeArcs.map(arc => {
          const counts = arcCounts.find(c => c.arc_id === arc.id);
          const done  = counts?.done  ?? 0;
          const total = counts?.total ?? 0;

          return (
            <div key={arc.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span style={{ color: arc.color_hex, opacity: 0.5, fontFamily: 'monospace', fontSize: '0.8rem', marginLeft: '1rem' }}>›</span>
                <span style={{
                  fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.05rem',
                  letterSpacing: '1px', color: arc.color_hex, flex: 1,
                }}>
                  {arc.name}
                </span>
                <span style={{
                  fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.85rem',
                  letterSpacing: '1px', color: 'rgba(255,255,255,0.6)',
                }}>
                  {done}/{total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SidebarPanel>
  );
}

// Panel 3 — 7-Day Completion
function SevenDayPanel({ data, now }: { data: DayCompletion[]; now: Date }) {
  const counts = data.map(d => d.count);
  const total  = counts.reduce((s, c) => s + c, 0);
  const avg    = total / 7;
  const max    = Math.max(...counts, 1);
  const todayStr = toDateString(now);

  const barColor = (entry: DayCompletion): string => {
    if (entry.date === todayStr) return 'rgba(255,255,255,0.2)';
    if (entry.count === 0)       return 'rgba(255,255,255,0.08)';
    if (entry.count >= avg)      return '#4ade80';
    if (entry.count >= avg * 0.6) return '#f5c842';
    return '#ff6b35';
  };

  return (
    <SidebarPanel title="7-day completion" icon={Analytics}>
      <div style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.95rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.35)', marginBottom: '0.75rem' }}>
        avg {avg.toFixed(1)} tasks/day
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 80 }}>
        {data.map((entry, i) => {
          const h = max > 0 ? Math.max(4, Math.round((entry.count / max) * 68)) : 4;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: h, background: barColor(entry) }} />
              <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>
                {DAY_LETTERS[new Date(entry.date + 'T12:00:00').getDay()]}
              </span>
            </div>
          );
        })}
      </div>
    </SidebarPanel>
  );
}

