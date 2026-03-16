import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerNode } from '../types';
import { getDotColor, getDotDiameter, getDotAnimClass } from '../types';
import TaskDetailPanel from './TaskDetailPanel';

interface DotNodeProps {
  node: PlannerNode;
  onClick?: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

export default function DotNode({ node, onClick, onComplete, onDelete, onEdit }: DotNodeProps) {
  const [hovered, setHovered] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
  const dotRef = useRef<HTMLDivElement>(null);

  const diameter  = getDotDiameter(node.estimated_duration_minutes);
  const color     = getDotColor(node);
  const animClass = getDotAnimClass(node);

  const subTotal  = node.sub_total ?? 0;
  const subDone   = node.sub_done  ?? 0;

  const handleMouseEnter = () => {
    if (dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect();
      setPanelPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
    setHovered(true);
  };

  const handleMouseLeave = () => setHovered(false);

  return (
    <div
      ref={dotRef}
      className={`dot ${animClass}`}
      style={{
        width:  diameter,
        height: diameter,
        minWidth:  diameter,
        minHeight: diameter,
        backgroundColor: color,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
      }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={node.title}
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

      {/* Hover detail panel */}
      {hovered && createPortal(
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleMouseLeave}
        >
          <TaskDetailPanel
            node={node}
            anchorX={panelPos.x}
            anchorY={panelPos.y}
            onClose={() => setHovered(false)}
            onComplete={() => { onComplete?.(); setHovered(false); }}
            onEdit={() => { onEdit?.(); setHovered(false); }}
            onDelete={() => { onDelete?.(); setHovered(false); }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
