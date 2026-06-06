import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import type { AcademicNode } from '../lib/academicDb';
import { updateNodePlannedDate, loadDailyNodeCounts, type DailyNodeSummary } from '../lib/academicDb';
import {
  loadCanvasNodes, loadCanvasEdges,
  addNodeToCanvas, updateCanvasNodePosition, removeNodeFromCanvas,
  removeInvalidEdges, addCanvasEdge, removeCanvasEdge,
} from '../lib/canvasDb';
import type { CanvasNode, CanvasEdge, AcademicCanvas } from '../lib/canvasDb';

const VT = "'VT323', 'HBIOS-SYS', monospace";

const DATE_COL_W = 92;
const NODE_W     = 148;
const NODE_H     = 52;
const NODE_GAP   = 10;
const NODE_VPAD  = 12;
const DATE_ROW_H = 38;

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

function getDayRange(nodes: CanvasNode[]): string[] {
  if (nodes.length === 0) {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push(toLocalISO(d));
    }
    return days;
  }
  const sorted = nodes.map(n => n.day).sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const result: string[] = [];
  const cursor = new Date(min + 'T00:00:00');
  cursor.setDate(cursor.getDate() - 2);
  const end = new Date(max + 'T00:00:00');
  end.setDate(end.getDate() + 1);
  while (cursor <= end) {
    result.push(toLocalISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

interface DragState {
  nodeId: string;
  fromDay: string;
  title: string;
  x: number;
  y: number;
}

interface EdgePath {
  from: string;
  to: string;
  d: string;
}

interface Props {
  canvasId: string;
  nodes: AcademicNode[];
  accentColor: string;
  onRefresh?: () => void;
  canvases: AcademicCanvas[];
  selectedCanvasId: string;
  onSelectCanvas: (id: string) => void;
  creatingCanvas: boolean;
  newCanvasName: string;
  setNewCanvasName: (v: string) => void;
  setCreatingCanvas: (v: boolean) => void;
  onCreateCanvas: () => void;
  onViewAllCanvases: () => void;
}

export default function CanvasView({
  canvasId, nodes, accentColor, onRefresh,
  canvases, selectedCanvasId, onSelectCanvas,
  creatingCanvas, newCanvasName, setNewCanvasName, setCreatingCanvas, onCreateCanvas,
  onViewAllCanvases,
}: Props) {
  const [canvasNodes, setCanvasNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [edgePaths, setEdgePaths] = useState<EdgePath[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dailyCounts, setDailyCounts] = useState<Map<string, DailyNodeSummary>>(new Map());
  const [badgeTooltip, setBadgeTooltip] = useState<{ x: number; y: number; items: { title: string; node_type: string; arc_color: string }[] } | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null);

  const dayBandRefs    = useRef<Map<string, HTMLDivElement>>(new Map());
  const nodeCtnrRefs   = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStateRef   = useRef<DragState | null>(null);
  const canvasNodesRef = useRef<CanvasNode[]>([]);
  const nodeCardRefs   = useRef<Map<string, HTMLDivElement>>(new Map());
  const wrapperRef     = useRef<HTMLDivElement | null>(null);
  const scrollRef      = useRef<HTMLDivElement | null>(null);
  const contentRef     = useRef<HTMLDivElement | null>(null);
  const svgRef         = useRef<SVGSVGElement | null>(null);

  const reload = useCallback(async () => {
    if (!canvasId) { setLoading(false); return; }
    const [cn, ed] = await Promise.all([loadCanvasNodes(canvasId), loadCanvasEdges(canvasId)]);

    // Sync canvas row positions when planned_start_at was changed externally
    const updates: Promise<void>[] = [];
    for (const item of cn) {
      const node = nodes.find(n => n.id === item.node_id);
      if (!node) continue;
      const nodeDay = (node.planned_start_at || node.due_at)?.slice(0, 10);
      if (nodeDay && nodeDay !== item.day) {
        updates.push(updateCanvasNodePosition(canvasId, item.node_id, nodeDay, item.x_slot));
        item.day = nodeDay;
      }
    }
    if (updates.length > 0) await Promise.all(updates);

    setCanvasNodes(cn);
    canvasNodesRef.current = cn;
    setEdges(ed);
    setLoading(false);
  }, [canvasId, nodes]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { canvasNodesRef.current = canvasNodes; }, [canvasNodes]);

  // Recompute bezier paths — compute positions mathematically from container rects
  // to avoid timing issues with flex gap reflow changing individual node positions.
  const computePaths = useCallback(() => {
    if (!svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();

    const getX = (cn: CanvasNode, side: 'left' | 'center' | 'right'): number => {
      const cardEl = nodeCardRefs.current.get(cn.node_id);
      if (!cardEl) return 0;
      const r = cardEl.getBoundingClientRect();
      if (side === 'left') return r.left - svgRect.left;
      if (side === 'right') return r.right - svgRect.left;
      return r.left + r.width / 2 - svgRect.left;
    };

    const getY = (cn: CanvasNode, end: 'top' | 'bottom' | 'center'): number => {
      const cardEl = nodeCardRefs.current.get(cn.node_id);
      if (!cardEl) return 0;
      const r = cardEl.getBoundingClientRect();
      if (end === 'top') return r.top - svgRect.top;
      if (end === 'bottom') return r.bottom - svgRect.top;
      return r.top + r.height / 2 - svgRect.top;
    };

    const paths: EdgePath[] = [];
    for (const edge of edges) {
      const fromCN = canvasNodesRef.current.find(n => n.node_id === edge.from_node_id);
      const toCN   = canvasNodesRef.current.find(n => n.node_id === edge.to_node_id);
      if (!fromCN || !toCN) continue;

      let d: string;
      if (fromCN.day === toCN.day) {
        const x1 = getX(fromCN, 'right');
        const y1 = getY(fromCN, 'center');
        const x2 = getX(toCN, 'left');
        const y2 = getY(toCN, 'center');
        const cpx = (x2 - x1) * 0.5;
        d = `M ${x1} ${y1} C ${x1 + cpx} ${y1}, ${x2 - cpx} ${y2}, ${x2} ${y2}`;
      } else {
        const x1 = getX(fromCN, 'center');
        const y1 = getY(fromCN, 'bottom');
        const x2 = getX(toCN, 'center');
        const y2 = getY(toCN, 'top');
        const cpy = (y2 - y1) * 0.5;
        d = `M ${x1} ${y1} C ${x1} ${y1 + cpy}, ${x2} ${y2 - cpy}, ${x2} ${y2}`;
      }
      paths.push({ from: edge.from_node_id, to: edge.to_node_id, d });
    }
    setEdgePaths(paths);
  }, [edges]);

  useLayoutEffect(() => {
    computePaths();
  }, [computePaths, canvasNodes]);

  // Escape exits connect mode
  useEffect(() => {
    if (!connectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setConnectMode(false); setConnectSource(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [connectMode]);

  const executeDrop = useCallback(async (nodeId: string, fromDay: string, targetDay: string) => {
    if (fromDay === targetDay) return;
    const current = canvasNodesRef.current;
    const xSlot = current.filter(n => n.day === targetDay).length;
    await updateCanvasNodePosition(canvasId, nodeId, targetDay, xSlot);
    const droppedNode = nodes.find(n => n.id === nodeId);
    if (droppedNode?.node_type === 'task') {
      await updateNodePlannedDate(nodeId, targetDay);
      onRefresh?.();
    }
    const newPositions = new Map(current.map(n => [n.node_id, n.node_id === nodeId ? targetDay : n.day]));
    await removeInvalidEdges(canvasId, newPositions);
    await reload();
  }, [canvasId, nodes, onRefresh, reload]);

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: MouseEvent) => {
      const next = { ...dragStateRef.current!, x: e.clientX, y: e.clientY };
      dragStateRef.current = next;
      setDragState(next);
      let found: string | null = null;
      for (const [day, el] of dayBandRefs.current) {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          found = day; break;
        }
      }
      setDragOverDay(found);
    };

    const onUp = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      dragStateRef.current = null;
      setDragState(null);
      setDragOverDay(null);
      if (!ds) return;
      let targetDay: string | null = null;
      for (const [day, el] of dayBandRefs.current) {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          targetDay = day; break;
        }
      }
      if (targetDay && targetDay !== ds.fromDay) executeDrop(ds.nodeId, ds.fromDay, targetDay);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragState, executeDrop]);

  const startDrag = (e: React.MouseEvent, cn: CanvasNode, node: AcademicNode, day: string) => {
    if (node.node_type !== 'task' || connectMode) return;
    e.preventDefault();
    e.stopPropagation();
    const ds: DragState = { nodeId: cn.node_id, fromDay: day, title: node.title, x: e.clientX, y: e.clientY };
    dragStateRef.current = ds;
    setDragState(ds);
  };

  const handleRemoveNode = async (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    await removeNodeFromCanvas(canvasId, nodeId);
    await reload();
  };

  const handleNodeConnect = useCallback(async (nodeId: string, nodeDay: string) => {
    if (!connectSource) {
      setConnectSource(nodeId);
      return;
    }
    if (connectSource === nodeId) {
      setConnectSource(null);
      return;
    }
    const src = canvasNodesRef.current.find(cn => cn.node_id === connectSource);
    const tgt = canvasNodesRef.current.find(cn => cn.node_id === nodeId);
    if (!src || src.day > nodeDay) {
      setConnectSource(null);
      return;
    }
    // Same-day: always store edge left→right (lower x_slot → higher x_slot)
    let fromId = connectSource;
    let toId   = nodeId;
    if (src.day === nodeDay && tgt && src.x_slot > tgt.x_slot) {
      fromId = nodeId;
      toId   = connectSource;
    }
    await addCanvasEdge(canvasId, fromId, toId);
    setConnectSource(null);
    await reload();
  }, [connectSource, canvasId, reload]);

  const handleDeleteEdge = useCallback(async (fromId: string, toId: string) => {
    await removeCanvasEdge(canvasId, fromId, toId);
    setHoveredEdge(null);
    await reload();
  }, [canvasId, reload]);

  const dayRange = getDayRange(canvasNodes);

  useEffect(() => {
    if (dayRange.length === 0) return;
    loadDailyNodeCounts(dayRange).then(setDailyCounts).catch(() => {});
  }, [dayRange.join(',')]);

  const placedIds = new Set(canvasNodes.map(n => n.node_id));
  const unplaced  = nodes.filter(n => !placedIds.has(n.id) && !n.is_completed);
  const today     = toLocalISO(new Date());
  const noCanvas  = !canvasId;

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', gap: 12 }}>

      {/* ── Left column ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Canvas selector box */}
        <div style={{
          border: '1.5px solid rgba(255,255,255,0.28)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          padding: '14px 0 10px', flexShrink: 0,
        }}>
          <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', padding: '0 14px 10px' }}>
            canvases
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 10px' }}>
            {canvases.map(c => (
              <button
                key={c.id}
                onClick={() => onSelectCanvas(c.id)}
                style={{
                  background: selectedCanvasId === c.id ? 'rgba(255,255,255,0.06)' : 'none',
                  border: `1px solid ${selectedCanvasId === c.id ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}`,
                  fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1,
                  color: selectedCanvasId === c.id ? '#fff' : 'rgba(255,255,255,0.32)',
                  cursor: 'pointer', padding: '5px 10px', textAlign: 'left', transition: 'all 0.1s',
                }}
              >
                {c.name}
              </button>
            ))}
            {creatingCanvas ? (
              <input
                autoFocus
                value={newCanvasName}
                onChange={e => setNewCanvasName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onCreateCanvas();
                  if (e.key === 'Escape') { setCreatingCanvas(false); setNewCanvasName(''); }
                }}
                onBlur={() => { if (!newCanvasName.trim()) setCreatingCanvas(false); }}
                placeholder="canvas name..."
                style={{
                  background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${accentColor}77`, outline: 'none',
                  fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1,
                  color: 'rgba(255,255,255,0.75)', padding: '4px 4px', width: '100%',
                }}
              />
            ) : (
              <button
                onClick={() => setCreatingCanvas(true)}
                style={{
                  background: 'none', border: '1px dashed rgba(255,255,255,0.1)',
                  fontFamily: VT, fontSize: '0.78rem', letterSpacing: 1,
                  color: 'rgba(255,255,255,0.18)', cursor: 'pointer', padding: '4px 10px',
                  textAlign: 'left', transition: 'all 0.1s', marginTop: 2,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = accentColor; e.currentTarget.style.borderColor = `${accentColor}55`; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.18)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                + new canvas
              </button>
            )}
          </div>
        </div>

        {/* View all canvases */}
        <button
          onClick={onViewAllCanvases}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: VT, fontSize: '0.78rem', letterSpacing: 2,
            color: 'rgba(255,255,255,0.22)', cursor: 'pointer',
            padding: '7px 10px', width: '100%', textAlign: 'left',
            transition: 'all 0.1s', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = accentColor; e.currentTarget.style.borderColor = `${accentColor}55`; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.22)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          view all active canvases →
        </button>

        {/* Connect mode box */}
        <div style={{
          border: `1.5px solid ${connectMode ? `${accentColor}55` : 'rgba(255,255,255,0.28)'}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          padding: '14px 10px 10px', flexShrink: 0,
          transition: 'border-color 0.15s',
        }}>
          <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>
            connect
          </div>
          <button
            onClick={() => { setConnectMode(m => !m); setConnectSource(null); }}
            style={{
              background: connectMode ? `${accentColor}22` : 'none',
              border: `1px solid ${connectMode ? accentColor : 'rgba(255,255,255,0.12)'}`,
              fontFamily: VT, fontSize: '0.82rem', letterSpacing: 2,
              color: connectMode ? accentColor : 'rgba(255,255,255,0.28)',
              cursor: 'pointer', padding: '5px 10px',
              width: '100%', textAlign: 'center', transition: 'all 0.15s',
            }}
          >
            {connectMode ? 'exit connect' : 'connect mode'}
          </button>
        </div>

        {/* Unplaced nodes box */}
        <div style={{
          border: '1.5px solid rgba(255,255,255,0.28)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          padding: '14px 0', flex: 1,
        }}>
          <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', padding: '0 14px 10px' }}>
            unplaced — {unplaced.length}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px' }}>
            {unplaced.map(n => {
              const nodeDay = (n.planned_start_at || n.due_at)?.slice(0, 10) ?? toLocalISO(new Date());
              return (
                <div
                  key={n.id}
                  onClick={async () => {
                    const xSlot = canvasNodes.filter(cn => cn.day === nodeDay).length;
                    await addNodeToCanvas(canvasId, n.id, nodeDay, xSlot);
                    await reload();
                  }}
                  style={{
                    padding: '8px 10px', marginBottom: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5,
                    color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                    userSelect: 'none', transition: 'border-color 0.1s, color 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                >
                  <div style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{n.title}</div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.18)', marginTop: 2, letterSpacing: 1 }}>{n.node_type} · {nodeDay.slice(5).replace('-', '/')}</div>
                </div>
              );
            })}
            {unplaced.length === 0 && (
              <div style={{ fontFamily: VT, fontSize: '0.78rem', color: 'rgba(255,255,255,0.1)', letterSpacing: 1 }}>all placed</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div ref={wrapperRef} style={{
        flex: 1, position: 'relative', border: '1.5px solid rgba(255,255,255,0.28)', overflow: 'hidden',
        backgroundColor: '#080808',
      }}>


        {/* Scrollable rows */}
        <div
          ref={scrollRef}
          style={{ height: '100%', overflowY: 'auto' }}
          onClick={() => { if (connectMode && connectSource) setConnectSource(null); }}
        >
        <div ref={contentRef} style={{
          position: 'relative',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}>
          {(noCanvas || loading) && (
            <div style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.1)', letterSpacing: 2, padding: 40 }}>
              {loading ? 'loading...' : 'select or create a canvas'}
            </div>
          )}
          {!noCanvas && !loading && dayRange.map(day => {
            const bandNodes  = canvasNodes.filter(n => n.day === day).sort((a, b) => a.x_slot - b.x_slot);
            const hasNodes   = bandNodes.length > 0;
            const isToday    = day === today;
            const isDragOver = dragOverDay === day;
            const dow        = new Date(day + 'T00:00:00').getDay();
            const isWeekStart = dow === 0;
            const hasSameDayEdge = edges.some(e => {
              const fn = canvasNodes.find(n => n.node_id === e.from_node_id);
              const tn = canvasNodes.find(n => n.node_id === e.to_node_id);
              return fn?.day === day && tn?.day === day;
            });
            const rowGap = hasSameDayEdge ? 48 : NODE_GAP;

            return (
              <div
                key={day}
                ref={el => {
                  if (el) dayBandRefs.current.set(day, el);
                  else dayBandRefs.current.delete(day);
                }}
                style={{
                  display: 'flex',
                  minHeight: DATE_ROW_H,
                  borderTop: isDragOver
                    ? '1px solid rgba(255,255,255,0.35)'
                    : isWeekStart
                      ? '2px solid rgba(245,200,66,0.5)'
                      : '1px solid rgba(255,255,255,0.2)',
                  borderBottom: `1px solid ${isDragOver ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)'}`,
                  background: isDragOver ? 'rgba(255,255,255,0.06)' : 'transparent',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              >
                {/* Date label */}
                <div style={{
                  width: DATE_COL_W, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: VT, fontSize: '1rem', letterSpacing: 1,
                  color: isToday ? accentColor : dow === 0 ? '#f87171' : dow === 6 ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                }}>
                  {fmtDate(day)}
                </div>

                {/* Node cards */}
                {!hasNodes && <div style={{ flex: 1 }} />}
                {hasNodes && (
                  <div
                    ref={el => { if (el) nodeCtnrRefs.current.set(day, el); else nodeCtnrRefs.current.delete(day); }}
                    style={{
                      flex: 1, display: 'flex', flexWrap: 'wrap',
                      justifyContent: 'center', alignItems: 'flex-start', alignContent: 'flex-start',
                      gap: rowGap, padding: `${NODE_VPAD}px 12px`,
                    }}>
                    {bandNodes.map(cn => {
                      const node = nodes.find(n => n.id === cn.node_id);
                      if (!node) return null;
                      const isHovered      = hoveredNode === cn.node_id;
                      const isDraggingThis = dragState?.nodeId === cn.node_id;
                      const isSource       = connectSource === cn.node_id;
                      const isCompleted    = node.is_completed ?? false;

                      return (
                        <div
                          key={cn.node_id}
                          ref={el => {
                            if (el) nodeCardRefs.current.set(cn.node_id, el);
                            else nodeCardRefs.current.delete(cn.node_id);
                          }}
                          className="canvas-drag-node"
                          onMouseDown={isCompleted ? undefined : e => startDrag(e, cn, node, day)}
                          onClick={e => { e.stopPropagation(); if (connectMode) handleNodeConnect(cn.node_id, day); }}
                          onMouseEnter={() => { if (!dragState) setHoveredNode(cn.node_id); }}
                          onMouseLeave={() => setHoveredNode(null)}
                          style={{
                            width: NODE_W, height: NODE_H, flexShrink: 0,
                            padding: '8px 10px',
                            border: `1.5px solid ${isDraggingThis || isSource ? accentColor : isCompleted ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)'}`,
                            background: isDraggingThis ? 'rgba(255,255,255,0.04)' : '#1a1a1a',
                            boxShadow: isSource ? `0 0 10px ${accentColor}55` : 'none',
                            cursor: isCompleted ? 'default' : connectMode ? 'crosshair' : node.node_type === 'task' ? 'grab' : 'default',
                            userSelect: 'none', position: 'relative',
                            display: 'flex', flexDirection: 'column',
                            justifyContent: 'center', alignItems: 'center',
                            transition: 'border-color 0.1s, background 0.1s, box-shadow 0.1s',
                            opacity: isDraggingThis ? 0.4 : isCompleted ? 0.35 : 1,
                          }}
                        >
                          <div style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.8)', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                            {node.title}
                          </div>
                          <div style={{ fontFamily: VT, fontSize: '0.68rem', color: 'rgba(255,255,255,0.22)', marginTop: 2, letterSpacing: 1, textAlign: 'center' }}>
                            {node.node_type}
                          </div>
                          {isHovered && !dragState && !connectMode && (
                            <button
                              onClick={e => handleRemoveNode(e, cn.node_id)}
                              style={{
                                position: 'absolute', top: 4, right: 4,
                                background: 'none', border: 'none',
                                fontFamily: VT, fontSize: '1rem', lineHeight: 1,
                                color: 'rgba(255,255,255,0.2)', cursor: 'pointer', padding: 0,
                              }}
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
                )}

                {/* Daily count badge */}
                {(() => {
                  const summary = dailyCounts.get(day);
                  if (!summary || summary.count === 0) return null;
                  const { count, items } = summary;
                  const yellows = ['#fff9c4', '#fde968', '#f5c842', '#e6a817', '#c47f00', '#a06000'];
                  const bg = yellows[Math.min(count - 1, yellows.length - 1)];
                  return (
                    <div style={{ width: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <div
                        onMouseEnter={e => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setBadgeTooltip({ x: r.left + r.width / 2, y: r.top, items });
                        }}
                        onMouseLeave={() => setBadgeTooltip(null)}
                        style={{
                          width: 18, height: 18, background: bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: VT, fontSize: '0.95rem', lineHeight: 1, color: '#000', cursor: 'default',
                        }}
                      >
                        {count}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        {/* SVG edge overlay — inside content div, scrolls with nodes */}
        <svg
          ref={svgRef}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 5,
          }}
        >
          <defs>
            <marker id="canvas-edge-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse">
              <polyline points="0 0, 8 4, 0 8" fill="none" stroke="context-stroke" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {edgePaths.map(ep => {
            const isHov = hoveredEdge?.from === ep.from && hoveredEdge?.to === ep.to;
            return (
              <g key={`${ep.from}-${ep.to}`}>
                <path
                  d={ep.d}
                  stroke={isHov ? accentColor : `${accentColor}88`}
                  strokeWidth={isHov ? 3 : 2}
                  fill="none"
                  markerEnd="url(#canvas-edge-arrow)"
                />
                {/* Wide transparent hit target for clicking in connect mode */}
                {connectMode && (
                  <path
                    d={ep.d}
                    stroke="transparent"
                    strokeWidth={14}
                    fill="none"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredEdge({ from: ep.from, to: ep.to })}
                    onMouseLeave={() => setHoveredEdge(null)}
                    onClick={e => { e.stopPropagation(); handleDeleteEdge(ep.from, ep.to); }}
                  />
                )}
              </g>
            );
          })}
        </svg>
        </div> {/* end contentRef */}
        </div> {/* end scrollRef */}
      </div>

      {/* ── Badge tooltip ── */}
      {badgeTooltip && (
        <div style={{
          position: 'fixed', left: badgeTooltip.x, top: badgeTooltip.y - 8,
          transform: 'translate(-50%, -100%)',
          background: '#111', border: '1.5px solid rgba(255,255,255,0.28)',
          padding: '6px 10px', pointerEvents: 'none', zIndex: 9998,
          minWidth: 160, maxWidth: 280,
        }}>
          {badgeTooltip.items.map((item, i) => (
            <div key={i} style={{
              fontFamily: VT, fontSize: '0.85rem', letterSpacing: 0.5,
              lineHeight: 1.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>[{item.node_type}]</span>{' '}
              <span style={{ color: item.arc_color }}>{item.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Floating drag ghost ── */}
      {dragState && (
        <div style={{
          position: 'fixed',
          left: dragState.x - NODE_W / 2,
          top: dragState.y - NODE_H / 2,
          width: NODE_W, height: NODE_H,
          padding: '8px 10px',
          border: `1px solid ${accentColor}`,
          background: '#0a0a0a',
          fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5,
          color: 'rgba(255,255,255,0.9)',
          pointerEvents: 'none', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          boxShadow: `0 0 16px ${accentColor}44`,
        }}>
          {dragState.title}
        </div>
      )}
    </div>
  );
}
