import { getDb } from '@/lib/db';

export interface PkmCard {
  id: string;
  title: string | null;
  content_plain: string | null;
  content_json: string | null;
  status: 'active' | 'archived';
  arc_id: string | null;
  project_id: string | null;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

export interface PkmTag {
  id: string;
  name: string;
  color_hex: string | null;
}

const gid = () => Math.random().toString(36).slice(2, 18);

// ── Cards ────────────────────────────────────────────────────────────────────

export async function getCardById(id: string): Promise<PkmCard | null> {
  const rows = await getDb().select<PkmCard[]>(`SELECT * FROM pkm_cards WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function loadCards(): Promise<PkmCard[]> {
  const db = getDb();
  return db.select<PkmCard[]>(
    `SELECT * FROM pkm_cards WHERE status = 'active' ORDER BY updated_at DESC`,
  );
}

export async function loadArchivedCards(): Promise<PkmCard[]> {
  const db = getDb();
  return db.select<PkmCard[]>(
    `SELECT * FROM pkm_cards WHERE status = 'archived' ORDER BY updated_at DESC`,
  );
}

export async function createCard(
  data: Partial<Pick<PkmCard, 'title' | 'content_plain' | 'content_json' | 'arc_id' | 'project_id' | 'color_hex'>>,
): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(
    `INSERT INTO pkm_cards (id, title, content_plain, content_json, arc_id, project_id, color_hex)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.title ?? null, data.content_plain ?? null, data.content_json ?? null, data.arc_id ?? null, data.project_id ?? null, data.color_hex ?? null],
  );
  return id;
}

export async function updateCard(id: string, patch: Partial<Pick<PkmCard, 'title' | 'content_plain' | 'content_json' | 'arc_id' | 'project_id' | 'color_hex' | 'status'>>): Promise<void> {
  const db = getDb();
  const fields = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(patch), id];
  await db.execute(`UPDATE pkm_cards SET ${fields} WHERE id = ?`, values);
}

export async function deleteCard(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM pkm_cards WHERE id = ?`, [id]);
}

export async function archiveCard(id: string): Promise<void> {
  await updateCard(id, { status: 'archived' });
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

export async function syncCardLinks(sourceId: string, contentJson: string): Promise<void> {
  const db = getDb();
  const allCards = await loadCards();
  const titles = extractWikiLinks(contentJson);
  const titleMap = new Map(allCards.map(c => [(c.title ?? '').toLowerCase(), c.id]));
  const targetIds = [...new Set(
    titles
      .map(t => titleMap.get(t.toLowerCase()))
      .filter((id): id is string => !!id && id !== sourceId),
  )];
  await db.execute(`DELETE FROM pkm_card_links WHERE source_id = ?`, [sourceId]);
  for (const targetId of targetIds) {
    await db.execute(
      `INSERT OR IGNORE INTO pkm_card_links (source_id, target_id) VALUES (?, ?)`,
      [sourceId, targetId],
    );
  }
}

export interface CardBacklinkRow {
  id: string;
  title: string | null;
  updated_at: string;
}

export async function loadAllCardLinks(): Promise<{ source_id: string; target_id: string }[]> {
  const db = getDb();
  return db.select<{ source_id: string; target_id: string }[]>(
    `SELECT source_id, target_id FROM pkm_card_links`,
  );
}

export async function getCardBacklinks(targetId: string): Promise<CardBacklinkRow[]> {
  const db = getDb();
  return db.select<CardBacklinkRow[]>(
    `SELECT c.id, c.title, c.updated_at
       FROM pkm_card_links l
       JOIN pkm_cards c ON c.id = l.source_id
      WHERE l.target_id = ?
      ORDER BY c.updated_at DESC`,
    [targetId],
  );
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function loadTags(): Promise<PkmTag[]> {
  const db = getDb();
  return db.select<PkmTag[]>(`SELECT * FROM pkm_tags ORDER BY name ASC`);
}

export async function getOrCreateTag(name: string, colorHex?: string): Promise<PkmTag> {
  const db = getDb();
  const trimmed = name.trim();
  const existing = await db.select<PkmTag[]>(`SELECT * FROM pkm_tags WHERE name = ?`, [trimmed]);
  if (existing[0]) return existing[0];
  const id = gid();
  await db.execute(`INSERT INTO pkm_tags (id, name, color_hex) VALUES (?, ?, ?)`, [id, trimmed, colorHex ?? null]);
  return { id, name: trimmed, color_hex: colorHex ?? null };
}

export async function loadCardTags(cardId: string): Promise<PkmTag[]> {
  const db = getDb();
  return db.select<PkmTag[]>(
    `SELECT t.* FROM pkm_tags t
       JOIN pkm_card_tags ct ON ct.tag_id = t.id
      WHERE ct.card_id = ?
      ORDER BY t.name ASC`,
    [cardId],
  );
}

export async function setCardTags(cardId: string, tagIds: string[]): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM pkm_card_tags WHERE card_id = ?`, [cardId]);
  for (const tagId of tagIds) {
    await db.execute(`INSERT OR IGNORE INTO pkm_card_tags (card_id, tag_id) VALUES (?, ?)`, [cardId, tagId]);
  }
}

export async function loadCardIdsForTag(tagId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select<{ card_id: string }[]>(
    `SELECT card_id FROM pkm_card_tags WHERE tag_id = ?`,
    [tagId],
  );
  return rows.map(r => r.card_id);
}

// ── Whiteboards ──────────────────────────────────────────────────────────────

export interface PkmWhiteboard {
  id: string;
  name: string;
  arc_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function loadWhiteboards(): Promise<PkmWhiteboard[]> {
  const db = getDb();
  return db.select<PkmWhiteboard[]>(`SELECT * FROM pkm_whiteboards ORDER BY updated_at DESC`);
}

export async function createWhiteboard(name: string): Promise<string> {
  const db = getDb();
  const id = gid();
  await db.execute(`INSERT INTO pkm_whiteboards (id, name) VALUES (?, ?)`, [id, name]);
  return id;
}

export async function renameWhiteboard(id: string, name: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE pkm_whiteboards SET name = ? WHERE id = ?`, [name, id]);
}

export async function deleteWhiteboard(id: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM pkm_whiteboards WHERE id = ?`, [id]);
}

// ── Whiteboard card placement ─────────────────────────────────────────────────

export interface WhiteboardCardPlacement {
  card_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  title: string | null;
  content_plain: string | null;
  color_hex: string | null;
}

export async function loadWhiteboardCards(whiteboardId: string): Promise<WhiteboardCardPlacement[]> {
  const db = getDb();
  return db.select<WhiteboardCardPlacement[]>(
    `SELECT wc.card_id, wc.x, wc.y, wc.width, wc.height, wc.z_index,
            c.title, c.content_plain, c.color_hex
       FROM pkm_whiteboard_cards wc
       JOIN pkm_cards c ON c.id = wc.card_id
      WHERE wc.whiteboard_id = ?`,
    [whiteboardId],
  );
}

export async function placeCardOnWhiteboard(
  whiteboardId: string,
  cardId: string,
  pos: Partial<{ x: number; y: number; width: number; height: number }> = {},
): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT OR IGNORE INTO pkm_whiteboard_cards (whiteboard_id, card_id, x, y, width, height)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [whiteboardId, cardId, pos.x ?? 40, pos.y ?? 40, pos.width ?? 280, pos.height ?? 180],
  );
}

export async function updateCardPlacement(
  whiteboardId: string,
  cardId: string,
  patch: Partial<{ x: number; y: number; width: number; height: number; z_index: number }>,
): Promise<void> {
  const db = getDb();
  const fields = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  if (!fields) return;
  const values = [...Object.values(patch), whiteboardId, cardId];
  await db.execute(
    `UPDATE pkm_whiteboard_cards SET ${fields} WHERE whiteboard_id = ? AND card_id = ?`,
    values,
  );
}

export async function removeCardFromWhiteboard(whiteboardId: string, cardId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `DELETE FROM pkm_whiteboard_cards WHERE whiteboard_id = ? AND card_id = ?`,
    [whiteboardId, cardId],
  );
}

// ── Whiteboard edges (manual + auto wiki-link) ────────────────────────────────

export interface WhiteboardEdge {
  from_card_id: string;
  to_card_id: string;
  label: string | null;
  kind: 'wiki' | 'manual';
}

export async function loadWhiteboardEdges(whiteboardId: string): Promise<WhiteboardEdge[]> {
  const db = getDb();
  const manual = await db.select<{ from_card_id: string; to_card_id: string; label: string | null }[]>(
    `SELECT from_card_id, to_card_id, label FROM pkm_whiteboard_edges WHERE whiteboard_id = ?`,
    [whiteboardId],
  );
  const auto = await db.select<{ from_card_id: string; to_card_id: string }[]>(
    `SELECT l.source_id AS from_card_id, l.target_id AS to_card_id
       FROM pkm_card_links l
       JOIN pkm_whiteboard_cards wc1 ON wc1.card_id = l.source_id AND wc1.whiteboard_id = ?
       JOIN pkm_whiteboard_cards wc2 ON wc2.card_id = l.target_id AND wc2.whiteboard_id = ?`,
    [whiteboardId, whiteboardId],
  );
  return [
    ...manual.map(e => ({ ...e, kind: 'manual' as const })),
    ...auto.map(e => ({ ...e, label: null, kind: 'wiki' as const })),
  ];
}

export async function addManualEdge(whiteboardId: string, fromCardId: string, toCardId: string, label?: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT OR IGNORE INTO pkm_whiteboard_edges (whiteboard_id, from_card_id, to_card_id, label) VALUES (?, ?, ?, ?)`,
    [whiteboardId, fromCardId, toCardId, label ?? null],
  );
}

export async function removeManualEdge(whiteboardId: string, fromCardId: string, toCardId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `DELETE FROM pkm_whiteboard_edges WHERE whiteboard_id = ? AND from_card_id = ? AND to_card_id = ?`,
    [whiteboardId, fromCardId, toCardId],
  );
}
