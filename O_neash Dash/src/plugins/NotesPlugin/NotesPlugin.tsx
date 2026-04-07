import { useEffect, useState } from 'react';
import { CommentText, Notebook } from 'pixelarticons/react';
import MemoPool from './views/MemoPool';
import DocumentsView from './views/DocumentsView';

type Tab = 'memos' | 'docs';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'memos', label: 'memos',     icon: <CommentText size={18} /> },
  { id: 'docs',  label: 'documents', icon: <Notebook    size={18} /> },
];

export default function NotesPlugin() {
  const [tab, setTab] = useState<Tab>('memos');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) setTab(TABS[idx].id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Tab bar — same design as Planner ViewSwitcher */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '2.4rem',
        padding:    '112px 160px 0.7rem 160px',
        background: '#000',
        flexShrink: 0,
      }}>
        {TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
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
                color:      active ? '#00c4a7' : 'rgba(255,255,255,0.22)',
                transition: 'color 0.12s ease',
              }}>
                {i + 1}
              </span>
              {active && (
                <span style={{ color: '#00c4a7', display: 'flex', alignItems: 'center' }}>
                  {t.icon}
                </span>
              )}
              <span style={{
                fontSize:      active ? '2.6rem' : '1.45rem',
                color:         active ? '#fff' : 'rgba(255,255,255,0.28)',
                textTransform: active ? 'uppercase' : 'lowercase',
                transition:    'font-size 0.12s ease, color 0.12s ease',
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'memos' ? <MemoPool /> : <DocumentsView />}
      </div>
    </div>
  );
}
