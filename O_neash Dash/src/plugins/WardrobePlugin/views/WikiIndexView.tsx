import { useState, useMemo } from 'react';
import type { WikiEntryRow, WikiCategory } from '../lib/wardrobeDb';
import { WIKI_CATEGORIES, getCategoryMeta } from '../lib/wardrobeCategories';
import { toDisplaySrc } from '../lib/wardrobeImageLib';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'SUSE', 'KOTRAGothic', monospace";
const ACC = '#e879f9';

interface WikiIndexViewProps {
  entries: WikiEntryRow[];
  onOpen: (entry: WikiEntryRow) => void;
  onCreate: (category: WikiCategory) => void;
}

export default function WikiIndexView({ entries, onOpen, onCreate }: WikiIndexViewProps) {
  const [activeCategory, setActiveCategory] = useState<WikiCategory | 'all'>('all');
  const [search, setSearch]                 = useState('');
  const [pickerOpen, setPickerOpen]          = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (activeCategory !== 'all' && e.category !== activeCategory) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, activeCategory, search]);

  const counts = useMemo(() => {
    const map = new Map<WikiCategory, number>();
    for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + 1);
    return map;
  }, [entries]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setActiveCategory('all')}
            style={{
              fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1,
              background: activeCategory === 'all' ? `${ACC}18` : 'none',
              border: `1px solid ${activeCategory === 'all' ? ACC + '55' : 'transparent'}`,
              color: activeCategory === 'all' ? ACC : 'rgba(255,255,255,0.35)',
              cursor: 'pointer', padding: '3px 10px', transition: 'color 0.1s, background 0.1s, border-color 0.1s',
            }}
          >
            all ({entries.length})
          </button>
          {WIKI_CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              style={{
                fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1,
                display: 'flex', alignItems: 'center', gap: 6,
                background: activeCategory === c.key ? `${c.color}18` : 'none',
                border: `1px solid ${activeCategory === c.key ? c.color + '55' : 'transparent'}`,
                color: activeCategory === c.key ? c.color : 'rgba(255,255,255,0.35)',
                cursor: 'pointer', padding: '3px 10px', transition: 'color 0.1s, background 0.1s, border-color 0.1s',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              {c.label} ({counts.get(c.key) ?? 0})
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search titles…"
          style={{
            marginLeft: 'auto', minWidth: 200,
            fontFamily: VT, fontSize: '0.95rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', padding: '6px 10px', outline: 'none',
          }}
        />

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setPickerOpen(o => !o)}
            style={{
              fontFamily: VT, fontSize: '0.95rem', letterSpacing: 1,
              background: ACC, border: 'none', color: '#000',
              cursor: 'pointer', padding: '6px 14px',
            }}
          >
            + new entry
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 20,
              background: 'rgba(8,8,8,0.98)', border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)', minWidth: 180,
            }}>
              {WIKI_CATEGORIES.map(c => (
                <button
                  key={c.key}
                  onClick={() => { setPickerOpen(false); onCreate(c.key); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    background: 'none', border: 'none', textAlign: 'left',
                    fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)',
                    cursor: 'pointer', padding: '8px 12px',
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 0 0' }}>
        {filtered.length === 0 ? (
          <div style={{ fontFamily: VT, fontSize: '1.1rem', color: 'rgba(255,255,255,0.2)', letterSpacing: 1, padding: '40px 0' }}>
            no entries yet
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {filtered.map(entry => {
              const meta = getCategoryMeta(entry.category);
              return (
                <button
                  key={entry.id}
                  onClick={() => onOpen(entry)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer', textAlign: 'left', padding: 0, overflow: 'hidden',
                    transition: 'border-color 0.1s',
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.borderColor = `${meta.color}55`)}
                  onMouseLeave={ev => (ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                >
                  <div style={{ height: 120, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {entry.cover_image ? (
                      <img
                        src={toDisplaySrc(entry.cover_image)}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, opacity: 0.5 }} />
                    )}
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontFamily: VT, fontSize: '1.15rem', letterSpacing: 0.5, color: '#fff', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.title || 'untitled'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: PT, fontSize: '0.75rem', letterSpacing: 0.5, color: meta.color }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                      {meta.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
