import { useEffect } from 'react';
import { Zap, Grid2x22, Target, Reload } from 'pixelarticons/react';
import { useViewStore } from '../store/useViewStore';
import type { PlannerViewType } from '../types';

const VIEWS: { id: PlannerViewType; label: string; icon: React.ReactNode }[] = [
  { id: 'today',      label: 'today',      icon: <Zap      size={18} /> },
  { id: 'eisenhower', label: 'eisenhower', icon: <Grid2x22 size={18} /> },
  { id: 'focus',      label: 'focus',      icon: <Target   size={18} /> },
  { id: 'routines',   label: 'routines',   icon: <Reload   size={18} /> },
];

export default function ViewSwitcher() {
  const { activeView, setActiveView } = useViewStore();

  // Number key shortcuts: 1–5, arrow keys to cycle views
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < VIEWS.length) {
        setActiveView(VIEWS[idx].id);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const currentIdx = VIEWS.findIndex(v => v.id === activeView);
        const next = e.key === 'ArrowRight'
          ? (currentIdx + 1) % VIEWS.length
          : (currentIdx - 1 + VIEWS.length) % VIEWS.length;
        setActiveView(VIEWS[next].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveView, activeView]);

  return (
    <div style={{ padding: '0 2rem 0', background: '#000', flexShrink: 0 }}>
      <div style={{ fontFamily: "'VT323', monospace", fontSize: '2rem', letterSpacing: 5, color: 'var(--teal)', textTransform: 'uppercase', lineHeight: 1, marginBottom: 20 }}>
        planner
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.4rem', paddingBottom: '0.7rem' }}>
      {VIEWS.map((v, i) => {
        const active = activeView === v.id;
        return (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            style={{
              background:    'none',
              border:        'none',
              padding:       0,
              cursor:        'pointer',
              fontFamily:    "'VT323', monospace",
              letterSpacing: active ? '3px' : '1.5px',
              lineHeight:    1,
              display:       'flex',
              alignItems:    'center',
              gap:           '0.4rem',
              transition:    'all 0.12s ease',
            }}
          >
            <span style={{
              fontSize:   '1.1rem',
              color:      active ? 'var(--teal)' : 'rgba(255,255,255,0.22)',
              transition: 'color 0.12s ease',
            }}>
              {i + 1}
            </span>
            {active && (
              <span style={{ color: 'var(--teal)', display: 'flex', alignItems: 'center' }}>
                {v.icon}
              </span>
            )}
            <span style={{
              fontSize:      active ? '2.6rem' : '1.45rem',
              color:         active ? '#fff' : 'rgba(255,255,255,0.28)',
              textTransform: active ? 'uppercase' : 'lowercase',
              transition:    'font-size 0.12s ease, color 0.12s ease',
            }}>
              {v.label}
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
