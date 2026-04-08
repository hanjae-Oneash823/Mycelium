import { useEffect, useRef, useState, useCallback } from 'react';
import { loadNotes, loadAllLinks } from '../lib/notesDb';
import type { NoteRow } from '../lib/notesDb';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';

const FONT           = "'VT323', 'HBIOS-SYS', monospace";
const DAMPING        = 0.80;
const REPULSION      = 5500;
const SPRING_WIKI    = 0.04;
const SPRING_PROJECT = 0.022;
const REST_WIKI      = 150;
const REST_PROJECT   = 130;
const CENTER_K       = 0.008;
const DT             = 1.0;
const BASE_DOC_R     = 6;
const BASE_PROJ_R    = 10;
const LOG_SCALE      = 3.5;
const DRAG_THRESH    = 6;

// ── types ─────────────────────────────────────────────────────────────────────

interface GNode {
  id:    string;
  kind:  'doc' | 'project';
  label: string;
  color: string;
  r:     number;
  x: number; y: number;
  vx: number; vy: number;
  pinned: boolean;
}

interface GEdge {
  s:    string;
  t:    string;
  type: 'wiki' | 'project';
  color: string;
}

// ── force sim ────────────────────────────────────────────────────────────────

function tick(nodes: GNode[], edges: GEdge[], w: number, h: number) {
  const n   = nodes.length;
  const cx  = w / 2, cy = h / 2;
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));

  for (const nd of nodes) {
    if (nd.pinned) continue;
    nd.vx += (cx - nd.x) * CENTER_K;
    nd.vy += (cy - nd.y) * CENTER_K;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 1;
      const d  = Math.sqrt(d2);
      const f  = REPULSION / d2;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
      if (!b.pinned) { b.vx += fx; b.vy += fy; }
    }
  }

  for (const e of edges) {
    const ai = idx.get(e.s), bi = idx.get(e.t);
    if (ai == null || bi == null) continue;
    const a = nodes[ai], b = nodes[bi];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = e.type === 'wiki' ? REST_WIKI : REST_PROJECT;
    const k    = e.type === 'wiki' ? SPRING_WIKI : SPRING_PROJECT;
    const f    = (d - rest) * k;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  for (const nd of nodes) {
    if (nd.pinned) continue;
    nd.vx *= DAMPING; nd.vy *= DAMPING;
    nd.x  += nd.vx * DT; nd.y += nd.vy * DT;
    const pad = 40;
    nd.x = Math.max(pad, Math.min(w - pad, nd.x));
    nd.y = Math.max(pad, Math.min(h - pad, nd.y));
  }
}

// ── canvas draw ───────────────────────────────────────────────────────────────

function draw(
  ctx: CanvasRenderingContext2D,
  nodes: GNode[], edges: GEdge[],
  w: number, h: number,
  hoverId: string | null,
  scale: number, offX: number, offY: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // edges
  for (const e of edges) {
    const a = nodeMap.get(e.s), b = nodeMap.get(e.t);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = e.type === 'wiki'
      ? 'rgba(255,255,255,0.55)'
      : `${e.color}70`;
    ctx.lineWidth = e.type === 'wiki' ? 1.4 : 1.0;
    ctx.stroke();
  }

  // nodes
  for (const nd of nodes) {
    const hov = nd.id === hoverId;
    const { r } = nd;
    const isProj = nd.kind === 'project';

    // glow
    if (hov || isProj) {
      ctx.beginPath();
      if (isProj) {
        ctx.rect(nd.x - r - 5, nd.y - r - 5, (r + 5) * 2, (r + 5) * 2);
      } else {
        ctx.arc(nd.x, nd.y, r + 5, 0, Math.PI * 2);
      }
      ctx.fillStyle = `${nd.color}22`;
      ctx.fill();
    }

    // body
    ctx.beginPath();
    if (isProj) {
      ctx.rect(nd.x - r, nd.y - r, r * 2, r * 2);
    } else {
      ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle   = hov ? '#fff' : nd.color;
    ctx.globalAlpha = hov ? 1 : isProj ? 0.88 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;

    // label: always for projects, only on hover for docs
    if (hov || isProj) {
      const txt  = nd.label.length > 26 ? nd.label.slice(0, 25) + '…' : nd.label;
      const size = isProj ? 15 : 13;
      ctx.font      = `${size}px VT323, monospace`;
      ctx.fillStyle = hov ? '#fff' : `${nd.color}cc`;
      ctx.fillText(txt, nd.x + r + 5, nd.y + 5);
    }
  }

  ctx.restore();
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toWorld(sx: number, sy: number, scale: number, offX: number, offY: number) {
  return { x: (sx - offX) / scale, y: (sy - offY) / scale };
}

function hitTest(nodes: GNode[], wx: number, wy: number): GNode | null {
  for (const nd of nodes) {
    const pad = nd.r + 6;
    if (Math.abs(nd.x - wx) < pad && Math.abs(nd.y - wy) < pad) return nd;
  }
  return null;
}

// ── GraphView ─────────────────────────────────────────────────────────────────

interface GraphViewProps {
  onOpenDoc: (doc: NoteRow) => void;
}

export default function GraphView({ onOpenDoc }: GraphViewProps) {
  const { arcs, projects, loadAll } = usePlannerStore();
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const nodesRef   = useRef<GNode[]>([]);
  const edgesRef   = useRef<GEdge[]>([]);
  const docsRef    = useRef<NoteRow[]>([]);
  const rafRef     = useRef<number>(0);
  const runningRef = useRef(true);

  const hoverRef        = useRef<string | null>(null);
  const dragRef         = useRef<{ node: GNode; ox: number; oy: number } | null>(null);
  const panRef          = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const scaleRef        = useRef(1);
  const offRef          = useRef({ x: 0, y: 0 });
  const sizeRef         = useRef({ w: 800, h: 600 });

  const [hoverLabel, setHoverLabel] = useState<{ x: number; y: number; label: string } | null>(null);
  const [ready, setReady]           = useState(false);

  // arcs that actually appear in the graph (for legend)
  const [legendArcs, setLegendArcs] = useState<{ name: string; color: string }[]>([]);

  useEffect(() => { loadAll(); }, []);

  // ── load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!arcs.length && !projects.length) return;
    (async () => {
      const docs  = await loadNotes('document');
      const links = await loadAllLinks();
      docsRef.current = docs;

      const { w, h } = sizeRef.current;

      // which projects actually have docs assigned
      const usedProjectIds = new Set(docs.map(d => d.project_id).filter(Boolean) as string[]);

      // build raw edges first for link-count sizing
      const docSet = new Set(docs.map(d => d.id));

      const projEdgesRaw: GEdge[] = docs
        .filter(d => d.project_id && usedProjectIds.has(d.project_id))
        .map(d => {
          const proj = projects.find(p => p.id === d.project_id);
          const arc  = proj?.arc_id ? arcs.find(a => a.id === proj.arc_id) : null;
          return {
            s: d.id, t: `proj:${d.project_id}`,
            type: 'project' as const,
            color: arc?.color_hex ?? 'rgba(255,255,255,0.5)',
          };
        });

      const wikiEdgesRaw: GEdge[] = links
        .filter(l => docSet.has(l.source_id) && docSet.has(l.target_id))
        .map(l => ({ s: l.source_id, t: l.target_id, type: 'wiki' as const, color: '#fff' }));

      const allEdges = [...projEdgesRaw, ...wikiEdgesRaw];

      const linkCount = new Map<string, number>();
      for (const e of allEdges) {
        linkCount.set(e.s, (linkCount.get(e.s) ?? 0) + 1);
        linkCount.set(e.t, (linkCount.get(e.t) ?? 0) + 1);
      }

      const nodeR = (id: string, base: number) =>
        base + Math.log1p(linkCount.get(id) ?? 0) * LOG_SCALE;

      // project nodes (squares)
      const projNodes: GNode[] = projects
        .filter(p => usedProjectIds.has(p.id))
        .map(p => {
          const arc = p.arc_id ? arcs.find(a => a.id === p.arc_id) : null;
          return {
            id: `proj:${p.id}`, kind: 'project', label: p.name,
            color: arc?.color_hex ?? 'rgba(255,255,255,0.5)',
            r: nodeR(`proj:${p.id}`, BASE_PROJ_R),
            x: w / 2 + (Math.random() - 0.5) * 200,
            y: h / 2 + (Math.random() - 0.5) * 200,
            vx: 0, vy: 0, pinned: false,
          };
        });

      // doc nodes (circles)
      const docNodes: GNode[] = docs.map(d => {
        const arc = d.arc_id ? arcs.find(a => a.id === d.arc_id) : null;
        return {
          id: d.id, kind: 'doc', label: d.title ?? 'untitled',
          color: arc?.color_hex ?? 'rgba(255,255,255,0.55)',
          r: nodeR(d.id, BASE_DOC_R),
          x: w / 2 + (Math.random() - 0.5) * 300,
          y: h / 2 + (Math.random() - 0.5) * 300,
          vx: 0, vy: 0, pinned: false,
        };
      });

      nodesRef.current = [...projNodes, ...docNodes];
      edgesRef.current = allEdges;

      // legend: arcs that have at least one doc
      const usedArcIds = new Set(docs.map(d => d.arc_id).filter(Boolean));
      setLegendArcs(
        arcs
          .filter(a => usedArcIds.has(a.id))
          .map(a => ({ name: a.name, color: a.color_hex }))
      );

      setReady(true);
    })();
  }, [arcs, projects]);

  // ── animation loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    runningRef.current = true;
    let frame = 0;

    const loop = () => {
      if (!runningRef.current) return;
      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext('2d');
      if (!canvas || !ctx) { rafRef.current = requestAnimationFrame(loop); return; }
      const { w, h } = sizeRef.current;
      frame++;
      if (frame < 400 || frame % 2 === 0) {
        tick(nodesRef.current, edgesRef.current, w, h);
      }
      draw(ctx, nodesRef.current, edgesRef.current, w, h,
           hoverRef.current, scaleRef.current, offRef.current.x, offRef.current.y);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { runningRef.current = false; cancelAnimationFrame(rafRef.current); };
  }, [ready]);

  // ── resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      sizeRef.current = { w, h };
      if (canvasRef.current) { canvasRef.current.width = w; canvasRef.current.height = h; }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── mouse events ────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    if (dragRef.current) {
      const { node, ox, oy } = dragRef.current;
      const w = toWorld(sx, sy, scaleRef.current, offRef.current.x, offRef.current.y);
      node.x = w.x + ox; node.y = w.y + oy;
      node.vx = 0; node.vy = 0;
      return;
    }
    if (panRef.current) {
      const { sx: psx, sy: psy, ox, oy } = panRef.current;
      offRef.current = { x: ox + (sx - psx), y: oy + (sy - psy) };
      return;
    }

    const w   = toWorld(sx, sy, scaleRef.current, offRef.current.x, offRef.current.y);
    const hit = hitTest(nodesRef.current, w.x, w.y);
    hoverRef.current = hit?.id ?? null;
    setHoverLabel(hit ? { x: e.clientX + 12, y: e.clientY - 8, label: hit.label } : null);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    const w   = toWorld(sx, sy, scaleRef.current, offRef.current.x, offRef.current.y);
    const hit = hitTest(nodesRef.current, w.x, w.y);
    if (hit) {
      hit.pinned = true;
      dragRef.current = { node: hit, ox: hit.x - w.x, oy: hit.y - w.y };
    } else if (e.button === 0) {
      panRef.current = { sx, sy, ox: offRef.current.x, oy: offRef.current.y };
    }
  }, []);

  const onMouseUp = useCallback(() => {
    if (dragRef.current) { dragRef.current.node.pinned = false; dragRef.current = null; }
    panRef.current = null;
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    const down = mouseDownPosRef.current;
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESH) return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w   = toWorld(sx, sy, scaleRef.current, offRef.current.x, offRef.current.y);
    const hit = hitTest(nodesRef.current, w.x, w.y);
    if (hit?.kind === 'doc') {
      const doc = docsRef.current.find(d => d.id === hit.id);
      if (doc) onOpenDoc(doc);
    }
  }, [onOpenDoc]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect     = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta    = e.deltaY > 0 ? 0.92 : 1.09;
    const oldScale = scaleRef.current;
    const newScale = Math.max(0.25, Math.min(4, oldScale * delta));
    offRef.current = {
      x: mx - (mx - offRef.current.x) * (newScale / oldScale),
      y: my - (my - offRef.current.y) * (newScale / oldScale),
    };
    scaleRef.current = newScale;
  }, []);

  const onMouseLeave = useCallback(() => {
    hoverRef.current = null;
    setHoverLabel(null);
    dragRef.current  = null;
    panRef.current   = null;
  }, []);

  const wikiCount = edgesRef.current.filter(e => e.type === 'wiki').length;
  const docCount  = nodesRef.current.filter(n => n.kind === 'doc').length;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: hoverLabel ? 'pointer' : 'default' }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onClick}
        onWheel={onWheel}
        onMouseLeave={onMouseLeave}
      />

      {/* hover tooltip */}
      {hoverLabel && (
        <div style={{
          position: 'fixed', left: hoverLabel.x, top: hoverLabel.y,
          fontFamily: FONT, fontSize: '1rem', letterSpacing: 1,
          color: '#fff', background: 'rgba(0,0,0,0.82)',
          border: '1px solid rgba(255,255,255,0.18)',
          padding: '2px 10px',
          pointerEvents: 'none', zIndex: 100,
        }}>
          {hoverLabel.label}
        </div>
      )}

      {/* arc legend — left middle */}
      {legendArcs.length > 0 && (
        <div style={{
          position: 'absolute', left: 28, top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: '0.35rem',
          pointerEvents: 'none',
        }}>
          {legendArcs.map(a => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: 8, height: 8, flexShrink: 0,
                background: a.color,
                opacity: 0.75,
              }} />
              <span style={{
                fontFamily: FONT, fontSize: '1rem', letterSpacing: 1.5,
                color: `${a.color}bb`,
              }}>
                {a.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* bottom legend */}
      <div style={{
        position: 'absolute', bottom: 22, left: 28,
        fontFamily: FONT, fontSize: '0.88rem', letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.22)',
        display: 'flex', flexDirection: 'column', gap: 3,
        pointerEvents: 'none',
      }}>
        <div>{docCount} docs  ·  {wikiCount} wiki links</div>
        <div>scroll to zoom  ·  drag to pan  ·  click doc to open</div>
      </div>

      {ready && wikiCount === 0 && (
        <div style={{
          position: 'absolute', top: 28, right: 32,
          fontFamily: FONT, fontSize: '0.9rem', letterSpacing: 1,
          color: 'rgba(255,255,255,0.18)',
          pointerEvents: 'none', textAlign: 'right', lineHeight: 1.5,
        }}>
          no wiki-links yet<br />
          use [[doc title]] in the editor to link notes
        </div>
      )}
    </div>
  );
}
