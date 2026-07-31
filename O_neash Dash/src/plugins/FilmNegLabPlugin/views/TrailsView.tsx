import { useCallback, useEffect, useState } from 'react';
import { Directions } from 'pixelarticons/react';
import type { TrailRow, TrailPhotoRow } from '../lib/filmNegDb';
import { loadTrails, loadTrailPhotos } from '../lib/filmNegDb';
import { toDisplaySrc } from '../lib/filmNegImageLib';
import TrailEditor from '../components/TrailEditor';
import Modal from '../components/Modal';

const VT = "var(--font-main), var(--font-kr), monospace";

export default function TrailsView() {
  const [trails, setTrails]     = useState<TrailRow[]>([]);
  const [covers, setCovers]     = useState<Map<string, TrailPhotoRow[]>>(new Map());
  const [editing, setEditing]   = useState<TrailRow | 'new' | null>(null);

  const load = useCallback(async () => {
    const rows = await loadTrails();
    setTrails(rows);
    const map = new Map<string, TrailPhotoRow[]>();
    for (const trail of rows) {
      map.set(trail.id, await loadTrailPhotos(trail.id));
    }
    setCovers(map);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = () => {
    setEditing(null);
    load();
  };

  return (
    <div style={{ padding: '1rem 2rem 2rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => setEditing('new')}
          style={{
            fontFamily: VT, fontSize: '1rem', letterSpacing: 1,
            background: 'none', border: '1px solid #e8a94f55', color: '#e8a94f',
            cursor: 'pointer', padding: '3px 12px',
          }}
        >
          + new trail
        </button>
      </div>

      {trails.length === 0 ? (
        <div style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 0.5, textAlign: 'center', padding: '60px 0' }}>
          no trails yet — group travel photos into a route
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {trails.map(trail => {
            const photos = covers.get(trail.id) ?? [];
            return (
              <div
                key={trail.id}
                onClick={() => setEditing(trail)}
                style={{ cursor: 'pointer', border: `1px solid ${trail.color}33`, background: 'rgba(255,255,255,0.02)' }}
              >
                <div style={{ display: 'flex', height: 100, overflow: 'hidden' }}>
                  {photos.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)' }}>
                      <Directions size={24} />
                    </div>
                  ) : (
                    photos.slice(0, 4).map(p => (
                      <img key={p.id} src={toDisplaySrc(p.image_path)} alt="" style={{ flex: 1, height: '100%', objectFit: 'cover' }} />
                    ))
                  )}
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontFamily: VT, fontSize: '1.05rem', letterSpacing: 0.5, color: '#fff' }}>{trail.name}</div>
                  <div style={{ fontFamily: VT, fontSize: '0.75rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {photos.length} photo{photos.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <TrailEditor
            initial={editing === 'new' ? undefined : editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
