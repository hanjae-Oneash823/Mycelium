import { useState, useEffect } from 'react';
import { WidgetStudio } from './sections/WidgetStudio';

type Section = 'widgets' | 'general' | 'appearance';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'widgets',     label: 'WIDGET STUDIO' },
  { id: 'general',     label: 'GENERAL'       },
  { id: 'appearance',  label: 'APPEARANCE'    },
];

function SettingsPlugin() {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = SECTIONS[activeIdx].id;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const numIdx = parseInt(e.key) - 1;
      if (!isNaN(numIdx) && numIdx >= 0 && numIdx < SECTIONS.length) {
        setActiveIdx(numIdx);
        return;
      }
      if (e.key === 'ArrowRight') setActiveIdx(i => Math.min(i + 1, SECTIONS.length - 1));
      if (e.key === 'ArrowLeft')  setActiveIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      fontFamily: "'VT323', monospace", boxSizing: 'border-box',
      padding: '8vh 15vw',
    }}>

      {/* ── Top nav — same pattern as LaunchMenu category row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '2.4rem',
        paddingBottom: '0.8rem',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {SECTIONS.map((s, i) => {
          const sel = activeIdx === i;
          return (
            <button
              key={s.id}
              onClick={() => setActiveIdx(i)}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: '0.4rem', lineHeight: 1, transition: 'all 0.12s ease',
              }}
            >
              <span style={{
                fontSize: '1.2rem',
                color: sel ? '#00c4a7' : 'rgba(255,255,255,0.22)',
                transition: 'color 0.12s ease',
              }}>
                {i + 1}
              </span>
              <span style={{
                fontSize:      sel ? '2.4rem' : '1.5rem',
                color:         sel ? '#fff' : 'rgba(255,255,255,0.28)',
                textTransform: sel ? 'uppercase' : 'lowercase',
                letterSpacing: sel ? '3px' : '1.5px',
                transition: 'font-size 0.12s ease, color 0.12s ease',
              }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, minHeight: 0, marginTop: '2rem', overflow: 'hidden' }}>
        {active === 'widgets'    && <WidgetStudio />}
        {active === 'general'    && <PlaceholderSection label="GENERAL" />}
        {active === 'appearance' && <PlaceholderSection label="APPEARANCE" />}
      </div>

    </div>
  );
}

function PlaceholderSection({ label }: { label: string }) {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'VT323', monospace",
      color: 'rgba(255,255,255,0.1)', fontSize: '0.85rem', letterSpacing: '2px',
    }}>
      {label} — coming soon
    </div>
  );
}

export default SettingsPlugin;
