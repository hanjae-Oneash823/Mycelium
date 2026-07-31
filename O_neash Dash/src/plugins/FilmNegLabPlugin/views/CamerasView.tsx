import { useCallback, useEffect, useState } from 'react';
import { Camera as CameraIcon } from 'pixelarticons/react';
import type { CameraRow } from '../lib/filmNegDb';
import { loadCameras, countPhotosByCamera } from '../lib/filmNegDb';
import CameraEditor from '../components/CameraEditor';
import Modal from '../components/Modal';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#e8a94f';

export default function CamerasView() {
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [counts, setCounts]   = useState<Map<string, number>>(new Map());
  const [editing, setEditing] = useState<CameraRow | 'new' | null>(null);

  const load = useCallback(async () => {
    setCameras(await loadCameras());
    setCounts(await countPhotosByCamera());
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
            background: 'none', border: `1px solid ${ACC}55`, color: ACC,
            cursor: 'pointer', padding: '3px 12px',
          }}
        >
          + new camera
        </button>
      </div>

      {cameras.length === 0 ? (
        <div style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 0.5, textAlign: 'center', padding: '60px 0' }}>
          no cameras added yet
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {cameras.map(camera => (
            <div
              key={camera.id}
              onClick={() => setEditing(camera)}
              style={{
                cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)',
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <CameraIcon size={22} color={camera.type === 'film' ? ACC : 'rgba(255,255,255,0.4)'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 0.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {camera.name}
                </div>
                <div style={{ fontFamily: VT, fontSize: '0.75rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {camera.type} · {counts.get(camera.id) ?? 0} photo{(counts.get(camera.id) ?? 0) === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} maxWidth={420}>
          <CameraEditor
            initial={editing === 'new' ? undefined : editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
