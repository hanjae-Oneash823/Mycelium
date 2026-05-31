import { getDb } from '../../../lib/db';

export interface AcademicCanvas {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

export interface CanvasNode {
  canvas_id: string;
  node_id: string;
  day: string;
  x_slot: number;
  is_deadline: number;
}

export interface CanvasEdge {
  canvas_id: string;
  from_node_id: string;
  to_node_id: string;
}

export async function loadCanvases(projectId: string): Promise<AcademicCanvas[]> {
  return getDb().select('SELECT * FROM academic_canvases WHERE project_id = ? ORDER BY created_at', [projectId]);
}

export async function createCanvas(projectId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().execute('INSERT INTO academic_canvases (id, project_id, name) VALUES (?, ?, ?)', [id, projectId, name]);
  return id;
}

export async function deleteCanvas(canvasId: string): Promise<void> {
  await getDb().execute('DELETE FROM academic_canvases WHERE id = ?', [canvasId]);
}

export async function renameCanvas(canvasId: string, name: string): Promise<void> {
  await getDb().execute('UPDATE academic_canvases SET name = ? WHERE id = ?', [name, canvasId]);
}

export async function loadCanvasNodes(canvasId: string): Promise<CanvasNode[]> {
  return getDb().select('SELECT * FROM academic_canvas_nodes WHERE canvas_id = ?', [canvasId]);
}

export async function addNodeToCanvas(canvasId: string, nodeId: string, day: string, xSlot: number): Promise<void> {
  await getDb().execute(
    'INSERT OR REPLACE INTO academic_canvas_nodes (canvas_id, node_id, day, x_slot, is_deadline) VALUES (?, ?, ?, ?, 0)',
    [canvasId, nodeId, day, xSlot],
  );
}

export async function updateCanvasNodePosition(canvasId: string, nodeId: string, day: string, xSlot: number): Promise<void> {
  await getDb().execute(
    'UPDATE academic_canvas_nodes SET day = ?, x_slot = ? WHERE canvas_id = ? AND node_id = ?',
    [day, xSlot, canvasId, nodeId],
  );
}

export async function removeNodeFromCanvas(canvasId: string, nodeId: string): Promise<void> {
  const db = getDb();
  await db.execute('DELETE FROM academic_canvas_nodes WHERE canvas_id = ? AND node_id = ?', [canvasId, nodeId]);
  await db.execute(
    'DELETE FROM academic_canvas_edges WHERE canvas_id = ? AND (from_node_id = ? OR to_node_id = ?)',
    [canvasId, nodeId, nodeId],
  );
}

export async function setDeadlineNode(canvasId: string, nodeId: string | null): Promise<void> {
  const db = getDb();
  await db.execute('UPDATE academic_canvas_nodes SET is_deadline = 0 WHERE canvas_id = ?', [canvasId]);
  if (nodeId) {
    await db.execute('UPDATE academic_canvas_nodes SET is_deadline = 1 WHERE canvas_id = ? AND node_id = ?', [canvasId, nodeId]);
  }
}

export async function loadCanvasEdges(canvasId: string): Promise<CanvasEdge[]> {
  return getDb().select('SELECT * FROM academic_canvas_edges WHERE canvas_id = ?', [canvasId]);
}

export async function addCanvasEdge(canvasId: string, fromNodeId: string, toNodeId: string): Promise<void> {
  await getDb().execute(
    'INSERT OR IGNORE INTO academic_canvas_edges (canvas_id, from_node_id, to_node_id) VALUES (?, ?, ?)',
    [canvasId, fromNodeId, toNodeId],
  );
}

export async function removeCanvasEdge(canvasId: string, fromNodeId: string, toNodeId: string): Promise<void> {
  await getDb().execute(
    'DELETE FROM academic_canvas_edges WHERE canvas_id = ? AND from_node_id = ? AND to_node_id = ?',
    [canvasId, fromNodeId, toNodeId],
  );
}

export async function removeInvalidEdges(canvasId: string, nodePositions: Map<string, string>): Promise<void> {
  const edges: CanvasEdge[] = await getDb().select('SELECT * FROM academic_canvas_edges WHERE canvas_id = ?', [canvasId]);
  for (const edge of edges) {
    const fromDay = nodePositions.get(edge.from_node_id);
    const toDay = nodePositions.get(edge.to_node_id);
    if (fromDay && toDay && fromDay > toDay) {
      await getDb().execute(
        'DELETE FROM academic_canvas_edges WHERE canvas_id = ? AND from_node_id = ? AND to_node_id = ?',
        [canvasId, edge.from_node_id, edge.to_node_id],
      );
    }
  }
}
