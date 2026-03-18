import { getDb } from '@/lib/db';
import type { LinkedNoteRef } from '../types';

export async function linkNoteToTask(compositeNoteId: string, nodeId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT OR IGNORE INTO note_task_links(note_id, node_id) VALUES (?, ?)`,
    [compositeNoteId, nodeId]
  );
}

export async function unlinkNoteFromTask(compositeNoteId: string, nodeId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `DELETE FROM note_task_links WHERE note_id = ? AND node_id = ?`,
    [compositeNoteId, nodeId]
  );
}

export async function deleteAllLinksForNote(compositeNoteId: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM note_task_links WHERE note_id = ?`, [compositeNoteId]);
}

export async function getLinkedNoteIds(nodeId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select<LinkedNoteRef[]>(
    `SELECT note_id, node_id, linked_at FROM note_task_links WHERE node_id = ? ORDER BY linked_at DESC`,
    [nodeId]
  );
  return rows.map(r => r.note_id);
}

export async function getLinkedNodeIds(compositeNoteId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select<LinkedNoteRef[]>(
    `SELECT note_id, node_id, linked_at FROM note_task_links WHERE note_id = ? ORDER BY linked_at DESC`,
    [compositeNoteId]
  );
  return rows.map(r => r.node_id);
}
