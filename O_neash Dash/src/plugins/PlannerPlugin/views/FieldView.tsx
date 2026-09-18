import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import { useArcVisibilityStore } from '../../../store/useArcVisibilityStore';
import { useFontStack } from '../../../lib/useFontStack';
import { isActiveArc } from '../types';
import type { PlannerNode, CreateNodeData } from '../types';
import DotTooltip from '../components/DotTooltip';
import TaskDetailPanel from '../components/TaskDetailPanel';
import {
  buildColumns, bucketColumn, seedParticle, tick, columnAt, bandAt, rowAt, TOP_BOUND, launchParticle,
} from '../lib/fieldPhysics';
import type { FieldColumn, FieldParticle } from '../lib/fieldPhysics';
import { draw } from '../lib/fieldRender';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#f59e0b';
const HIT_RADIUS = 16;

function findNodeAt(particles: FieldParticle[], x: number, y: number): FieldParticle | null {
  let best: FieldParticle | null = null;
  let bestDist = HIT_RADIUS;
  for (const p of particles) {
    if (p.opacity < 0.3) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function pagePos(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
}

const navBtn: CSSProperties = {
  background: 'none', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)',
  fontFamily: VT, fontSize: '1.1rem', letterSpacing: '1px',
  padding: '0.1rem 0.6rem', cursor: 'pointer', lineHeight: 1,
};

export default function FieldView() {
  const { nodes, arcs, updateNode, rescheduleNode, completeNode, deleteNode } = usePlannerStore();
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const toggleArc = useArcVisibilityStore(s => s.toggleArc);
  const openTaskForm = useViewStore(s => s.openTaskForm);
  const openTaskFormEdit = useViewStore(s => s.openTaskFormEdit);
  const taskFormOpen = useViewStore(s => s.taskFormOpen);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleMapRef = useRef<Map<string, FieldParticle>>(new Map());
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(true);

  const [futureOffset, setFutureOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ node: PlannerNode; x: number; y: number; isToday: boolean } | null>(null);
  const [tooltip, setTooltip] = useState<{ node: PlannerNode; x: number; y: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const now = new Date();
  const hasOverdue = useMemo(
    () => nodes.some(n => (n.is_overdue || n.is_missed_schedule) && !n.is_completed),
    [nodes],
  );
  const columns = useMemo<FieldColumn[]>(() => buildColumns(now, futureOffset, hasOverdue), [hasOverdue, futureOffset]);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const fontStack = useFontStack();

  // Mirror fast-changing values into refs so the RAF loop (mounted once, below) always reads fresh
  // state without restarting on every render — same pattern as NotesPlugin/GraphView.tsx.
  const nodesRef = useRef(nodes);               useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const columnsRef = useRef(columns);           useEffect(() => { columnsRef.current = columns; }, [columns]);
  const hiddenArcIdsRef = useRef(hiddenArcIds); useEffect(() => { hiddenArcIdsRef.current = hiddenArcIds; }, [hiddenArcIds]);
  const selectedIdRef = useRef(selectedId);     useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  const fontStackRef = useRef(fontStack);       useEffect(() => { fontStackRef.current = fontStack; }, [fontStack]);

  const hoverIdRef = useRef<string | null>(null);
  const hoverZoneRef = useRef(-1);
  const hoverBandRef = useRef(-1);
  const hoverCellZoneRef = useRef(-1);
  const hoverCellRowRef = useRef(-1);
  const cursorRef = useRef({ x: 0, y: 0, active: false });

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showStatus = (text: string) => {
    setStatus(text);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(null), 1800);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    // Re-bind to non-union-typed consts: TS narrowing from the checks above doesn't persist
    // into the nested closures below, even though these bindings can never become null again.
    const canvasEl: HTMLCanvasElement = canvas;
    const ctx: CanvasRenderingContext2D = ctx2d;
    runningRef.current = true;

    function reconcile(W: number, H: number) {
      const map = particleMapRef.current;
      const cols = columnsRef.current;
      const seen = new Set<string>();
      for (const node of nodesRef.current) {
        const colIndex = bucketColumn(node, cols);
        if (colIndex == null) continue;
        seen.add(node.id);
        const existing = map.get(node.id);
        if (existing) {
          existing.node = node;
        } else {
          map.set(node.id, seedParticle(node, colIndex, cols.length, W, H));
        }
      }
      for (const id of Array.from(map.keys())) {
        if (!seen.has(id)) map.delete(id);
      }
    }

    function frame() {
      if (!runningRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvasEl.clientWidth, H = canvasEl.clientHeight;
      if (W && H) {
        const pxW = Math.round(W * dpr), pxH = Math.round(H * dpr);
        if (canvasEl.width !== pxW || canvasEl.height !== pxH) { canvasEl.width = pxW; canvasEl.height = pxH; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        reconcile(W, H);
        const particles = Array.from(particleMapRef.current.values());
        tick(
          particles, columnsRef.current, hiddenArcIdsRef.current,
          selectedIdRef.current, W, H, reducedMotion,
        );
        draw(ctx, W, H, particles, {
          columns: columnsRef.current,
          hiddenArcIds: hiddenArcIdsRef.current,
          hoverNodeId: hoverIdRef.current,
          selectedNodeId: selectedIdRef.current,
          hoverZone: hoverZoneRef.current,
          hoverBand: hoverBandRef.current,
          hoverCellZone: hoverCellZoneRef.current,
          hoverCellRow: hoverCellRowRef.current,
          cursor: cursorRef.current,
          reducedMotion,
          fontStack: fontStackRef.current,
        });
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, rect } = pagePos(e, canvas);
    cursorRef.current = { x, y, active: true };
    const hit = findNodeAt(Array.from(particleMapRef.current.values()), x, y);
    hoverIdRef.current = hit ? hit.node.id : null;
    setTooltip(hit ? { node: hit.node, x: rect.left + hit.x, y: rect.top + hit.y } : null);
    if (y < TOP_BOUND) {
      hoverCellZoneRef.current = -1; hoverCellRowRef.current = -1;
    } else {
      hoverCellZoneRef.current = columnAt(x, canvas.clientWidth, columns.length);
      hoverCellRowRef.current = rowAt(y, canvas.clientHeight);
    }
    if (selectedId) {
      hoverZoneRef.current = columnAt(x, canvas.clientWidth, columns.length);
      hoverBandRef.current = bandAt(y, canvas.clientHeight) ?? -1;
      canvas.style.cursor = hit ? 'pointer' : 'crosshair';
    } else {
      hoverZoneRef.current = -1; hoverBandRef.current = -1;
      canvas.style.cursor = hit ? 'pointer' : 'default';
    }
  };

  const handlePointerLeave = () => {
    hoverIdRef.current = null;
    hoverZoneRef.current = -1;
    hoverBandRef.current = -1;
    hoverCellZoneRef.current = -1;
    hoverCellRowRef.current = -1;
    cursorRef.current = { ...cursorRef.current, active: false };
    setTooltip(null);
  };

  const commitMove = (particle: FieldParticle, zone: number, band: 0 | 1) => {
    const node = particle.node;
    const col = columns[zone];
    if (!col || col.isOverdue) return; // can't manually schedule into OOPS
    const dateStr = col.key;
    const pastDue = !!node.due_at && dateStr > node.due_at.slice(0, 10);
    let changed = false;
    if (!pastDue && node.planned_start_at?.slice(0, 10) !== dateStr) {
      rescheduleNode(node.id, dateStr);
      changed = true;
    }
    if (band !== node.importance_level) {
      updateNode(node.id, { importance_level: band });
      changed = true;
    }
    if (changed) {
      launchParticle(particle, performance.now());
      showStatus(`"${node.title}" → ${col.label}${band === 1 ? ' · marked important' : ' · marked normal'}`);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = pagePos(e, canvas);
    const hit = findNodeAt(Array.from(particleMapRef.current.values()), x, y);
    if (hit) {
      if (hit.node.is_locked || hit.node.is_routine) return; // still dblclick-able, just not movable
      setSelectedId(prev => (prev === hit.node.id ? null : hit.node.id));
      return;
    }
    if (selectedId) {
      const particle = particleMapRef.current.get(selectedId);
      if (particle) {
        const zone = columnAt(x, canvas.clientWidth, columns.length);
        const band = bandAt(y, canvas.clientHeight);
        if (band !== null) commitMove(particle, zone, band); // clicking the events row cancels the move
      }
      setSelectedId(null);
      hoverZoneRef.current = -1; hoverBandRef.current = -1;
      return;
    }
    if (y < TOP_BOUND) return; // header text area, not a placement region
    const col = columns[columnAt(x, canvas.clientWidth, columns.length)];
    if (!col || col.isOverdue) return;
    const band = bandAt(y, canvas.clientHeight);
    const defaults: Partial<CreateNodeData> = { planned_start_at: col.key };
    if (band === null) defaults.node_type = 'event';
    else defaults.importance_level = band;
    openTaskForm(defaults);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, rect } = pagePos(e, canvas);
    const hit = findNodeAt(Array.from(particleMapRef.current.values()), x, y);
    if (!hit) return;
    setSelectedId(null);
    const colIndex = bucketColumn(hit.node, columns);
    const isToday = colIndex != null && !!columns[colIndex]?.isToday;
    setDetail({ node: hit.node, x: rect.left + hit.x, y: rect.top, isToday });
    setTooltip(null);
  };

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: '1.5rem', padding: '0 1.2rem 0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button style={{ ...navBtn, opacity: futureOffset === 0 ? 0.25 : 1 }} disabled={futureOffset === 0} onClick={() => setFutureOffset(o => Math.max(0, o - 5))}>
            ‹ prev
          </button>
          <span style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', minWidth: 72, textAlign: 'center' }}>
            {futureOffset === 0 ? 'next 5 days' : `+${futureOffset + 1} – +${futureOffset + 5}`}
          </span>
          <button style={navBtn} onClick={() => setFutureOffset(o => o + 5)}>
            next ›
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 360, margin: '0 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'default', touchAction: 'none', display: 'block' }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
        <div style={{
          position: 'absolute', left: 14, bottom: 12, zIndex: 5,
          fontFamily: VT, fontSize: '0.78rem', letterSpacing: '0.3px', color: ACC,
          opacity: status ? 1 : 0, transition: 'opacity 0.4s ease', pointerEvents: 'none',
        }}>
          {status}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '0.75rem 1.2rem 0' }}>
        {arcs.filter(isActiveArc).map(arc => {
          const hidden = hiddenArcIds.includes(arc.id);
          return (
            <button
              key={arc.id}
              onClick={() => toggleArc(arc.id)}
              style={{
                fontFamily: VT, fontSize: '0.7rem', letterSpacing: '1px', textTransform: 'uppercase',
                background: 'none', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.8)',
                padding: '5px 11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                opacity: hidden ? 0.35 : 1, transition: 'opacity 0.15s ease',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: arc.color_hex, flexShrink: 0 }} />
              {arc.name}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '4px 1.2rem 0.5rem', fontFamily: VT, fontSize: '0.65rem', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
        click a node to select · click a box to move it · click empty space to add · dblclick to open · click an arc to dissolve
      </div>

      {tooltip && !detail && !taskFormOpen && (
        <DotTooltip node={tooltip.node} anchorX={tooltip.x} anchorY={tooltip.y} />
      )}
      {detail && !taskFormOpen && (
        <TaskDetailPanel
          node={detail.node}
          anchorX={detail.x}
          anchorY={detail.y}
          isToday={detail.isToday}
          onClose={() => setDetail(null)}
          onComplete={() => { completeNode(detail.node.id); setDetail(null); }}
          onEdit={() => { setDetail(null); openTaskFormEdit(detail.node); }}
          onDelete={() => { deleteNode(detail.node.id); setDetail(null); }}
        />
      )}
    </div>
  );
}
