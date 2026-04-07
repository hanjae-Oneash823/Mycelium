import { useMemo } from 'react';
import { MenuSquare } from 'pixelarticons/react/MenuSquare';
import { usePlannerStore } from '../../plugins/PlannerPlugin/store/usePlannerStore';
import { toDateString } from '../../plugins/PlannerPlugin/lib/logicEngine';
import type { WidgetProps } from '../types';

const GOLD = '#d4a52a';

export function DailyTasks({ }: WidgetProps) {
  const nodes = usePlannerStore(s => s.nodes);

  const { overdueCount, tasksCount, eventsCount, tmrwCount } = useMemo(() => {
    const today    = toDateString(new Date());
    const tomorrow = toDateString(new Date(Date.now() + 86_400_000));

    return {
      overdueCount: nodes.filter(n => n.is_overdue).length,
      tasksCount:   nodes.filter(n =>
        !n.is_completed &&
        !n.is_overdue &&
        n.node_type === 'task' &&
        !!n.planned_start_at?.startsWith(today),
      ).length,
      eventsCount:  nodes.filter(n =>
        !n.is_completed &&
        n.node_type === 'event' &&
        !!n.planned_start_at?.startsWith(today),
      ).length,
      tmrwCount:    nodes.filter(n =>
        !n.is_completed &&
        !!n.planned_start_at?.startsWith(tomorrow),
      ).length,
    };
  }, [nodes]);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      fontFamily: "'VT323', monospace",
      padding: '10px 14px',
      boxSizing: 'border-box',
      gap: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <MenuSquare width={18} height={18} style={{ color: GOLD }} />
        <span style={{ fontSize: '1.05rem', letterSpacing: '2px', color: GOLD, lineHeight: 1 }}>
          DAILY-TASKS
        </span>
      </div>

      {/* Counters */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
      }}>
        <Counter value={overdueCount} label="overdue" color="#ef4444" />
        <Divider />
        <Counter value={tasksCount}   label="tasks"   color="#4ade80" />
        <Divider />
        <Counter value={eventsCount}  label="events"  color="#7ecfff" />
        <Divider />
        <Counter value={tmrwCount}    label="tmrw"    color="rgba(255,255,255,0.35)" />
      </div>
    </div>
  );
}

function Counter({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }}>
      <span style={{
        fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
        color,
        lineHeight: 1,
        letterSpacing: '-1px',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: '0.62rem',
        letterSpacing: '1.5px',
        color: 'rgba(255,255,255,0.3)',
        textTransform: 'lowercase',
      }}>
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width: 1, height: '40%',
      background: 'rgba(255,255,255,0.07)',
      flexShrink: 0,
    }} />
  );
}
