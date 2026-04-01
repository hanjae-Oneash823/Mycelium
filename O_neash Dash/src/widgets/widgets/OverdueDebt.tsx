import { useMemo } from 'react';
import { SquareAlert } from 'pixelarticons/react/SquareAlert';
import { usePlannerStore } from '../../plugins/PlannerPlugin/store/usePlannerStore';
import { formatEffortLabel } from '../../plugins/PlannerPlugin/lib/logicEngine';
import type { WidgetProps } from '../types';

const GOLD = '#d4a52a';

export function OverdueDebt({ }: WidgetProps) {
  const nodes = usePlannerStore(s => s.nodes);

  const { count, totalMins } = useMemo(() => {
    const overdue = nodes.filter(n => n.is_overdue || n.is_missed_schedule);
    return {
      count:     overdue.length,
      totalMins: overdue.reduce((s, n) => s + (n.estimated_duration_minutes ?? 0), 0),
    };
  }, [nodes]);

  const color = count === 0 ? '#00c4a7' : count <= 2 ? '#facc15' : '#ef4444';

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      fontFamily: "'VT323', monospace",
      padding: '10px 12px', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <SquareAlert width={14} height={14} style={{ color: GOLD }} />
        <span style={{ fontSize: '0.82rem', letterSpacing: '2px', color: GOLD, lineHeight: 1 }}>
          OVERDUE-DEBT
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: '3.2rem', color, lineHeight: 1 }}>{count}</span>
        <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.25)' }}>tasks</span>
      </div>

      <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px' }}>
        {totalMins > 0 ? `${formatEffortLabel(totalMins)} owed` : count === 0 ? 'clear' : '—'}
      </div>
    </div>
  );
}
