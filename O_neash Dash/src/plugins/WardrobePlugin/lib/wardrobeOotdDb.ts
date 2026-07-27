import { getDb } from '@/lib/db';

export interface OotdLogRow {
  id: string;
  date: string;
  item_ids: string;
  note: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

const gid = () => Math.random().toString(36).slice(2, 18);

export function parseItemIds(row: Pick<OotdLogRow, 'item_ids'>): string[] {
  if (!row.item_ids) return [];
  try {
    return JSON.parse(row.item_ids) as string[];
  } catch {
    return [];
  }
}

export async function getLogByDate(date: string): Promise<OotdLogRow | null> {
  const rows = await getDb().select<OotdLogRow[]>(
    `SELECT * FROM wardrobe_ootd_logs WHERE date = ?`,
    [date],
  );
  return rows[0] ?? null;
}

export async function loadLogsForMonth(year: number, month: number): Promise<OotdLogRow[]> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  const nextYear  = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const to = `${nextYear}-${pad(nextMonth)}-01`;
  return getDb().select<OotdLogRow[]>(
    `SELECT * FROM wardrobe_ootd_logs WHERE date >= ? AND date < ? ORDER BY date ASC`,
    [from, to],
  );
}

export async function upsertLog(
  date: string,
  itemIds: string[],
  note: string | null,
  photoPath: string | null,
): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO wardrobe_ootd_logs (id, date, item_ids, note, photo_path)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET item_ids = excluded.item_ids, note = excluded.note, photo_path = excluded.photo_path`,
    [gid(), date, JSON.stringify(itemIds), note, photoPath],
  );
}

export async function deleteLog(date: string): Promise<void> {
  await getDb().execute(`DELETE FROM wardrobe_ootd_logs WHERE date = ?`, [date]);
}
