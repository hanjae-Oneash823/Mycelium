import { useState, useEffect, useCallback } from 'react';
import type { WardrobeItemRow } from '../lib/wardrobeItemsDb';
import { loadItems } from '../lib/wardrobeItemsDb';
import { ITEM_TYPES, type ItemType } from '../lib/wardrobeItemTypes';
import ItemCard from './ItemCard';
import ItemEditor from './ItemEditor';
import Modal from './Modal';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#e879f9';

export default function ClosetGrid() {
  const [items, setItems]       = useState<WardrobeItemRow[]>([]);
  const [filter, setFilter]     = useState<ItemType | 'all'>('all');
  const [editing, setEditing]   = useState<WardrobeItemRow | 'new' | null>(null);

  const load = useCallback(async () => {
    setItems(await loadItems(filter === 'all' ? undefined : filter));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = () => {
    setEditing(null);
    load();
  };

  const pill = (active: boolean, color: string) => ({
    all: 'unset' as const,
    fontFamily: VT,
    fontSize: '1rem',
    letterSpacing: 1.5,
    padding: '3px 12px',
    background: active ? `${color}33` : 'transparent',
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.15)'}`,
    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer' as const,
  });

  return (
    <div style={{ padding: '1rem 2rem 2rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button style={pill(filter === 'all', ACC)} onClick={() => setFilter('all')}>all</button>
        {ITEM_TYPES.map(t => (
          <button key={t.key} style={pill(filter === t.key, t.color)} onClick={() => setFilter(t.key)}>
            {t.label.toLowerCase()}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setEditing('new')}
          style={{
            fontFamily: VT, fontSize: '1rem', letterSpacing: 1,
            background: 'none', border: `1px solid ${ACC}55`, color: ACC,
            cursor: 'pointer', padding: '3px 12px',
          }}
        >
          + add item
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 0.5, textAlign: 'center', padding: '60px 0' }}>
          nothing here yet
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
          {items.map(item => (
            <ItemCard key={item.id} item={item} onClick={() => setEditing(item)} />
          ))}
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <ItemEditor
            initial={editing === 'new' ? undefined : editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
