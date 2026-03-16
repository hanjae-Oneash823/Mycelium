import { Zap, Calendar, Grid2x22, Target, GitBranch } from 'pixelarticons/react';
import { useViewStore } from '../store/useViewStore';
import type { PlannerViewType } from '../types';

interface TabDef {
  id: PlannerViewType;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'today',       label: 'today',       icon: <Zap size={16} /> },
  { id: 'calendar',    label: 'calendar',    icon: <Calendar size={16} /> },
  { id: 'eisenhower',  label: 'eisenhower',  icon: <Grid2x22 size={16} /> },
  { id: 'focus',       label: 'focus',       icon: <Target size={16} /> },
  { id: 'arc',         label: 'arc',         icon: <GitBranch size={16} /> },
];

export default function ViewSwitcher() {
  const { activeView, setActiveView } = useViewStore();

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: '#000',
        flexShrink: 0,
      }}
    >
      {TABS.map(tab => {
        const active = activeView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent',
              color: active ? 'var(--teal)' : 'rgba(255,255,255,0.45)',
              padding: '0.55rem 1.1rem',
              fontFamily: "'VT323', monospace",
              fontSize: '1.05rem',
              letterSpacing: '2px',
              textTransform: 'lowercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'color 0.14s ease, border-color 0.14s ease',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
