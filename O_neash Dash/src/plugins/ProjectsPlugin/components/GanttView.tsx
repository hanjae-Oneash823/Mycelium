import { useState } from 'react';
import { createPortal } from 'react-dom';
import { brightenHex, STATUS_COLOR } from '../lib/colors';
import type { Arc, Project, DateRange, NodeDayCount, ProjectStatus } from '../lib/projectsDb';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#00c4a7';
const MIN_BAR_PCT = 1.2;
const DAY_MS = 86400000;
const TICK_MIN = 5;
const TICK_MAX = 11;
const LABEL_COL_WIDTH = 220;

function parseDate(s: string | null): number | null {
  if (!s) return null;
  const ms = new Date(s.replace(' ', 'T')).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function fmtAxisDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

// ── Status dot ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ProjectStatus }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: STATUS_COLOR[status], flexShrink: 0,
    }} />
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────

function GanttTooltip({ label, startMs, endMs, anchorX, anchorY }: {
  label: string; startMs: number; endMs: number; anchorX: number; anchorY: number;
}) {
  const w = 220;
  const left = Math.max(8, Math.min(anchorX - w / 2, window.innerWidth - w - 8));

  return createPortal(
    <div style={{
      position: 'fixed', left, top: anchorY - 10, transform: 'translateY(-100%)',
      width: w, background: '#0c0c0c', border: '1px solid rgba(255,255,255,0.10)',
      padding: '5px 10px 6px', zIndex: 9000, pointerEvents: 'none',
      fontFamily: VT, boxShadow: '0 4px 20px rgba(0,0,0,0.85)',
    }}>
      <div style={{ fontSize: '1.1rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        &gt;&nbsp;{label}
      </div>
      <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5, marginTop: 2 }}>
        {fmtAxisDate(startMs)} → {fmtAxisDate(endMs)}
      </div>
    </div>,
    document.body,
  );
}

// ── Duration track: a thin line for the overall span + ticks per active day ──

function DurationTrack({ startMs, endMs, rangeStart, rangeMs, color, height, label, nodeDays }: {
  startMs: number; endMs: number; rangeStart: number; rangeMs: number;
  color: string; height: number; label: string; nodeDays: NodeDayCount[];
}) {
  const leftPct = ((startMs - rangeStart) / rangeMs) * 100;
  const widthPct = Math.max(((endMs - startMs) / rangeMs) * 100, MIN_BAR_PCT);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      style={{ position: 'relative', height, flex: 1 }}
      onMouseEnter={e => setHoverPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setHoverPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHoverPos(null)}
    >
      <div style={{
        position: 'absolute', top: '50%', height: 2, transform: 'translateY(-50%)',
        left: `${leftPct}%`, width: `${widthPct}%`,
        background: `${color}50`, borderRadius: 1, pointerEvents: 'none',
      }} />

      {nodeDays.map(({ day, count }) => {
        const dayMs = parseDate(day);
        if (dayMs === null) return null;
        const pct = ((dayMs - rangeStart) / rangeMs) * 100;
        const size = Math.min(TICK_MIN + (count - 1) * 1.5, TICK_MAX);
        return (
          <div key={day} style={{
            position: 'absolute', top: '50%', left: `${pct}%`,
            width: size, height: size, borderRadius: '50%',
            background: color, transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }} />
        );
      })}

      {hoverPos && (
        <GanttTooltip label={label} startMs={startMs} endMs={endMs} anchorX={hoverPos.x} anchorY={hoverPos.y} />
      )}
    </div>
  );
}

// ── Row building ───────────────────────────────────────────────────────────

interface ProjectRow {
  project: Project;
  startMs: number;
  endMs: number;
  nodeDays: NodeDayCount[];
}

interface ArcRow {
  arc: Arc;
  startMs: number;
  endMs: number;
  nodeDays: NodeDayCount[];
  projects: ProjectRow[];
}

function buildRows(
  arcs: Arc[], projects: Project[],
  arcRanges: Map<string, DateRange>, projectRanges: Map<string, DateRange>,
  arcNodeDates: Map<string, NodeDayCount[]>, projectNodeDates: Map<string, NodeDayCount[]>,
): ArcRow[] {
  const rows: ArcRow[] = [];
  for (const arc of arcs) {
    const range = arcRanges.get(arc.id);
    const startMs = parseDate(range?.start ?? null);
    const endMs = parseDate(range?.end ?? null);
    if (startMs === null || endMs === null) continue;

    const childProjects = projects.filter(p => p.arc_id === arc.id);
    const projectRows: ProjectRow[] = childProjects.flatMap(project => {
      const pRange = projectRanges.get(project.id);
      const pStart = parseDate(pRange?.start ?? null);
      const pEnd = parseDate(pRange?.end ?? null);
      if (pStart === null || pEnd === null) return [];
      return [{ project, startMs: pStart, endMs: Math.max(pEnd, pStart), nodeDays: projectNodeDates.get(project.id) ?? [] }];
    });

    rows.push({
      arc, startMs, endMs: Math.max(endMs, startMs),
      nodeDays: arcNodeDates.get(arc.id) ?? [],
      projects: projectRows,
    });
  }
  return rows;
}

// ── Main view ──────────────────────────────────────────────────────────────

export default function GanttView({ arcs, projects, arcRanges, projectRanges, arcNodeDates, projectNodeDates }: {
  arcs: Arc[]; projects: Project[];
  arcRanges: Map<string, DateRange>; projectRanges: Map<string, DateRange>;
  arcNodeDates: Map<string, NodeDayCount[]>; projectNodeDates: Map<string, NodeDayCount[]>;
}) {
  const rows = buildRows(arcs, projects, arcRanges, projectRanges, arcNodeDates, projectNodeDates);

  if (rows.length === 0) {
    return (
      <div style={{ padding: '40px 160px', fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.2)', letterSpacing: 2 }}>
        no dated nodes yet — gantt needs at least one node per arc
      </div>
    );
  }

  const rangeStart = Math.min(...rows.map(r => r.startMs));
  const rangeEndRaw = Math.max(...rows.map(r => r.endMs));
  const rangeEnd = Math.max(rangeEndRaw, rangeStart + DAY_MS);
  const rangeMs = rangeEnd - rangeStart;

  const todayMs = Date.now();
  const todayPct = todayMs >= rangeStart && todayMs <= rangeEnd ? ((todayMs - rangeStart) / rangeMs) * 100 : null;

  return (
    <div style={{ padding: '0 160px 80px', overflowY: 'auto', flex: 1 }}>
      <div style={{ position: 'relative' }}>
        {/* Axis */}
        <div style={{ display: 'flex', marginBottom: 16 }}>
          <div style={{ width: LABEL_COL_WIDTH, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontFamily: VT, fontSize: '0.78rem', letterSpacing: 1, color: 'rgba(255,255,255,0.3)' }}>
            <span>{fmtAxisDate(rangeStart)}</span>
            <span>{fmtAxisDate(rangeEnd)}</span>
          </div>
        </div>

        {rows.map(row => (
          <div key={row.arc.id} style={{ marginBottom: 14 }}>
            {/* Arc row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: LABEL_COL_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                <StatusDot status={row.arc.status} />
                <span style={{
                  fontFamily: VT, fontSize: '1rem', letterSpacing: 1, color: 'rgba(255,255,255,0.85)',
                  textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {row.arc.name}
                </span>
              </div>
              <DurationTrack
                startMs={row.startMs} endMs={row.endMs} rangeStart={rangeStart} rangeMs={rangeMs}
                color={brightenHex(row.arc.color_hex)} height={22} label={row.arc.name} nodeDays={row.nodeDays}
              />
            </div>

            {/* Project sub-rows */}
            {row.projects.map(({ project, startMs, endMs, nodeDays }) => (
              <div key={project.id} style={{ display: 'flex', alignItems: 'center', marginTop: 3 }}>
                <div style={{ width: LABEL_COL_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, paddingRight: 12, paddingLeft: 18 }}>
                  <StatusDot status={project.status} />
                  <span style={{
                    fontFamily: VT, fontSize: '0.8rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.4)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {project.name}
                  </span>
                </div>
                <DurationTrack
                  startMs={startMs} endMs={endMs} rangeStart={rangeStart} rangeMs={rangeMs}
                  color={`${row.arc.color_hex}aa`} height={14} label={project.name} nodeDays={nodeDays}
                />
              </div>
            ))}
          </div>
        ))}

        {/* "Today" marker, positioned within the bar track (right of the fixed label column) */}
        {todayPct !== null && (
          <div style={{ position: 'absolute', top: 32, bottom: 0, left: LABEL_COL_WIDTH, right: 0, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`, width: 1, background: `${ACC}88` }} />
          </div>
        )}
      </div>
    </div>
  );
}
