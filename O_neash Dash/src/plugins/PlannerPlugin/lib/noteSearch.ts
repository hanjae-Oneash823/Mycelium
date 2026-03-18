import { BaseDirectory, readTextFile, exists, readDir } from '@tauri-apps/plugin-fs';
import type { NoteHit } from '../types';
import type { NoteGroup, Note } from '@/types';

async function loadGroups(): Promise<NoteGroup[]> {
  try {
    const data = await readTextFile('notes/groups.json', { baseDir: BaseDirectory.AppData });
    return JSON.parse(data) as NoteGroup[];
  } catch {
    return [];
  }
}

export async function searchNotes(query: string): Promise<NoteHit[]> {
  if (!query.trim()) return [];
  const groups = await loadGroups();
  const q = query.toLowerCase();
  const hits: NoteHit[] = [];

  for (const group of groups) {
    const dir = `notes/${group.id}`;
    const dirExists = await exists(dir, { baseDir: BaseDirectory.AppData });
    if (!dirExists) continue;
    const entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
    for (const entry of entries) {
      if (!entry.isFile || !entry.name?.endsWith('.json')) continue;
      try {
        const raw = await readTextFile(`${dir}/${entry.name}`, { baseDir: BaseDirectory.AppData });
        const note = JSON.parse(raw) as Note;
        if (
          note.title?.toLowerCase().includes(q) ||
          note.content?.toLowerCase().includes(q)
        ) {
          hits.push({
            compositeId: `${group.id}:${note.id}`,
            groupId: group.id,
            groupName: group.name,
            groupColor: group.color,
            noteId: note.id,
            title: note.title,
            content: note.content,
            updatedAt: note.updatedAt,
          });
        }
      } catch { /* skip malformed files */ }
    }
  }
  return hits.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadNotesByIds(compositeIds: string[]): Promise<NoteHit[]> {
  if (compositeIds.length === 0) return [];
  const groups = await loadGroups();
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const results: NoteHit[] = [];

  for (const cid of compositeIds) {
    const colonIdx = cid.indexOf(':');
    if (colonIdx === -1) continue;
    const groupId = cid.slice(0, colonIdx);
    const noteId  = cid.slice(colonIdx + 1);
    const group = groupMap.get(groupId);
    if (!group) continue;
    const filePath = `notes/${groupId}/${noteId}.json`;
    try {
      const fileExists = await exists(filePath, { baseDir: BaseDirectory.AppData });
      if (!fileExists) continue;
      const raw = await readTextFile(filePath, { baseDir: BaseDirectory.AppData });
      const note = JSON.parse(raw) as Note;
      results.push({
        compositeId: cid,
        groupId,
        groupName: group.name,
        groupColor: group.color,
        noteId: note.id,
        title: note.title,
        content: note.content,
        updatedAt: note.updatedAt,
      });
    } catch { /* skip */ }
  }
  return results;
}
