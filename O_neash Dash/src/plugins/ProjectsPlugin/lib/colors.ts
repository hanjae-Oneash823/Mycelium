import type { ProjectStatus } from './projectsDb';

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  'active':   '#00c4a7',
  'done':     '#4ade80',
  'archived': 'rgba(255,255,255,0.25)',
};

export function brightenHex(hex: string, factor = 1.25): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
