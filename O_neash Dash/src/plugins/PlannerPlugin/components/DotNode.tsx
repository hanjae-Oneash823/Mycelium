import { useState, useRef, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PlannerNode } from '../types';
import { getDotColor, getDotDiameter, getDotAnimClass } from '../types';
import { useViewStore } from '../store/useViewStore';
import DotTooltip from './DotTooltip';
import TaskDetailPanel from './TaskDetailPanel';

interface DotNodeProps {
  node:         PlannerNode;
  scale?:       number;
  noPopups?:    boolean;
  isToday?:     boolean;
  onComplete?:  () => void;
  onDelete?:    () => void;
  onEdit?:      () => void;
}

export default function DotNode({ node, scale = 1, noPopups = false, isToday = true, onComplete, onDelete, onEdit }: DotNodeProps) {
  const [hovered,   setHovered]   = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [anchor,    setAnchor]    = useState({ x: 0, y: 0 });
  const taskFormOpen = useViewStore(s => s.taskFormOpen);
  const dotRef = useRef<HTMLDivElement | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:       node.id,
    disabled: !!node.is_locked || !!node.is_routine,
    data:     { node },
  });

  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    dotRef.current = el;
    setNodeRef(el);
  }, [setNodeRef]);

  const computeAnchor = () => {
    if (dotRef.current) {
      const r = dotRef.current.getBoundingClientRect();
      setAnchor({ x: r.left + r.width / 2, y: r.top });
    }
  };

  const handleMouseEnter = () => {
    computeAnchor();
    setHovered(true);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    computeAnchor();
    setHovered(false);
    setPanelOpen(prev => !prev);
  };

  const diameter  = Math.round(getDotDiameter(node.estimated_duration_minutes) * scale);
  const color     = getDotColor(node);
  const animClass = getDotAnimClass(node);

  const subTotal = node.sub_total ?? 0;
  const subDone  = node.sub_done  ?? 0;

  return (
    <div
      ref={mergedRef}
      className={`dot ${animClass}`}
      style={{
        width:           diameter,
        height:          diameter,
        minWidth:        diameter,
        minHeight:       diameter,
        backgroundColor: node.node_type === 'event' ? '#000' : color,
        borderRadius:    '50%',
        border:          node.node_type === 'event' ? `3px solid ${color}` : 'none',
        cursor:          isDragging ? 'grabbing' : (node.is_locked || node.is_routine ? 'default' : 'grab'),
        display:         'inline-flex',
        alignItems:      'center',
        justifyContent:  'center',
        position:        'relative',
        flexShrink:      0,
        opacity:         isDragging ? 0 : 1,
        transform:       isDragging ? undefined : CSS.Translate.toString(transform),
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
      {...listeners}
      {...attributes}
    >
      {/* Subtask SVG ring — SVG is sized to contain the ring, centered over dot */}
      {subTotal > 0 && (() => {
        const gap = 4;
        const sw  = 2;
        const pad = gap + sw;
        const svgSize = diameter + pad * 2;
        const cx = svgSize / 2;
        const r  = diameter / 2 + gap;
        const circ = 2 * Math.PI * r;
        return (
          <svg
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            style={{
              position: 'absolute',
              top:  '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={sw} />
            {subDone > 0 && (
              <circle
                cx={cx} cy={cx} r={r}
                fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={sw}
                strokeDasharray={`${(subDone / subTotal) * circ} ${circ}`}
                transform={`rotate(-90 ${cx} ${cx})`}
                strokeLinecap="butt"
              />
            )}
          </svg>
        );
      })()}

      {/* Subtask count badge — visible on hover */}
      {subTotal > 0 && hovered && !isDragging && (
        <div style={{
          position: 'absolute', bottom: -(diameter * 0.45), left: '50%', transform: 'translateX(-50%)',
          fontFamily: "'VT323', monospace", fontSize: Math.max(9, diameter * 0.42),
          color: color, letterSpacing: '0.5px', lineHeight: 1, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 20,
          textShadow: '0 1px 4px #000',
        }}>
          {subDone}/{subTotal}
        </div>
      )}


      {/* Hover tooltip — hidden while dragging, panel open, or task form open */}
      {!noPopups && hovered && !isDragging && !panelOpen && !taskFormOpen && (
        <DotTooltip node={node} anchorX={anchor.x} anchorY={anchor.y} />
      )}

      {/* Click panel */}
      {!noPopups && panelOpen && !isDragging && !taskFormOpen && (
        <TaskDetailPanel
          node={node}
          anchorX={anchor.x}
          anchorY={anchor.y}
          isToday={isToday}
          onClose={() => setPanelOpen(false)}
          onComplete={() => { onComplete?.(); setPanelOpen(false); }}
          onEdit={() => { setPanelOpen(false); onEdit?.(); }}
          onDelete={() => { onDelete?.(); setPanelOpen(false); }}
        />
      )}
    </div>
  );
}
