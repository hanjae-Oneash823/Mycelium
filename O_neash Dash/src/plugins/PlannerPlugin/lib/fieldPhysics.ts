import type { PlannerNode } from '../types';
import { getDotDiameter } from '../types';
import { isSameDay, toDateString } from './logicEngine';

export interface FieldColumn {
  key: string;   // 'YYYY-MM-DD', or 'overdue'
  label: string; // 'OOPS' | 'TODAY' | 'MON' etc
  dateLabel: string; // 'MM/DD', empty for the OOPS column
  color: string;
  isOverdue: boolean;
  isToday: boolean;
}

export interface FieldParticle {
  node: PlannerNode;
  x: number; y: number; vx: number; vy: number; fx: number; fy: number;
  opacity: number; scale: number;
  phase: number; jitterFreq: number; yJitter: number;
  /** 1 = label bubble at rest; 0 = collapsed into the dot. Animated by tick() after a launch. */
  labelScale: number;
  /** Timestamp (ms) the current launch's label animation started, or null when at rest. */
  labelAnimStart: number | null;
}

export const TOP_BOUND = 76;
export const BOTTOM_MARGIN = 18;
export const NO_ARC_ID = '__none__';

const RADIUS = getDotDiameter() / 2;
const REPULSE_MULT = 2.4;
const REPULSE_K = 0.55;
const SPRING_K = 0.02;
const DAMPING = 0.86;

// Mirrors the label-bubble sizing in fieldRender.ts's drawLabelBubble (14px font, ~8px padding
// each side, 128px max text width) so dots repel far enough apart that their title bubbles don't
// overlap. tick() has no canvas context to measure text precisely, so this is a char-count estimate.
const LABEL_CHAR_WIDTH = 7.5;
const LABEL_PAD = 16;
const LABEL_MAX_WIDTH = 144;

function labelHalfWidth(node: PlannerNode): number {
  const estWidth = Math.min(LABEL_MAX_WIDTH, node.title.length * LABEL_CHAR_WIDTH + LABEL_PAD);
  return estWidth / 2;
}

// Launch sequence for a moved node's label bubble: shrink into the dot, stay hidden while the
// node travels to its new home (spring physics below), then expand back out once it arrives.
const LABEL_SHRINK_MS = 150;
const LABEL_HOLD_MS = 250;
const LABEL_EXPAND_MS = 200;
const LABEL_ANIM_TOTAL_MS = LABEL_SHRINK_MS + LABEL_HOLD_MS + LABEL_EXPAND_MS;

function updateLabelScale(p: FieldParticle, nowMs: number): void {
  if (p.labelAnimStart == null) { p.labelScale = 1; return; }
  const elapsed = nowMs - p.labelAnimStart;
  if (elapsed >= LABEL_ANIM_TOTAL_MS) {
    p.labelAnimStart = null;
    p.labelScale = 1;
  } else if (elapsed < LABEL_SHRINK_MS) {
    p.labelScale = 1 - elapsed / LABEL_SHRINK_MS;
  } else if (elapsed < LABEL_SHRINK_MS + LABEL_HOLD_MS) {
    p.labelScale = 0;
  } else {
    p.labelScale = (elapsed - LABEL_SHRINK_MS - LABEL_HOLD_MS) / LABEL_EXPAND_MS;
  }
}

function dayColor(date: Date): string {
  const dow = date.getDay();
  if (dow === 0) return '#ff6b35';
  if (dow === 6) return '#64c8ff';
  return 'rgba(255,255,255,0.75)';
}

/** Mirrors EisenhowerView's column window: optional OOPS + TODAY + 5 sliding future days. */
export function buildColumns(now: Date, futureOffset: number, hasOverdue: boolean): FieldColumn[] {
  const cols: FieldColumn[] = [];
  if (hasOverdue) cols.push({ key: 'overdue', label: 'OOPS', dateLabel: '', color: '#f87171', isOverdue: true, isToday: false });
  for (let i = 0; i < 6; i++) {
    const dayIndex = i === 0 ? 0 : i + futureOffset;
    const dt = new Date(now);
    dt.setDate(dt.getDate() + dayIndex);
    const key = toDateString(dt);
    const local = new Date(key + 'T12:00:00');
    const mm = String(local.getMonth() + 1).padStart(2, '0');
    const dd = String(local.getDate()).padStart(2, '0');
    cols.push({
      key,
      label: i === 0 ? 'TODAY' : local.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      dateLabel: `${mm}/${dd}`,
      color: i === 0 ? '#ffffff' : dayColor(local),
      isOverdue: false,
      isToday: i === 0,
    });
  }
  return cols;
}

/** Which column a node belongs to, or null if it falls outside the currently visible window. */
export function bucketColumn(node: PlannerNode, columns: FieldColumn[]): number | null {
  if (node.is_overdue || node.is_missed_schedule) {
    const idx = columns.findIndex(c => c.isOverdue);
    return idx === -1 ? null : idx;
  }
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.isOverdue) continue;
    const colDate = new Date(col.key + 'T12:00:00');
    const matches = node.planned_start_at
      ? isSameDay(node.planned_start_at, colDate)
      : isSameDay(node.due_at, colDate);
    if (matches) return i;
  }
  return null;
}

// Vertical space is split into three rows: important tasks (short), normal tasks, and events —
// events ignore importance_level entirely and always live in their own row.
const IMPORTANT_FRAC = 0.2;
const NORMAL_FRAC = 0.55;
// events get the remaining fraction (0.25)

export interface RowBoundaries {
  topBound: number;
  bottomBound: number;
  importantBoundary: number; // divider between important and normal rows
  normalBoundary: number;    // divider between normal and events rows
}

export function rowBoundaries(H: number): RowBoundaries {
  const topBound = TOP_BOUND;
  const bottomBound = H - BOTTOM_MARGIN;
  const usable = bottomBound - topBound;
  const importantBoundary = topBound + usable * IMPORTANT_FRAC;
  const normalBoundary = importantBoundary + usable * NORMAL_FRAC;
  return { topBound, bottomBound, importantBoundary, normalBoundary };
}

/** Y target for the binary important(top)/normal(mid) band split — importance_level is 0|1, not a scale. */
export function importanceY(important: 0 | 1, H: number, jitter: number): number {
  const { topBound, importantBoundary, normalBoundary } = rowBoundaries(H);
  const bandCenter = important
    ? topBound + (importantBoundary - topBound) / 2
    : importantBoundary + (normalBoundary - importantBoundary) / 2;
  return bandCenter + jitter;
}

export function eventRowY(H: number, jitter: number): number {
  const { normalBoundary, bottomBound } = rowBoundaries(H);
  return normalBoundary + (bottomBound - normalBoundary) / 2 + jitter;
}

export function homeYFor(node: PlannerNode, H: number, jitter: number): number {
  return node.node_type === 'event' ? eventRowY(H, jitter) : importanceY(node.importance_level, H, jitter);
}

/** y -> important/normal band for click-to-place; null means the cursor is over the events row (not a valid task-placement target). */
export function bandAt(y: number, H: number): 0 | 1 | null {
  const { importantBoundary, normalBoundary } = rowBoundaries(H);
  if (y < importantBoundary) return 1;
  if (y < normalBoundary) return 0;
  return null;
}

export function columnAt(x: number, W: number, columnCount: number): number {
  const colW = W / columnCount;
  return Math.min(columnCount - 1, Math.max(0, Math.floor(x / colW)));
}

export function seedParticle(node: PlannerNode, columnIndex: number, columnCount: number, W: number, H: number): FieldParticle {
  const colW = W / columnCount;
  const yJitter = (Math.random() - 0.5) * 16;
  return {
    node,
    x: colW * (columnIndex + 0.5) + (Math.random() - 0.5) * colW * 0.5,
    y: homeYFor(node, H, yJitter),
    vx: 0, vy: 0, fx: 0, fy: 0,
    opacity: 1, scale: 1,
    phase: Math.random() * Math.PI * 2,
    jitterFreq: 0.45 + Math.random() * 0.35,
    yJitter,
    labelScale: 1,
    labelAnimStart: null,
  };
}

/** Triggers the shrink-into-dot / travel / expand-back sequence for a node's label bubble. */
export function launchParticle(particle: FieldParticle, now: number): void {
  particle.labelAnimStart = now;
}

export function arcIdOf(node: PlannerNode): string {
  return node.arc_id ?? NO_ARC_ID;
}

/**
 * Mutates particle positions/velocities in place for one frame — a deliberate exception to the
 * project's immutable-data convention, matching NotesPlugin/GraphView.tsx: per-tick allocation for
 * ~dozens of particles at 60fps would generate needless GC pressure for a purely transient render loop.
 */
export function tick(
  particles: FieldParticle[],
  columns: FieldColumn[],
  hiddenArcIds: string[],
  selectedId: string | null,
  W: number,
  H: number,
  reducedMotion: boolean,
): void {
  const bottomBound = H - BOTTOM_MARGIN;
  const jitterK = reducedMotion ? 0 : 0.12;
  const tsec = performance.now() / 1000;
  const nowMs = tsec * 1000;

  for (const p of particles) {
    const visible = !hiddenArcIds.includes(arcIdOf(p.node));
    const tOp = visible ? 1 : 0.12, tSc = visible ? 1 : 0.55;
    p.opacity += (tOp - p.opacity) * 0.08;
    p.scale += (tSc - p.scale) * 0.08;
    updateLabelScale(p, nowMs);
  }

  for (const p of particles) { p.fx = 0; p.fy = 0; }
  const halfW = particles.map(p => labelHalfWidth(p.node));
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i], b = particles[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = (RADIUS * a.scale + RADIUS * b.scale) * REPULSE_MULT + halfW[i] + halfW[j];
      if (dist < minDist) {
        const overlap = (minDist - dist) / minDist;
        const fx = (dx / dist) * overlap * REPULSE_K, fy = (dy / dist) * overlap * REPULSE_K;
        a.fx -= fx; a.fy -= fy; b.fx += fx; b.fy += fy;
      }
    }
  }
  for (const p of particles) {
    if (p.node.id === selectedId) continue;
    const colIndex = bucketColumn(p.node, columns);
    if (colIndex == null) continue;
    const colW = W / columns.length;
    const homeX = colW * (colIndex + 0.5);
    const homeY = homeYFor(p.node, H, p.yJitter);
    const ax = (homeX - p.x) * SPRING_K + p.fx + Math.sin(tsec * p.jitterFreq + p.phase) * jitterK;
    const ay = (homeY - p.y) * SPRING_K + p.fy + Math.cos(tsec * p.jitterFreq * 0.8 + p.phase) * jitterK;
    p.vx = (p.vx + ax) * DAMPING;
    p.vy = (p.vy + ay) * DAMPING;
    p.x += p.vx; p.y += p.vy;
    if (p.y < TOP_BOUND) { p.y = TOP_BOUND; p.vy *= -0.3; }
    if (p.y > bottomBound) { p.y = bottomBound; p.vy *= -0.3; }
    if (p.x < RADIUS + 4) { p.x = RADIUS + 4; p.vx *= -0.3; }
    if (p.x > W - RADIUS - 4) { p.x = W - RADIUS - 4; p.vx *= -0.3; }
  }
}
