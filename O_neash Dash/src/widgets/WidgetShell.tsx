import { useState } from 'react';
import { SIZE_SPANS } from './types';
import type { WidgetInstance } from './types';
import { getWidgetDef } from './registry';
import useWidgetStore from './store/useWidgetStore';

interface WidgetShellProps {
  instance: WidgetInstance;
  editMode: boolean;
}

// Corner bracket dimensions
const ARM = 16;   // arm length in px
const T   = 1.5; // arm thickness
const P   = 5;   // offset from widget edge
const BC  = 'rgba(255,255,255,0.2)'; // bracket colour

export function WidgetShell({ instance, editMode }: WidgetShellProps) {
  const [hovered, setHovered] = useState(false);
  const removeWidget  = useWidgetStore(s => s.removeWidget);
  const reorderWidget = useWidgetStore(s => s.reorderWidget);

  const def = getWidgetDef(instance.widgetId);
  if (!def) return null;

  const { colSpan, rowSpan } = SIZE_SPANS[instance.size];
  const Component = def.component;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        gridColumn: `span ${colSpan}`,
        gridRow:    `span ${rowSpan}`,
        border:     editMode
          ? '1px solid rgba(0,196,167,0.35)'
          : '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.018)',
        position:   'relative',
        overflow:   'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Widget content */}
      <Component size={instance.size} instanceId={instance.instanceId} />

      {/* Corner brackets — top-left */}
      <div style={{ position: 'absolute', top: P, left: P, width: ARM, height: T, background: BC, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: P, left: P, width: T, height: ARM, background: BC, pointerEvents: 'none' }} />
      {/* top-right */}
      <div style={{ position: 'absolute', top: P, right: P, width: ARM, height: T, background: BC, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: P, right: P, width: T, height: ARM, background: BC, pointerEvents: 'none' }} />
      {/* bottom-left */}
      <div style={{ position: 'absolute', bottom: P, left: P, width: ARM, height: T, background: BC, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: P, left: P, width: T, height: ARM, background: BC, pointerEvents: 'none' }} />
      {/* bottom-right */}
      <div style={{ position: 'absolute', bottom: P, right: P, width: ARM, height: T, background: BC, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: P, right: P, width: T, height: ARM, background: BC, pointerEvents: 'none' }} />

      {/* Edit mode overlay */}
      {editMode && hovered && (
        <div style={{
          position:   'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display:    'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 6,
        }}>
          <div style={{
            fontFamily: "'VT323', monospace",
            fontSize: '0.75rem', letterSpacing: '2px',
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 4,
          }}>
            {def.label}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <ShellButton onClick={() => reorderWidget(instance.instanceId, 'up')}>↑</ShellButton>
            <ShellButton onClick={() => reorderWidget(instance.instanceId, 'down')}>↓</ShellButton>
            <ShellButton onClick={() => removeWidget(instance.instanceId)} danger>✕</ShellButton>
          </div>
        </div>
      )}
    </div>
  );
}

function ShellButton({ onClick, danger, children }: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background:   'none',
        border:       `1px solid ${danger ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)'}`,
        color:        danger ? '#ef4444' : 'rgba(255,255,255,0.7)',
        fontFamily:   "'VT323', monospace",
        fontSize:     '1rem',
        padding:      '0 10px',
        cursor:       'pointer',
        lineHeight:   '1.6rem',
      }}
    >
      {children}
    </button>
  );
}
