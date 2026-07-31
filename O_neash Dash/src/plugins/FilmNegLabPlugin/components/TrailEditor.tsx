import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AvatarCircleX } from 'pixelarticons/react';
import type { PhotoRow, TrailRow, TrailPhotoRow } from '../lib/filmNegDb';
import {
  createTrail, updateTrail, deleteTrail,
  loadTrailPhotos, addPhotoToTrail, removePhotoFromTrail, reorderTrailPhotos,
  loadPhotos,
} from '../lib/filmNegDb';
import { toDisplaySrc } from '../lib/filmNegImageLib';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'Tamzen', 'SUSE', 'KOTRAGothic', monospace";

const TRAIL_COLORS = ['#e8a94f', '#64c8ff', '#e879f9', '#4a8c6e', '#e05555', '#a78bfa'];

interface TrailEditorProps {
  initial?: TrailRow;
  onSaved: () => void;
  onCancel: () => void;
}

export default function TrailEditor({ initial, onSaved, onCancel }: TrailEditorProps) {
  const [name, setName]               = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor]             = useState(initial?.color ?? TRAIL_COLORS[0]);
  const [trailPhotos, setTrailPhotos] = useState<TrailPhotoRow[]>([]);
  const [allPhotos, setAllPhotos]     = useState<PhotoRow[]>([]);
  const [addQuery, setAddQuery]       = useState('');
  const [armedDelete, setArmedDelete] = useState(false);

  useEffect(() => {
    loadPhotos().then(setAllPhotos);
    if (initial) loadTrailPhotos(initial.id).then(setTrailPhotos);
  }, [initial]);

  const trailPhotoIds = useMemo(() => new Set(trailPhotos.map(p => p.id)), [trailPhotos]);

  const candidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return allPhotos
      .filter(p => !trailPhotoIds.has(p.id))
      .filter(p => !q || (p.title?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [allPhotos, trailPhotoIds, addQuery]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const data = { name: trimmed, description: description.trim() || null, color };
    if (initial) {
      await updateTrail(initial.id, data);
    } else {
      await createTrail(data);
    }
    onSaved();
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    await deleteTrail(initial.id);
    onSaved();
  };

  const addPhoto = async (photoId: string) => {
    if (!initial) return;
    await addPhotoToTrail(initial.id, photoId);
    setTrailPhotos(await loadTrailPhotos(initial.id));
    setAddQuery('');
  };

  const removePhoto = async (photoId: string) => {
    if (!initial) return;
    await removePhotoFromTrail(initial.id, photoId);
    setTrailPhotos(await loadTrailPhotos(initial.id));
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!initial) return;
    const next = [...trailPhotos];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTrailPhotos(next);
    await reorderTrailPhotos(initial.id, next.map(p => p.id));
  };

  const rowLabel = { fontFamily: VT, fontSize: '1.05rem', letterSpacing: 1.5, color: '#fff', minWidth: 90 };
  const textInput = {
    background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', fontFamily: PT, fontSize: '1rem', outline: 'none', padding: '4px 0', flex: 1,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={rowLabel}>name</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kyoto, spring 2026" style={textInput} autoFocus />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={rowLabel}>color</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {TRAIL_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                all: 'unset', cursor: 'pointer', width: 18, height: 18, borderRadius: '50%', background: c,
                border: color === c ? '2px solid #fff' : '2px solid transparent',
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={rowLabel}>about</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...textInput, resize: 'vertical' }} />
      </div>

      {initial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={rowLabel}>route ({trailPhotos.length})</span>
          {trailPhotos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trailPhotos.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px' }}>
                  <img src={toDisplaySrc(p.image_path)} alt="" style={{ width: 36, height: 26, objectFit: 'cover' }} />
                  <span style={{ fontFamily: PT, fontSize: '0.9rem', color: '#fff', flex: 1 }}>{p.title || 'untitled'}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} style={{ all: 'unset', cursor: 'pointer', opacity: i === 0 ? 0.2 : 0.6, display: 'flex' }}>
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === trailPhotos.length - 1} style={{ all: 'unset', cursor: 'pointer', opacity: i === trailPhotos.length - 1 ? 0.2 : 0.6, display: 'flex' }}>
                    <ChevronRight size={14} />
                  </button>
                  <button onClick={() => removePhoto(p.id)} style={{ all: 'unset', cursor: 'pointer', opacity: 0.5, display: 'flex' }}>
                    <AvatarCircleX size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            value={addQuery}
            onChange={e => setAddQuery(e.target.value)}
            placeholder="+ search photos to add..."
            style={{ ...textInput, fontSize: '0.85rem' }}
          />
          {addQuery && candidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {candidates.map(p => (
                <button
                  key={p.id}
                  onClick={() => addPhoto(p.id)}
                  style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 6px', fontFamily: PT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <img src={toDisplaySrc(p.image_path)} alt="" style={{ width: 28, height: 20, objectFit: 'cover' }} />
                  {p.title || 'untitled'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
            {initial ? 'save' : 'create'}
          </button>
        </div>
      </div>
    </div>
  );
}
