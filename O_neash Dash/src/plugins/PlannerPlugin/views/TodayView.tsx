import React, { useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import { scoreSuggestion, isSameDay, toDateString, formatDueLabel, formatEffortLabel } from '../lib/logicEngine';
import DotNode from '../components/DotNode';
import type { PlannerNode } from '../types';

const SUGGESTION_THRESHOLD = 40;
const SUGGESTION_LIMIT = 3;

export default function TodayView() {
  const { nodes, capacity, completeNode, deleteNode, rescheduleNode } = usePlannerStore();
  const { openTaskForm } = useViewStore();
  const now   = new Date();
  const today = toDateString(now);

  const overdue     = useMemo(() => nodes.filter(n => n.is_overdue && !n.is_completed).sort((a,b) => (a.due_at ?? '').localeCompare(b.due_at ?? '')), [nodes]);
  const todayNodes  = useMemo(() => nodes.filter(n => !n.is_overdue && !n.is_completed && (isSameDay(n.planned_start_at, now) || isSameDay(n.due_at, now))), [nodes]);

  const suggestions = useMemo(() => {
    const candidates = nodes.filter(n =>
      !n.is_completed && !n.is_overdue &&
      !isSameDay(n.planned_start_at, now) &&
      !isSameDay(n.due_at, now)
    );
    const scored = candidates.map(n => ({ node: n, score: scoreSuggestion(n, now) })).sort((a,b) => b.score - a.score);
    const above = scored.filter(s => s.score > SUGGESTION_THRESHOLD);
    return (above.length > 0 ? above : scored).slice(0, SUGGESTION_LIMIT).map(s => s.node);
  }, [nodes]);

  const todayMinutes   = todayNodes.reduce((s, n) => s + (n.estimated_duration_minutes ?? 0), 0);
  const capacityMins   = capacity?.daily_minutes ?? 480;
  const capacityHrs    = (capacityMins / 60).toFixed(1);
  const todayHrs       = (todayMinutes / 60).toFixed(1);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0', display: 'flex', flexDirection: 'column' }}>

      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.4rem', letterSpacing: '4px', color: '#fff' }}>
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
        </span>
        {overdue.length > 0 && (
          <span style={{ fontSize: '0.85rem', letterSpacing: '2px', color: '#ff3b3b', border: '1px solid #ff3b3b44', padding: '0.1rem 0.5rem' }}>
            {overdue.length} overdue
          </span>
        )}
        <span style={{ fontSize: '0.85rem', letterSpacing: '2px', color: 'var(--teal)', border: '1px solid #00c4a744', padding: '0.1rem 0.5rem' }}>
          {todayNodes.length} today
        </span>
        {suggestions.length > 0 && (
          <span style={{ fontSize: '0.85rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.15)', padding: '0.1rem 0.5rem' }}>
            {suggestions.length} suggested
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.82rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.35)' }}>
          {todayHrs}h / {capacityHrs}h
        </span>
        <button
          onClick={() => openTaskForm({ planned_start_at: today, due_at: today })}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.6)', padding: '0.2rem 0.8rem', fontSize: '0.9rem', letterSpacing: '2px', cursor: 'pointer', fontFamily: "'VT323', monospace" }}
        >
          + task
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* OVERDUE */}
        {overdue.length > 0 && (
          <section>
            <div style={{ fontSize: '0.82rem', letterSpacing: '3px', textTransform: 'uppercase', color: '#ff3b3b', marginBottom: '0.7rem', borderBottom: '1px solid rgba(255,59,59,0.2)', paddingBottom: '0.4rem' }}>
              overdue
            </div>
            <div style={{ background: 'rgba(255,59,59,.025)', display: 'flex', flexDirection: 'column', gap: '0' }}>
              {overdue.map(node => (
                <TaskRow key={node.id} node={node} now={now}
                  onComplete={() => completeNode(node.id)}
                  onDelete={() => deleteNode(node.id)}
                  onEdit={() => openTaskForm({ title: node.title, due_at: node.due_at ?? undefined, importance_level: node.importance_level })}
                />
              ))}
            </div>
          </section>
        )}

        {/* TODAY */}
        <section>
          <div style={{ fontSize: '0.82rem', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '0.7rem', borderBottom: '1px solid rgba(0,196,167,0.2)', paddingBottom: '0.4rem' }}>
            today {todayNodes.length === 0 && <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 300, letterSpacing: '1px', textTransform: 'lowercase', marginLeft: '0.5rem' }}>— nothing scheduled</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {todayNodes.map(node => (
              <TaskRow key={node.id} node={node} now={now}
                onComplete={() => completeNode(node.id)}
                onDelete={() => deleteNode(node.id)}
                onEdit={() => openTaskForm({ title: node.title, planned_start_at: node.planned_start_at ?? undefined, due_at: node.due_at ?? undefined, importance_level: node.importance_level })}
              />
            ))}
          </div>
        </section>

        {/* SUGGESTIONS */}
        {suggestions.length > 0 && (
          <section>
            <div style={{ fontSize: '0.82rem', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '0.7rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
              bring to today?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {suggestions.map(node => (
                <TaskRow key={node.id} node={node} now={now}
                  onComplete={() => completeNode(node.id)}
                  onDelete={() => deleteNode(node.id)}
                  onEdit={() => openTaskForm({ title: node.title, due_at: node.due_at ?? undefined, importance_level: node.importance_level })}
                  rescheduleToday={() => rescheduleNode(node.id, today)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {overdue.length === 0 && todayNodes.length === 0 && suggestions.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.5rem', paddingTop: '4rem' }}>
            <div style={{ fontSize: '1.8rem', letterSpacing: '4px', color: 'rgba(255,255,255,0.12)' }}>nothing today</div>
            <div style={{ fontSize: '0.9rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.1)' }}>double-click to add a task</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────
function TaskRow({ node, now, onComplete, onDelete, onEdit, rescheduleToday }: {
  node: PlannerNode;
  now: Date;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  rescheduleToday?: () => void;
}) {
  const dueLabel    = formatDueLabel(node.due_at, now);
  const effortLabel = formatEffortLabel(node.estimated_duration_minutes);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <DotNode node={node} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} />

      <span style={{ flex: 1, fontSize: '1.05rem', letterSpacing: '0.5px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.title}
      </span>

      {dueLabel && (
        <span style={{ fontSize: '0.82rem', letterSpacing: '1px', color: node.is_overdue ? '#ff3b3b' : 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
          {dueLabel}
        </span>
      )}
      {effortLabel && (
        <span style={{ fontSize: '0.82rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
          {effortLabel}
        </span>
      )}

      {node.groups && node.groups.filter(g => !g.is_ungrouped).map(g => (
        <span key={g.id} style={{ fontSize: '0.78rem', padding: '0.05rem 0.35rem', background: g.color_hex + '18', border: `1px solid ${g.color_hex}44`, color: g.color_hex, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
          {g.name}
        </span>
      ))}

      {rescheduleToday && (
        <button
          onClick={rescheduleToday}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', padding: '0.1rem 0.5rem', fontSize: '0.9rem', cursor: 'pointer', fontFamily: "'VT323', monospace", letterSpacing: '1px', whiteSpace: 'nowrap' }}
        >
          + today
        </button>
      )}

      <button onClick={onComplete} title="complete" style={rowBtn('#4ade80')}>✓</button>
      <button onClick={onEdit}    title="edit"     style={rowBtn('rgba(255,255,255,0.3)')}>✏</button>
      <button onClick={onDelete}  title="delete"   style={rowBtn('#ef4444')}>×</button>
    </div>
  );
}

function rowBtn(color: string): React.CSSProperties {
  return {
    background: 'transparent', border: 'none', color,
    fontSize: '1.1rem', cursor: 'pointer', padding: '0 0.2rem',
    lineHeight: 1, opacity: 0.6,
  };
}
