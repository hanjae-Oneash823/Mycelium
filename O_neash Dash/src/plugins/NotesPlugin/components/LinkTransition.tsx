import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadNotes, loadAllLinks } from '../lib/notesDb';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';

// ── canvas / sim dimensions ───────────────────────────────────────────────────
const CW      = 480;   // circle diameter (px)
const CH      = 480;
const SW      = 920;   // simulation space
const SH      = 920;
const SETTLE  = 220;   // synchronous settle ticks
const PAN_MS  = 1000;  // pan animation duration (ms)

// ── physics constants (mirrors GraphView) ────────────────────────────────────
const DAMPING     = 0.82;
const REPULSION   = 6000;
const SPRING_WIKI = 0.038;
const SPRING_PROJ = 0.020;
const REST_WIKI   = 155;
const REST_PROJ   = 135;
const CENTER_K    = 0.009;
const DT          = 1.0;
const BASE_DOC_R  = 5;
const BASE_PROJ_R = 9;
const LOG_SCALE   = 3.2;

interface GNode {
  id:    string;
  kind:  'doc' | 'project';
  label: string;
  color: string;
  r:     number;
  x: number; y: number;
  vx: number; vy: number;
}
interface GEdge { s: string; t: string; type: 'wiki' | 'project'; }

// ── physics tick ─────────────────────────────────────────────────────────────
function tickSim(nodes: GNode[], edges: GEdge[]) {
  const cx = SW / 2, cy = SH / 2;
  for (const n of nodes) {
    n.vx += (cx - n.x) * CENTER_K;
    n.vy += (cy - n.y) * CENTER_K;
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 1;
      const d  = Math.sqrt(d2);
      const f  = REPULSION / d2;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  for (const e of edges) {
    const ai = idx.get(e.s), bi = idx.get(e.t);
    if (ai == null || bi == null) continue;
    const a = nodes[ai], b = nodes[bi];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = e.type === 'wiki' ? REST_WIKI : REST_PROJ;
    const k    = e.type === 'wiki' ? SPRING_WIKI : SPRING_PROJ;
    const f    = (d - rest) * k;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }
  for (const n of nodes) {
    n.vx *= DAMPING; n.vy *= DAMPING;
    n.x  += n.vx * DT;
    n.y  += n.vy * DT;
  }
}

// ── easing ───────────────────────────────────────────────────────────────────
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// ── canvas paint ─────────────────────────────────────────────────────────────
function paintMinimap(
  ctx:    CanvasRenderingContext2D,
  nodes:  GNode[],
  edges:  GEdge[],
  fromId: string,
  toId:   string,
  offX:   number,
  offY:   number,
) {
  ctx.clearRect(0, 0, CW, CH);

  // circular clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(CW / 2, CH / 2, CW / 2 - 1, 0, Math.PI * 2);
  ctx.clip();

  // dark background
  ctx.fillStyle = '#04060e';
  ctx.fillRect(0, 0, CW, CH);

  ctx.save();
  ctx.translate(offX, offY);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // edges
  for (const e of edges) {
    const a = nodeMap.get(e.s), b = nodeMap.get(e.t);
    if (!a || !b) continue;
    const toInvolved   = e.s === toId   || e.t === toId;
    const fromInvolved = e.s === fromId || e.t === fromId;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (toInvolved) {
      ctx.strokeStyle = 'rgba(0,196,167,0.55)';
      ctx.lineWidth   = 1.6;
    } else if (fromInvolved) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth   = 1.3;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth   = 0.7;
    }
    ctx.stroke();
  }

  // nodes
  for (const n of nodes) {
    const isFrom = n.id === fromId;
    const isTo   = n.id === toId;
    const isProj = n.kind === 'project';
    const { r }  = n;
    const fillColor = isFrom ? '#ffffff' : isTo ? '#00c4a7' : n.color;
    const alpha     = isFrom || isTo ? 1.0 : isProj ? 0.5 : 0.3;

    ctx.beginPath();
    if (isProj) ctx.rect(n.x - r, n.y - r, r * 2, r * 2);
    else        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = fillColor;
    ctx.fill();
    ctx.globalAlpha = 1;

    // label for origin / destination only
    if (isFrom || isTo) {
      const txt = n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label;
      ctx.font        = '14px VT323, monospace';
      ctx.fillStyle   = isTo ? '#00c4a7' : '#ffffff';
      ctx.globalAlpha = 0.88;
      ctx.fillText(txt, n.x + r + 6, n.y + 5);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  // vignette (darkens toward circle edge)
  const vg = ctx.createRadialGradient(CW / 2, CH / 2, CW / 3.2, CW / 2, CH / 2, CW / 2);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CW, CH);

  ctx.restore();
}

// ── helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── component ─────────────────────────────────────────────────────────────────
interface Props {
  fromDocId:  string;
  toDocId:    string;
  onComplete: () => void;
}

export default function LinkTransition({ fromDocId, toDocId, onComplete }: Props) {
  const { arcs, projects } = usePlannerStore();
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const nodesRef    = useRef<GNode[]>([]);
  const edgesRef    = useRef<GEdge[]>([]);
  const rafRef      = useRef<number>(0);

  const offRef      = useRef({ x: 0, y: 0 });
  const fromOffRef  = useRef({ x: 0, y: 0 });
  const toOffRef    = useRef({ x: 0, y: 0 });
  const panningRef  = useRef(false);
  const panStartRef = useRef(0);
  const panDoneRef  = useRef(false);

  // overlay is black immediately; circle fades in once graph is ready
  const [circleVis, setCircleVis] = useState<'hidden' | 'visible' | 'closing'>('hidden');

  // ── orchestration ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [docs, links] = await Promise.all([
          loadNotes('document'),
          loadAllLinks(),
        ]);
        if (cancelled) return;

        // build nodes & edges
        const docSet    = new Set(docs.map(d => d.id));
        const linkCount = new Map<string, number>();

        const wikiEdges: GEdge[] = links
          .filter(l => docSet.has(l.source_id) && docSet.has(l.target_id))
          .map(l => ({ s: l.source_id, t: l.target_id, type: 'wiki' as const }));

        const usedProjIds = new Set(docs.map(d => d.project_id).filter(Boolean) as string[]);
        const projEdges: GEdge[] = docs
          .filter(d => d.project_id && usedProjIds.has(d.project_id))
          .map(d => ({ s: d.id, t: `proj:${d.project_id}`, type: 'project' as const }));

        const allEdges = [...wikiEdges, ...projEdges];
        for (const e of allEdges) {
          linkCount.set(e.s, (linkCount.get(e.s) ?? 0) + 1);
          linkCount.set(e.t, (linkCount.get(e.t) ?? 0) + 1);
        }

        const nodeR = (id: string, base: number) =>
          base + Math.log1p(linkCount.get(id) ?? 0) * LOG_SCALE;

        const projNodes: GNode[] = projects
          .filter(p => usedProjIds.has(p.id))
          .map(p => {
            const arc = p.arc_id ? arcs.find(a => a.id === p.arc_id) : null;
            return {
              id: `proj:${p.id}`, kind: 'project' as const, label: p.name,
              color: arc?.color_hex ?? 'rgba(255,255,255,0.5)',
              r: nodeR(`proj:${p.id}`, BASE_PROJ_R),
              x: SW / 2 + (Math.random() - 0.5) * 320,
              y: SH / 2 + (Math.random() - 0.5) * 320,
              vx: 0, vy: 0,
            };
          });

        const docNodes: GNode[] = docs.map(d => {
          const arc = d.arc_id ? arcs.find(a => a.id === d.arc_id) : null;
          return {
            id: d.id, kind: 'doc' as const, label: d.title ?? 'untitled',
            color: arc?.color_hex ?? 'rgba(255,255,255,0.55)',
            r: nodeR(d.id, BASE_DOC_R),
            x: SW / 2 + (Math.random() - 0.5) * 320,
            y: SH / 2 + (Math.random() - 0.5) * 320,
            vx: 0, vy: 0,
          };
        });

        const nodes = [...projNodes, ...docNodes];

        // settle synchronously
        for (let i = 0; i < SETTLE; i++) tickSim(nodes, allEdges);

        nodesRef.current = nodes;
        edgesRef.current = allEdges;

        const fromNode = nodes.find(n => n.id === fromDocId);
        const toNode   = nodes.find(n => n.id === toDocId);

        fromOffRef.current = {
          x: CW / 2 - (fromNode?.x ?? SW / 2),
          y: CH / 2 - (fromNode?.y ?? SH / 2),
        };
        toOffRef.current = {
          x: CW / 2 - (toNode?.x ?? SW / 2),
          y: CH / 2 - (toNode?.y ?? SH / 2),
        };
        offRef.current = { ...fromOffRef.current };

        if (cancelled) return;

        // show circle
        setCircleVis('visible');

        // pause on origin node
        await sleep(440);
        if (cancelled) return;

        // start pan
        panStartRef.current = performance.now();
        panningRef.current  = true;

      } catch {
        // on any error skip the animation and navigate immediately
        if (!cancelled) onComplete();
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── render loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    const loop = (now: number) => {
      if (!active) return;

      // advance pan
      if (panningRef.current && !panDoneRef.current) {
        const t = Math.min(1, (now - panStartRef.current) / PAN_MS);
        const e = easeInOutCubic(t);
        offRef.current = {
          x: fromOffRef.current.x + (toOffRef.current.x - fromOffRef.current.x) * e,
          y: fromOffRef.current.y + (toOffRef.current.y - fromOffRef.current.y) * e,
        };

        if (t >= 1) {
          panDoneRef.current = true;
          panningRef.current = false;
          // exit: close circle → navigate
          setTimeout(() => {
            setCircleVis('closing');
            setTimeout(onComplete, 340);
          }, 180);
        }
      }

      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext('2d');
      if (canvas && ctx && nodesRef.current.length > 0) {
        paintMinimap(
          ctx, nodesRef.current, edgesRef.current,
          fromDocId, toDocId,
          offRef.current.x, offRef.current.y,
        );
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [onComplete, fromDocId, toDocId]);

  // ── render ─────────────────────────────────────────────────────────────────
  return createPortal(
    <div style={{
      position:       'fixed',
      inset:          0,
      zIndex:         9000,
      background:     'rgba(0,0,0,0.92)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      pointerEvents:  'all',
    }}>
      <div style={{
        width:      CW,
        height:     CH,
        borderRadius: '50%',
        overflow:   'hidden',
        flexShrink: 0,
        boxShadow:  '0 0 0 1px rgba(255,255,255,0.08)',
        opacity:    circleVis === 'visible' ? 1 : 0,
        transform:  circleVis === 'visible' ? 'scale(1)' : 'scale(0.88)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}>
        <canvas ref={canvasRef} width={CW} height={CH} />
      </div>
    </div>,
    document.body,
  );
}
