import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { CheckboxOn, PenSquare, SkullSharp, Frown, HumanArmsUp, ArrowBarUp, ChevronDown, Tea, Forward, Undo, SpeedSlow, PartyPopper, Loader} from 'pixelarticons/react';
import { getDotColor } from '../types';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import { scoreSuggestion, isSameDay, toDateString, formatEffortLabel, computePressureScore, pickFrogNode, pickDiceNode, type PressureResult } from '../lib/logicEngine';
import {
  loadTodayDoneSummary, loadArcNodeCounts, loadTodayCompletedNodes,
  loadFrogsDoneToday, setNodeFrogPinned,
  type TodayDoneSummary, type ArcNodeCount,
} from '../lib/plannerDb';
import DotNode from '../components/DotNode';
import type { PlannerNode } from '../types';

const SUGGESTION_LIMIT = 3;

export default function TodayView() {
  const { nodes, capacity, completeNode, uncompleteNode, deleteNode, rescheduleNode, loadAll } = usePlannerStore();
  const { openTaskForm, openTaskFormEdit } = useViewStore();
  const [now, setNow]                     = useState(() => new Date());
  const [overdueCollapsed, setOverdueCollapsed] = useState(false);
  const [doneSummary, setDoneSummary]     = useState<TodayDoneSummary>({ count: 0, effortMinutes: 0 });
  const [todayDone, setTodayDone]         = useState<import('../types').PlannerNode[]>([]);
  const [frogsDone, setFrogsDone]         = useState(0);
  const [diceOpen, setDiceOpen]           = useState(false);

  useEffect(() => {
    let lastDate = toDateString(new Date());
    const id = setInterval(() => {
      const next = new Date();
      setNow(next);
      const nextDate = toDateString(next);
      if (nextDate !== lastDate) {
        lastDate = nextDate;
        loadAll(); // rehydrate nodes so is_overdue/is_missed_schedule recompute with new date
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Reload analytics whenever nodes change (completions trigger store refresh)
  useEffect(() => {
    loadTodayDoneSummary().then(setDoneSummary).catch(() => {});
    loadTodayCompletedNodes().then(setTodayDone).catch(() => {});
    loadFrogsDoneToday().then(setFrogsDone).catch(() => {});
  }, [nodes]);

  const pressure = useMemo(
    () => computePressureScore(nodes, capacity?.daily_minutes ?? 480, now),
    [nodes, capacity, now],
  );

  const today    = toDateString(now);

  const frogNode = useMemo(() => pickFrogNode(nodes, today), [nodes, today]);

  // When completing the current frog node, pin it before completing so we can count it
  const handleCompleteNode = useCallback(async (node: PlannerNode) => {
    if (frogNode?.id === node.id && !node.is_frog_pinned) {
      await setNodeFrogPinned(node.id, true);
    }
    completeNode(node.id);
  }, [frogNode, completeNode]);
  const tomorrow = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  const overdue = useMemo(() =>
    nodes
      .filter(n => (n.is_overdue || n.is_missed_schedule) && !n.is_completed)
      .sort((a, b) => (a.due_at ?? a.planned_start_at ?? '').localeCompare(b.due_at ?? b.planned_start_at ?? '')),
    [nodes],
  );

  const todayNodes = useMemo(() =>
    nodes.filter(n =>
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
    isFrog:       frogNode?.id === node.id,
    onComplete:   () => handleCompleteNode(node),
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
          onClick={() => setDiceOpen(true)}
          title="Dice Taskmaster — roll for a random task"
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.45)', padding: '0.3rem 0.85rem',
            fontSize: '0.95rem', letterSpacing: '2px', cursor: 'pointer',
            fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          }}
        >
          ⚄ dice
        </button>
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
          <EatTheFrogPanel hasFrog={!!frogNode} frogsDone={frogsDone} />
          <OngoingArcsPanel />
          <PressureGaugePanel pressure={pressure} />
        </div>

      </div>

      {/* Modals */}
      {diceOpen && (
        <DiceModal
          pool={[...overdue, ...todayNodes]}
          onClose={() => setDiceOpen(false)}
          onReschedule={(id) => { rescheduleNode(id, today); setDiceOpen(false); }}
        />
      )}
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

function MiniCard({ node, now, isFrog, onComplete, onDelete, onEdit, badge, primaryAction }: {
  node: PlannerNode; now: Date; isFrog?: boolean;
  onComplete: () => void; onDelete: () => void; onEdit: () => void;
  badge: { label: string; color: string };
  primaryAction?: { label: string; onClick: () => void };
}) {
  const { arcs, projects } = usePlannerStore();
  const [hovered, setHovered] = useState(false);

  const arc  = node.arc_id     ? arcs.find(a => a.id === node.arc_id)         : null;
  const proj = node.project_id ? projects.find(p => p.id === node.project_id) : null;
  const isEvent    = node.node_type === 'event';
  const eventStart = isEvent && node.planned_start_at && node.planned_start_at.length > 10
    ? node.planned_start_at.slice(11, 16) : null;
  const eventEnd   = (() => {
    if (!eventStart || !(node.estimated_duration_minutes ?? 0)) return null;
    const [hStr, mStr] = eventStart.split(':');
    const totalMins = Number(hStr) * 60 + Number(mStr) + node.estimated_duration_minutes!;
    return `${String(Math.floor(totalMins / 60) % 24).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
  })();

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
      {/* Event header */}
      {isEvent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <span style={{
            fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.72rem',
            letterSpacing: '3px', color: 'rgba(192,132,252,0.75)',
            border: '1px solid rgba(192,132,252,0.3)', padding: '0.02rem 0.4rem',
            lineHeight: 1.4,
          }}>EVENT</span>
          <span style={{
            fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.95rem',
            letterSpacing: '2px', color: 'rgba(255,255,255,0.35)',
          }}>
            {eventStart ? `${eventStart}${eventEnd ? ` → ${eventEnd}` : ''}` : 'all day'}
          </span>
        </div>
      )}

      {/* Frog badge */}
      {isFrog && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.15rem 0.35rem', alignSelf: 'flex-start',
        }}>
          <PixelFrog px={2} />
          <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.78rem', letterSpacing: '2px', color: '#4ade80', lineHeight: 1.4 }}>FROG</span>
        </span>
      )}

      {/* Title + badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{
          fontSize: '1.35rem', lineHeight: 1.15, letterSpacing: '0.5px',
          color: isEvent ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.8)',
          fontFamily: "'VT323', 'HBIOS-SYS', monospace",
          wordBreak: 'break-word', flex: 1,
        }}>
          {node.title}
        </span>
        {!isEvent && (
          <span style={{
            fontSize: '0.95rem', letterSpacing: '1px', flexShrink: 0,
            color: `${badge.color}88`, fontFamily: "'VT323', 'HBIOS-SYS', monospace",
            paddingTop: '0.1rem',
          }}>
            {badge.label}
          </span>
        )}
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

function OverdueCard({ node, now, isFrog, onComplete, onDelete, onEdit }: {
  node: PlannerNode; now: Date; isFrog?: boolean;
  onComplete: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const badge = (() => {
    if (node.is_missed_schedule) return { label: 'missed', color: '#f5c842' };
    const days = node.due_at
      ? Math.round((now.getTime() - new Date(node.due_at + 'T12:00:00').getTime()) / 86400000)
      : null;
    return { label: days ? `${days}d ago` : 'overdue', color: '#ff3b3b' };
  })();
  return <MiniCard node={node} now={now} isFrog={isFrog} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} badge={badge} />;
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

function TaskCard({ node, now, isFrog, onComplete, onUncomplete, onDelete, onEdit, rescheduleTomorrow, isDone }: {
  node: PlannerNode;
  now: Date;
  isFrog?: boolean;
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
  const isEvent   = node.node_type === 'event';
  // Extract HH:MM — handles both ISO 'T' and SQLite space separator
  const eventStart = isEvent && node.planned_start_at && node.planned_start_at.length > 10
    ? node.planned_start_at.slice(11, 16) : null;
  const eventEnd = (() => {
    if (!eventStart || !(node.estimated_duration_minutes ?? 0)) return null;
    const [hStr, mStr] = eventStart.split(':');
    const totalMins = Number(hStr) * 60 + Number(mStr) + node.estimated_duration_minutes!;
    return `${String(Math.floor(totalMins / 60) % 24).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
  })();
  const typeLabel = node.due_at ? 'assign' : 'task';
  const typeLabelColor = node.due_at ? 'rgba(245,166,35,0.4)' : 'rgba(0,196,167,0.4)';

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
        {isEvent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.78rem',
              letterSpacing: '3px', color: 'rgba(192,132,252,0.75)',
              border: '1px solid rgba(192,132,252,0.3)', padding: '0.05rem 0.45rem',
              lineHeight: 1.4,
            }}>EVENT</span>
            <span style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.1rem',
              letterSpacing: '2px', color: 'rgba(255,255,255,0.4)',
            }}>
              {eventStart ? `${eventStart}${eventEnd ? ` → ${eventEnd}` : ''}` : 'all day'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DotNode node={node} scale={1.6} noPopups onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} />
              <span style={{
                fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '0.8rem',
                letterSpacing: '2px', textTransform: 'uppercase', color: typeLabelColor,
              }}>{typeLabel}</span>
              {isFrog && !isDone && (
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <PixelFrog px={2} />
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
        )}

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
        {!isDone && rescheduleTomorrow && !isEvent && (
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

function SidebarPanel({ title, icon: Icon, titleRight, children }: { title: string; icon?: React.FC<{ size?: number; style?: React.CSSProperties }>; titleRight?: React.ReactNode; children: React.ReactNode }) {
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
        {titleRight && <span style={{ marginLeft: 'auto' }}>{titleRight}</span>}
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

  const noTasks  = totalCount === 0;
  const allDone  = totalCount > 0 && todayNodes.length === 0 && doneSummary.count > 0;

  if (noTasks) return (
    <SidebarPanel title="today's effort" icon={Tea}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.25rem 0 0.25rem 1.5rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#00c4a7' }}>
          <Loader size={16} />
          <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.15rem', letterSpacing: '2px', lineHeight: 1.3 }}>
            nothing scheduled.
          </span>
        </span>
        <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>
          a rare 여유로운 day.<br />
          enjoy it — or get ahead<br />
          on what's coming.
        </span>
      </div>
    </SidebarPanel>
  );

  if (allDone) return (
    <SidebarPanel title="today's effort" icon={Tea}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.25rem 0 0.25rem 1.5rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#4ade80' }}>
          <PartyPopper size={16} />
          <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1.15rem', letterSpacing: '2px', lineHeight: 1.3, textShadow: '0 0 14px #4ade8055' }}>
            all done.
          </span>
        </span>
        <span style={{ fontFamily: "'VT323', 'HBIOS-SYS', monospace", fontSize: '1rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>
          go crack open a beer,<br />
          put on netflix, and<br />
          do absolutely nothing.
        </span>
      </div>
    </SidebarPanel>
  );

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
  const { setActiveView } = useViewStore();
  const latestNodeUpdate = (arcId: string) =>
    nodes.filter(n => n.arc_id === arcId).reduce((max, n) => n.updated_at > max ? n.updated_at : max, '');
  const activeArcs = arcs
    .filter(a => !a.is_archived)
    .sort((a, b) => latestNodeUpdate(b.id).localeCompare(latestNodeUpdate(a.id)))
    .slice(0, 3);
  const totalArcs  = arcs.filter(a => !a.is_archived).length;
  const [arcCounts, setArcCounts] = useState<ArcNodeCount[]>([]);
  const mono: React.CSSProperties = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" };

  useEffect(() => {
    loadArcNodeCounts().then(setArcCounts);
  }, [nodes]);

  if (activeArcs.length === 0) return null;

  return (
    <SidebarPanel title="ongoing arcs" icon={Forward}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {activeArcs.map(arc => {
          const counts = arcCounts.find(c => c.arc_id === arc.id);
          const done  = counts?.done  ?? 0;
          const total = counts?.total ?? 0;
          return (
            <div key={arc.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', lineHeight: 1.15 }}>
                <span style={{ color: arc.color_hex, opacity: 0.5, fontFamily: 'monospace', fontSize: '0.8rem', marginLeft: '1rem' }}>›</span>
                <span style={{ ...mono, fontSize: '1.05rem', letterSpacing: '1px', color: arc.color_hex, flex: 1 }}>
                  {arc.name}
                </span>
                <span style={{ ...mono, fontSize: '0.85rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.6)' }}>
                  {done}/{total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {totalArcs > 3 && (
        <div
          onClick={() => setActiveView('arc')}
          style={{ ...mono, fontSize: '0.9rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', marginTop: '0.55rem', textAlign: 'right' }}
        >
          [ see more ]
        </div>
      )}
    </SidebarPanel>
  );
}

// Panel 3 — Pressure Gauge
const PRESSURE_LEVELS = [
  { key: 'safe',     label: 'SAFE',     color: '#4ade80', min: 0,  max: 25  },
  { key: 'loaded',   label: 'LOADED',   color: '#f5c842', min: 26, max: 50  },
  { key: 'heavy',    label: 'HEAVY',    color: '#ff6b35', min: 51, max: 75  },
  { key: 'critical', label: 'CRITICAL', shortLabel: 'CRIT.', color: '#ff3b3b', min: 76, max: 100 },
] as const;

function PressureSummaryPopup({ pressure, onClose }: { pressure: PressureResult; onClose: () => void }) {
  const { score, level, breakdown } = pressure;
  const levelData = PRESSURE_LEVELS.find(l => l.key === level)!;
  const { todayScore, overdueScore, horizonScore, todayItems, overdueItems, horizonItems,
          todayMins, capacityMins, effortBonus } = breakdown;

  const mono: React.CSSProperties = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" };
  const dim  = 'rgba(255,255,255,0.35)';
  const mid  = 'rgba(255,255,255,0.6)';
  const trunc = (s: string) => s.length > 24 ? s.slice(0, 23) + '…' : s;
  const fmtPts = (n: number) => `+${Math.round(n * 10) / 10}`;
  const urgColor: Record<number, string> = { 0: '#c084fc', 1: '#00c4a7', 2: '#64c8ff', 3: '#ff6b35', 4: '#ff3b3b' };

  const Row = ({ left, right, color = mid }: { left: string; right?: string; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color, ...mono, fontSize: '1.05rem', letterSpacing: '1px' }}>
      <span>{left}</span>
      {right && <span style={{ color: 'rgba(255,255,255,0.85)', flexShrink: 0 }}>{right}</span>}
    </div>
  );
  const Divider = () => (
    <div style={{ color: dim, ...mono, fontSize: '1rem', letterSpacing: '1px' }}>
      {'─'.repeat(36)}
    </div>
  );
  const SectionHead = ({ label, sub, score: s, cap }: { label: string; sub?: string; score: number; cap: number }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...mono }}>
      <span style={{ fontSize: '1.15rem', letterSpacing: '3px', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>
        {label}{sub && <span style={{ fontSize: '0.9rem', color: dim, marginLeft: '0.4rem' }}>{sub}</span>}
      </span>
      <span style={{ fontSize: '1rem', color: dim, letterSpacing: '1px' }}>
        [ <span style={{ color: levelData.color }}>{Math.round(s)}</span> / {cap} ]
      </span>
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.14)',
          padding: '1.5rem 1.75rem', width: 420, maxHeight: '75vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '0.6rem',
        }}
      >
        {/* Header */}
        <div style={{ ...mono, fontSize: '1.3rem', letterSpacing: '4px', color: levelData.color, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          pressure breakdown
        </div>
        <Divider />

        {/* TODAY */}
        <SectionHead label="today" score={todayScore} cap={45} />
        {todayItems.length === 0
          ? <Row left="  (none scheduled today)" color={dim} />
          : todayItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: '1.05rem', letterSpacing: '1px' }}>
                <span style={{ color: mid }}>{'> '}<span style={{ color: urgColor[item.urgencyLevel] }}>L{item.urgencyLevel}</span>{' '}{trunc(item.title)}</span>
                <span style={{ color: 'rgba(255,255,255,0.85)', flexShrink: 0 }}>{fmtPts(item.urgPts)}</span>
              </div>
            ))
        }
        {effortBonus > 0 && (
          <Row
            left={`  effort  ${(todayMins/60).toFixed(1)}h / ${(capacityMins/60).toFixed(0)}h`}
            right={fmtPts(effortBonus)}
            color={dim}
          />
        )}

        {/* OVERDUE */}
        <div style={{ marginTop: '0.4rem' }} />
        <SectionHead label="overdue" score={overdueScore} cap={25} />
        {overdueItems.length === 0
          ? <Row left="  (no overdue tasks)" color={dim} />
          : overdueItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: '1.05rem', letterSpacing: '1px' }}>
                <span style={{ color: mid }}>{'> '}<span style={{ color: urgColor[item.urgencyLevel] }}>L{item.urgencyLevel}</span>{' '}{trunc(item.title)}<span style={{ color: dim }}> · {Math.round(item.daysAgo * 10) / 10}d ago</span></span>
                <span style={{ color: 'rgba(255,255,255,0.85)', flexShrink: 0 }}>{fmtPts(item.pts)}</span>
              </div>
            ))
        }

        {/* HORIZON */}
        <div style={{ marginTop: '0.4rem' }} />
        <SectionHead label="horizon" sub="(next 7d)" score={horizonScore} cap={30} />
        {horizonItems.length === 0
          ? <Row left="  (nothing in the next 7d)" color={dim} />
          : horizonItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: '1.05rem', letterSpacing: '1px' }}>
                <span style={{ color: mid }}>{'> '}<span style={{ color: urgColor[item.urgencyLevel] }}>L{item.urgencyLevel}</span>{' '}{trunc(item.title)}<span style={{ color: dim }}> · in {Math.round(item.daysAway * 10) / 10}d</span></span>
                <span style={{ color: 'rgba(255,255,255,0.85)', flexShrink: 0 }}>{fmtPts(item.pts)}</span>
              </div>
            ))
        }

        {/* Total */}
        <div style={{ marginTop: '0.4rem' }} />
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...mono }}>
          <span style={{ fontSize: '1.2rem', letterSpacing: '3px', color: 'rgba(255,255,255,0.55)' }}>TOTAL</span>
          <span style={{ fontSize: '1.4rem', letterSpacing: '2px', color: levelData.color }}>
            {score} pts · [ {levelData.label} ]
          </span>
        </div>

        {/* Close */}
        <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
          <span
            onClick={onClose}
            style={{ ...mono, fontSize: '1.05rem', letterSpacing: '2px', color: dim, cursor: 'pointer' }}
          >
            [ close ]
          </span>
        </div>
      </div>
    </div>
  );
}

function PressureGaugePanel({ pressure }: { pressure: PressureResult }) {
  const { score, level } = pressure;
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryHovered, setSummaryHovered] = useState(false);
  const levelData = PRESSURE_LEVELS.find(l => l.key === level)!;

  // SVG geometry — cx=80, cy=90 matches .gauge-needle CSS transform-origin
  const W = 160, H = 90;
  const cx = 80, cy = 90;
  const r = 55, labelR = 65, needleLen = r - 6;

  const toRad = (d: number) => d * Math.PI / 180;
  const px = (radius: number, d: number) => cx + radius * Math.cos(toRad(d));
  const py = (radius: number, d: number) => cy - radius * Math.sin(toRad(d));

  const wedge = (s: number, e: number) =>
    `M ${cx} ${cy} L ${px(r, s)} ${py(r, s)} A ${r} ${r} 0 0 1 ${px(r, e)} ${py(r, e)} Z`;

  const segments: Array<typeof PRESSURE_LEVELS[number] & { startDeg: number; endDeg: number; midDeg: number; anchor: 'end' | 'start' }> = [
    { startDeg: 179, endDeg: 137, midDeg: 158, anchor: 'end',   ...PRESSURE_LEVELS[0] },
    { startDeg: 134, endDeg: 92,  midDeg: 113, anchor: 'end',   ...PRESSURE_LEVELS[1] },
    { startDeg: 89,  endDeg: 47,  midDeg: 68,  anchor: 'start', ...PRESSURE_LEVELS[2] },
    { startDeg: 44,  endDeg: 1,   midDeg: 23,  anchor: 'start', ...PRESSURE_LEVELS[3] },
  ];

  const needleAngle = 180 - (score / 100) * 180;
  const needleRad   = toRad(needleAngle);
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy - needleLen * Math.sin(needleRad);

  return (
    <SidebarPanel title="pressure gauge" icon={SpeedSlow}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '44px' }}>

        {/* Gauge SVG */}
        <svg width={W} height={H} style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}>
          {segments.map(seg => (
            <path
              key={seg.key}
              d={wedge(seg.startDeg, seg.endDeg)}
              fill={seg.key === level ? seg.color : seg.color + '22'}
            />
          ))}
          {segments.map(seg => (
            <text
              key={`lbl-${seg.key}`}
              x={px(labelR, seg.midDeg)}
              y={py(labelR, seg.midDeg) + 4}
              textAnchor={seg.anchor}
              fill={seg.key === level ? seg.color : 'rgba(255,255,255,0.2)'}
              fontSize={16}
              letterSpacing={1}
              fontFamily="'VT323', 'HBIOS-SYS', monospace"
            >
              {'shortLabel' in seg ? seg.shortLabel : seg.label}
            </text>
          ))}
          <line
            x1={cx} y1={cy} x2={nx} y2={ny}
            stroke="#fff" strokeWidth={1.5} strokeOpacity={0.9}
            strokeLinecap="square"
            className={`gauge-needle gauge-needle-${level}`}
          />
          <circle cx={cx} cy={cy} r={3} fill="#fff" opacity={0.45} />
        </svg>

        {/* Score + level box + summary */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', flexShrink: 0 }}>
          <div style={{
            border: '0.7px solid rgba(255,255,255,0.35)',
            padding: '0.35rem 0.65rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '0.05rem',
          }}>
            <span style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: '1.8rem', letterSpacing: '1px',
              color: levelData.color, lineHeight: 1,
              filter: `drop-shadow(0 0 6px ${levelData.color}88)`,
            }}>{score}<span style={{ fontSize: '0.9rem', marginLeft: '2px' }}>pts.</span></span>
            <span style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: '0.85rem', letterSpacing: '2px',
              color: levelData.color, opacity: 0.8, lineHeight: 1,
            }}>[ {levelData.label} ]</span>
          </div>
          <span
            onClick={() => setSummaryOpen(true)}
            onMouseEnter={() => setSummaryHovered(true)}
            onMouseLeave={() => setSummaryHovered(false)}
            style={{
              fontFamily: "'VT323', 'HBIOS-SYS', monospace",
              fontSize: '0.9rem', letterSpacing: '2px',
              color: summaryHovered ? levelData.color : 'rgba(255,255,255,0.3)',
              cursor: 'pointer', transition: 'color 0.15s',
            }}
          >
            [ summary ]
          </span>
        </div>

      </div>

      {summaryOpen && <PressureSummaryPopup pressure={pressure} onClose={() => setSummaryOpen(false)} />}
    </SidebarPanel>
  );
}


// ─── Pixel Frog ───────────────────────────────────────────────────────────────

const FROG_MAP = [
  [0,0,1,1,0,0,0,1,1,0,0],  // r0: eye stalks
  [0,1,1,1,1,1,1,1,1,1,0],  // r1: head
  [0,1,0,1,1,1,1,1,0,1,0],  // r2: eyes
  [0,1,0,1,1,1,1,1,0,1,0],  // r3: eyes
  [1,1,1,1,0,1,0,1,1,1,1],  // r4: nostrils
  [1,1,1,1,1,1,1,1,1,1,1],  // r5: body
  [0,0,0,0,0,0,0,0,0,0,0],  // r6: gap
  [0,1,1,1,1,1,1,1,1,1,0],  // r7: jaw
  [0,0,1,1,1,1,1,1,1,0,0],  // r8: feet
];

function PixelFrog({ px = 3, color = '#4ade80', dim = false }: { px?: number; color?: string; dim?: boolean }) {
  const col = dim ? 'rgba(74,222,128,0.2)' : color;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(11, ${px}px)`,
      gridTemplateRows: `repeat(9, ${px}px)`,
      gap: 0, flexShrink: 0,
    }}>
      {FROG_MAP.flat().map((on, i) => (
        <div key={i} style={{ width: px, height: px, background: on ? col : 'transparent' }} />
      ))}
    </div>
  );
}

// ─── Panel 5 — Eat the Frog ───────────────────────────────────────────────────

const FROG_GOAL = 3;

function EatTheFrogPanel({ hasFrog, frogsDone }: {
  hasFrog: boolean;
  frogsDone: number;
}) {
  const mono: React.CSSProperties = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" };
  const done    = Math.min(frogsDone, FROG_GOAL);
  const allDone = done >= FROG_GOAL;

  if (!hasFrog && done === 0) return null;

  const counter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      {Array.from({ length: FROG_GOAL }).map((_, i) => (
        <PixelFrog key={i} px={2} dim={i >= done} />
      ))}
      {allDone && (
        <span style={{ ...mono, fontSize: '0.8rem', letterSpacing: '1.5px', color: '#4ade80', marginLeft: '0.2rem' }}>✓</span>
      )}
    </div>
  );

  return (
    <SidebarPanel title="eat the frog" icon={Frown} titleRight={counter}>
      {/* Subtitle */}
      <div style={{ ...mono, fontSize: '0.88rem', letterSpacing: '0.5px', color: 'rgba(74,222,128,0.55)', lineHeight: 1.4, marginBottom: '0.75rem' }}>
        swallow it whole.<br />the rest of the day is yours.
      </div>


    </SidebarPanel>
  );
}

// ─── Dice Taskmaster Modal ────────────────────────────────────────────────────

// Row-major 3×3 dot patterns for faces 1–6
const T = true, F = false;
const DOT_PATTERNS: boolean[][] = [
  [F,F,F, F,T,F, F,F,F], // 1
  [T,F,F, F,F,F, F,F,T], // 2
  [T,F,F, F,T,F, F,F,T], // 3
  [T,F,T, F,F,F, T,F,T], // 4
  [T,F,T, F,T,F, T,F,T], // 5
  [T,F,T, T,F,T, T,F,T], // 6
];

// Die: 44px, border + dots. CELL=8, GAP=4, PAD=6 → 6+8+4+8+4+8+6 = 44px
function DieFace({ idx }: { idx: number }) {
  const pattern = DOT_PATTERNS[idx] ?? DOT_PATTERNS[0];
  return (
    <div style={{
      width: 44, height: 44, boxSizing: 'border-box',
      border: '2px solid rgba(192,132,252,0.6)', background: '#000',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 8px)',
      gridTemplateRows: 'repeat(3, 8px)',
      gap: 2, padding: 6,
    }}>
      {pattern.map((on, i) => (
        <div key={i} style={{ background: on ? '#c084fc' : 'transparent' }} />
      ))}
    </div>
  );
}

type DicePhase = 'idle' | 'rolling' | 'fading' | 'result';

function DiceModal({ pool, onClose, onReschedule }: {
  pool: PlannerNode[];
  onClose: () => void;
  onReschedule: (id: string) => void;
}) {
  const [phase, setPhase]       = useState<DicePhase>('idle');
  const [faceIdx, setFaceIdx]   = useState(0);
  const [rollKey, setRollKey]   = useState(0);
  const [picked, setPicked]     = useState<PlannerNode | null>(null);
  const [closing, setClosing]   = useState(false);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const mono: React.CSSProperties = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" };

  const tasks     = pool.filter(n => n.node_type !== 'event' && !n.is_completed);
  const purple    = '#c084fc';
  const purpleDim = 'rgba(192,132,252,0.4)';
  const dim       = 'rgba(255,255,255,0.22)';

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 170);
  };

  const startRoll = () => {
    if (phase === 'rolling' || phase === 'fading') return;
    setPicked(null);
    setFaceIdx(Math.floor(Math.random() * 6));
    setRollKey(k => k + 1);
    setPhase('rolling');

    // Cycle face during animation
    intervalRef.current = setInterval(() => {
      setFaceIdx(Math.floor(Math.random() * 6));
    }, 130);

    // Animation is 1.8s; after that fade die out, then show result
    setTimeout(() => {
      clearInterval(intervalRef.current!);
      const result = pickDiceNode(pool);
      setPicked(result);
      setPhase('fading');
      setTimeout(() => setPhase('result'), 320);
    }, 1800);
  };

  return (
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={closing ? 'dice-modal-out' : 'dice-modal-in'}
        style={{ background: '#000', border: '1px solid rgba(255,255,255,0.18)', padding: '2rem', width: 400, display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
          <span style={{ ...mono, fontSize: '1.5rem', letterSpacing: '4px', color: purple, textTransform: 'uppercase' }}>dice taskmaster</span>
          <span style={{ ...mono, fontSize: '1.2rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.65)' }}>{tasks.length} tasks</span>
        </div>

        {/* Tagline */}
        <div style={{ ...mono, fontSize: '1.35rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.4, marginBottom: '1.25rem' }}>
          the gods have assembled your tasks.<br />roll — and <span style={{ color: '#ff3b3b' }}>OBEY</span>.
        </div>

        {/* Stage */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          height: 180, width: '100%',
          marginBottom: '1.25rem',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          {/* Die — enters on roll, fades out after */}
          {(phase === 'rolling' || phase === 'fading') && (
            <div
              key={rollKey}
              className={phase === 'fading' ? 'dice-fade-out' : 'dice-rolling-entry'}
              style={{ position: 'absolute', left: 'calc(50% - 22px)', bottom: 8 }}
            >
              <DieFace idx={faceIdx} />
            </div>
          )}

          {/* Result — fades in after die exits */}
          {phase === 'result' && (
            <div
              className="dice-result-in"
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '0 1rem',
              }}
            >
              {picked ? (
                <>
                  <div style={{ ...mono, fontSize: '1.1rem', letterSpacing: '3px', color: 'rgba(192,132,252,0.85)', marginBottom: '0.5rem' }}>FATE HAS SPOKEN</div>
                  <div style={{ ...mono, fontSize: '2rem', color: '#fff', textAlign: 'center', lineHeight: 1.25 }}>{picked.title}</div>
                  {!picked.planned_start_at?.startsWith(toDateString(new Date())) && (
                    <button
                      onClick={() => onReschedule(picked.id)}
                      style={{ marginTop: '0.75rem', background: 'transparent', border: `1px solid ${purpleDim}`, color: purple, padding: '0.2rem 0.8rem', cursor: 'pointer', ...mono, fontSize: '1rem', letterSpacing: '2px' }}
                    >
                      + today
                    </button>
                  )}
                </>
              ) : (
                <div style={{ ...mono, fontSize: '1rem', color: dim }}>no tasks in pool</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {tasks.length > 0 && (phase === 'idle' || phase === 'result') ? (
            <span
              onClick={startRoll}
              style={{ ...mono, fontSize: '1.2rem', letterSpacing: '2px', color: purple, cursor: 'pointer' }}
            >
              {phase === 'result' ? '[ re-roll ]' : '[ press to roll ]'}
            </span>
          ) : <span />}
          <span onClick={handleClose} style={{ ...mono, fontSize: '1rem', letterSpacing: '2px', color: dim, cursor: 'pointer' }}>
            [ close ]
          </span>
        </div>
      </div>
    </div>
  );
}

