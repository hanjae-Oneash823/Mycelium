import { useMemo } from 'react';
import { PixelFrog } from '../../plugins/PlannerPlugin/components/PixelFrog';
import { usePlannerStore } from '../../plugins/PlannerPlugin/store/usePlannerStore';
import { pickFrogNode, toDateString } from '../../plugins/PlannerPlugin/lib/logicEngine';
import type { WidgetProps } from '../types';

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
      padding: '12px 14px',
      boxSizing: 'border-box',
      gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, flexWrap: 'wrap' }}>
        <PixelFrog px={2} />
        <span style={{ fontSize: '1.05rem', letterSpacing: '2px', color: GREEN, lineHeight: 1 }}>
          EAT-THE-FROG
        </span>
        {frogCount > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {Array.from({ length: frogCount - 1 }).map((_, i) => (
              <PixelFrog key={i} px={2} dim />
            ))}
          </div>
        )}
      </div>

      {frog ? (
        <>
          {/* Body flavour text */}
          <div style={{
            flex: 1,
            fontSize: '0.82rem',
            letterSpacing: '0.5px',
            color: GREEN,
            lineHeight: 1.45,
            whiteSpace: 'pre-line',
            overflow: 'hidden',
            opacity: 0.78,
          }}>
            {bodyText}
          </div>

          {/* Next frog pointer */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '1px',
              marginBottom: 2,
            }}>
              {'>'}&nbsp; next frog:
            </div>
            <div style={{
              fontSize: '0.95rem',
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
          fontSize: '0.85rem', letterSpacing: '1.5px',
          color: 'rgba(255,255,255,0.15)',
        }}>
          no frogs today
        </div>
      )}
    </div>
  );
}
