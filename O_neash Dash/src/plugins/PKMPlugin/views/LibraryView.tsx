import { useEffect, useState } from 'react';
import { Notes as PaperIcon, Plus } from 'pixelarticons/react';
import PixelIcon from '../components/PixelIcon';
import { loadCards, createCard, type PkmCard } from '../lib/pkmDb';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#f59e0b';

interface LibraryViewProps {
  onOpenCard: (id: string) => void;
}

export default function LibraryView({ onOpenCard }: LibraryViewProps) {
  const [cards, setCards] = useState<PkmCard[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  const refresh = () => loadCards().then(rows => { setCards(rows); setLoaded(true); });
  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    const id = await createCard({ title: '' });
    onOpenCard(id);
  };

  const filtered = query.trim()
    ? cards.filter(c => (c.title ?? '').toLowerCase().includes(query.trim().toLowerCase()))
    : cards;

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', flexDirection: 'column', color: '#fff', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <PixelIcon type="paper" size={32} />
        <span style={{ fontFamily: VT, fontSize: '1.3rem', letterSpacing: 4, color: '#fff' }}>CARDS</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search cards..."
          style={{
            marginLeft: 'auto', width: 260,
            fontFamily: VT, fontSize: '0.9rem', letterSpacing: 0.5,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff', padding: '5px 10px', outline: 'none',
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1,
            background: `${ACC}18`, border: `1px solid ${ACC}55`,
            color: ACC, padding: '5px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus width={14} height={14} /> new card
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 32px 32px' }}>
        {loaded && filtered.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, height: '100%', color: 'rgba(255,255,255,0.15)',
          }}>
            <PaperIcon width={32} height={32} style={{ color: 'rgba(255,255,255,0.08)' }} />
            <div style={{ fontFamily: VT, fontSize: '1.1rem', color: 'rgba(255,255,255,0.25)', letterSpacing: 0.5 }}>
              {cards.length === 0 ? 'no cards yet' : 'no matches'}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {filtered.map(card => (
            <button
              key={card.id}
              onClick={() => onOpenCard(card.id)}
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 8,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${card.color_hex ?? 'rgba(255,255,255,0.1)'}`,
                padding: '14px 16px', minHeight: 90,
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            >
              <span style={{
                fontFamily: VT, fontSize: '1rem', letterSpacing: 0.5, color: '#fff',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {card.title || 'untitled'}
              </span>
              <span style={{
                fontFamily: VT, fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)',
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
              }}>
                {card.content_plain ?? ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
