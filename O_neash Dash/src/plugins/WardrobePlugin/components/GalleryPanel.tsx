import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { open } from '@tauri-apps/plugin-dialog';
import type { GalleryImageRow } from '../lib/wardrobeDb';
import { loadGalleryImages, addGalleryImage, updateGalleryImageNote, deleteGalleryImage } from '../lib/wardrobeDb';
import { saveImageBlob, saveImageFromPath, extFromMime, toDisplaySrc } from '../lib/wardrobeImageLib';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'SUSE', 'KOTRAGothic', monospace";
const ACC = '#e879f9';

interface GalleryPanelProps {
  entryId: string;
}

export default function GalleryPanel({ entryId }: GalleryPanelProps) {
  const [images,     setImages]     = useState<GalleryImageRow[]>([]);
  const [dragOver,   setDragOver]   = useState(false);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxSrc(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxSrc]);

  const load = useCallback(async () => {
    setImages(await loadGalleryImages(entryId));
  }, [entryId]);

  useEffect(() => { load(); }, [load]);

  const handlePickFiles = useCallback(async () => {
    const picked = await open({
      multiple: true,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    for (const path of paths) {
      const saved = await saveImageFromPath(path);
      await addGalleryImage(entryId, saved);
    }
    load();
  }, [entryId, load]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
    for (const file of files) {
      const saved = await saveImageBlob(file, extFromMime(file.type));
      await addGalleryImage(entryId, saved);
    }
    if (files.length > 0) load();
  }, [entryId, load]);

  const handleNoteBlur = useCallback((id: string, note: string) => {
    updateGalleryImageNote(id, note);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (armedDelete !== id) { setArmedDelete(id); return; }
    await deleteGalleryImage(id);
    setArmedDelete(null);
    load();
  }, [armedDelete, load]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        border: `1px dashed ${dragOver ? ACC + '88' : 'rgba(255,255,255,0.1)'}`,
        background: dragOver ? `${ACC}0c` : 'transparent',
        padding: 12, transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
          gallery
        </span>
        <button
          onClick={handlePickFiles}
          style={{
            fontFamily: VT, fontSize: '0.8rem', letterSpacing: 0.5,
            background: 'none', border: `1px solid ${ACC}55`, color: ACC,
            cursor: 'pointer', padding: '2px 8px',
          }}
        >
          + add
        </button>
      </div>

      {images.length === 0 ? (
        <div style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 0.5, textAlign: 'center', padding: '20px 0' }}>
          drop images here
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {images.map(img => (
            <div key={img.id} style={{ position: 'relative' }}>
              <img
                src={toDisplaySrc(img.image_path)}
                alt=""
                onClick={() => setLightboxSrc(img.image_path)}
                style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
              />
              <button
                onClick={() => handleDelete(img.id)}
                onBlur={() => setArmedDelete(null)}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  fontFamily: VT, fontSize: '0.75rem',
                  background: armedDelete === img.id ? 'rgba(200,40,40,0.85)' : 'rgba(0,0,0,0.55)',
                  color: '#fff', border: 'none', borderRadius: 3,
                  cursor: 'pointer', padding: '1px 6px',
                }}
              >
                {armedDelete === img.id ? 'confirm?' : '✕'}
              </button>
              <textarea
                defaultValue={img.note ?? ''}
                onBlur={e => handleNoteBlur(img.id, e.target.value)}
                placeholder="add a note…"
                rows={2}
                style={{
                  width: '100%', resize: 'none', marginTop: 4,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  outline: 'none', color: 'rgba(255,255,255,0.75)',
                  fontFamily: PT, fontSize: '0.85rem', lineHeight: 1.4, padding: '5px 7px',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {lightboxSrc && createPortal(
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100000,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={toDisplaySrc(lightboxSrc)}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
