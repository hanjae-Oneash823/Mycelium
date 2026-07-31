import { useState } from 'react';
import type { CameraRow, CameraType } from '../lib/filmNegDb';
import { createCamera, updateCamera, deleteCamera } from '../lib/filmNegDb';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'Tamzen', 'SUSE', 'KOTRAGothic', monospace";
const ACC = '#e8a94f';

interface CameraEditorProps {
  initial?: CameraRow;
  onSaved: () => void;
  onCancel: () => void;
}

export default function CameraEditor({ initial, onSaved, onCancel }: CameraEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<CameraType>(initial?.type ?? 'digital');
  const [armedDelete, setArmedDelete] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (initial) {
      await updateCamera(initial.id, { name: trimmed, type });
    } else {
      await createCamera({ name: trimmed, type });
    }
    onSaved();
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    await deleteCamera(initial.id);
    onSaved();
  };

  const rowLabel = { fontFamily: VT, fontSize: '1.05rem', letterSpacing: 1.5, color: '#fff', minWidth: 70 };
  const textInput = {
    background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: PT, fontSize: '1rem', outline: 'none', padding: '4px 0', flex: 1,
  };
  const pill = (active: boolean) => ({
    all: 'unset' as const,
    fontFamily: VT,
    fontSize: '0.9rem',
    letterSpacing: 1,
    padding: '3px 14px',
    background: active ? `${ACC}33` : 'transparent',
    border: `1px solid ${active ? ACC : 'rgba(255,255,255,0.15)'}`,
    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer' as const,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={rowLabel}>name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
          placeholder="e.g. Canon AE-1"
          style={textInput}
          autoFocus
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={rowLabel}>type</span>
        <button style={pill(type === 'digital')} onClick={() => setType('digital')}>digital</button>
        <button style={pill(type === 'film')} onClick={() => setType('film')}>film</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        {initial ? (
          <button
            onClick={handleDelete}
            style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: armedDelete ? '#e05555' : 'rgba(255,255,255,0.25)', cursor: 'pointer' }}
          >
            {armedDelete ? 'confirm delete?' : 'delete'}
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
            cancel
          </button>
          <button
            onClick={handleSave}
            style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, padding: '4px 18px', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', cursor: 'pointer' }}
          >
            {initial ? 'save' : 'add'}
          </button>
        </div>
      </div>
    </div>
  );
}
