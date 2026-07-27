import { getDb } from '@/lib/db';
import type { ItemType } from './wardrobeItemTypes';

export type ItemStatus = 'active' | 'archived';

export interface WardrobeItemRow {
  id: string;
  name: string;
  item_type: ItemType;
  brand: string | null;
  purchase_date: string | null;
  image_path: string | null;
  sizing_json: string | null;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
}

export type SizingValues = Record<string, string>;

const gid = () => Math.random().toString(36).slice(2, 18);

export function parseSizing(row: Pick<WardrobeItemRow, 'sizing_json'>): SizingValues {
  if (!row.sizing_json) return {};
  try {
    return JSON.parse(row.sizing_json) as SizingValues;
  } catch {
    return {};
  }
}

export async function getItemById(id: string): Promise<WardrobeItemRow | null> {
  const rows = await getDb().select<WardrobeItemRow[]>(
    `SELECT * FROM wardrobe_items WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getItemsByIds(ids: string[]): Promise<WardrobeItemRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return getDb().select<WardrobeItemRow[]>(
    `SELECT * FROM wardrobe_items WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function loadItems(
  itemType?: ItemType,
  status: ItemStatus = 'active',
): Promise<WardrobeItemRow[]> {
  const db = getDb();
  if (itemType) {
    return db.select<WardrobeItemRow[]>(
      `SELECT * FROM wardrobe_items WHERE item_type = ? AND status = ? ORDER BY created_at DESC`,
      [itemType, status],
    );
  }
  return db.select<WardrobeItemRow[]>(
    `SELECT * FROM wardrobe_items WHERE status = ? ORDER BY created_at DESC`,
    [status],
  );
}

export async function createItem(data: {
  name: string;
  item_type: ItemType;
  brand: string | null;
  purchase_date: string | null;
  image_path: string | null;
  sizing: SizingValues;
}): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(
    `INSERT INTO wardrobe_items (id, name, item_type, brand, purchase_date, image_path, sizing_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.item_type, data.brand, data.purchase_date, data.image_path, JSON.stringify(data.sizing)],
  );
  return id;
}

export async function updateItem(
  id: string,
  patch: Partial<{
    name: string;
    item_type: ItemType;
    brand: string | null;
    purchase_date: string | null;
    image_path: string | null;
    sizing: SizingValues;
    status: ItemStatus;
  }>,
): Promise<void> {
  const db = getDb();
  const { sizing, ...rest } = patch;
  const fields: Record<string, unknown> = { ...rest };
  if (sizing !== undefined) fields.sizing_json = JSON.stringify(sizing);
  if (Object.keys(fields).length === 0) return;
  const setClause = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  await db.execute(`UPDATE wardrobe_items SET ${setClause} WHERE id = ?`, [...Object.values(fields), id]);
}

export async function deleteItem(id: string): Promise<void> {
  await getDb().execute(`DELETE FROM wardrobe_items WHERE id = ?`, [id]);
}
