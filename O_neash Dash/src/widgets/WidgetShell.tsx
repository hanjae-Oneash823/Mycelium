import { useState } from 'react';
import { SIZE_SPANS } from './types';
import type { WidgetInstance } from './types';
import { getWidgetDef } from './registry';
import useWidgetStore from './store/useWidgetStore';

interface WidgetShellProps {
  instance:    WidgetInstance;
  editMode:    boolean;
  col:         number;
  row:         number;
  isDragging:  boolean;
  onDragStart: (id: string) => void;
  onDragEnd:   () => void;
}

const ARM = 16, T = 1.5, P = 5;
const BC = 'rgba(255,255,255,0.2)';

export function WidgetShell({ instance, editMode, col, row, isDragging, onDragStart, onDragEnd }: WidgetShellProps) {
  const [hovered, setHovered] = useState(false);

  const removeWidget  = useWidgetStore(s => s.removeWidget);
  const reorderWidget = useWidgetStore(s => s.reorderWidget);

  const def = getWidgetDef(instance.widgetId);
  if (!def) return null;

  const { colSpan, rowSpan } = SIZE_SPANS[instance.size];
  const Component = def.component;

  return (
    <div
      draggable={editMode}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={editMode ? (e) => {
        e.dataTransfer.setData('text/plain', instance.instanceId);
        e.dataTransfer.effectAllowed = 'move';
        // Defer so drag image is captured before opacity changes
        setTimeout(() => onDragStart(instance.instanceId), 0);
      } : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
      style={{
        gridColumn:  `${col} / span ${colSpan}`,
        gridRow:     `${row} / span ${rowSpan}`,
        border:      editMode ? '1px solid rgba(0,196,167,0.3)' : 'none',
        background:  'rgba(255,255,255,0.018)',
        position:    'relative',
        overflow:    'hidden',
        // Stay below ghost cells during drag so ghost cells receive events
        zIndex:      isDragging ? 0 : 1,
        opacity:     isDragging ? 0.3 : 1,
        cursor:      editMode ? 'grab' : 'default',
        transition:  'opacity 0.1s',
        // Disable pointer events when another widget is being dragged (handled by ghost cells)
        pointerEvents: 'auto',
      }}
    >
      <Component size={instance.size} instanceId={instance.instanceId} />

      {/* Corner brackets */}
      <div style={{ position:'absolute', top:P, left:P, width:ARM, height:T, background:BC, pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:P, left:P, width:T, height:ARM, background:BC, pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:P, right:P, width:ARM, height:T, background:BC, pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:P, right:P, width:T, height:ARM, background:BC, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:P, left:P, width:ARM, height:T, background:BC, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:P, left:P, width:T, height:ARM, background:BC, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:P, right:P, width:ARM, height:T, background:BC, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:P, right:P, width:T, height:ARM, background:BC, pointerEvents:'none' }} />

      {/* Drag grip hint */}
      {editMode && !hovered && (
        <div style={{
          position: 'absolute', top: 6, right: 8,
          fontFamily: "'VT323', monospace", fontSize: '0.75rem',
          color: 'rgba(0,196,167,0.35)', pointerEvents: 'none', lineHeight: 1,
        }}>⠿</div>
      )}

      {/* Edit overlay */}
      {editMode && hovered && !isDragging && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6,
          cursor: 'grab',
        }}>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'0.75rem', letterSpacing:'2px', color:'rgba(255,255,255,0.45)', marginBottom:2 }}>
            {def.label}
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <ShellButton onClick={(e) => { e.stopPropagation(); reorderWidget(instance.instanceId, 'up'); }}>↑</ShellButton>
            <ShellButton onClick={(e) => { e.stopPropagation(); reorderWidget(instance.instanceId, 'down'); }}>↓</ShellButton>
            <ShellButton onClick={(e) => { e.stopPropagation(); removeWidget(instance.instanceId); }} danger>✕</ShellButton>
          </div>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'0.62rem', letterSpacing:'1px', color:'rgba(255,255,255,0.18)', marginTop:2 }}>
            drag to reposition
          </div>
        </div>
      )}
    </div>
  );
}

function ShellButton({ onClick, danger, children }: {
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{
      background: 'none',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)'}`,
      color: danger ? '#ef4444' : 'rgba(255,255,255,0.7)',
      fontFamily: "'VT323',monospace", fontSize: '1rem',
      padding: '0 10px', cursor: 'pointer', lineHeight: '1.6rem',
    }}>
      {children}
    </button>
  );
}
