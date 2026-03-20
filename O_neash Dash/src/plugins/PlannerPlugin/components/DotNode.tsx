import { useState, useRef, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PlannerNode } from '../types';
import { getDotColor, getDotDiameter, getDotAnimClass } from '../types';
import { useViewStore } from '../store/useViewStore';
import DotTooltip from './DotTooltip';
import TaskDetailPanel from './TaskDetailPanel';

interface DotNodeProps {
  node:        PlannerNode;
  scale?:      number;
  noPopups?:   boolean;
  onComplete?: () => void;
  onDelete?:   () => void;
  onEdit?:     () => void;
}

export default function DotNode({ node, scale = 1, noPopups = false, onComplete, onDelete, onEdit }: DotNodeProps) {
  const [hovered,   setHovered]   = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [anchor,    setAnchor]    = useState({ x: 0, y: 0 });
  const taskFormOpen = useViewStore(s => s.taskFormOpen);
  const dotRef = useRef<HTMLDivElement | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:       node.id,
    disabled: !!node.is_locked,
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

  const diameter  = getDotDiameter(node.estimated_duration_minutes) * scale;
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
        backgroundColor: color,
        cursor:          isDragging ? 'grabbing' : (node.is_locked ? 'default' : 'grab'),
        display:         'inline-flex',
        alignItems:      'center',
        justifyContent:  'center',
        position:        'relative',
        flexShrink:      0,
        opacity:         isDragging ? 0.3 : 1,
        transform:       CSS.Translate.toString(transform),
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
      {...listeners}
      {...attributes}
    >
      {/* Subtask SVG ring */}
      {subTotal > 0 && (
        <svg
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
          viewBox={`0 0 ${diameter} ${diameter}`}
        >
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={diameter / 2 - 1.5}
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1.5"
            strokeDasharray={`${(subDone / subTotal) * (Math.PI * (diameter - 3))} ${Math.PI * (diameter - 3)}`}
            transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
            strokeLinecap="butt"
          />
        </svg>
      )}

      {/* Note badge */}
      {(node.linked_note_count ?? 0) >= 1 && (
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 7, height: 7, borderRadius: '50%',
          background: '#c084fc', border: '1px solid #000',
          pointerEvents: 'none',
        }} />
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
          onClose={() => setPanelOpen(false)}
          onComplete={() => { onComplete?.(); setPanelOpen(false); }}
          onEdit={() => { setPanelOpen(false); onEdit?.(); }}
          onDelete={() => { onDelete?.(); setPanelOpen(false); }}
        />
      )}
    </div>
  );
}
