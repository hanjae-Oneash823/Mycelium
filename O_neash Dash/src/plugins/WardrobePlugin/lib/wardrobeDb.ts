import { getDb } from '@/lib/db';

export type WikiCategory = 'genre' | 'brand' | 'clothing_type';

export interface WikiEntryRow {
  id: string;
  category: WikiCategory;
  title: string;
  content_plain: string | null;
  content_json: string | null;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
}

const gid = () => Math.random().toString(36).slice(2, 18);

export async function getEntryById(id: string): Promise<WikiEntryRow | null> {
  const rows = await getDb().select<WikiEntryRow[]>(
    `SELECT * FROM wardrobe_wiki_entries WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

export async function loadEntries(category?: WikiCategory): Promise<WikiEntryRow[]> {
  const db = getDb();
  if (category) {
    return db.select<WikiEntryRow[]>(
      `SELECT * FROM wardrobe_wiki_entries WHERE category = ? ORDER BY updated_at DESC`,
      [category],
    );
  }
  return db.select<WikiEntryRow[]>(
    `SELECT * FROM wardrobe_wiki_entries ORDER BY updated_at DESC`,
  );
}

export async function createEntry(
  data: Pick<WikiEntryRow, 'category' | 'title' | 'content_plain' | 'content_json'>,
): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(
    `INSERT INTO wardrobe_wiki_entries (id, category, title, content_plain, content_json)
     VALUES (?, ?, ?, ?, ?)`,
    [id, data.category, data.title, data.content_plain ?? null, data.content_json ?? null],
  );
  return id;
}

export async function updateEntry(
  id: string,
  patch: Partial<Pick<WikiEntryRow, 'category' | 'title' | 'content_plain' | 'content_json' | 'cover_image'>>,
): Promise<void> {
  const db = getDb();
  const fields = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(patch), id];
  await db.execute(`UPDATE wardrobe_wiki_entries SET ${fields} WHERE id = ?`, values);
}

export async function deleteEntry(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM wardrobe_wiki_entries WHERE id = ?`, [id]);
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
  const allEntries = await loadEntries();
  const titles = extractWikiLinks(contentJson);
  const titleMap = new Map(allEntries.map(e => [e.title.toLowerCase(), e.id]));
  const targetIds = [...new Set(
    titles
      .map(t => titleMap.get(t.toLowerCase()))
      .filter((id): id is string => !!id && id !== sourceId),
  )];
  await db.execute(`DELETE FROM wardrobe_wiki_links WHERE source_id = ?`, [sourceId]);
  for (const targetId of targetIds) {
    await db.execute(
      `INSERT OR IGNORE INTO wardrobe_wiki_links (source_id, target_id) VALUES (?, ?)`,
      [sourceId, targetId],
    );
  }
}

export interface BacklinkRow {
  id: string;
  title: string;
  category: WikiCategory;
  updated_at: string;
}

export async function getBacklinks(targetId: string): Promise<BacklinkRow[]> {
  const db = getDb();
  return db.select<BacklinkRow[]>(
    `SELECT e.id, e.title, e.category, e.updated_at
       FROM wardrobe_wiki_links l
       JOIN wardrobe_wiki_entries e ON e.id = l.source_id
      WHERE l.target_id = ?
      ORDER BY e.updated_at DESC`,
    [targetId],
  );
}

// ── Gallery ───────────────────────────────────────────────────────────────────

export interface GalleryImageRow {
  id: string;
  entry_id: string;
  image_path: string;
  note: string | null;
  sort_order: number;
  created_at: string;
}

export async function loadGalleryImages(entryId: string): Promise<GalleryImageRow[]> {
  const db = getDb();
  return db.select<GalleryImageRow[]>(
    `SELECT * FROM wardrobe_wiki_gallery_images WHERE entry_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [entryId],
  );
}

export async function addGalleryImage(entryId: string, imagePath: string): Promise<string> {
  const db = getDb();
  const id = gid();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM wardrobe_wiki_gallery_images WHERE entry_id = ?`,
    [entryId],
  );
  const sortOrder = rows[0]?.n ?? 0;
  await db.execute(
    `INSERT INTO wardrobe_wiki_gallery_images (id, entry_id, image_path, sort_order) VALUES (?, ?, ?, ?)`,
    [id, entryId, imagePath, sortOrder],
  );
  return id;
}

export async function updateGalleryImageNote(id: string, note: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE wardrobe_wiki_gallery_images SET note = ? WHERE id = ?`, [note, id]);
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM wardrobe_wiki_gallery_images WHERE id = ?`, [id]);
}
