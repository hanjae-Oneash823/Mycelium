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
