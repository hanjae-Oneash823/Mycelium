import { getDb } from '@/lib/db';

const gid = () => Math.random().toString(36).slice(2, 18);

export type CameraType = 'digital' | 'film';

export interface CameraRow {
  id: string;
  name: string;
  type: CameraType;
  created_at: string;
}

export interface PhotoRow {
  id: string;
  title: string | null;
  image_path: string;
  notes: string | null;
  taken_at: string | null;
  camera: string | null;
  camera_id: string | null;
  film_stock: string | null;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  is_favorite: boolean;
  rating: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TrailRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface TrailPhotoRow extends PhotoRow {
  sort_order: number;
}

export interface CreatePhotoInput {
  title: string | null;
  image_path: string;
  notes: string | null;
  taken_at: string | null;
  camera: string | null;
  camera_id: string | null;
  film_stock: string | null;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  width: number | null;
  height: number | null;
}

// ─────────────────── Photos ───────────────────────────────────────────────

export async function loadPhotos(): Promise<PhotoRow[]> {
  return getDb().select<PhotoRow[]>(
    `SELECT * FROM filmneg_photos ORDER BY COALESCE(taken_at, created_at) DESC`,
  );
}

export async function getPhotoById(id: string): Promise<PhotoRow | null> {
  const rows = await getDb().select<PhotoRow[]>(`SELECT * FROM filmneg_photos WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function loadGeotaggedPhotos(): Promise<PhotoRow[]> {
  return getDb().select<PhotoRow[]>(
    `SELECT * FROM filmneg_photos WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY COALESCE(taken_at, created_at) ASC`,
  );
}

export async function createPhoto(data: CreatePhotoInput): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(
    `INSERT INTO filmneg_photos
       (id, title, image_path, notes, taken_at, camera, camera_id, film_stock, lat, lng, location_name, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.title, data.image_path, data.notes, data.taken_at, data.camera, data.camera_id, data.film_stock,
     data.lat, data.lng, data.location_name, data.width, data.height],
  );
  return id;
}

export async function updatePhoto(id: string, data: CreatePhotoInput): Promise<void> {
  await getDb().execute(
    `UPDATE filmneg_photos SET
       title = ?, image_path = ?, notes = ?, taken_at = ?, camera = ?, camera_id = ?, film_stock = ?,
       lat = ?, lng = ?, location_name = ?, width = ?, height = ?
     WHERE id = ?`,
    [data.title, data.image_path, data.notes, data.taken_at, data.camera, data.camera_id, data.film_stock,
     data.lat, data.lng, data.location_name, data.width, data.height, id],
  );
}

export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  await getDb().execute(`UPDATE filmneg_photos SET is_favorite = ? WHERE id = ?`, [isFavorite ? 1 : 0, id]);
}

export async function setRating(id: string, rating: number | null): Promise<void> {
  await getDb().execute(`UPDATE filmneg_photos SET rating = ? WHERE id = ?`, [rating, id]);
}

export async function deletePhoto(id: string): Promise<void> {
  await getDb().execute(`DELETE FROM filmneg_photos WHERE id = ?`, [id]);
}

export async function searchPhotos(query: string): Promise<PhotoRow[]> {
  const like = `%${query}%`;
  return getDb().select<PhotoRow[]>(
    `SELECT DISTINCT p.* FROM filmneg_photos p
     LEFT JOIN filmneg_photo_tags pt ON pt.photo_id = p.id
     LEFT JOIN filmneg_tags t ON t.id = pt.tag_id
     WHERE p.title LIKE ? OR p.notes LIKE ? OR p.camera LIKE ? OR p.film_stock LIKE ?
        OR p.location_name LIKE ? OR t.name LIKE ?
     ORDER BY COALESCE(p.taken_at, p.created_at) DESC`,
    [like, like, like, like, like, like],
  );
}

// ─────────────────── Tags ─────────────────────────────────────────────────

export async function loadTags(): Promise<TagRow[]> {
  return getDb().select<TagRow[]>(`SELECT * FROM filmneg_tags ORDER BY name ASC`);
}

export async function getOrCreateTag(name: string, color = '#64c8ff'): Promise<string> {
  const db = getDb();
  const trimmed = name.trim();
  const existing = await db.select<TagRow[]>(`SELECT * FROM filmneg_tags WHERE name = ?`, [trimmed]);
  if (existing[0]) return existing[0].id;
  const id = gid();
  await db.execute(`INSERT INTO filmneg_tags (id, name, color) VALUES (?, ?, ?)`, [id, trimmed, color]);
  return id;
}

export async function deleteTag(id: string): Promise<void> {
  await getDb().execute(`DELETE FROM filmneg_tags WHERE id = ?`, [id]);
}

export async function loadTagsForPhoto(photoId: string): Promise<TagRow[]> {
  return getDb().select<TagRow[]>(
    `SELECT t.* FROM filmneg_tags t
     JOIN filmneg_photo_tags pt ON pt.tag_id = t.id
     WHERE pt.photo_id = ? ORDER BY t.name ASC`,
    [photoId],
  );
}

export async function loadTagsForPhotos(photoIds: string[]): Promise<Map<string, TagRow[]>> {
  if (photoIds.length === 0) return new Map();
  const placeholders = photoIds.map(() => '?').join(', ');
  const rows = await getDb().select<(TagRow & { photo_id: string })[]>(
    `SELECT t.*, pt.photo_id FROM filmneg_tags t
     JOIN filmneg_photo_tags pt ON pt.tag_id = t.id
     WHERE pt.photo_id IN (${placeholders})`,
    photoIds,
  );
  const map = new Map<string, TagRow[]>();
  for (const row of rows) {
    const { photo_id, ...tag } = row;
    const list = map.get(photo_id) ?? [];
    list.push(tag);
    map.set(photo_id, list);
  }
  return map;
}

export async function setPhotoTags(photoId: string, tagIds: string[]): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM filmneg_photo_tags WHERE photo_id = ?`, [photoId]);
  for (const tagId of tagIds) {
    await db.execute(
      `INSERT OR IGNORE INTO filmneg_photo_tags (photo_id, tag_id) VALUES (?, ?)`,
      [photoId, tagId],
    );
  }
}

export async function findPhotoIdsByTag(tagId: string): Promise<Set<string>> {
  const rows = await getDb().select<{ photo_id: string }[]>(
    `SELECT photo_id FROM filmneg_photo_tags WHERE tag_id = ?`,
    [tagId],
  );
  return new Set(rows.map(r => r.photo_id));
}

// ─────────────────── Trails ───────────────────────────────────────────────

export async function loadTrails(): Promise<TrailRow[]> {
  return getDb().select<TrailRow[]>(`SELECT * FROM filmneg_trails ORDER BY updated_at DESC`);
}

export async function getTrailById(id: string): Promise<TrailRow | null> {
  const rows = await getDb().select<TrailRow[]>(`SELECT * FROM filmneg_trails WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function createTrail(data: { name: string; description: string | null; color: string }): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(
    `INSERT INTO filmneg_trails (id, name, description, color) VALUES (?, ?, ?, ?)`,
    [id, data.name, data.description, data.color],
  );
  return id;
}

export async function updateTrail(id: string, data: { name: string; description: string | null; color: string }): Promise<void> {
  await getDb().execute(
    `UPDATE filmneg_trails SET name = ?, description = ?, color = ? WHERE id = ?`,
    [data.name, data.description, data.color, id],
  );
}

export async function deleteTrail(id: string): Promise<void> {
  await getDb().execute(`DELETE FROM filmneg_trails WHERE id = ?`, [id]);
}

export async function loadTrailPhotos(trailId: string): Promise<TrailPhotoRow[]> {
  return getDb().select<TrailPhotoRow[]>(
    `SELECT p.*, tp.sort_order FROM filmneg_photos p
     JOIN filmneg_trail_photos tp ON tp.photo_id = p.id
     WHERE tp.trail_id = ? ORDER BY tp.sort_order ASC`,
    [trailId],
  );
}

export async function loadAllTrailsWithPhotos(): Promise<Map<string, TrailPhotoRow[]>> {
  const rows = await getDb().select<(TrailPhotoRow & { trail_id: string })[]>(
    `SELECT p.*, tp.sort_order, tp.trail_id FROM filmneg_photos p
     JOIN filmneg_trail_photos tp ON tp.photo_id = p.id
     WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
     ORDER BY tp.trail_id, tp.sort_order ASC`,
  );
  const map = new Map<string, TrailPhotoRow[]>();
  for (const row of rows) {
    const { trail_id, ...photo } = row;
    const list = map.get(trail_id) ?? [];
    list.push(photo);
    map.set(trail_id, list);
  }
  return map;
}

export async function addPhotoToTrail(trailId: string, photoId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ max_order: number | null }[]>(
    `SELECT MAX(sort_order) as max_order FROM filmneg_trail_photos WHERE trail_id = ?`,
    [trailId],
  );
  const nextOrder = (rows[0]?.max_order ?? -1) + 1;
  await db.execute(
    `INSERT OR IGNORE INTO filmneg_trail_photos (trail_id, photo_id, sort_order) VALUES (?, ?, ?)`,
    [trailId, photoId, nextOrder],
  );
}

export async function removePhotoFromTrail(trailId: string, photoId: string): Promise<void> {
  await getDb().execute(
    `DELETE FROM filmneg_trail_photos WHERE trail_id = ? AND photo_id = ?`,
    [trailId, photoId],
  );
}

export async function reorderTrailPhotos(trailId: string, photoIdsInOrder: string[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < photoIdsInOrder.length; i++) {
    await db.execute(
      `UPDATE filmneg_trail_photos SET sort_order = ? WHERE trail_id = ? AND photo_id = ?`,
      [i, trailId, photoIdsInOrder[i]],
    );
  }
}

export async function loadTrailsForPhoto(photoId: string): Promise<TrailRow[]> {
  return getDb().select<TrailRow[]>(
    `SELECT t.* FROM filmneg_trails t
     JOIN filmneg_trail_photos tp ON tp.trail_id = t.id
     WHERE tp.photo_id = ? ORDER BY t.name ASC`,
    [photoId],
  );
}

// ─────────────────── Cameras ──────────────────────────────────────────────

export async function loadCameras(): Promise<CameraRow[]> {
  return getDb().select<CameraRow[]>(`SELECT * FROM filmneg_cameras ORDER BY name ASC`);
}

export async function getCameraById(id: string): Promise<CameraRow | null> {
  const rows = await getDb().select<CameraRow[]>(`SELECT * FROM filmneg_cameras WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function createCamera(data: { name: string; type: CameraType }): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(`INSERT INTO filmneg_cameras (id, name, type) VALUES (?, ?, ?)`, [id, data.name, data.type]);
  return id;
}

export async function updateCamera(id: string, data: { name: string; type: CameraType }): Promise<void> {
  await getDb().execute(`UPDATE filmneg_cameras SET name = ?, type = ? WHERE id = ?`, [data.name, data.type, id]);
}

export async function deleteCamera(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE filmneg_photos SET camera_id = NULL WHERE camera_id = ?`, [id]);
  await db.execute(`DELETE FROM filmneg_cameras WHERE id = ?`, [id]);
}

export async function countPhotosByCamera(): Promise<Map<string, number>> {
  const rows = await getDb().select<{ camera_id: string; count: number }[]>(
    `SELECT camera_id, COUNT(*) as count FROM filmneg_photos WHERE camera_id IS NOT NULL GROUP BY camera_id`,
  );
  return new Map(rows.map(r => [r.camera_id, r.count]));
}
