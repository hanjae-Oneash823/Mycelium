import { useMemo } from 'react';
import { Calendar } from 'pixelarticons/react/Calendar';
import { usePlannerStore } from '../../plugins/PlannerPlugin/store/usePlannerStore';
import { toDateString } from '../../plugins/PlannerPlugin/lib/logicEngine';
import type { WidgetProps } from '../types';
import type { ImportanceLevel } from '../../plugins/PlannerPlugin/types';

const GOLD = '#d4a52a';

const URGENCY_COLOR: Record<ImportanceLevel, string> = {
  0: 'rgba(255,255,255,0.2)',
  1: 'rgba(255,255,255,0.4)',
  2: '#facc15',
  3: '#f97316',
  4: '#ef4444',
};

const DAYS = 14;

export function DeadlineHorizon({ }: WidgetProps) {
  const nodes = usePlannerStore(s => s.nodes);

  const buckets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: Array<{ date: string; label: string; tasks: typeof nodes }> = [];

    for (let i = 0; i < DAYS; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = toDateString(d);
      const tasks = nodes.filter(n =>
        !n.is_completed &&
        (n.due_at?.startsWith(dateStr) || n.planned_start_at?.startsWith(dateStr)),
      );
      result.push({
        date: dateStr,
        label: i === 0 ? 'T' : String(i),
        tasks,
      });
    }
    return result;
  }, [nodes]);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      fontFamily: "'VT323', monospace",
      padding: '10px 12px',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <Calendar width={14} height={14} style={{ color: GOLD }} />
        <span style={{ fontSize: '0.82rem', letterSpacing: '2px', color: GOLD, lineHeight: 1 }}>
          DEADLINE-HORIZON
        </span>
        <span style={{ fontSize: '0.72rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.25)' }}>
          14D
        </span>
      </div>

      {/* Dot timeline */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flex: 1, paddingTop: 10 }}>
        {buckets.map(bucket => {
          const topTask = bucket.tasks.reduce<typeof nodes[0] | null>((best, n) =>
            !best || n.computed_urgency_level > best.computed_urgency_level ? n : best, null);
          const dotColor = topTask
            ? URGENCY_COLOR[topTask.computed_urgency_level]
            : 'rgba(255,255,255,0.07)';
          const count = bucket.tasks.length;

          return (
            <div key={bucket.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
              {/* Stack of dots (capped at 3) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                  <div key={i} style={{
                    width: 6, height: 6,
                    background: dotColor,
                    opacity: count > 0 ? 1 - i * 0.25 : 1,
                  }} />
                ))}
                {count === 0 && (
                  <div style={{ width: 6, height: 6, background: 'rgba(255,255,255,0.07)' }} />
                )}
              </div>
              {/* Day label */}
              <div style={{
                fontSize: '0.65rem',
                color: bucket.label === 'T' ? '#00c4a7' : 'rgba(255,255,255,0.2)',
                letterSpacing: 0,
              }}>
                {bucket.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 6 }}>
        {([1, 2, 3, 4] as ImportanceLevel[]).map(lvl => (
          <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 6, height: 6, background: URGENCY_COLOR[lvl] }} />
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>
              L{lvl}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
