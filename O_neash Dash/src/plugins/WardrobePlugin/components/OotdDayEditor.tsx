import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { WardrobeItemRow } from '../lib/wardrobeItemsDb';
import { loadItems } from '../lib/wardrobeItemsDb';
import { getLogByDate, upsertLog, deleteLog, parseItemIds } from '../lib/wardrobeOotdDb';
import { saveImageBlob, saveImageFromPath, extFromMime, toDisplaySrc } from '../lib/wardrobeImageLib';
import { ITEM_TYPES, type ItemType } from '../lib/wardrobeItemTypes';
import ItemCard from './ItemCard';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#e879f9';

interface OotdDayEditorProps {
  date: string; // YYYY-MM-DD
  onSaved: () => void;
  onCancel: () => void;
}

export default function OotdDayEditor({ date, onSaved, onCancel }: OotdDayEditorProps) {
  const [allItems, setAllItems]       = useState<WardrobeItemRow[]>([]);
  const [selected, setSelected]       = useState<Partial<Record<ItemType, string>>>({});
  const [note, setNote]               = useState('');
  const [photoPath, setPhotoPath]     = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<ItemType | null>(null);
  const [armedDelete, setArmedDelete] = useState(false);
  const [loaded, setLoaded]           = useState(false);

  const isFuture = date > new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      const [items, log] = await Promise.all([loadItems(), getLogByDate(date)]);
      setAllItems(items);
      if (log) {
        const ids = new Set(parseItemIds(log));
        const bySlot: Partial<Record<ItemType, string>> = {};
        for (const item of items) {
          if (ids.has(item.id)) bySlot[item.item_type] = item.id;
        }
        setSelected(bySlot);
        setNote(log.note ?? '');
        setPhotoPath(log.photo_path);
      }
      setLoaded(true);
    })();
  }, [date]);

  const itemsByType = useCallback(
    (type: ItemType) => allItems.filter(i => i.item_type === type),
    [allItems],
  );

  const pickPhoto = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] }],
    });
    if (!picked || Array.isArray(picked)) return;
    setPhotoPath(await saveImageFromPath(picked));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
    if (!file) return;
    setPhotoPath(await saveImageBlob(file, extFromMime(file.type)));
  };

  const handleSave = async () => {
    const itemIds = Object.values(selected).filter((v): v is string => !!v);
    await upsertLog(date, itemIds, note.trim() || null, photoPath);
    onSaved();
  };

  const handleDelete = async () => {
    if (!armedDelete) { setArmedDelete(true); return; }
    await deleteLog(date);
    onSaved();
  };

  if (!loaded) return null;

  const rowLabel = { fontFamily: VT, fontSize: '1rem', letterSpacing: 1.5, color: 'rgba(255,255,255,0.4)', minWidth: 90 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: 2, color: '#fff' }}>{date}</span>
        <span style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1, color: isFuture ? ACC : 'rgba(255,255,255,0.3)' }}>
          {isFuture ? 'planned' : 'worn'}
        </span>
      </div>

      {ITEM_TYPES.map(t => {
        const chosenId = selected[t.key];
        const chosenItem = chosenId ? allItems.find(i => i.id === chosenId) : undefined;
        const expanded = expandedSlot === t.key;
        return (
          <div key={t.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...rowLabel, color: t.color }}>{t.label.toLowerCase()}</span>
              {chosenItem ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  {chosenItem.image_path && (
                    <img src={toDisplaySrc(chosenItem.image_path)} alt="" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                  )}
                  <span style={{ fontFamily: VT, fontSize: '0.95rem', color: '#fff' }}>{chosenItem.name}</span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setExpandedSlot(expanded ? null : t.key)}
                    style={{ all: 'unset', fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}
                  >
                    change
                  </button>
                  <button
                    onClick={() => setSelected(s => { const n = { ...s }; delete n[t.key]; return n; })}
                    style={{ all: 'unset', fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}
                  >
                    clear
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setExpandedSlot(expanded ? null : t.key)}
                  style={{
                    fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1,
                    background: 'none', border: `1px solid ${t.color}44`, color: `${t.color}cc`,
                    cursor: 'pointer', padding: '2px 10px',
                  }}
                >
                  choose
                </button>
              )}
            </div>
            {expanded && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginTop: 8 }}>
                {itemsByType(t.key).length === 0 ? (
                  <span style={{ fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.2)' }}>no {t.label.toLowerCase()} in closet</span>
                ) : itemsByType(t.key).map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    selected={chosenId === item.id}
                    onClick={() => { setSelected(s => ({ ...s, [t.key]: item.id })); setExpandedSlot(null); }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={pickPhoto}
        style={{
          border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.02)',
          height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', overflow: 'hidden',
        }}
      >
        {photoPath ? (
          <img src={toDisplaySrc(photoPath)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.25)' }}>drop outfit photo (optional)</span>
        )}
      </div>

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="note…"
        rows={2}
        style={{
          width: '100%', resize: 'none', background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)', outline: 'none', color: 'rgba(255,255,255,0.8)',
          fontFamily: VT, fontSize: '0.95rem', padding: '8px 10px', boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={handleDelete}
          style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: armedDelete ? '#e05555' : 'rgba(255,255,255,0.25)', cursor: 'pointer' }}
        >
          {armedDelete ? 'confirm delete?' : 'clear day'}
        </button>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
            cancel
          </button>
          <button
            onClick={handleSave}
            style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, padding: '4px 18px', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', cursor: 'pointer' }}
          >
            save
          </button>
        </div>
      </div>
    </div>
  );
}
