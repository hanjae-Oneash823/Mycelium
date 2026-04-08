import { getDb } from '@/lib/db';

export interface NoteRow {
  id: string;
  note_type: 'memo' | 'document';
  title: string | null;
  content_plain: string | null;
  content_json: string | null;
  status: 'active' | 'archived';
  arc_id: string | null;
  project_id: string | null;
  pinned: number;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

const gid = () => Math.random().toString(36).slice(2, 18);

export async function loadArchivedMemos(): Promise<NoteRow[]> {
  const db = getDb();
  return db.select<NoteRow[]>(
    `SELECT * FROM notes WHERE note_type = 'memo' AND status = 'archived' ORDER BY updated_at DESC`,
  );
}

export async function loadNotes(type?: 'memo' | 'document'): Promise<NoteRow[]> {
  const db = getDb();
  if (type) {
    return db.select<NoteRow[]>(
      `SELECT * FROM notes WHERE note_type = ? AND status = 'active' ORDER BY pinned DESC, updated_at DESC`,
      [type],
    );
  }
  return db.select<NoteRow[]>(
    `SELECT * FROM notes WHERE status = 'active' ORDER BY pinned DESC, updated_at DESC`,
  );
}

export async function createNote(
  data: Pick<NoteRow, 'note_type' | 'title' | 'content_plain' | 'content_json' | 'arc_id' | 'project_id'>,
): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(
    `INSERT INTO notes (id, note_type, title, content_plain, content_json, arc_id, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.note_type, data.title ?? null, data.content_plain ?? null, data.content_json ?? null, data.arc_id ?? null, data.project_id ?? null],
  );
  return id;
}

export async function updateNote(id: string, patch: Partial<Pick<NoteRow, 'title' | 'content_plain' | 'content_json' | 'arc_id' | 'project_id' | 'pinned' | 'color_hex' | 'status'>>): Promise<void> {
  const db = getDb();
  const fields = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(patch), id];
  await db.execute(`UPDATE notes SET ${fields} WHERE id = ?`, values);
}

export async function deleteNote(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM notes WHERE id = ?`, [id]);
}

export async function archiveNote(id: string): Promise<void> {
  await updateNote(id, { status: 'archived' });
}

export async function promoteToDocument(id: string, title: string, contentJson: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE notes SET note_type = 'document', title = ?, content_json = ? WHERE id = ?`,
    [title, contentJson, id],
  );
}

// ── Doc comments ──────────────────────────────────────────────────────────────

export interface CommentRow {
  id: string;
  doc_id: string;
  mark_id: string;
  body: string;
  resolved: number;
  created_at: string;
}

export async function loadComments(docId: string): Promise<CommentRow[]> {
  const db = getDb();
  return db.select<CommentRow[]>(
    `SELECT * FROM doc_comments WHERE doc_id = ? ORDER BY created_at ASC`,
    [docId],
  );
}

export async function createComment(docId: string, markId: string, body: string): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(
    `INSERT INTO doc_comments (id, doc_id, mark_id, body) VALUES (?, ?, ?, ?)`,
    [id, docId, markId, body],
  );
  return id;
}

export async function deleteComment(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM doc_comments WHERE id = ?`, [id]);
}

export async function resolveComment(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE doc_comments SET resolved = 1 WHERE id = ?`, [id]);
}

// ── Wiki-link graph ────────────────────────────────────────────────────────────

function extractWikiLinks(contentJson: string): string[] {
  const titles: string[] = [];
  function traverse(node: any) {
    if (node?.type === 'wikiLink' && node.attrs?.title) {
      titles.push(node.attrs.title as string);
    }
    node?.content?.forEach(traverse);
  }
  try { traverse(JSON.parse(contentJson)); } catch { /* malformed JSON */ }
  return titles;
}

export async function syncLinks(sourceId: string, contentJson: string): Promise<void> {
  const db = getDb();
  const allDocs = await loadNotes('document');
  const titles = extractWikiLinks(contentJson);
  const titleMap = new Map(allDocs.map(d => [(d.title ?? '').toLowerCase(), d.id]));
  const targetIds = [...new Set(
    titles
      .map(t => titleMap.get(t.toLowerCase()))
      .filter((id): id is string => !!id && id !== sourceId),
  )];
  await db.execute(`DELETE FROM note_links WHERE source_id = ?`, [sourceId]);
  for (const targetId of targetIds) {
    await db.execute(
      `INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)`,
      [sourceId, targetId],
    );
  }
}

export interface BacklinkRow {
  id: string;
  title: string | null;
  updated_at: string;
}

export async function loadAllLinks(): Promise<{ source_id: string; target_id: string }[]> {
  const db = getDb();
  return db.select<{ source_id: string; target_id: string }[]>(
    `SELECT source_id, target_id FROM note_links`,
  );
}

export async function getBacklinks(targetId: string): Promise<BacklinkRow[]> {
  const db = getDb();
  return db.select<BacklinkRow[]>(
    `SELECT n.id, n.title, n.updated_at
       FROM note_links l
       JOIN notes n ON n.id = l.source_id
      WHERE l.target_id = ?
      ORDER BY n.updated_at DESC`,
    [targetId],
  );
}
