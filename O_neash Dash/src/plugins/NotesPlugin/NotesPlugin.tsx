import { useEffect, useState, useCallback } from 'react';
import { useNotesStore } from './store/useNotesStore';
import { Shapes, CommentText, Notebook, GitBranch } from 'pixelarticons/react';
import HubView from './views/HubView';
import MemoPool from './views/MemoPool';
import DocumentsView from './views/DocumentsView';
import GraphView from './views/GraphView';
import type { NoteRow } from './lib/notesDb';

type Tab = 'hub' | 'memos' | 'docs' | 'graph';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'hub',   label: 'hub',       icon: <Shapes     size={18} /> },
  { id: 'memos', label: 'memos',     icon: <CommentText size={18} /> },
  { id: 'docs',  label: 'documents', icon: <Notebook   size={18} /> },
  { id: 'graph', label: 'graph',     icon: <GitBranch  size={18} /> },
];

export default function NotesPlugin() {
  const [tab, setTab] = useState<Tab>('hub');
  const [pendingDoc,    setPendingDoc]    = useState<NoteRow | null>(null);
  const [pendingMemoId, setPendingMemoId] = useState<string | null>(null);

  const pendingOpenDocId    = useNotesStore(s => s.pendingOpenDocId);
  const setPendingOpenDocId = useNotesStore(s => s.setPendingOpenDocId);
  const documents           = useNotesStore(s => s.documents);
  const loadDocuments       = useNotesStore(s => s.loadDocuments);

  useEffect(() => {
    if (!pendingOpenDocId) return;
    (async () => {
      let docs = documents;
      if (docs.length === 0) { await loadDocuments(); docs = useNotesStore.getState().documents; }
      const doc = docs.find(d => d.id === pendingOpenDocId) ?? null;
      if (doc) { setPendingDoc(doc); setTab('docs'); }
      setPendingOpenDocId(null);
    })();
  }, [pendingOpenDocId]);

  const handlePromoteToDoc = useCallback((doc: NoteRow) => {
    setPendingDoc(doc);
    setTab('docs');
  }, []);

  const handleDocOpened = useCallback(() => {
    setPendingDoc(null);
  }, []);

  const handleOpenDoc = useCallback((doc: NoteRow) => {
    setPendingDoc(doc);
    setTab('docs');
  }, []);

  const handleOpenMemo = useCallback((memo: NoteRow) => {
    setPendingMemoId(memo.id);
    setTab('memos');
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        setTab(TABS[idx].id);
        if (TABS[idx].id !== 'docs') setPendingDoc(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ padding: '112px 160px 0', background: '#000', flexShrink: 0 }}>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: '2rem', letterSpacing: 5, color: '#00c4a7', textTransform: 'uppercase', lineHeight: 1, marginBottom: 20 }}>
          notes
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.4rem', paddingBottom: '0.7rem' }}>
        {TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id !== 'docs') setPendingDoc(null); }}

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
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'hub'   && <HubView onOpenDoc={handleOpenDoc} onOpenMemo={handleOpenMemo} onGoToDocs={() => setTab('docs')} />}
        {tab === 'memos' && <MemoPool onPromoteToDoc={handlePromoteToDoc} pendingMemoId={pendingMemoId} onMemoFocused={() => setPendingMemoId(null)} />}
        {tab === 'docs'  && <DocumentsView defaultOpenDoc={pendingDoc} onDefaultDocOpened={handleDocOpened} />}
        {tab === 'graph' && <GraphView onOpenDoc={handleOpenDoc} />}
      </div>
    </div>
  );
}
