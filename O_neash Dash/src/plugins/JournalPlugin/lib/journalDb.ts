import { getDb } from '@/lib/db';

export interface JournalEntry {
  id: string;
  date: string;      // YYYY-MM-DD
  content: string;
  images: string[];  // absolute paths
  created_at: string;
  updated_at: string;
}

type RawRow = Omit<JournalEntry, 'images'> & { images: string };

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parse(row: RawRow): JournalEntry {
  return { ...row, images: JSON.parse(row.images || '[]') };
}

export async function getAllEntries(): Promise<JournalEntry[]> {
  const db = getDb();
  const rows = await db.select<RawRow[]>(`SELECT * FROM journal_entries ORDER BY date DESC`);
  return rows.map(parse);
}

export async function getOrCreateEntry(date: string): Promise<JournalEntry> {
  const db = getDb();
  const rows = await db.select<RawRow[]>(`SELECT * FROM journal_entries WHERE date = ?`, [date]);
  if (rows.length > 0) return parse(rows[0]);
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO journal_entries (id, date, content, images) VALUES (?, ?, '', '[]')`,
    [id, date],
  );
  const fresh = await db.select<RawRow[]>(`SELECT * FROM journal_entries WHERE id = ?`, [id]);
  return parse(fresh[0]);
}

export async function updateEntry(id: string, content: string, images: string[]): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE journal_entries SET content = ?, images = ? WHERE id = ?`,
    [content, JSON.stringify(images), id],
  );
}

export async function deleteEntry(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM journal_entries WHERE id = ?`, [id]);
}

export async function searchEntries(query: string): Promise<JournalEntry[]> {
  const db = getDb();
  const q = `%${query}%`;
  const rows = await db.select<RawRow[]>(
    `SELECT * FROM journal_entries WHERE content LIKE ? OR date LIKE ? ORDER BY date DESC`,
    [q, q],
  );
  return rows.map(parse);
}

export async function getEntryDates(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select<{ date: string }[]>(`SELECT date FROM journal_entries ORDER BY date DESC`);
  return rows.map(r => r.date);
}

export async function getStreak(): Promise<number> {
  const dates = await getEntryDates();
  if (dates.length === 0) return 0;
  const set = new Set(dates);
  const cursor = new Date();
  if (!set.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (set.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
