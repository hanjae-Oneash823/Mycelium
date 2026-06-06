import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, Arc } from '../../ProjectsPlugin/lib/projectsDb';
import type { AcademicNode } from '../lib/academicDb';
import { updateNodePlannedDate } from '../lib/academicDb';
import {
  loadCanvases, loadCanvasNodes, loadCanvasEdges,
  updateCanvasNodePosition, removeNodeFromCanvas, removeInvalidEdges,
} from '../lib/canvasDb';
import type { AcademicCanvas, CanvasNode, CanvasEdge } from '../lib/canvasDb';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const DATE_COL_W = 92;
const NODE_W     = 148;
const NODE_H     = 52;
const NODE_GAP   = 10;
const NODE_VPAD  = 12;
const DATE_ROW_H = 38;
const COL_MIN_W  = 180;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

function buildDateRange(allCanvasNodes: CanvasNode[][]): string[] {
  const allDays = allCanvasNodes.flatMap(cn => cn.map(n => n.day));
  if (allDays.length === 0) {
    const days: string[] = [];
    for (let i = -2; i < 12; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      days.push(toLocalISO(d));
    }
    return days;
  }
  const sorted = [...allDays].sort();
  const start = new Date(sorted[0] + 'T00:00:00');
  const end   = new Date(sorted[sorted.length - 1] + 'T00:00:00');
  start.setDate(start.getDate() - 2);
  end.setDate(end.getDate() + 2);
  const result: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1))
    result.push(toLocalISO(cursor));
  return result;
}

interface CanvasColumn {
  canvas: AcademicCanvas;
  project: Project;
  arc: Arc | null;
  canvasNodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface DragState {
  nodeId: string;
  canvasId: string;
  fromDay: string;
  title: string;
  x: number;
  y: number;
}

interface Props {
  subjects: Project[];
  arcs: Arc[];
  nodeMap: Map<string, AcademicNode[]>;
  onBack: () => void;
  onRefresh: () => void;
}

export default function MultiCanvasView({ subjects, arcs, nodeMap, onBack, onRefresh }: Props) {
  const [columns,     setColumns]     = useState<CanvasColumn[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dragState,   setDragState]   = useState<DragState | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ canvasId: string; day: string } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const arcMap       = new Map(arcs.map(a => [a.id, a]));
  const today        = toLocalISO(new Date());
  const cellRefs     = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStateRef = useRef<DragState | null>(null);
  const columnsRef   = useRef<CanvasColumn[]>([]);

  useEffect(() => { columnsRef.current = columns; }, [columns]);

  const loadAll = useCallback(async () => {
    const cols: CanvasColumn[] = [];
    for (const project of subjects) {
      const canvases = await loadCanvases(project.id);
      for (const canvas of canvases) {
        const [canvasNodes, edges] = await Promise.all([
          loadCanvasNodes(canvas.id),
          loadCanvasEdges(canvas.id),
        ]);
        cols.push({
          canvas, project,
          arc: project.arc_id ? (arcMap.get(project.arc_id) ?? null) : null,
          canvasNodes, edges,
        });
      }
    }
    setColumns(cols);
    setLoading(false);
  }, [subjects]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  const reloadColumn = useCallback(async (canvasId: string) => {
    const [canvasNodes, edges] = await Promise.all([
      loadCanvasNodes(canvasId),
      loadCanvasEdges(canvasId),
    ]);
    setColumns(prev => prev.map(col =>
      col.canvas.id === canvasId ? { ...col, canvasNodes, edges } : col,
    ));
  }, []);

  const executeDrop = useCallback(async (
    nodeId: string, canvasId: string, fromDay: string, targetDay: string,
  ) => {
    if (fromDay === targetDay) return;
    const col = columnsRef.current.find(c => c.canvas.id === canvasId);
    if (!col) return;
    const xSlot = col.canvasNodes.filter(n => n.day === targetDay).length;
    await updateCanvasNodePosition(canvasId, nodeId, targetDay, xSlot);
    const node = (nodeMap.get(col.project.id) ?? []).find(n => n.id === nodeId);
    if (node?.node_type === 'task') {
      await updateNodePlannedDate(nodeId, targetDay);
      onRefresh();
    }
    const newPositions = new Map(
      col.canvasNodes.map(n => [n.node_id, n.node_id === nodeId ? targetDay : n.day]),
    );
    await removeInvalidEdges(canvasId, newPositions);
    await reloadColumn(canvasId);
  }, [nodeMap, reloadColumn, onRefresh]);

  // ── Drag listeners ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: MouseEvent) => {
      const next = { ...dragStateRef.current!, x: e.clientX, y: e.clientY };
      dragStateRef.current = next;
      setDragState(next);

      let found: { canvasId: string; day: string } | null = null;
      for (const [key, el] of cellRefs.current) {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const sep = key.indexOf(':');
          found = { canvasId: key.slice(0, sep), day: key.slice(sep + 1) };
          break;
        }
      }
      setDragOverCell(found);
    };

    const onUp = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      dragStateRef.current = null;
      setDragState(null);
      setDragOverCell(null);
      if (!ds) return;
      for (const [key, el] of cellRefs.current) {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const sep = key.indexOf(':');
          const canvasId = key.slice(0, sep);
          const day      = key.slice(sep + 1);
          if (canvasId === ds.canvasId && day !== ds.fromDay)
            executeDrop(ds.nodeId, canvasId, ds.fromDay, day);
          break;
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragState, executeDrop]);

  const startDrag = (
    e: React.MouseEvent, nodeId: string, canvasId: string,
    day: string, title: string, nodeType: string,
  ) => {
    if (nodeType !== 'task') return;
    e.preventDefault(); e.stopPropagation();
    const ds: DragState = { nodeId, canvasId, fromDay: day, title, x: e.clientX, y: e.clientY };
    dragStateRef.current = ds;
    setDragState(ds);
  };

  const handleRemoveNode = async (e: React.MouseEvent, nodeId: string, canvasId: string) => {
    e.stopPropagation();
    await removeNodeFromCanvas(canvasId, nodeId);
    await reloadColumn(canvasId);
  };

  const dateRange = buildDateRange(columns.map(c => c.canvasNodes));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '1rem 160px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2, color: 'rgba(255,255,255,0.25)', transition: 'color 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
          >
            ←
          </button>
          <span style={{ fontFamily: VT, fontSize: '2rem', letterSpacing: 4, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>
            ALL CANVASES
          </span>
          {!loading && (
            <span style={{ fontFamily: VT, fontSize: '0.8rem', letterSpacing: 2, color: 'rgba(255,255,255,0.18)', marginLeft: 2 }}>
              — {columns.length} active
            </span>
          )}
        </div>
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }} />
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: VT, color: 'rgba(255,255,255,0.15)', fontSize: '1rem', letterSpacing: 2 }}>
          loading...
        </div>
      )}

      {!loading && columns.length === 0 && (
        <div style={{ padding: '40px 160px', fontFamily: VT, fontSize: '0.95rem', letterSpacing: 2, color: 'rgba(255,255,255,0.1)' }}>
          no canvases found — create one inside a subject
        </div>
      )}

      {/* Grid */}
      {!loading && columns.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 160px 40px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `${DATE_COL_W}px repeat(${columns.length}, minmax(${COL_MIN_W}px, 1fr))`,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}>

            {/* ── Header row ── */}
            <div style={{ height: 56, borderBottom: '1px solid rgba(255,255,255,0.08)' }} />
            {columns.map(col => {
              const accentColor = col.arc?.color_hex ?? '#f59e0b';
              return (
                <div key={col.canvas.id} style={{
                  height: 56, padding: '0 14px',
                  borderLeft: '2px solid rgba(255,255,255,0.18)',
                  borderBottom: `1px solid ${accentColor}33`,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                }}>
                  <div style={{ fontFamily: VT, fontSize: '0.65rem', letterSpacing: 2, color: accentColor, opacity: 0.65, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {col.project.name}
                  </div>
                  <div style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 1, color: 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {col.canvas.name}
                  </div>
                </div>
              );
            })}

            {/* ── Date rows ── */}
            {dateRange.map(day => {
              const dow        = new Date(day + 'T00:00:00').getDay();
              const isToday    = day === today;
              const isWeekStart = dow === 0;
              const borderTop  = isWeekStart
                ? '2px solid rgba(245,200,66,0.5)'
                : '2px solid rgba(255,255,255,0.18)';

              return (
                <div key={day} style={{ display: 'contents' }}>

                  {/* Date label */}
                  <div style={{
                    minHeight: DATE_ROW_H,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    paddingRight: 10,
                    fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5,
                    color: isToday ? '#f59e0b' : dow === 0 ? '#f87171' : dow === 6 ? '#60a5fa' : 'rgba(255,255,255,0.35)',
                    borderTop,
                    background: isToday ? 'rgba(245,158,11,0.04)' : 'transparent',
                  }}>
                    {fmtDate(day)}
                  </div>

                  {/* Canvas cells */}
                  {columns.map(col => {
                    const cellKey    = `${col.canvas.id}:${day}`;
                    const accentColor = col.arc?.color_hex ?? '#f59e0b';
                    const bandNodes  = col.canvasNodes.filter(n => n.day === day).sort((a, b) => a.x_slot - b.x_slot);
                    const hasNodes   = bandNodes.length > 0;
                    const isDragOver = dragOverCell?.canvasId === col.canvas.id
                      && dragOverCell?.day === day
                      && dragState?.canvasId === col.canvas.id;
                    const projectNodes = nodeMap.get(col.project.id) ?? [];

                    return (
                      <div
                        key={cellKey}
                        ref={el => { if (el) cellRefs.current.set(cellKey, el); else cellRefs.current.delete(cellKey); }}
                        style={{
                          minHeight: DATE_ROW_H,
                          borderLeft: '2px solid rgba(255,255,255,0.18)',
                          borderTop,
                          background: isDragOver ? 'rgba(255,255,255,0.06)' : isToday ? 'rgba(245,158,11,0.02)' : 'transparent',
                          padding: hasNodes ? `${NODE_VPAD}px 12px` : 0,
                          display: 'flex', flexWrap: 'wrap', gap: NODE_GAP,
                          justifyContent: 'center',
                          alignContent: 'flex-start', alignItems: 'flex-start',
                          transition: 'background 0.08s',
                        }}
                      >
                        {bandNodes.map(cn => {
                          const node = projectNodes.find(n => n.id === cn.node_id);
                          if (!node) return null;
                          const isDraggingThis = dragState?.nodeId === cn.node_id;
                          const isHovered      = hoveredNode === cn.node_id;
                          const isCompleted    = node.is_completed ?? false;

                          return (
                            <div
                              key={cn.node_id}
                              className="canvas-drag-node"
                              onMouseDown={isCompleted ? undefined : e => startDrag(e, cn.node_id, col.canvas.id, day, node.title, node.node_type)}
                              onMouseEnter={() => { if (!dragState) setHoveredNode(cn.node_id); }}
                              onMouseLeave={() => setHoveredNode(null)}
                              style={{
                                width: NODE_W, height: NODE_H, flexShrink: 0,
                                padding: '8px 10px',
                                border: `1.5px solid ${isDraggingThis ? accentColor : isCompleted ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)'}`,
                                background: isDraggingThis ? 'rgba(255,255,255,0.04)' : '#1a1a1a',
                                cursor: isCompleted ? 'default' : node.node_type === 'task' ? 'grab' : 'default',
                                userSelect: 'none', position: 'relative',
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'center', alignItems: 'center',
                                transition: 'border-color 0.1s, background 0.1s',
                                opacity: isDraggingThis ? 0.4 : isCompleted ? 0.35 : 1,
                              }}
                            >
                              <div style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.8)', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                                {node.title}
                              </div>
                              <div style={{ fontFamily: VT, fontSize: '0.68rem', color: 'rgba(255,255,255,0.22)', marginTop: 2, letterSpacing: 1, textAlign: 'center' }}>
                                {node.node_type}
                              </div>
                              {isHovered && !dragState && (
                                <button
                                  onClick={e => handleRemoveNode(e, cn.node_id, col.canvas.id)}
                                  style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', fontFamily: VT, fontSize: '1rem', lineHeight: 1, color: 'rgba(255,255,255,0.2)', cursor: 'pointer', padding: 0 }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating drag ghost */}
      {dragState && (
        <div style={{
          position: 'fixed',
          left: dragState.x - NODE_W / 2,
          top: dragState.y - NODE_H / 2,
          width: NODE_W, height: NODE_H,
          padding: '8px 10px',
          border: `1px solid ${columns.find(c => c.canvas.id === dragState.canvasId)?.arc?.color_hex ?? '#f59e0b'}`,
          background: '#0a0a0a',
          fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5,
          color: 'rgba(255,255,255,0.9)',
          pointerEvents: 'none', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          boxShadow: `0 0 16px ${columns.find(c => c.canvas.id === dragState.canvasId)?.arc?.color_hex ?? '#f59e0b'}44`,
        }}>
          {dragState.title}
        </div>
      )}
    </div>
  );
}
