import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Presentation, Radio, Gps, Grid2x22 } from "pixelarticons/react";
import { ChevronLeft }  from "pixelarticons/react/ChevronLeft";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { ChevronUp } from "pixelarticons/react/ChevronUp";
import { ChevronDown } from "pixelarticons/react/ChevronDown";
import { usePlannerStore } from "../store/usePlannerStore";
import { useViewStore } from "../store/useViewStore";
import {
  formatDueLabel,
  formatEffortLabel,
  isSameDay,
} from "../lib/logicEngine";
import type { PlannerNode, Arc, Project, PlannerGroup } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "tree" | "detail";
type ArcFilter = "current" | "all";

interface ScopeItem {
  type: "all" | "arc" | "project" | "group";
  id: string;
  label: string;
  color: string;
  arcId?: string;
  arcLabel?: string;
}

interface PhysNode {
  id: string;
  type: "root" | "arc" | "project" | "group" | "groups-hub";
  label: string;
  color: string;
  taskCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  phase: number;
  parentId?: string;
  scope: ScopeItem | null; // null = unclickable
}

interface FieldRanges {
  dayMin:     number; // always 0 — past/today tasks are clamped to rightmost (urgent)
  dayMax:     number; // furthest future task in days
  impHrsMin:  number; // min effort among important tasks
  impHrsMax:  number;
  noHrsMin:   number; // min effort among unimportant tasks
  noHrsMax:   number;
  sizeHrsMin: number; // min effort across all tasks (for dot sizing)
  sizeHrsMax: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isCurrentArc(_arc: Arc, _today: string): boolean {
  return true;
}

function daysUntil(dateStr: string, now: Date): number {
  const normalized = dateStr.length === 10 ? dateStr + "T12:00:00" : dateStr;
  return (new Date(normalized).getTime() - now.getTime()) / 86400000;
}

/** Deterministic jitter from task ID — stable across re-renders */
function idJitter(id: string, range: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++)
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return ((h & 0xffff) / 0xffff - 0.5) * range;
}

/** Compute min/max ranges from the active (unfinished) task set */
function computeFieldRanges(active: PlannerNode[], now: Date): FieldRanges {
  const hrs = (n: PlannerNode) => (n.estimated_duration_minutes ?? 60) / 60;

  const dated = active.filter(n => n.planned_start_at);
  const allDays = dated.map(n => daysUntil(n.planned_start_at!, now));

  const imp   = active.filter(n => n.importance_level === 1).map(hrs);
  const noImp = active.filter(n => n.importance_level !== 1).map(hrs);
  const all   = active.map(hrs);

  return {
    dayMin:     0,
    dayMax:     allDays.length ? Math.min(10, Math.max(1, Math.max(...allDays))) : 10,
    impHrsMin:  imp.length   ? Math.min(...imp)   : 0,
    impHrsMax:  imp.length   ? Math.max(...imp)   : 8,
    noHrsMin:   noImp.length ? Math.min(...noImp) : 0,
    noHrsMax:   noImp.length ? Math.max(...noImp) : 8,
    sizeHrsMin: all.length   ? Math.min(...all)   : 0,
    sizeHrsMax: all.length   ? Math.max(...all)   : 8,
  };
}

const MARGIN = 0.06; // dead space at each grid edge — dots won't reach within 6% of any border

/** X axis: linear map from the dataset's day range. Only uses planned_start_at (when-to-do). */
function fieldX(node: PlannerNode, now: Date, ranges: FieldRanges): number {
  if (!node.planned_start_at)
    return MARGIN * 0.4 + idJitter(node.id, 0.015);

  const days = daysUntil(node.planned_start_at, now);
  const span = Math.max(ranges.dayMax, 1);
  const norm = Math.min(1, Math.max(0, days / span)); // days<=0 → norm=0 → rightmost (urgent)
  const x = (1 - MARGIN) - norm * (1 - 2 * MARGIN);
  return Math.min(1 - MARGIN, Math.max(MARGIN, x + idJitter(node.id, 0.02)));
}

/** Y axis: normalized within each importance half. Dead zone 0.45–0.55, edge margins MARGIN. */
function fieldY(node: PlannerNode, ranges: FieldRanges): number {
  const hrs = (node.estimated_duration_minutes ?? 60) / 60;
  const imp = node.importance_level === 1;

  if (imp) {
    const span = Math.max(ranges.impHrsMax - ranges.impHrsMin, 0.1);
    const norm = Math.min(1, Math.max(0, (hrs - ranges.impHrsMin) / span));
    // Map to [0.55, 1-MARGIN]
    const base = 0.55 + norm * (1 - MARGIN - 0.55);
    return Math.min(1 - MARGIN, Math.max(0.55, base + idJitter(node.id + 'y', 0.02)));
  } else {
    const span = Math.max(ranges.noHrsMax - ranges.noHrsMin, 0.1);
    const norm = Math.min(1, Math.max(0, (hrs - ranges.noHrsMin) / span));
    // Map to [MARGIN, 0.45]
    const base = MARGIN + norm * (0.45 - MARGIN);
    return Math.min(0.45, Math.max(MARGIN, base + idJitter(node.id + 'y', 0.02)));
  }
}

/** Dot radius: linear scale across the dataset's effort range. */
function dotRadius(node: PlannerNode, ranges: FieldRanges): number {
  const hrs  = (node.estimated_duration_minutes ?? 60) / 60;
  const span = Math.max(ranges.sizeHrsMax - ranges.sizeHrsMin, 0.1);
  const norm = Math.min(1, Math.max(0, (hrs - ranges.sizeHrsMin) / span));
  return 5 + norm * 21; // 5 → 26
}

function nodeArcColor(
  node: PlannerNode,
  arcs: Arc[],
  projects: Project[],
): string {
  if (node.arc_id) {
    const arc = arcs.find((a) => a.id === node.arc_id);
    if (arc) return arc.color_hex;
  }
  if (node.project_id) {
    const proj = projects.find((p) => p.id === node.project_id);
    if (proj?.arc_id) {
      const arc = arcs.find((a) => a.id === proj.arc_id);
      if (arc) return arc.color_hex;
    }
  }
  const g = node.groups?.find((grp) => !grp.is_ungrouped);
  if (g) return g.color_hex;
  return "#3dbfbf";
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex || hex.length < 7) return `rgba(100,100,100,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}

function nodeRadius(n: PhysNode): number {
  if (n.type === "root") return 22;
  if (n.type === "groups-hub") return 18;
  if (n.type === "arc")
    return Math.max(14, Math.min(30, 12 + n.taskCount * 0.75));
  if (n.type === "project")
    return Math.max(9, Math.min(20, 8 + n.taskCount * 0.5));
  return 10;
}

// ── NodeTreeCanvas ────────────────────────────────────────────────────────────

const ALL_WX = -280; // world X for ALL node
const GHUB_WX = 280; // world X for GROUPS hub

function NodeTreeCanvas({
  arcs,
  projects,
  groups,
  nodes,
  onSelectScope,
  arcFilter,
}: {
  arcs: Arc[];
  projects: Project[];
  groups: PlannerGroup[];
  nodes: PlannerNode[];
  onSelectScope: (scope: ScopeItem) => void;
  arcFilter: ArcFilter;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const physNodes = useRef<PhysNode[]>([]);
  const pan = useRef({ x: 0, y: 0 });
  const zoom = useRef(1.05);
  const hovId = useRef<string | null>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);
  const dragStart = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const hasDragged = useRef(false);

  // Build physics nodes
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pending = nodes.filter((n) => !n.is_completed);
    const arcPending = (id: string) =>
      pending.filter((n) => n.arc_id === id).length;
    const projPending = (id: string) =>
      pending.filter((n) => n.project_id === id).length;
    const groupPending = (id: string) =>
      pending.filter((n) => n.groups?.some((g) => g.id === id)).length;

    const filteredArcs =
      arcFilter === "current"
        ? arcs.filter((a) => isCurrentArc(a, today))
        : arcs;

    const next: PhysNode[] = [];

    // ALL root — left side
    next.push({
      id: "__root__",
      type: "root",
      label: "ALL",
      color: "#ffffff",
      taskCount: pending.length,
      x: ALL_WX,
      y: 0,
      vx: 0,
      vy: 0,
      tx: ALL_WX,
      ty: 0,
      phase: 0,
      scope: {
        type: "all",
        id: "__all__",
        label: "all tasks",
        color: "#ffffff",
      },
    });

    // Arcs orbit ALL
    filteredArcs.forEach((arc, i) => {
      const angle =
        -Math.PI / 2 + (i / Math.max(filteredArcs.length, 1)) * 2 * Math.PI;
      const tx = ALL_WX + Math.cos(angle) * 175;
      const ty = Math.sin(angle) * 175;
      next.push({
        id: arc.id,
        type: "arc",
        label: arc.name,
        color: arc.color_hex,
        taskCount: arcPending(arc.id),
        x: tx + (Math.random() - 0.5) * 30,
        y: ty + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        tx,
        ty,
        phase: Math.random() * Math.PI * 2,
        scope: {
          type: "arc",
          id: arc.id,
          label: arc.name,
          color: arc.color_hex,
        },
      });

      const arcProjs = projects.filter((p) => p.arc_id === arc.id);
      arcProjs.forEach((proj, j) => {
        const spread = Math.min(Math.PI * 0.65, arcProjs.length * 0.32);
        const fanOffset =
          arcProjs.length > 1
            ? (j / (arcProjs.length - 1) - 0.5) * spread * 2
            : 0;
        const pAngle = angle + fanOffset;
        const ptx = tx + Math.cos(pAngle) * 120;
        const pty = ty + Math.sin(pAngle) * 120;
        next.push({
          id: proj.id,
          type: "project",
          label: proj.name,
          color: arc.color_hex,
          taskCount: projPending(proj.id),
          x: ptx + (Math.random() - 0.5) * 20,
          y: pty + (Math.random() - 0.5) * 20,
          vx: 0,
          vy: 0,
          tx: ptx,
          ty: pty,
          phase: Math.random() * Math.PI * 2,
          parentId: arc.id,
          scope: {
            type: "project",
            id: proj.id,
            label: proj.name,
            color: arc.color_hex,
            arcId: arc.id,
            arcLabel: arc.name,
          },
        });
      });
    });

    // Orphan projects (no arc)
    projects
      .filter((p) => !p.arc_id)
      .forEach((proj, i) => {
        const angle = Math.PI / 2 + (i - 0.5) * 0.4;
        const ptx = ALL_WX + Math.cos(angle) * 160;
        const pty = Math.sin(angle) * 160;
        next.push({
          id: proj.id,
          type: "project",
          label: proj.name,
          color: "#888",
          taskCount: projPending(proj.id),
          x: ptx,
          y: pty,
          vx: 0,
          vy: 0,
          tx: ptx,
          ty: pty,
          phase: Math.random() * Math.PI * 2,
          scope: {
            type: "project",
            id: proj.id,
            label: proj.name,
            color: "#888",
          },
        });
      });

    // GROUPS hub — right side (unclickable)
    const visGroups = groups.filter((g) => !g.is_ungrouped);
    next.push({
      id: "__groups_hub__",
      type: "groups-hub",
      label: "GROUPS",
      color: "#aaaaaa",
      taskCount: 0,
      x: GHUB_WX,
      y: 0,
      vx: 0,
      vy: 0,
      tx: GHUB_WX,
      ty: 0,
      phase: 0.5,
      scope: null,
    });

    // Group nodes orbit the hub
    visGroups.forEach((g, i) => {
      const angle =
        -Math.PI / 2 + (i / Math.max(visGroups.length, 1)) * 2 * Math.PI;
      const gtx = GHUB_WX + Math.cos(angle) * 90;
      const gty = Math.sin(angle) * 90;
      next.push({
        id: g.id,
        type: "group",
        label: g.name,
        color: g.color_hex,
        taskCount: groupPending(g.id),
        x: gtx + (Math.random() - 0.5) * 20,
        y: gty + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        tx: gtx,
        ty: gty,
        phase: Math.random() * Math.PI * 2,
        parentId: "__groups_hub__",
        scope: { type: "group", id: g.id, label: g.name, color: g.color_hex },
      });
    });

    physNodes.current = next;
  }, [arcs, projects, groups, nodes, arcFilter]);

  // Animation loop
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const W = container.clientWidth;
      const H = container.clientHeight;
      const cx = W / 2 + pan.current.x;
      const cy = H / 2 + pan.current.y;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(cx, cy);
      ctx.scale(zoom.current, zoom.current);

      const t = timeRef.current;
      timeRef.current += 0.016;
      const pnodes = physNodes.current;

      // Physics
      for (const n of pnodes) {
        const fx = Math.cos(t * 0.28 + n.phase * 1.4) * 3.5;
        const fy = Math.sin(t * 0.45 + n.phase) * 4.5;
        n.vx = n.vx * 0.78 + (n.tx + fx - n.x) * 0.055;
        n.vy = n.vy * 0.78 + (n.ty + fy - n.y) * 0.055;
        n.x += n.vx;
        n.y += n.vy;
      }

      // Connections: ALL → arcs
      const root = pnodes.find((n) => n.id === "__root__");
      const ghub = pnodes.find((n) => n.id === "__groups_hub__");

      if (root) {
        for (const n of pnodes.filter((n) => n.type === "arc")) {
          ctx.beginPath();
          ctx.moveTo(root.x, root.y);
          ctx.lineTo(n.x, n.y);
          ctx.strokeStyle =
            n.id === hovId.current
              ? hexWithAlpha(n.color, 0.4)
              : "rgba(255,255,255,0.07)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Arc → projects
      for (const n of pnodes.filter(
        (n) =>
          n.type === "project" && n.parentId && n.parentId !== "__groups_hub__",
      )) {
        const par = pnodes.find((p) => p.id === n.parentId);
        if (!par) continue;
        ctx.beginPath();
        ctx.moveTo(par.x, par.y);
        ctx.lineTo(n.x, n.y);
        ctx.strokeStyle =
          n.id === hovId.current || par.id === hovId.current
            ? hexWithAlpha(par.color, 0.32)
            : "rgba(255,255,255,0.045)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Groups hub → group nodes
      if (ghub) {
        for (const n of pnodes.filter((n) => n.type === "group")) {
          ctx.beginPath();
          ctx.moveTo(ghub.x, ghub.y);
          ctx.lineTo(n.x, n.y);
          ctx.strokeStyle =
            n.id === hovId.current
              ? hexWithAlpha(n.color, 0.4)
              : "rgba(255,255,255,0.07)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Draw nodes
      for (const n of pnodes) {
        const hov = n.id === hovId.current && n.scope !== null;
        const anyHov = hovId.current !== null;
        const greyed = anyHov && !hov;
        const r = nodeRadius(n);

        // Glow on hover
        if (hov) {
          const grd = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 16);
          grd.addColorStop(0, hexWithAlpha(n.color, 0.28));
          grd.addColorStop(1, "transparent");
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 16, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // Node fill — grey out non-hovered nodes when any node is hovered
        const fillAlpha =
          n.type === "project" ? 0.45 : n.type === "groups-hub" ? 0.35 : 0.78;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = greyed
          ? "rgba(80,80,80,0.45)"
          : hov
            ? n.color
            : hexWithAlpha(n.color, fillAlpha);
        ctx.fill();

        // Ring on root / groups-hub
        if (n.type === "root" || n.type === "groups-hub") {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        // Task count badge (inside circle)
        if (n.taskCount > 0 && n.type !== "root") {
          ctx.fillStyle = greyed ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)";
          const numSize =
            n.type === "arc" ? Math.max(14, r * 1.05) : Math.max(12, r * 0.85);
          ctx.font = `${numSize}px "VT323", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(n.taskCount), n.x, n.y);
        } else if (n.type === "root") {
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          ctx.font = '12px "VT323", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("ALL", n.x, n.y);
        } else if (n.type === "groups-hub") {
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.font = '10px "VT323", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("◈", n.x, n.y);
        }

        // Label below node — grey out when not hovered
        const labelColor = greyed
          ? "rgba(100,100,100,0.5)"
          : hov
            ? "#ffffff"
            : n.type === "arc"
              ? hexWithAlpha(n.color, 0.95)
              : n.type === "groups-hub"
                ? "rgba(255,255,255,0.7)"
                : n.type === "project"
                  ? hexWithAlpha(n.color, 0.8)
                  : "rgba(255,255,255,0.92)";
        ctx.fillStyle = labelColor;
        const labelSize =
          n.type === "arc"
            ? 17
            : n.type === "root" || n.type === "groups-hub"
              ? 16
              : 15;
        ctx.font = `${labelSize}px "VT323", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        wrapText(ctx, n.label, n.x, n.y + r + 7, 90, labelSize + 2);
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const sync = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  const worldCoords = useCallback((mx: number, my: number) => {
    const container = containerRef.current!;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const cx = W / 2 + pan.current.x;
    const cy = H / 2 + pan.current.y;
    return { wx: (mx - cx) / zoom.current, wy: (my - cy) / zoom.current };
  }, []);

  const nodeAtMouse = useCallback(
    (mx: number, my: number): PhysNode | null => {
      const { wx, wy } = worldCoords(mx, my);
      let best: PhysNode | null = null;
      let minD = Infinity;
      for (const n of physNodes.current) {
        if (!n.scope) continue; // skip unclickable
        const d = Math.hypot(n.x - wx, n.y - wy);
        if (d < nodeRadius(n) + 10 && d < minD) {
          minD = d;
          best = n;
        }
      }
      return best;
    },
    [worldCoords],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (isDragging.current) {
        const dx = mx - dragStart.current.x;
        const dy = my - dragStart.current.y;
        if (Math.hypot(dx, dy) > 4) hasDragged.current = true;
        pan.current.x += dx;
        pan.current.y += dy;
        dragStart.current = { x: mx, y: my };
        return;
      }
      const n = nodeAtMouse(mx, my);
      hovId.current = n?.id ?? null;
      canvasRef.current!.style.cursor = n ? "pointer" : "grab";
    },
    [nodeAtMouse],
  );

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    isDragging.current = true;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (hasDragged.current) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const n = nodeAtMouse(e.clientX - rect.left, e.clientY - rect.top);
      if (n?.scope) onSelectScope(n.scope);
    },
    [nodeAtMouse, onSelectScope],
  );

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    zoom.current = Math.max(
      0.3,
      Math.min(2.8, zoom.current * (e.deltaY > 0 ? 0.9 : 1.11)),
    );
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: "grab" }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onClick}
        onWheel={onWheel}
      />
    </div>
  );
}

const PAD = { l: 104, r: 80, t: 60, b: 60 } as const;

function formatSnapDate(date: Date, now: Date): string {
  const diffDays = Math.round((date.getTime() - now.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  const mo  = (date.getMonth() + 1).toString().padStart(2, '0');
  const da  = date.getDate().toString().padStart(2, '0');
  return `${dow} ${mo}/${da}`;
}

interface DragState {
  dotId:             string;
  dot:               FieldDot;
  originMx:          number;
  originMy:          number;
  dotPx:             number;
  dotPy:             number;
  axis:              'h' | 'v' | null;
  guideAlpha:        number;
  hasMoved:          boolean;
  snapTargets:       Array<{ dateStr: string; px: number; label: string }>;
  snappedDateStr:    string | null;
  snappedPx:         number | null;
  snappedLabel:      string | null;
  dueDatePx:         number | null;
  crossedCenter:     boolean;
  newImportance:     0 | 1 | null;
  currentPx:         number;
  currentPy:         number;
  originalDateStr:   string | null;
  originalImportance: 0 | 1;
}

// ── FieldCanvas ───────────────────────────────────────────────────────────────

interface FieldDot {
  node: PlannerNode;
  fx: number;
  fy: number;
  r: number;
  color: string;
}

function FieldCanvas({
  nodes,
  allNodes,
  arcs,
  projects,
  hoveredNodeId,
  onHover,
  onUpdate,
  now,
}: {
  nodes: PlannerNode[];
  allNodes: PlannerNode[];
  arcs: Arc[];
  projects: Project[];
  hoveredNodeId: string | null;
  onHover: (id: string | null) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  now: Date;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animStartRef = useRef<number | null>(null);
  const animRafRef = useRef(0);
  const wiggleTimeRef = useRef(0);
  const wiggleRafRef = useRef(0);
  const hoveredQuadRef = useRef<number | null>(null);
  const drawFrameRef = useRef<() => void>(() => {});
  const labelWidthsRef = useRef<number[]>([0, 0, 0, 0]);
  const rangesRef = useRef<FieldRanges>({ dayMin: 0, dayMax: 14, impHrsMin: 0, impHrsMax: 8, noHrsMin: 0, noHrsMax: 8, sizeHrsMin: 0, sizeHrsMax: 8 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    yBelow: number;
    title: string;
    sub: string;
  } | null>(null);

  const dragStateRef = useRef<DragState | null>(null);
  const [overrides, setOverrides] = useState<Map<string, Partial<PlannerNode>>>(new Map());
  const [isDragging, setIsDragging] = useState(false);

  const dots = useMemo<FieldDot[]>(() => {
    const active = nodes.filter((n) => !n.is_completed && !(n.planned_start_at && daysUntil(n.planned_start_at, now) > 10));
    const ranges = computeFieldRanges(allNodes.filter((n) => !n.is_completed && !(n.planned_start_at && daysUntil(n.planned_start_at, now) > 10)), now);
    rangesRef.current = ranges;
    return active.map((node) => {
      const ov = overrides.get(node.id);
      const effective = ov ? { ...node, ...ov } : node;
      return {
        node: effective,
        fx: fieldX(effective, now, ranges),
        fy: fieldY(effective, ranges),
        r:  dotRadius(effective, ranges),
        color: nodeArcColor(node, arcs, projects),
      };
    });
  }, [nodes, arcs, projects, now, overrides]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const pad = PAD;
    const fw = W - pad.l - pad.r;
    const fh = H - pad.t - pad.b;

    // Quad backgrounds — color-coded by zone
    const quads: [number, number, string, string][] = [
      [0.5, 0, "rgba(34,197,94,0.055)", "rgba(34,197,94,0.13)"], // do now    — green
      [0, 0, "rgba(59,130,246,0.055)", "rgba(59,130,246,0.13)"], // schedule  — blue
      [0.5, 0.5, "rgba(251,146,60,0.055)", "rgba(251,146,60,0.13)"], // delegate  — amber
      [0, 0.5, "rgba(160,160,160,0.035)", "rgba(160,160,160,0.09)"], // drop      — gray
    ];
    const hq = hoveredQuadRef.current;
    for (let i = 0; i < quads.length; i++) {
      const [qx, qy, color, hoverColor] = quads[i];
      ctx.fillStyle = hq === i ? hoverColor : color;
      ctx.fillRect(pad.l + qx * fw, pad.t + qy * fh, fw * 0.5, fh * 0.5);
    }
    // Hovered quad border highlight
    if (hq !== null) {
      const [qx, qy, , hoverColor] = quads[hq];
      ctx.beginPath();
      ctx.rect(pad.l + qx * fw, pad.t + qy * fh, fw * 0.5, fh * 0.5);
      ctx.strokeStyle = hoverColor.replace(/[\d.]+\)$/, "0.5)");
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Outer border
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, fw, fh);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Secondary gridlines at 0.25 / 0.75
    ctx.save();
    ctx.setLineDash([3, 10]);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.0;
    for (const t of [0.25, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(pad.l + fw * t, pad.t);
      ctx.lineTo(pad.l + fw * t, pad.t + fh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + fh * t);
      ctx.lineTo(pad.l + fw, pad.t + fh * t);
      ctx.stroke();
    }
    ctx.restore();

    // Main axis dividers
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(pad.l + fw * 0.5, pad.t);
    ctx.lineTo(pad.l + fw * 0.5, pad.t + fh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + fh * 0.5);
    ctx.lineTo(pad.l + fw, pad.t + fh * 0.5);
    ctx.stroke();
    ctx.restore();

    // Corner labels — color-matched to quadrant, larger when hovered
    const corners: [
      string,
      CanvasTextAlign,
      CanvasTextBaseline,
      number,
      number,
      string,
    ][] = [
      [
        "DO NOW",
        "right",
        "top",
        pad.l + fw - 6,
        pad.t + 5,
        "rgba(74,222,128,0.7)",
      ],
      ["schedule", "left", "top", pad.l + 6, pad.t + 5, "rgba(96,165,250,0.7)"],
      [
        "delegate",
        "right",
        "bottom",
        pad.l + fw - 6,
        pad.t + fh - 5,
        "rgba(251,146,60,0.7)",
      ],
      [
        "drop",
        "left",
        "bottom",
        pad.l + 6,
        pad.t + fh - 5,
        "rgba(180,180,180,0.5)",
      ],
    ];
    for (let i = 0; i < corners.length; i++) {
      const [text, align, baseline, x, y, color] = corners[i];
      ctx.font = `${hq === i ? 28 : 20}px "VT323", monospace`;
      labelWidthsRef.current[i] = ctx.measureText(text).width;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.fillText(text, x, y);
    }

    // Completed ghost dots
    const ranges = rangesRef.current;
    const dragging = dragStateRef.current;

    const fillDot = (isEvent: boolean, x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (isEvent) {
        ctx.stroke();
      } else {
        ctx.fill();
      }
    };

    for (const node of nodes.filter((n) => n.is_completed)) {
      const px = pad.l + fieldX(node, now, ranges) * fw;
      const py = pad.t + (1 - fieldY(node, ranges)) * fh;
      const ghostColor = hexWithAlpha(nodeArcColor(node, arcs, projects), 0.09);
      ctx.fillStyle = ghostColor;
      ctx.strokeStyle = ghostColor;
      ctx.lineWidth = 1.5;
      fillDot(node.node_type === 'event', px, py, 4);
    }

    // Load animation progress (ease-out over 700ms)
    const animElapsed =
      animStartRef.current !== null
        ? performance.now() - animStartRef.current
        : 700;
    const animRaw = Math.min(1, animElapsed / 700);
    const animP = 1 - Math.pow(1 - animRaw, 3); // ease-out cubic

    const cx = pad.l + fw / 2;
    const cy = pad.t + fh / 2;

    const wt = wiggleTimeRef.current;

    // Active dots
    for (const { node, fx, fy, r, color } of dots) {
      if (dragging?.dotId === node.id) continue; // drawn in drag guide section
      const targetX = pad.l + fx * fw;
      const targetY = pad.t + (1 - fy) * fh;
      // Per-dot deterministic phase from ID hash
      const phaseX = idJitter(node.id + "wx", Math.PI * 2);
      const phaseY = idJitter(node.id + "wy", Math.PI * 2);
      const phaseP = idJitter(node.id + "wp", Math.PI * 2);
      const wx = Math.sin(wt * 0.5 + phaseX) * 6 * animP;
      const wy = Math.sin(wt * 0.38 + phaseY) * 5 * animP;
      const pulse = 1 + Math.sin(wt * 0.6 + phaseP) * 0.15; // ±15% radius
      const px = cx + (targetX - cx) * animP + wx;
      const py = cy + (targetY - cy) * animP + wy;
      const pr = r * pulse * animP + r * (1 - animP); // ease in the pulse too
      const hov = node.id === hoveredNodeId;
      const isEvent = node.node_type === 'event';
      ctx.globalAlpha = animP;
      ctx.fillStyle = hov ? color : hexWithAlpha(color, 0.72);
      ctx.strokeStyle = hov ? color : hexWithAlpha(color, 0.72);
      ctx.lineWidth = 3;
      fillDot(isEvent, px, py, pr);
      ctx.globalAlpha = 1;
    }

    // ── Dim + desaturate overlay (compositing trick, works everywhere) ────────
    if (dragging && dragging.guideAlpha > 0.01) {
      const ga = dragging.guideAlpha;
      // 1) Desaturate: 'saturation' composite mode blends source saturation onto dest
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = ga * 0.95;
      ctx.fillStyle = 'hsl(0, 0%, 40%)'; // 0% saturation → strips color from dots below
      ctx.fillRect(pad.l, pad.t, fw, fh);
      ctx.restore();
      // 2) Darken: plain dark overlay
      ctx.globalAlpha = ga * 0.92;
      ctx.fillStyle = '#000000';
      ctx.fillRect(pad.l, pad.t, fw, fh);
      ctx.globalAlpha = 1;
    }

    // ── Drag guides ──────────────────────────────────────────────────────────
    if (dragging && dragging.guideAlpha > 0.01) {
      const drag = dragging;
      const ga = drag.guideAlpha;
      const isImp = (drag.dot.node.importance_level ?? 0) === 1;
      const dotDrawPx = drag.axis === 'h' ? (drag.snappedPx ?? drag.dotPx) : drag.dotPx;
      const dotDrawPy = drag.axis === 'v' ? drag.currentPy : drag.dotPy;

      ctx.save();

      // ── Horizontal rail ──────────────────────────────────────────────────
      // Faint horizontal band across the full grid at dot's y
      ctx.globalAlpha = ga * 0.07;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pad.l, drag.dotPy - 1, fw, 2);
      ctx.globalAlpha = 1;

      // Subtle vertical tick marks for each snap target
      for (const t of drag.snapTargets) {
        if (t.px < pad.l || t.px > pad.l + fw) continue;
        const isCurrent = t.dateStr === drag.snappedDateStr;
        if (isCurrent) continue; // drawn separately below
        ctx.globalAlpha = ga * 0.12;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(t.px - 0.5, drag.dotPy - 5, 1, 10);
        ctx.globalAlpha = 1;
      }

      // ── Snap indicator ───────────────────────────────────────────────────
      if (drag.axis === 'h' && drag.snappedPx !== null) {
        // Full-height snap line
        ctx.globalAlpha = ga * 0.6;
        ctx.strokeStyle = 'rgba(255,215,50,1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(drag.snappedPx, pad.t);
        ctx.lineTo(drag.snappedPx, pad.t + fh);
        ctx.stroke();

        // Top + bottom tick caps
        ctx.globalAlpha = ga * 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(drag.snappedPx - 5, pad.t + 2);
        ctx.lineTo(drag.snappedPx + 5, pad.t + 2);
        ctx.moveTo(drag.snappedPx - 5, pad.t + fh - 2);
        ctx.lineTo(drag.snappedPx + 5, pad.t + fh - 2);
        ctx.stroke();

        // Date label pill above the dot
        if (drag.snappedLabel) {
          const lx = drag.snappedPx;
          const ly = drag.dotPy - drag.dot.r - 14;
          ctx.font = '18px "VT323", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(drag.snappedLabel).width;
          ctx.globalAlpha = ga * 0.85;
          ctx.fillStyle = 'rgba(255,215,50,0.15)';
          ctx.beginPath();
          ctx.roundRect(lx - tw / 2 - 8, ly - 11, tw + 16, 22, 4);
          ctx.fill();
          ctx.globalAlpha = ga;
          ctx.fillStyle = 'rgba(255,215,50,1)';
          ctx.fillText(drag.snappedLabel, lx, ly);
          ctx.globalAlpha = 1;
        }
      }

      // ── Due date wall ────────────────────────────────────────────────────
      if (drag.dueDatePx !== null) {
        ctx.globalAlpha = ga * 0.4;
        ctx.strokeStyle = 'rgba(255,70,70,1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(drag.dueDatePx, pad.t);
        ctx.lineTo(drag.dueDatePx, pad.t + fh);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = ga * 0.55;
        ctx.fillStyle = 'rgba(255,70,70,1)';
        ctx.font = '13px "VT323", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('due', drag.dueDatePx, pad.t + 3);
        ctx.globalAlpha = 1;
      }

      // ── Vertical rail ────────────────────────────────────────────────────
      // Faint vertical band at dot's x
      ctx.globalAlpha = ga * 0.07;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(drag.dotPx - 1, pad.t, 2, fh);
      ctx.globalAlpha = 1;

      // Label showing where vertical drag leads
      const vLabel = isImp ? 'not important' : 'important';
      const vLabelY = isImp ? pad.t + fh * 0.77 : pad.t + fh * 0.23;
      const onRight = drag.dotPx > pad.l + fw / 2;
      const vLabelX = onRight ? drag.dotPx - 14 : drag.dotPx + 14;
      ctx.globalAlpha = ga * (drag.crossedCenter ? 0.9 : 0.4);
      ctx.fillStyle = drag.crossedCenter ? 'rgba(255,215,50,1)' : 'rgba(255,255,255,0.7)';
      ctx.font = '16px "VT323", monospace';
      ctx.textAlign = onRight ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(vLabel, vLabelX, vLabelY);
      ctx.globalAlpha = 1;

      // ── Vertical axis: target half highlight ─────────────────────────────
      if (drag.axis === 'v' && drag.crossedCenter) {
        const targetHalfY = isImp ? pad.t + fh / 2 : pad.t;
        ctx.globalAlpha = ga * 0.06;
        ctx.fillStyle = 'rgba(255,215,50,1)';
        ctx.fillRect(pad.l, targetHalfY, fw, fh / 2);
        ctx.globalAlpha = 1;
      }

      // ── Dragged dot (drawn on top of guides, always full color) ──────────
      ctx.globalAlpha = 1;
      ctx.fillStyle = drag.dot.color;
      ctx.strokeStyle = drag.dot.color;
      ctx.lineWidth = 3;
      fillDot(drag.dot.node.node_type === 'event', dotDrawPx, dotDrawPy, drag.dot.r);

      ctx.restore();
    }

    ctx.restore();
  }, [dots, hoveredNodeId, nodes, arcs, projects, now]);

  // Keep ref always pointing at the latest drawFrame
  useEffect(() => {
    drawFrameRef.current = drawFrame;
  }, [drawFrame]);

  // Persistent loop: handles load animation + wiggle
  useEffect(() => {
    animStartRef.current = performance.now();
    let last = performance.now();
    const loop = () => {
      const nowMs = performance.now();
      const dt = (nowMs - last) * 0.001;
      wiggleTimeRef.current += dt;
      last = nowMs;
      // Fade in guide lines
      const drag = dragStateRef.current;
      if (drag && drag.guideAlpha < 1) {
        drag.guideAlpha = Math.min(1, drag.guideAlpha + dt * 4); // ~250ms
      }
      drawFrameRef.current();
      wiggleRafRef.current = requestAnimationFrame(loop);
    };
    wiggleRafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(wiggleRafRef.current);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const sync = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      setContainerSize({ w: container.clientWidth, h: container.clientHeight });
      drawFrame();
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(container);
    return () => obs.disconnect();
  }, [drawFrame]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      // ── Handle active drag ────────────────────────────────────────────────
      const drag = dragStateRef.current;
      if (drag) {
        const rect2 = canvas.getBoundingClientRect();
        const mx2 = e.clientX - rect2.left;
        const my2 = e.clientY - rect2.top;
        const dpr2 = window.devicePixelRatio || 1;
        const H2 = canvas.height / dpr2;
        const fh2 = H2 - PAD.t - PAD.b;

        const dx = mx2 - drag.originMx;
        const dy = my2 - drag.originMy;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.hasMoved = true;

        // Axis lock: first direction to exceed 8px wins
        if (drag.axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        }

        if (drag.axis === 'h') {
          const mouseX = drag.dotPx + dx;
          let bestTarget = drag.snapTargets[0];
          let bestDist = Infinity;
          for (const t of drag.snapTargets) {
            if (drag.dueDatePx !== null && t.px > drag.dueDatePx + 2) continue;
            const d = Math.abs(mouseX - t.px);
            if (d < bestDist) { bestDist = d; bestTarget = t; }
          }
          if (bestTarget) {
            drag.snappedDateStr = bestTarget.dateStr;
            drag.snappedPx = bestTarget.px;
            drag.snappedLabel = bestTarget.label;
          }
          drag.currentPx = drag.snappedPx ?? drag.dotPx;
          drag.currentPy = drag.dotPy;
        } else if (drag.axis === 'v') {
          drag.currentPy = drag.dotPy + dy;
          drag.currentPx = drag.dotPx;
          const centerY = PAD.t + fh2 / 2;
          const isImp = (drag.dot.node.importance_level ?? 0) === 1;
          drag.crossedCenter = isImp ? drag.currentPy > centerY : drag.currentPy < centerY;
          drag.newImportance = drag.crossedCenter ? (isImp ? 0 : 1) : null;
        }
        return; // don't process normal hover/tooltip during drag
      }

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      const pad = PAD;
      const fw = W - pad.l - pad.r;
      const fh = H - pad.t - pad.b;

      const wt = wiggleTimeRef.current;

      let found: FieldDot | null = null;
      let minD = Infinity;
      for (const dot of dots) {
        const basePx = pad.l + dot.fx * fw;
        const basePy = pad.t + (1 - dot.fy) * fh;
        // Match wiggle offset from drawFrame so hit zone follows the visual dot
        const phaseX = idJitter(dot.node.id + "wx", Math.PI * 2);
        const phaseY = idJitter(dot.node.id + "wy", Math.PI * 2);
        const px = basePx + Math.sin(wt * 0.5 + phaseX) * 6;
        const py = basePy + Math.sin(wt * 0.38 + phaseY) * 5;
        const hitR = Math.max(dot.r, 10) + 10; // generous minimum for small dots
        const d = Math.hypot(mx - px, my - py);
        if (d < hitR && d < minD) {
          minD = d;
          found = dot;
        }
      }

      onHover(found?.node.id ?? null);

      // Determine hovered quadrant
      const inField =
        mx > pad.l && mx < pad.l + fw && my > pad.t && my < pad.t + fh;
      const newQuad = inField
        ? (mx > pad.l + fw * 0.5 ? 0 : 1) + (my > pad.t + fh * 0.5 ? 2 : 0)
        : null;
      if (hoveredQuadRef.current !== newQuad) {
        hoveredQuadRef.current = newQuad;
        drawFrame();
      }

      if (found) {
        const px = pad.l + found.fx * fw;
        const py = pad.t + (1 - found.fy) * fh;
        let sub = "";
        if (found.node.arc_id)
          sub = arcs.find((a) => a.id === found!.node.arc_id)?.name ?? "";
        if (found.node.project_id) {
          const pname =
            projects.find((p) => p.id === found!.node.project_id)?.name ?? "";
          sub = sub ? `${sub} › ${pname}` : pname;
        }
        const subTotal = found.node.sub_total ?? 0;
        if (subTotal > 0) {
          const subDone = found.node.sub_done ?? 0;
          const subStr = `${subDone}/${subTotal} sub`;
          sub = sub ? `${sub}  ·  ${subStr}` : subStr;
        }
        setTooltip({
          x: px,
          y: py - found.r - 10,
          yBelow: py + found.r + 10,
          title: found.node.title,
          sub,
        });
      } else {
        setTooltip(null);
      }
    },
    [dots, onHover, arcs, projects],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      const fw = W - PAD.l - PAD.r;
      const fh = H - PAD.t - PAD.b;
      const wt = wiggleTimeRef.current;

      // Find hit dot
      let found: FieldDot | null = null;
      let minD = Infinity;
      for (const dot of dots) {
        const basePx = PAD.l + dot.fx * fw;
        const basePy = PAD.t + (1 - dot.fy) * fh;
        const phaseX = idJitter(dot.node.id + 'wx', Math.PI * 2);
        const phaseY = idJitter(dot.node.id + 'wy', Math.PI * 2);
        const px = basePx + Math.sin(wt * 0.5 + phaseX) * 6;
        const py = basePy + Math.sin(wt * 0.38 + phaseY) * 5;
        const hitR = Math.max(dot.r, 10) + 10;
        const d = Math.hypot(mx - px, my - py);
        if (d < hitR && d < minD) { minD = d; found = dot; }
      }
      if (!found) return;

      const dotPx = PAD.l + found.fx * fw;
      const dotPy = PAD.t + (1 - found.fy) * fh;

      // Build snap targets for all integer days in range
      const ranges = rangesRef.current;
      const span = Math.max(ranges.dayMax, 1);
      const todayNoon = new Date(now);
      todayNoon.setHours(12, 0, 0, 0);
      const snapTargets: DragState['snapTargets'] = [];
      for (let i = -7; i <= Math.ceil(ranges.dayMax) + 7; i++) {
        const snapDate = new Date(todayNoon);
        snapDate.setDate(todayNoon.getDate() + i);
        const dateStr = snapDate.toISOString().slice(0, 10);
        const days = daysUntil(dateStr + 'T12:00:00', now);
        const norm = Math.min(1, Math.max(0, days / span));
        const x = (1 - MARGIN) - norm * (1 - 2 * MARGIN);
        const px = PAD.l + x * fw;
        const label = formatSnapDate(snapDate, now);
        snapTargets.push({ dateStr, px, label });
      }

      // Due date wall
      let dueDatePx: number | null = null;
      if (found.node.due_at) {
        const dueDays = daysUntil(found.node.due_at, now);
        const norm = Math.min(1, Math.max(0, dueDays / span));
        const x = (1 - MARGIN) - norm * (1 - 2 * MARGIN);
        dueDatePx = PAD.l + x * fw;
      }

      dragStateRef.current = {
        dotId: found.node.id,
        dot: found,
        originMx: mx,
        originMy: my,
        dotPx,
        dotPy,
        axis: null,
        guideAlpha: 0,
        hasMoved: false,
        snapTargets,
        snappedDateStr: null,
        snappedPx: null,
        snappedLabel: null,
        dueDatePx,
        crossedCenter: false,
        newImportance: null,
        currentPx: dotPx,
        currentPy: dotPy,
        originalDateStr: found.node.planned_start_at
          ? found.node.planned_start_at.slice(0, 10)
          : null,
        originalImportance: ((found.node.importance_level ?? 0) === 1 ? 1 : 0) as 0 | 1,
      };
      setIsDragging(true);
      setTooltip(null);
    },
    [dots, now],
  );

  const onMouseUp = useCallback(() => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const { hasMoved, axis, dotId, snappedDateStr, newImportance, originalDateStr, originalImportance } = drag;
    dragStateRef.current = null;
    setIsDragging(false);
    if (!hasMoved) return;

    if (axis === 'h' && snappedDateStr && snappedDateStr !== originalDateStr) {
      setOverrides(prev => {
        const next = new Map(prev);
        next.set(dotId, { ...next.get(dotId), planned_start_at: snappedDateStr });
        return next;
      });
      onUpdate(dotId, { planned_start_at: snappedDateStr });
    }
    if (axis === 'v' && newImportance !== null && newImportance !== originalImportance) {
      setOverrides(prev => {
        const next = new Map(prev);
        next.set(dotId, { ...next.get(dotId), importance_level: newImportance });
        return next;
      });
      onUpdate(dotId, { importance_level: newImportance });
    }
  }, [onUpdate]);

  // Escape cancels drag
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragStateRef.current) {
        dragStateRef.current = null;
        setIsDragging(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: isDragging ? 'grabbing' : 'default' }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          // Cancel drag on leave
          if (dragStateRef.current) {
            dragStateRef.current = null;
            setIsDragging(false);
          }
          onHover(null);
          setTooltip(null);
          hoveredQuadRef.current = null;
          drawFrame();
        }}
      />
      {containerSize.w > 0 &&
        (() => {
          const p = PAD;
          const fw = containerSize.w - p.l - p.r;
          const fh = containerSize.h - p.t - p.b;
          const midY = p.t + fh / 2;
          const midX = p.l + fw / 2;
          const col = "rgba(255,215,50,0.85)";
          const dim = "rgba(255,215,50,0.45)";
          const sz = 28;
          return (
            <>
              {/* later — chevron (outside) then label (inside), right-edge 4px from grid */}
              <div style={{
                position: "absolute",
                right: containerSize.w - p.l + 14,
                top: midY,
                transform: "translateY(-50%)",
                display: "flex", alignItems: "center", gap: 4,
                color: dim, pointerEvents: "none",
              }}>
                <ChevronLeft width={sz} height={sz} />
                <span style={{ fontFamily: '"VT323", monospace', fontSize: 22, lineHeight: 1 }}>later</span>
              </div>

              {/* NOW! — label (inside) then chevron (outside), left-edge 4px from grid */}
              <div style={{
                position: "absolute",
                left: p.l + fw + 14,
                top: midY,
                transform: "translateY(-50%)",
                display: "flex", alignItems: "center", gap: 4,
                color: col, pointerEvents: "none",
              }}>
                <span style={{ fontFamily: '"VT323", monospace', fontSize: 22, lineHeight: 1 }}>NOW!</span>
                <ChevronRight width={sz} height={sz} />
              </div>

              {/* CRITICAL! — chevron above label, bottom-edge 4px from grid */}
              <div style={{
                position: "absolute",
                left: midX,
                top: p.t - 4,
                transform: "translateX(-50%) translateY(-100%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                color: col, pointerEvents: "none",
              }}>
                <ChevronUp width={sz} height={sz} />
                <span style={{ fontFamily: '"VT323", monospace', fontSize: 22, lineHeight: 1 }}>CRITICAL!</span>
              </div>

              {/* low stakes — label above chevron, top-edge 4px from grid */}
              <div style={{
                position: "absolute",
                left: midX,
                top: p.t + fh + 4,
                transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                color: dim, pointerEvents: "none",
              }}>
                <span style={{ fontFamily: '"VT323", monospace', fontSize: 22, lineHeight: 1 }}>low stakes</span>
                <ChevronDown width={sz} height={sz} />
              </div>
            </>
          );
        })()}
      {tooltip && (() => {
        const flipped = tooltip.y < 80;
        return (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: flipped ? tooltip.yBelow : tooltip.y,
              transform: flipped ? "translate(-50%, 0)" : "translate(-50%, -100%)",
              background: "rgba(10,10,16,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "5px 10px",
              pointerEvents: "none",
              maxWidth: 220,
            }}
          >
            <div
              style={{
                fontSize: "0.92rem",
                color: "rgba(255,255,255,0.9)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tooltip.title}
            </div>
            {tooltip.sub && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "rgba(255,255,255,0.38)",
                  marginTop: 2,
                }}
              >
                {tooltip.sub}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── TaskListPanel ─────────────────────────────────────────────────────────────

function TaskListPanel({
  nodes,
  arcs,
  projects,
  hoveredNodeId,
  onHover,
  onComplete,
  onEdit,
  now,
}: {
  nodes: PlannerNode[];
  arcs: Arc[];
  projects: Project[];
  hoveredNodeId: string | null;
  onHover: (id: string | null) => void;
  onComplete: (id: string) => void;
  onEdit: (node: PlannerNode) => void;
  now: Date;
}) {
  if (nodes.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontSize: "1rem",
          letterSpacing: "2px",
          color: "rgba(255,255,255,0.12)",
        }}
      >
        no tasks
      </div>
    );
  }

  const visibleNodes = nodes.filter(n => !(n.planned_start_at && daysUntil(n.planned_start_at, now) > 10));
  const ranges = computeFieldRanges(visibleNodes, now);
  const sorted = [...visibleNodes].sort((a, b) => {
    const da = Math.hypot(1 - fieldX(a, now, ranges), 1 - fieldY(a, ranges));
    const db = Math.hypot(1 - fieldX(b, now, ranges), 1 - fieldY(b, ranges));
    return da - db;
  });

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      {sorted.map((node) => {
        const hov = node.id === hoveredNodeId;
        const color = nodeArcColor(node, arcs, projects);
        const due = formatDueLabel(node.due_at, now);
        const effort = formatEffortLabel(node.estimated_duration_minutes);
        const done = node.is_completed;
        const isToday = node.due_at ? isSameDay(node.due_at, now) : false;

        return (
          <div
            key={node.id}
            onMouseEnter={() => onHover(node.id)}
            onMouseLeave={() => onHover(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px 8px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              borderLeft: `2px solid ${hov ? color : "transparent"}`,
              background: hov ? "rgba(255,255,255,0.04)" : "transparent",
              opacity: done ? 0.28 : 1,
              transition: "background 0.1s, border-color 0.1s",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />

            <span
              style={{
                flex: 1,
                fontSize: "1rem",
                letterSpacing: "0.3px",
                color: hov ? "#fff" : "rgba(255,255,255,0.8)",
                textDecoration: done ? "line-through" : "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.title}
            </span>

            {effort && (
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "rgba(255,255,255,0.28)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "0 5px",
                  flexShrink: 0,
                }}
              >
                {effort}
              </span>
            )}

            {due && (
              <span
                style={{
                  fontSize: "0.78rem",
                  letterSpacing: "0.5px",
                  flexShrink: 0,
                  color: node.is_overdue
                    ? "#ff3b3b"
                    : isToday
                      ? "#f5a623"
                      : "rgba(255,255,255,0.3)",
                }}
              >
                {node.is_overdue ? "OVERDUE" : isToday ? "TODAY" : due}
              </span>
            )}

            {!done && hov && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete(node.id);
                }}
                title="mark done"
                style={{
                  width: 15,
                  height: 15,
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "transparent",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
            )}
            {hov && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(node);
                }}
                title="edit"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.35)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  padding: "0 2px",
                  flexShrink: 0,
                }}
              >
                ✎
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main FocusView ────────────────────────────────────────────────────────────

export default function FocusView() {
  const { nodes, groups, arcs, projects, completeNode, updateNode } = usePlannerStore();
  const { openTaskFormEdit } = useViewStore();

  const [mode, setMode] = useState<ViewMode>("tree");
  const [scope, setScope] = useState<ScopeItem | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [treeOpacity, setTreeOpacity] = useState(1);
  const [detailOpacity, setDetailOpacity] = useState(0);
  const [arcFilter, setArcFilter] = useState<ArcFilter>("current");

  const todayStr = new Date().toISOString().slice(0, 10); // recomputes each render, changes at midnight
  const now = useMemo(() => new Date(), [todayStr]); // refreshes when the calendar date changes

  const handleSelectScope = useCallback((s: ScopeItem) => {
    setScope(s);
    setTreeOpacity(0);
    setTimeout(() => {
      setMode("detail");
      setDetailOpacity(1);
    }, 350);
  }, []);

  const handleBackToTree = useCallback(() => {
    setDetailOpacity(0);
    setTimeout(() => {
      setMode("tree");
      setTreeOpacity(1);
    }, 350);
  }, []);

  const filteredNodes = useMemo<PlannerNode[]>(() => {
    let pool = nodes;
    if (scope && scope.type !== "all") {
      if (scope.type === "arc")
        pool = nodes.filter((n) => n.arc_id === scope.id);
      if (scope.type === "project")
        pool = nodes.filter((n) => n.project_id === scope.id);
      if (scope.type === "group")
        pool = nodes.filter((n) => n.groups?.some((g) => g.id === scope.id));
    }
    return [...pool].sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      return b.computed_urgency_level - a.computed_urgency_level;
    });
  }, [nodes, scope]);

  const breadcrumb =
    mode === "tree"
      ? "node tree"
      : scope?.arcLabel
        ? `${scope.arcLabel} › ${scope.label}`
        : (scope?.label ?? "all tasks");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "5px 14px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          position: "relative",
        }}
      >
        {/* Left slot */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          {mode === "detail" && (
            <button
              onClick={handleBackToTree}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.95rem",
                letterSpacing: "1px",
                cursor: "pointer",
                padding: 0,
                fontFamily: "'VT323', monospace",
              }}
            >
              ← back to tree
            </button>
          )}
          {mode === "detail" && (
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "1px",
                color: "rgba(255,255,255,0.18)",
              }}
            >
              {filteredNodes.filter((n) => !n.is_completed).length} pending
            </span>
          )}
        </div>

        {/* Centre title */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          {mode === "tree" && (
            <Presentation
              size={20}
              style={{ color: "rgba(255,255,255,0.7)", flexShrink: 0 }}
            />
          )}
          <span
            style={{
              fontSize: "1.25rem",
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.88)",
              fontFamily: "'VT323', monospace",
            }}
          >
            {breadcrumb}
          </span>
        </div>

        {/* Right slot — arc filter (tree mode only) */}
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 6,
          }}
        >
          {mode === "tree" && (
            <>
              <button
                title="current arcs only"
                onClick={() => setArcFilter("current")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background:
                    arcFilter === "current"
                      ? "rgba(0,196,167,0.12)"
                      : "transparent",
                  border: `1px solid ${arcFilter === "current" ? "rgba(0,196,167,0.5)" : "rgba(255,255,255,0.12)"}`,
                  color:
                    arcFilter === "current"
                      ? "#00c4a7"
                      : "rgba(255,255,255,0.35)",
                  padding: "3px 8px 3px 5px",
                  cursor: "pointer",
                  fontSize: "0.72rem",
                  letterSpacing: "1px",
                  fontFamily: "'VT323', monospace",
                }}
              >
                <Gps size={14} /> current
              </button>
              <button
                title="all arcs"
                onClick={() => setArcFilter("all")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background:
                    arcFilter === "all"
                      ? "rgba(255,255,255,0.07)"
                      : "transparent",
                  border: `1px solid ${arcFilter === "all" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)"}`,
                  color:
                    arcFilter === "all"
                      ? "rgba(255,255,255,0.8)"
                      : "rgba(255,255,255,0.35)",
                  padding: "3px 8px 3px 5px",
                  cursor: "pointer",
                  fontSize: "0.72rem",
                  letterSpacing: "1px",
                  fontFamily: "'VT323', monospace",
                }}
              >
                <Radio size={14} /> all
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Tree */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: treeOpacity,
            transition: "opacity 0.35s",
            pointerEvents: mode === "tree" ? "auto" : "none",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <NodeTreeCanvas
            arcs={arcs}
            projects={projects}
            groups={groups}
            nodes={nodes}
            onSelectScope={handleSelectScope}
            arcFilter={arcFilter}
          />
        </div>

        {/* Detail */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: detailOpacity,
            transition: "opacity 0.35s",
            pointerEvents: mode === "detail" ? "auto" : "none",
            display: "flex",
          }}
        >
          {/* List panel 38% */}
          <div
            style={{
              width: "38%",
              flexShrink: 0,
              borderRight: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <TaskListPanel
              nodes={filteredNodes}
              arcs={arcs}
              projects={projects}
              hoveredNodeId={hoveredNodeId}
              onHover={setHoveredNodeId}
              onComplete={(id) => completeNode(id)}
              onEdit={(node) => openTaskFormEdit(node)}
              now={now}
            />
          </div>

          {/* Field panel 62% */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Field title */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                flexShrink: 0,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <Grid2x22 size={18} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span
                style={{
                  fontSize: "1.15rem",
                  letterSpacing: "2.5px",
                  color: "rgba(255,255,255,0.75)",
                  fontFamily: "'VT323', monospace",
                }}
              >
                THE FIELD
              </span>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <FieldCanvas
                nodes={filteredNodes}
                allNodes={nodes}
                arcs={arcs}
                projects={projects}
                hoveredNodeId={hoveredNodeId}
                onHover={setHoveredNodeId}
                onUpdate={updateNode}
                now={now}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
