import { useCallback, useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Search, Heart, PlusBox } from 'pixelarticons/react';
import type { PhotoRow, TagRow } from '../lib/filmNegDb';
import { loadPhotos, loadTags, loadTagsForPhotos, createPhoto } from '../lib/filmNegDb';
import { saveImageFromPath } from '../lib/filmNegImageLib';
import PhotoCard from '../components/PhotoCard';
import PhotoEditor from '../components/PhotoEditor';
import Modal from '../components/Modal';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'Tamzen', 'SUSE', 'KOTRAGothic', monospace";
const ACC = '#e8a94f';

export default function GridView() {
  const [photos, setPhotos]         = useState<PhotoRow[]>([]);
  const [tagsByPhoto, setTagsByPhoto] = useState<Map<string, TagRow[]>>(new Map());
  const [allTags, setAllTags]       = useState<TagRow[]>([]);
  const [query, setQuery]           = useState('');
  const [tagFilter, setTagFilter]   = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editing, setEditing]       = useState<PhotoRow | 'new' | null>(null);
  const [importing, setImporting]   = useState(false);

  const load = useCallback(async () => {
    const rows = await loadPhotos();
    setPhotos(rows);
    setTagsByPhoto(await loadTagsForPhotos(rows.map(r => r.id)));
    setAllTags(await loadTags());
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return photos.filter(p => {
      if (favoritesOnly && !p.is_favorite) return false;
      if (tagFilter && !(tagsByPhoto.get(p.id) ?? []).some(t => t.id === tagFilter)) return false;
      if (!q) return true;
      const tags = (tagsByPhoto.get(p.id) ?? []).map(t => t.name.toLowerCase());
      return (
        (p.title?.toLowerCase().includes(q)) ||
        (p.notes?.toLowerCase().includes(q)) ||
        (p.camera?.toLowerCase().includes(q)) ||
        (p.film_stock?.toLowerCase().includes(q)) ||
        (p.location_name?.toLowerCase().includes(q)) ||
        tags.some(t => t.includes(q))
      );
    });
  }, [photos, query, tagFilter, favoritesOnly, tagsByPhoto]);

  const handleImport = async () => {
    const picked = await open({
      multiple: true,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'bmp'] }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    if (paths.length === 0) return;
    setImporting(true);
    for (const sourcePath of paths) {
      const { path, exif } = await saveImageFromPath(sourcePath);
      const filename = sourcePath.split(/[/\\]/).pop() ?? '';
      await createPhoto({
        title: filename.replace(/\.[^.]+$/, ''),
        image_path: path,
        notes: null,
        taken_at: exif.takenAt,
        camera: exif.camera,
        camera_id: null,
        film_stock: null,
        lat: exif.lat,
        lng: exif.lng,
        location_name: null,
        width: exif.width,
        height: exif.height,
      });
    }
    setImporting(false);
    load();
  };

  const handleSaved = () => {
    setEditing(null);
    load();
  };

  const pill = (active: boolean, color: string) => ({
    all: 'unset' as const,
    fontFamily: VT,
    fontSize: '0.9rem',
    letterSpacing: 1,
    padding: '3px 12px',
    background: active ? `${color}33` : 'transparent',
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.15)'}`,
    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer' as const,
  });

  return (
    <div style={{ padding: '1rem 2rem 2rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.15)', padding: '3px 10px', minWidth: 200 }}>
          <Search size={14} color="rgba(255,255,255,0.35)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search title, notes, camera, tags..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontFamily: PT, fontSize: '0.9rem', flex: 1 }}
          />
        </div>
        <button style={pill(favoritesOnly, ACC)} onClick={() => setFavoritesOnly(f => !f)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Heart size={13} fill={favoritesOnly ? ACC : 'none'} /> favorites
          </span>
        </button>
        {allTags.map(t => (
          <button key={t.id} style={pill(tagFilter === t.id, t.color)} onClick={() => setTagFilter(f => (f === t.id ? null : t.id))}>
            {t.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleImport}
          disabled={importing}
          style={{
            fontFamily: VT, fontSize: '1rem', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: `1px solid ${ACC}55`, color: ACC,
            cursor: importing ? 'default' : 'pointer', padding: '3px 12px',
          }}
        >
          <PlusBox size={15} /> {importing ? 'importing...' : 'import photos'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 0.5, textAlign: 'center', padding: '60px 0' }}>
          {photos.length === 0 ? 'no photos archived yet' : 'nothing matches'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {filtered.map(photo => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              tags={tagsByPhoto.get(photo.id) ?? []}
              onClick={() => setEditing(photo)}
            />
          ))}
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} maxWidth={1280}>
          <PhotoEditor
            initial={editing === 'new' ? undefined : editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
