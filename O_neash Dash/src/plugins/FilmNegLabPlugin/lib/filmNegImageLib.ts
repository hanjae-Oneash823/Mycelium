import { writeFile, mkdir, exists, readDir, remove, readFile } from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { parse as parseExif } from 'exifr';
import { getDb } from '@/lib/db';

const gid = () => Math.random().toString(36).slice(2, 18);

async function imagesDir(): Promise<string> {
  const docs = await documentDir();
  return join(docs, 'O-neash-data', 'filmneg-images');
}

export interface ExtractedExif {
  takenAt: string | null;
  camera: string | null;
  lat: number | null;
  lng: number | null;
  width: number | null;
  height: number | null;
}

/** Extract GPS/timestamp/camera metadata from raw image bytes. Never throws — returns nulls on failure. */
export async function extractExif(bytes: Uint8Array): Promise<ExtractedExif> {
  try {
    const data = await parseExif(bytes, { gps: true, exif: true, tiff: true });
    if (!data) return { takenAt: null, camera: null, lat: null, lng: null, width: null, height: null };
    const takenAtDate: Date | undefined = data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate;
    const cameraParts = [data.Make, data.Model].filter(Boolean);
    return {
      takenAt: takenAtDate instanceof Date && !isNaN(takenAtDate.getTime()) ? takenAtDate.toISOString() : null,
      camera: cameraParts.length ? cameraParts.join(' ') : null,
      lat: typeof data.latitude === 'number' ? data.latitude : null,
      lng: typeof data.longitude === 'number' ? data.longitude : null,
      width: typeof data.ExifImageWidth === 'number' ? data.ExifImageWidth : null,
      height: typeof data.ExifImageHeight === 'number' ? data.ExifImageHeight : null,
    };
  } catch {
    return { takenAt: null, camera: null, lat: null, lng: null, width: null, height: null };
  }
}

/** Save a dropped Blob/File into the filmneg-images folder. Returns the absolute path plus any EXIF metadata found. */
export async function saveImageBlob(blob: Blob, ext: string): Promise<{ path: string; exif: ExtractedExif }> {
  const dir = await imagesDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });

  const filename = `${gid()}.${ext.toLowerCase()}`;
  const path     = await join(dir, filename);
  const bytes    = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
  const exif = await extractExif(bytes);
  return { path, exif };
}

/** Extract extension from a MIME type, e.g. "image/jpeg" → "jpg". */
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg':    'jpg',
    'image/jpg':     'jpg',
    'image/png':     'png',
    'image/webp':    'webp',
    'image/tiff':    'tiff',
    'image/bmp':     'bmp',
  };
  return map[mime] ?? 'jpg';
}

/** Copy a file already on disk (e.g. picked via a native file dialog) into the filmneg-images folder.
 *  Returns the absolute path plus any EXIF metadata found. */
export async function saveImageFromPath(sourcePath: string): Promise<{ path: string; exif: ExtractedExif }> {
  const dir = await imagesDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });

  const ext      = sourcePath.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `${gid()}.${ext}`;
  const path     = await join(dir, filename);
  const bytes    = await readFile(sourcePath);
  await writeFile(path, bytes);
  const exif = await extractExif(bytes);
  return { path, exif };
}

/** Convert an absolute file path to a Tauri-safe display URL. */
export function toDisplaySrc(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

/**
 * Delete image files in filmneg-images/ that are no longer referenced by any photo row.
 * Returns the number of files deleted.
 */
export async function cleanupOrphanImages(): Promise<number> {
  const dir = await imagesDir();
  if (!(await exists(dir))) return 0;

  const entries = await readDir(dir);
  const files   = entries.filter(e => e.isFile && !!e.name);
  if (files.length === 0) return 0;

  const db   = getDb();
  const rows = await db.select<{ image_path: string }[]>(`SELECT image_path FROM filmneg_photos`);

  const referenced = new Set<string>();
  for (const { image_path } of rows) {
    const parts = image_path.split(/[/\\]/);
    referenced.add(parts[parts.length - 1]);
  }

  let deleted = 0;
  for (const entry of files) {
    if (!referenced.has(entry.name!)) {
      try {
        await remove(await join(dir, entry.name!));
        deleted++;
      } catch { /* skip locked / missing */ }
    }
  }
  return deleted;
}
