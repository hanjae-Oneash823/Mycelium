import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { documentDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';

async function imagesDir(): Promise<string> {
  const docs = await documentDir();
  return join(docs, 'O-neash-data', 'journal-images');
}

export async function saveJournalImage(blob: Blob, ext: string): Promise<string> {
  const dir = await imagesDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  const filename = `${Math.random().toString(36).slice(2, 18)}.${ext.toLowerCase()}`;
  const path = await join(dir, filename);
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return path;
}

export function toDisplaySrc(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/bmp': 'bmp',
  };
  return map[mime] ?? 'png';
}
