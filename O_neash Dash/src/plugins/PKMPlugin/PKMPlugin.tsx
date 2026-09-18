import { useState, useEffect } from 'react';
import LibraryView from './views/LibraryView';
import WhiteboardView from './views/WhiteboardView';
import CardEditor from './components/CardEditor';
import { getCardById, updateCard, deleteCard, type PkmCard } from './lib/pkmDb';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#f59e0b';

type Mode = 'library' | 'whiteboard';

function ModeSwitcher({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tabs: { id: Mode; label: string }[] = [
    { id: 'library', label: 'library' },
    { id: 'whiteboard', label: 'whiteboard' },
  ];
  return (
    <div style={{
      position: 'absolute', top: 12, right: 24, zIndex: 30,
      display: 'flex', gap: 2, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.15)',
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            fontFamily: VT, fontSize: '0.8rem', letterSpacing: 1, textTransform: 'uppercase',
            padding: '5px 12px', cursor: 'pointer',
            background: mode === t.id ? `${ACC}18` : 'transparent',
            color: mode === t.id ? ACC : 'rgba(255,255,255,0.4)',
            border: 'none',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function PKMPlugin() {
  const [mode, setMode] = useState<Mode>('library');
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<PkmCard | null>(null);

  useEffect(() => {
    if (!openCardId) { setOpenCard(null); return; }
    getCardById(openCardId).then(setOpenCard);
  }, [openCardId]);

  if (openCardId && openCard) {
    return (
      <CardEditor
        doc={openCard}
        onSave={(title, json) => { updateCard(openCard.id, { title, content_json: json }); }}
        onBack={() => setOpenCardId(null)}
        onDelete={() => { deleteCard(openCard.id); setOpenCardId(null); }}
        onNavigate={(cardId) => setOpenCardId(cardId)}
      />
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ModeSwitcher mode={mode} onChange={setMode} />
      {mode === 'library'
        ? <LibraryView onOpenCard={setOpenCardId} />
        : <WhiteboardView onOpenCard={setOpenCardId} />}
    </div>
  );
}
