import { createPortal } from 'react-dom';
import type { PlannerNode } from '../types';
import { formatDueLabel, formatEffortLabel } from '../lib/logicEngine';

interface DotTooltipProps {
  node:    PlannerNode;
  anchorX: number;
  anchorY: number;
}

export default function DotTooltip({ node, anchorX, anchorY }: DotTooltipProps) {
  const dueLabel    = formatDueLabel(node.due_at, new Date());
  const effortLabel = formatEffortLabel(node.estimated_duration_minutes);
  const meta        = [effortLabel, dueLabel].filter(Boolean).join('  ·  ');

  const w    = 240;
  const left = Math.max(8, Math.min(anchorX - w / 2, window.innerWidth - w - 8));

  return createPortal(
    <div
      style={{
        position:      'fixed',
        left,
        top:           anchorY - 10,
        transform:     'translateY(-100%)',
        width:         w,
        background:    '#0c0c0c',
        border:        '1px solid rgba(255,255,255,0.10)',
        padding:       '5px 10px 6px',
        zIndex:        9000,
        pointerEvents: 'none',
        fontFamily:    "'VT323', 'IBM Plex Mono', monospace",
        boxShadow:     '0 4px 20px rgba(0,0,0,0.85)',
      }}
    >
      <div style={{
        fontSize:     '1.1rem',
        letterSpacing: '0.5px',
        color:        'rgba(255,255,255,0.88)',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        &gt;&nbsp;{node.title}
      </div>
      {meta && (
        <div style={{
          fontSize:     '0.82rem',
          color:        'rgba(255,255,255,0.35)',
          letterSpacing: '0.5px',
          marginTop:    2,
        }}>
          {meta}
        </div>
      )}
    </div>,
    document.body,
  );
}
