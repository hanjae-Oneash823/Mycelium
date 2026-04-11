import { writeFile, mkdir, exists, readDir, remove } from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getDb } from '@/lib/db';

const gid = () => Math.random().toString(36).slice(2, 18);

async function imagesDir(): Promise<string> {
  const docs = await documentDir();
  return join(docs, 'O-neash-data', 'notes-images');
}

/** Save a Blob to the notes-images folder. Returns the absolute path. */
export async function saveImageBlob(blob: Blob, ext: string): Promise<string> {
  const dir = await imagesDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });

  const filename = `${gid()}.${ext.toLowerCase()}`;
  const path     = await join(dir, filename);
  const buf      = await blob.arrayBuffer();
  await writeFile(path, new Uint8Array(buf));
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
 * Delete image files in notes-images/ that are no longer referenced
 * by any document's content_json. Returns the number of files deleted.
 */
export async function cleanupOrphanImages(): Promise<number> {
  const dir = await imagesDir();
  if (!(await exists(dir))) return 0;

  // List files on disk
  const entries = await readDir(dir);
  const files   = entries.filter(e => e.isFile && !!e.name);
  if (files.length === 0) return 0;

  // Collect referenced filenames from all notes
  const db    = getDb();
  const notes = await db.select<{ content_json: string | null }[]>(
    `SELECT content_json FROM notes WHERE content_json IS NOT NULL AND content_json LIKE '%notes-images%'`,
  );

  const referenced = new Set<string>();
  for (const { content_json } of notes) {
    if (!content_json) continue;
    // Match the last path segment (filename) after "notes-images/"
    for (const m of content_json.matchAll(/notes-images[/\\]([^"\\,\s]+)/g)) {
      referenced.add(m[1]);
    }
  }

  // Delete orphans
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
