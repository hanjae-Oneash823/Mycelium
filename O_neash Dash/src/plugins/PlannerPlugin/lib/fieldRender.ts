import { getDotColor, getDotDiameter, DOT_COLOR_MISSED, DOT_COLOR_NEUTRAL } from '../types';
import type { FieldColumn, FieldParticle } from './fieldPhysics';
import { rowBoundaries } from './fieldPhysics';

const RADIUS = getDotDiameter() / 2;
const ACC = '#f59e0b';

/**
 * `restCy`/`dotCy` are the bubble's resting position (below the dot) and the dot's own center.
 * `scale` interpolates between them (1 = at rest, 0 = collapsed into the dot) and shrinks/fades
 * the bubble uniformly via a canvas transform — text is measured/truncated once at full size so
 * the label content stays stable through the shrink/expand animation instead of re-wrapping.
 */
function drawLabelBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, restCy: number, dotCy: number, scale: number, fontStack: string): void {
  if (scale < 0.04) return;
  const maxWidth = 128;
  ctx.font = `400 14px ${fontStack}`;
  let label = text;
  if (ctx.measureText(label).width > maxWidth) {
    while (label.length > 1 && ctx.measureText(`${label}…`).width > maxWidth) {
      label = label.slice(0, -1);
    }
    label = `${label}…`;
  }
  const textW = ctx.measureText(label).width;
  const padX = 8;
  const bw = textW + padX * 2;
  const bh = 21;
  const radius = bh / 2;
  const bx = -bw / 2, by = -bh / 2;
  const cy = dotCy + (restCy - dotCy) * scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= scale;

  ctx.beginPath();
  ctx.moveTo(bx + radius, by);
  ctx.lineTo(bx + bw - radius, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + radius, radius);
  ctx.lineTo(bx + bw, by + bh - radius);
  ctx.arcTo(bx + bw, by + bh, bx + bw - radius, by + bh, radius);
  ctx.lineTo(bx + radius, by + bh);
  ctx.arcTo(bx, by + bh, bx, by + bh - radius, radius);
  ctx.lineTo(bx, by + radius);
  ctx.arcTo(bx, by, bx + radius, by, radius);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(label, 0, 0.5);

  ctx.restore();
}

export interface DrawOptions {
  columns: FieldColumn[];
  hiddenArcIds: string[];
  hoverNodeId: string | null;
  selectedNodeId: string | null;
  hoverZone: number;
  hoverBand: number;
  cursor: { x: number; y: number; active: boolean };
  reducedMotion: boolean;
  fontStack: string;
}

export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, particles: FieldParticle[], opts: DrawOptions): void {
  ctx.clearRect(0, 0, W, H);
  if (!W || !H) return;
  ctx.textAlign = 'center';

  const selected = opts.selectedNodeId ? particles.find(p => p.node.id === opts.selectedNodeId) ?? null : null;

  const colW = W / opts.columns.length;
  const { topBound, importantBoundary, normalBoundary } = rowBoundaries(H);
  const todayIdx = opts.columns.findIndex(c => c.isToday);
  if (todayIdx >= 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fillRect(colW * todayIdx, topBound, colW, H - topBound);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  opts.columns.forEach((_col, i) => {
    if (i === 0) return;
    ctx.beginPath(); ctx.moveTo(colW * i, topBound); ctx.lineTo(colW * i, H); ctx.stroke();
  });

  opts.columns.forEach((col, i) => {
    const cx = colW * (i + 0.5);
    ctx.fillStyle = col.color;
    ctx.font = `400 21px ${opts.fontStack}`;
    ctx.fillText(col.label, cx, 24);
    if (col.dateLabel) {
      ctx.font = `400 28px ${opts.fontStack}`;
      ctx.fillText(col.dateLabel, cx, 52);
    }
  });

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(0, topBound); ctx.lineTo(W, topBound); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, importantBoundary); ctx.lineTo(W, importantBoundary); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, normalBoundary); ctx.lineTo(W, normalBoundary); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = `400 16px ${opts.fontStack}`;
  ctx.fillStyle = '#f5d90a';
  ctx.fillText('IMPORTANT', 8, topBound + 18);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillText('NORMAL', 8, importantBoundary + 18);
  ctx.fillStyle = '#b366f5';
  ctx.fillText('EVENTS', 8, normalBoundary + 18);
  ctx.textAlign = 'center';

  if (selected && opts.hoverZone >= 0 && opts.hoverZone < opts.columns.length && !opts.columns[opts.hoverZone].isOverdue && opts.hoverBand >= 0) {
    const boxX = colW * opts.hoverZone;
    const boxY = opts.hoverBand === 1 ? topBound : importantBoundary;
    const boxH = opts.hoverBand === 1 ? (importantBoundary - topBound) : (normalBoundary - importantBoundary);
    ctx.fillStyle = 'rgba(245,158,11,0.09)';
    ctx.fillRect(boxX, boxY, colW, boxH);
  }

  if (selected && opts.cursor.active) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(245,158,11,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(selected.x, selected.y);
    ctx.lineTo(opts.cursor.x, opts.cursor.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const p of particles) {
    const r = RADIUS * p.scale;
    const color = getDotColor(p.node);
    const isEvent = p.node.node_type === 'event';
    ctx.globalAlpha = p.opacity;
    if (isEvent) {
      const borderColor = p.node.arc_color ?? DOT_COLOR_NEUTRAL;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = borderColor; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, r - 1.5, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (p.node.is_overdue && !opts.reducedMotion) {
      const pulse = (Math.sin(performance.now() / 420) + 1) / 2;
      ctx.strokeStyle = `rgba(255,59,59,${0.3 + pulse * 0.35})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 2 + pulse * 1.5, 0, Math.PI * 2); ctx.stroke();
    } else if (p.node.is_missed_schedule && !opts.reducedMotion) {
      const pulse = (Math.sin(performance.now() / 420) + 1) / 2;
      ctx.strokeStyle = `${DOT_COLOR_MISSED}${Math.round((0.3 + pulse * 0.35) * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 2 + pulse * 1.5, 0, Math.PI * 2); ctx.stroke();
    }
    if (opts.hoverNodeId === p.node.id) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke();
    }
    if (opts.selectedNodeId === p.node.id) {
      ctx.strokeStyle = `${ACC}e6`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2); ctx.stroke();
    }
    drawLabelBubble(ctx, p.node.title, p.x, p.y + r + 16, p.y, p.labelScale, opts.fontStack);
    ctx.globalAlpha = 1;
  }
}
