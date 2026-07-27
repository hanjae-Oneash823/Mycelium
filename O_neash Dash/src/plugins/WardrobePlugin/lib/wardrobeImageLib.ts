import { writeFile, mkdir, exists, readDir, remove, readFile } from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getDb } from '@/lib/db';

const gid = () => Math.random().toString(36).slice(2, 18);

async function imagesDir(): Promise<string> {
  const docs = await documentDir();
  return join(docs, 'O-neash-data', 'wardrobe-images');
}

/** Save a Blob to the wardrobe-images folder. Returns the absolute path. */
export async function saveImageBlob(blob: Blob, ext: string): Promise<string> {
  const dir = await imagesDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });

  const filename = `${gid()}.${ext.toLowerCase()}`;
  const path     = await join(dir, filename);
  const buf      = await blob.arrayBuffer();
  await writeFile(path, new Uint8Array(buf));
  return path;
}

/** Copy a file already on disk (e.g. picked via a native file dialog) into the wardrobe-images folder. Returns the absolute path. */
export async function saveImageFromPath(sourcePath: string): Promise<string> {
  const dir = await imagesDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });

  const ext      = sourcePath.split('.').pop()?.toLowerCase() || 'png';
  const filename = `${gid()}.${ext}`;
  const path     = await join(dir, filename);
  const bytes    = await readFile(sourcePath);
  await writeFile(path, bytes);
  return path;
}

/** Convert an absolute file path to a Tauri-safe display URL. */
export function toDisplaySrc(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

/** Extract extension from a MIME type, e.g. "image/jpeg" → "jpg". */
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg':    'jpg',
    'image/jpg':     'jpg',
    'image/png':     'png',
    'image/gif':     'gif',
    'image/webp':    'webp',
    'image/svg+xml': 'svg',
    'image/avif':    'avif',
    'image/tiff':    'png',
    'image/bmp':     'bmp',
  };
  return map[mime] ?? 'png';
}

/**
 * Delete image files in wardrobe-images/ that are no longer referenced
 * by any entry's content_json or cover_image. Returns the number of files deleted.
 */
export async function cleanupOrphanImages(): Promise<number> {
  const dir = await imagesDir();
  if (!(await exists(dir))) return 0;

  const entries = await readDir(dir);
  const files   = entries.filter(e => e.isFile && !!e.name);
  if (files.length === 0) return 0;

  const db   = getDb();
  const rows = await db.select<{ content_json: string | null; cover_image: string | null }[]>(
    `SELECT content_json, cover_image FROM wardrobe_wiki_entries`,
  );
  const galleryRows = await db.select<{ image_path: string }[]>(
    `SELECT image_path FROM wardrobe_wiki_gallery_images`,
  );
  const itemRows = await db.select<{ image_path: string | null }[]>(
    `SELECT image_path FROM wardrobe_items WHERE image_path IS NOT NULL`,
  );
  const ootdRows = await db.select<{ photo_path: string | null }[]>(
    `SELECT photo_path FROM wardrobe_ootd_logs WHERE photo_path IS NOT NULL`,
  );

  const referenced = new Set<string>();
  for (const { content_json, cover_image } of rows) {
    if (content_json) {
      for (const m of content_json.matchAll(/wardrobe-images[/\\]([^"\\,\s]+)/g)) {
        referenced.add(m[1]);
      }
    }
    if (cover_image) {
      const parts = cover_image.split(/[/\\]/);
      referenced.add(parts[parts.length - 1]);
    }
  }
  for (const { image_path } of galleryRows) {
    const parts = image_path.split(/[/\\]/);
    referenced.add(parts[parts.length - 1]);
  }
  for (const { image_path } of itemRows) {
    if (!image_path) continue;
    const parts = image_path.split(/[/\\]/);
    referenced.add(parts[parts.length - 1]);
  }
  for (const { photo_path } of ootdRows) {
    if (!photo_path) continue;
    const parts = photo_path.split(/[/\\]/);
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
