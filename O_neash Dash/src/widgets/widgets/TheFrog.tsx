import { useMemo } from 'react';
import { Frown } from 'pixelarticons/react/Frown';
import { usePlannerStore } from '../../plugins/PlannerPlugin/store/usePlannerStore';
import { pickFrogNode, toDateString } from '../../plugins/PlannerPlugin/lib/logicEngine';
import type { WidgetProps } from '../types';

const GOLD  = '#d4a52a';
const GREEN = '#4ade80';

const BODY_TEXTS = [
  '',
  'tackle the hardest tasks first.\nclose your eyes. swallow it whole.',
  'tackle the hardest tasks first.\nclose your eyes. swallow it whole.',
  'no... more... frogs... ughhh....\ni think i\'m gonna... puke...\ngood job though...',
  'no... more... frogs... ughhh....\ni think i\'m gonna... puke...\ngood job though...',
];

export function TheFrog({ }: WidgetProps) {
  const nodes = usePlannerStore(s => s.nodes);
  const today = toDateString(new Date());

  const frog = useMemo(() => pickFrogNode(nodes, today), [nodes, today]);

  const frogCount = frog ? Math.min(Math.max(frog.computed_urgency_level, 1), 4) : 0;
  const bodyText  = frog ? (BODY_TEXTS[frogCount] ?? BODY_TEXTS[2]) : '';

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'VT323', monospace",
      padding: '10px 12px',
      boxSizing: 'border-box',
      gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, flexWrap: 'wrap' }}>
        <Frown width={14} height={14} style={{ color: GOLD }} />
        <span style={{ fontSize: '0.82rem', letterSpacing: '2px', color: GOLD, lineHeight: 1 }}>
          EAT-THE-FROG
        </span>
        {frogCount > 0 && (
          <span style={{ fontSize: '0.95rem', lineHeight: 1, letterSpacing: 0 }}>
            {'🐸'.repeat(frogCount)}
          </span>
        )}
      </div>

      {frog ? (
        <>
          {/* Body flavour text */}
          <div style={{
            flex: 1,
            fontSize: '0.78rem',
            letterSpacing: '0.5px',
            color: GREEN,
            lineHeight: 1.45,
            whiteSpace: 'pre-line',
            overflow: 'hidden',
          }}>
            {bodyText}
          </div>

          {/* Next frog pointer */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              fontSize: '0.72rem',
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '1px',
              marginBottom: 2,
            }}>
              {'>'}&nbsp; next frog:
            </div>
            <div style={{
              fontSize: '0.88rem',
              color: '#fff',
              letterSpacing: '0.5px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingLeft: '1.2rem',
            }}>
              {frog.title}
            </div>
          </div>
        </>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.8rem', letterSpacing: '1.5px',
          color: 'rgba(255,255,255,0.15)',
        }}>
          no frogs today
        </div>
      )}
    </div>
  );
}
