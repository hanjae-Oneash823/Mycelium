import { useMemo, useState, useEffect } from 'react';
import { ArrowLeftBox, ArrowRightBox, CornerUpRight } from 'pixelarticons/react';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import { buildArcPositions, detectCongestion, addMonths, windowLabel } from '../lib/arcBuilder';
import ArcForm from '../components/ArcForm';
import ProjectForm from '../components/ProjectForm';
import type { Arc, Project } from '../types';

const WINDOW_MONTHS = 4;
const ROW_H = 100; // px per arc row
const BAR_H = 26;
const PROJ_BAR_H = 16;
const LABEL_W = 190;

export default function ArcView() {
  const { nodes, arcs, projects, archiveArc, deleteArc, deleteProject } = usePlannerStore();
  const { setActiveView, setFocusContext } = useViewStore();

  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1); d.setHours(0, 0, 0, 0);
    return d;
  });
  const [arcFormOpen, setArcFormOpen] = useState(false);
  const [editArc, setEditArc] = useState<Arc | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; arc: Arc } | null>(null);
  const [projContextMenu, setProjContextMenu] = useState<{ x: number; y: number; project: Project; arcId: string } | null>(null);
  const [projFormOpen, setProjFormOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editProjDefaultArcId, setEditProjDefaultArcId] = useState<string | null>(null);

  const windowEnd = useMemo(() => addMonths(windowStart, WINDOW_MONTHS), [windowStart]);

  // Build task count map per project
  const nodeCounts = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const n of nodes) {
      if (!n.project_id) continue;
      const cur = map.get(n.project_id) ?? { total: 0, done: 0 };
      cur.total++;
      if (n.is_completed) cur.done++;
      map.set(n.project_id, cur);
    }
    return map;
  }, [nodes]);

  const arcPositions = useMemo(
    () => buildArcPositions(arcs, projects, nodeCounts, windowStart, windowEnd),
    [arcs, projects, nodeCounts, windowStart, windowEnd]
  );

  const congestionBands = useMemo(() => detectCongestion(arcs), [arcs]);

  // Today position %
  const nowPct = useMemo(() => {
    const span = windowEnd.getTime() - windowStart.getTime();
    const pct = (Date.now() - windowStart.getTime()) / span * 100;
    return Math.max(0, Math.min(100, pct));
  }, [windowStart, windowEnd]);

  // Close context menus on click away
  useEffect(() => {
    if (!contextMenu && !projContextMenu) return;
    const close = () => { setContextMenu(null); setProjContextMenu(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu, projContextMenu]);

  const goToFocusArc = (arc: Arc) => {
    setFocusContext({ type: 'arc', id: arc.id });
    setActiveView('focus');
  };

  const goToFocusProject = (proj: Project) => {
    setFocusContext({ type: 'project', id: proj.id });
    setActiveView('focus');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'VT323', monospace" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        {/* Left spacer */}
        <div style={{ flex: 1 }} />
        {/* Centered nav group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setWindowStart(w => addMonths(w, -1))}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center' }}
          ><ArrowLeftBox size={22} /></button>
          <button
            onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1); d.setHours(0,0,0,0); setWindowStart(d); }}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', letterSpacing: '1.5px', padding: '3px 10px', cursor: 'pointer' }}
          >TODAY</button>
          <span style={{ fontSize: '1rem', letterSpacing: '2.5px', color: 'rgba(255,255,255,0.5)', padding: '0 0.5rem' }}>
            {windowLabel(windowStart, windowEnd)}
          </span>
          <button
            onClick={() => setWindowStart(w => addMonths(w, 1))}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center' }}
          ><ArrowRightBox size={22} /></button>
        </div>
        {/* Right: new arc button */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => { setEditArc(null); setArcFormOpen(true); }}
            style={{ background: 'transparent', border: '1px solid rgba(0,196,167,0.5)', color: '#00c4a7', fontSize: '1rem', letterSpacing: '2px', padding: '3px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          ><CornerUpRight size={16} /> new arc</button>
        </div>
      </div>

      {/* Timeline area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {arcs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.5rem' }}>
            <div style={{ fontSize: '1.4rem', letterSpacing: '4px', color: 'rgba(255,255,255,0.08)' }}>no arcs</div>
            <button onClick={() => { setEditArc(null); setArcFormOpen(true); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.3)', padding: '4px 14px', fontSize: '0.85rem', letterSpacing: '2px', cursor: 'pointer' }}>
              ＋ new arc
            </button>
          </div>
        ) : (
          <div style={{ minHeight: '100%' }}>
            {/* Month tick marks */}
            <div style={{ position: 'relative', height: 30, borderBottom: '1px solid rgba(255,255,255,0.06)', marginLeft: LABEL_W }}>
              {Array.from({ length: WINDOW_MONTHS + 1 }).map((_, i) => {
                const d = addMonths(windowStart, i);
                const pct = (d.getTime() - windowStart.getTime()) / (windowEnd.getTime() - windowStart.getTime()) * 100;
                return (
                  <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                    <span style={{ fontSize: '0.85rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                      {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                    </span>
                  </div>
                );
              })}
              {/* NOW line in header */}
              <div style={{ position: 'absolute', left: `${nowPct}%`, top: 0, bottom: 0, borderLeft: '1px solid #ff3b3b', pointerEvents: 'none' }} />
            </div>

            {/* Arc rows */}
            {arcPositions.map(ap => (
              <div key={ap.arc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', minHeight: ROW_H, display: 'flex' }}>
                {/* Label col */}
                <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                  <button
                    onClick={() => goToFocusArc(ap.arc)}
                    style={{ background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                  >
                    <span style={{ fontSize: '1.1rem', letterSpacing: '1px', color: ap.arc.color_hex, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: ap.arc.color_hex, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ap.arc.name}</span>
                    </span>
                  </button>
                  {/* All projects for this arc — including those with < 2 tasks (no bar) */}
                  {projects.filter(p => p.arc_id === ap.arc.id).map(p => {
                    const hasBar = ap.projects.some(pp => pp.project.id === p.id);
                    const color = p.color_hex ?? ap.arc.color_hex;
                    return (
                      <button
                        key={p.id}
                        onClick={() => goToFocusProject(p)}
                        onContextMenu={e => { e.preventDefault(); setProjContextMenu({ x: e.clientX, y: e.clientY, project: p, arcId: ap.arc.id }); }}
                        style={{ background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '0 0 0 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                        title={hasBar ? p.name : `${p.name} (no timeline bar — needs 2+ tasks)`}
                      >
                        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, display: 'inline-block', flexShrink: 0, opacity: hasBar ? 1 : 0.4 }} />
                        <span style={{ fontSize: '0.85rem', letterSpacing: '1px', color: hasBar ? color : 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setEditProject(null); setEditProjDefaultArcId(ap.arc.id); setProjFormOpen(true); }}
                    style={{ background: 'transparent', border: 'none', fontSize: '0.85rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', textAlign: 'left', padding: 0, marginTop: 4 }}
                  >＋ project</button>
                </div>

                {/* Timeline col */}
                <div style={{ flex: 1, position: 'relative', padding: '8px 0' }}>
                  {/* Congestion bands */}
                  {congestionBands.map((band, i) => {
                    const span = windowEnd.getTime() - windowStart.getTime();
                    const l = Math.max(0, (band.startMs - windowStart.getTime()) / span * 100);
                    const w = Math.min(100 - l, (band.endMs - band.startMs) / span * 100);
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: `${l}%`, width: `${w}%`, top: 0, bottom: 0,
                        background: band.severity === 'red' ? 'rgba(255,59,59,0.05)' : 'rgba(245,200,66,0.04)',
                        pointerEvents: 'none',
                      }} />
                    );
                  })}

                  {/* NOW line */}
                  <div style={{ position: 'absolute', left: `${nowPct}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(255,59,59,0.4)', pointerEvents: 'none', zIndex: 2 }} />

                  {/* Arc bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${ap.leftPct}%`,
                      width: `${ap.widthPct}%`,
                      top: 10,
                      height: BAR_H,
                      background: `${ap.arc.color_hex}22`,
                      border: `1px solid ${ap.arc.color_hex}66`,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden',
                    }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, arc: ap.arc }); }}
                    onClick={() => goToFocusArc(ap.arc)}
                    title={ap.arc.name}
                  >
                    <span style={{ fontSize: '0.9rem', letterSpacing: '1px', color: ap.arc.color_hex, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ap.arc.name}
                    </span>
                  </div>

                  {/* Project sub-bars */}
                  {ap.projects.map((pp, pi) => {
                    const donePct = pp.taskCount > 0 ? pp.doneCount / pp.taskCount * 100 : 0;
                    return (
                      <div
                        key={pp.project.id}
                        style={{
                          position: 'absolute',
                          left: `${pp.leftPct}%`,
                          width: `${pp.widthPct}%`,
                          top: 10 + BAR_H + 4 + pi * (PROJ_BAR_H + 2),
                          height: PROJ_BAR_H,
                          background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${pp.project.color_hex ?? ap.arc.color_hex}44`,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                        }}
                        onClick={() => goToFocusProject(pp.project)}
                        onContextMenu={e => { e.preventDefault(); setProjContextMenu({ x: e.clientX, y: e.clientY, project: pp.project, arcId: ap.arc.id }); }}
                        title={`${pp.project.name} (right-click to edit/delete)`}
                      >
                        {/* Completion fill */}
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${donePct}%`, background: `${pp.project.color_hex ?? ap.arc.color_hex}44`, transition: 'width 0.3s' }} />
                        <span style={{ position: 'relative', fontSize: '0.8rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.6)', paddingLeft: 5, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {pp.project.name}
                        </span>
                      </div>
                    );
                  })}

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NOW label at bottom */}
      <div style={{ padding: '4px 1rem', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff3b3b' }} />
        <span style={{ fontSize: '0.85rem', letterSpacing: '2px', color: 'rgba(255,59,59,0.7)' }}>NOW</span>
        <span style={{ fontSize: '0.85rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.25)' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
        </span>
      </div>

      {/* Arc context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
            background: '#111', border: '1px solid rgba(255,255,255,0.15)',
            minWidth: 140, fontFamily: "'VT323', monospace",
          }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: 'edit', action: () => { setEditArc(contextMenu.arc); setArcFormOpen(true); setContextMenu(null); } },
            { label: 'archive', action: async () => { await archiveArc(contextMenu.arc.id); setContextMenu(null); } },
            { label: 'delete', action: async () => { if (confirm(`Delete arc "${contextMenu.arc.name}"? Nodes will be orphaned.`)) { await deleteArc(contextMenu.arc.id); } setContextMenu(null); } },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent',
                border: 'none', color: item.label === 'delete' ? '#ff3b3b' : 'rgba(255,255,255,0.7)',
                fontSize: '0.85rem', letterSpacing: '1.5px', cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Project context menu */}
      {projContextMenu && (
        <div
          style={{
            position: 'fixed', left: projContextMenu.x, top: projContextMenu.y, zIndex: 9999,
            background: '#111', border: '1px solid rgba(255,255,255,0.15)',
            minWidth: 140, fontFamily: "'VT323', monospace",
          }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: 'edit', action: () => { setEditProject(projContextMenu.project); setEditProjDefaultArcId(projContextMenu.arcId); setProjFormOpen(true); setProjContextMenu(null); } },
            { label: 'delete', action: async () => { if (confirm(`Delete project "${projContextMenu.project.name}"?`)) { await deleteProject(projContextMenu.project.id); } setProjContextMenu(null); } },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent',
                border: 'none', color: item.label === 'delete' ? '#ff3b3b' : 'rgba(255,255,255,0.7)',
                fontSize: '0.85rem', letterSpacing: '1.5px', cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Arc form modal */}
      <ArcForm
        open={arcFormOpen}
        editArc={editArc}
        onClose={() => { setArcFormOpen(false); setEditArc(null); }}
      />

      {/* Project form modal */}
      <ProjectForm
        open={projFormOpen}
        editProject={editProject}
        defaultArcId={editProjDefaultArcId}
        onClose={() => { setProjFormOpen(false); setEditProject(null); setEditProjDefaultArcId(null); }}
      />
    </div>
  );
}
