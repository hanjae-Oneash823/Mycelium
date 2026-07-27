import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { WardrobeItemRow, SizingValues } from '../lib/wardrobeItemsDb';
import { createItem, updateItem, deleteItem, parseSizing } from '../lib/wardrobeItemsDb';
import { saveImageBlob, saveImageFromPath, extFromMime, toDisplaySrc } from '../lib/wardrobeImageLib';
import { ITEM_TYPES, getItemTypeMeta, type ItemType } from '../lib/wardrobeItemTypes';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'Tamzen', 'SUSE', 'KOTRAGothic', monospace";
const ACC = '#e879f9';

interface ItemEditorProps {
  initial?: WardrobeItemRow;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ItemEditor({ initial, onSaved, onCancel }: ItemEditorProps) {
  const [name, setName]                 = useState(initial?.name ?? '');
  const [itemType, setItemType]         = useState<ItemType>(initial?.item_type ?? 'top');
  const [brand, setBrand]               = useState(initial?.brand ?? '');
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? '');
  const [imagePath, setImagePath]       = useState<string | null>(initial?.image_path ?? null);
  const [sizing, setSizing]             = useState<SizingValues>(initial ? parseSizing(initial) : {});
  const [dragOver, setDragOver]         = useState(false);
  const [armedDelete, setArmedDelete]   = useState(false);
  const [saving, setSaving]             = useState(false);

  const typeMeta = getItemTypeMeta(itemType);

  const pickImage = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] }],
    });
    if (!picked || Array.isArray(picked)) return;
    setImagePath(await saveImageFromPath(picked));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
    if (!file) return;
    setImagePath(await saveImageBlob(file, extFromMime(file.type)));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const data = {
      name: trimmed,
      item_type: itemType,
      brand: brand.trim() || null,
      purchase_date: purchaseDate || null,
      image_path: imagePath,
      sizing,
    };
    if (initial) {
      await updateItem(initial.id, data);
    } else {
      await createItem(data);
    }
    setSaving(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    await deleteItem(initial.id);
    onSaved();
  };

  const rowLabel = {
    fontFamily: VT, fontSize: '1.1rem', letterSpacing: 1.5, color: '#fff', minWidth: 76,
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
    transition: 'color 0.1s, background 0.1s, border-color 0.1s',
  });

  const textInput = {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    fontFamily: PT,
    fontSize: '1rem',
    outline: 'none',
    padding: '4px 0',
    flex: 1,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={pickImage}
        style={{
          border: `1px dashed ${dragOver ? ACC + '88' : 'rgba(255,255,255,0.15)'}`,
          background: dragOver ? `${ACC}0c` : 'rgba(255,255,255,0.02)',
          height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', overflow: 'hidden',
        }}
      >
        {imagePath ? (
          <img src={toDisplaySrc(imagePath)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
            drop photo or click to choose
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={rowLabel}>name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
          placeholder="..."
          style={textInput}
          autoFocus
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={rowLabel}>type</span>
        {ITEM_TYPES.map(t => (
          <button key={t.key} style={pill(itemType === t.key, t.color)} onClick={() => setItemType(t.key)}>
            {t.label.toLowerCase()}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={rowLabel}>brand</span>
        <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="..." style={textInput} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={rowLabel}>bought</span>
        <input
          type="date"
          value={purchaseDate}
          onChange={e => setPurchaseDate(e.target.value)}
          style={{ ...textInput, colorScheme: 'dark' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={rowLabel}>sizing</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {typeMeta.sizingFields.map(f => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.35)', minWidth: 50 }}>
                {f.label}
              </span>
              <input
                value={sizing[f.key] ?? ''}
                onChange={e => setSizing(s => ({ ...s, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={textInput}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        {initial ? (
          <button
            onClick={handleDelete}
            style={{
              all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2,
              color: armedDelete ? '#e05555' : 'rgba(255,255,255,0.25)', cursor: 'pointer',
            }}
          >
            {armedDelete ? 'confirm delete?' : 'delete'}
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, padding: '4px 18px',
              border: '1px solid rgba(255,255,255,0.4)', color: '#fff', cursor: 'pointer',
            }}
          >
            {initial ? 'save' : 'add'}
          </button>
        </div>
      </div>
    </div>
  );
}
