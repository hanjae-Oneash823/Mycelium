import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Heart } from 'pixelarticons/react';
import type { PhotoRow, TagRow, TrailRow, CameraRow } from '../lib/filmNegDb';
import {
  createPhoto, updatePhoto, deletePhoto, setFavorite, setRating,
  loadTags, loadTagsForPhoto, setPhotoTags, getOrCreateTag,
  loadTrails, loadTrailsForPhoto, addPhotoToTrail, removePhotoFromTrail,
  loadCameras,
} from '../lib/filmNegDb';
import { saveImageFromPath, saveImageBlob, extFromMime, toDisplaySrc, type ExtractedExif } from '../lib/filmNegImageLib';
import LocationPicker from './LocationPicker';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'Tamzen', 'SUSE', 'KOTRAGothic', monospace";
const ACC = '#e8a94f';

interface PhotoEditorProps {
  initial?: PhotoRow;
  onSaved: () => void;
  onCancel: () => void;
}

export default function PhotoEditor({ initial, onSaved, onCancel }: PhotoEditorProps) {
  const [imagePath, setImagePath]   = useState<string | null>(initial?.image_path ?? null);
  const [title, setTitle]           = useState(initial?.title ?? '');
  const [notes, setNotes]           = useState(initial?.notes ?? '');
  const [camera, setCamera]         = useState(initial?.camera ?? '');
  const [cameraId, setCameraId]     = useState<string | null>(initial?.camera_id ?? null);
  const [allCameras, setAllCameras] = useState<CameraRow[]>([]);
  const [filmStock, setFilmStock]   = useState(initial?.film_stock ?? '');
  const [takenAt, setTakenAt]       = useState(initial?.taken_at?.slice(0, 10) ?? '');
  const [lat, setLat]               = useState(initial?.lat != null ? String(initial.lat) : '');
  const [lng, setLng]               = useState(initial?.lng != null ? String(initial.lng) : '');
  const [locationName, setLocationName] = useState(initial?.location_name ?? '');
  const [width, setWidth]           = useState<number | null>(initial?.width ?? null);
  const [height, setHeight]         = useState<number | null>(initial?.height ?? null);
  const [rating, setRatingLocal]    = useState<number | null>(initial?.rating ?? null);
  const [isFavorite, setIsFavorite] = useState(initial?.is_favorite ?? false);

  const [allTags, setAllTags]       = useState<TagRow[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState('');

  const [allTrails, setAllTrails]   = useState<TrailRow[]>([]);
  const [photoTrailIds, setPhotoTrailIds] = useState<Set<string>>(new Set());

  const [dragOver, setDragOver]     = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    loadTags().then(setAllTags);
    loadTrails().then(setAllTrails);
    loadCameras().then(setAllCameras);
    if (initial) {
      loadTagsForPhoto(initial.id).then(tags => setSelectedTagIds(new Set(tags.map(t => t.id))));
      loadTrailsForPhoto(initial.id).then(trails => setPhotoTrailIds(new Set(trails.map(t => t.id))));
    }
  }, [initial]);

  const applyExif = (exif: ExtractedExif) => {
    if (exif.takenAt) setTakenAt(exif.takenAt.slice(0, 10));
    if (exif.camera) setCamera(exif.camera);
    if (exif.lat != null) setLat(String(exif.lat));
    if (exif.lng != null) setLng(String(exif.lng));
    if (exif.width) setWidth(exif.width);
    if (exif.height) setHeight(exif.height);
  };

  const pickImage = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'bmp'] }],
    });
    if (!picked || Array.isArray(picked)) return;
    const { path, exif } = await saveImageFromPath(picked);
    setImagePath(path);
    applyExif(exif);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
    if (!file) return;
    const { path, exif } = await saveImageBlob(file, extFromMime(file.type));
    setImagePath(path);
    applyExif(exif);
  };

  const handleSave = async () => {
    if (!imagePath || saving) return;
    setSaving(true);
    const isFilmCamera = allCameras.find(c => c.id === cameraId)?.type === 'film';
    const data = {
      title: title.trim() || null,
      image_path: imagePath,
      notes: notes.trim() || null,
      taken_at: takenAt || null,
      camera: camera.trim() || null,
      camera_id: cameraId,
      film_stock: isFilmCamera ? (filmStock.trim() || null) : null,
      lat: lat.trim() ? Number(lat) : null,
      lng: lng.trim() ? Number(lng) : null,
      location_name: locationName.trim() || null,
      width,
      height,
    };

    let photoId: string;
    if (initial) {
      await updatePhoto(initial.id, data);
      photoId = initial.id;
    } else {
      photoId = await createPhoto(data);
    }
    await setPhotoTags(photoId, Array.from(selectedTagIds));
    await setFavorite(photoId, isFavorite);
    await setRating(photoId, rating);

    setSaving(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!armedDelete) { setArmedDelete(true); return; }
    await deletePhoto(initial.id);
    onSaved();
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addNewTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const id = await getOrCreateTag(trimmed);
    setAllTags(await loadTags());
    setSelectedTagIds(s => new Set(s).add(id));
    setNewTagName('');
  };

  const toggleTrail = async (trailId: string) => {
    if (!initial) return;
    if (photoTrailIds.has(trailId)) {
      await removePhotoFromTrail(trailId, initial.id);
    } else {
      await addPhotoToTrail(trailId, initial.id);
    }
    const trails = await loadTrailsForPhoto(initial.id);
    setPhotoTrailIds(new Set(trails.map(t => t.id)));
  };

  const selectedCamera = allCameras.find(c => c.id === cameraId) ?? null;
  const isFilmCamera = selectedCamera?.type === 'film';

  const rowLabel = { fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1.2, color: '#fff', minWidth: 68 };
  const pill = (active: boolean, color: string) => ({
    all: 'unset' as const,
    fontFamily: VT,
    fontSize: '0.8rem',
    letterSpacing: 1,
    padding: '2px 9px',
    background: active ? `${color}33` : 'transparent',
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.15)'}`,
    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer' as const,
  });
  const textInput = {
    background: 'transparent', border: 'none',
    color: '#fff', fontFamily: PT, fontSize: '0.9rem', outline: 'none', padding: '2px 0', flex: 1,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
        <input
          type="date"
          value={takenAt}
          onChange={e => setTakenAt(e.target.value)}
          style={{ ...textInput, colorScheme: 'dark', flex: 'none', width: 140, justifySelf: 'start' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'center' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="untitled"
            autoFocus
            style={{
              background: 'transparent', border: 'none',
              color: '#fff', fontFamily: PT, fontSize: '1.3rem', textAlign: 'center', outline: 'none',
              padding: '4px 0', width: 320,
            }}
          />
          <button
            onClick={() => setIsFavorite(f => !f)}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex' }}
            title="favorite"
          >
            <Heart size={20} fill={isFavorite ? ACC : 'none'} color={isFavorite ? ACC : 'rgba(255,255,255,0.3)'} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 2, justifySelf: 'end' }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setRatingLocal(r => (r === n ? null : n))}
              style={{
                all: 'unset', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1,
                color: rating != null && n <= rating ? ACC : 'rgba(255,255,255,0.25)',
              }}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28 }}>
        {/* ── left column: image, camera/film, tags ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={pickImage}
            style={{
              border: `1px dashed ${dragOver ? ACC + '88' : 'rgba(255,255,255,0.15)'}`,
              background: dragOver ? `${ACC}0c` : 'rgba(255,255,255,0.02)',
              height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden',
            }}
          >
            {imagePath ? (
              <img src={toDisplaySrc(imagePath)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
                drop photo or click to choose
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={rowLabel}>camera</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allCameras.map(c => (
                  <button key={c.id} style={pill(cameraId === c.id, ACC)} onClick={() => setCameraId(id => (id === c.id ? null : c.id))}>
                    {c.name}
                  </button>
                ))}
              </div>
              {allCameras.length === 0 && (
                <span style={{ fontFamily: PT, fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>
                  no cameras yet — add one in the cameras tab
                </span>
              )}
              {camera && (
                <span style={{ fontFamily: PT, fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>
                  detected from file: {camera}
                </span>
              )}
            </div>
          </div>

          {isFilmCamera && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={rowLabel}>film</span>
              <input value={filmStock} onChange={e => setFilmStock(e.target.value)} placeholder="e.g. Kodak Portra 400" style={textInput} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={rowLabel}>tags</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map(t => (
                  <button key={t.id} style={pill(selectedTagIds.has(t.id), t.color)} onClick={() => toggleTag(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewTag(); } }}
                  placeholder="+ new tag"
                  style={{ ...textInput, fontSize: '0.85rem' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── right column: location, trails, notes ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={rowLabel}>location</span>
            <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="auto-filled from map" style={{ ...textInput, flex: 2 }} />
            <input value={lat} onChange={e => setLat(e.target.value)} placeholder="lat" style={{ ...textInput, flex: 1 }} />
            <input value={lng} onChange={e => setLng(e.target.value)} placeholder="lng" style={{ ...textInput, flex: 1 }} />
          </div>

          <LocationPicker
            lat={lat.trim() ? Number(lat) : null}
            lng={lng.trim() ? Number(lng) : null}
            onPick={(newLat, newLng, name) => {
              setLat(String(newLat));
              setLng(String(newLng));
              if (name) setLocationName(name);
            }}
          />

          {initial && allTrails.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={rowLabel}>trails</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                {allTrails.map(t => (
                  <button key={t.id} style={pill(photoTrailIds.has(t.id), t.color)} onClick={() => toggleTrail(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={rowLabel}>notes</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ ...textInput, resize: 'vertical' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
        {initial && (
          <button
            onClick={handleDelete}
            style={{
              all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, cursor: 'pointer',
              color: armedDelete ? '#ff3b3b' : '#e05555',
              fontWeight: armedDelete ? 700 : 400,
            }}
          >
            {armedDelete ? 'confirm delete?' : 'delete'}
          </button>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
            cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!imagePath}
            style={{
              all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, padding: '4px 18px',
              border: '1px solid rgba(255,255,255,0.4)', color: imagePath ? '#fff' : 'rgba(255,255,255,0.25)',
              cursor: imagePath ? 'pointer' : 'default',
            }}
          >
            {initial ? 'save' : 'add'}
          </button>
        </div>
      </div>
    </div>
  );
}
