import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Target, TeachSharp, CheckboxOn, Notes } from 'pixelarticons/react';
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  getAllArcs, getAllProjects, getAllProjectCounts, getAllArcNodeCounts,
  getArcActivityHistory, getAllProjectActivity, getArcDateRanges, getProjectDateRanges,
  getArcNodeDates, getProjectNodeDates,
  createArc, updateArc, deleteArc, cascadeArcStatus,
  createProject, updateProject, deleteProject,
  type Arc, type Project, type ProjectStatus, type ProjectCounts, type ArcDayCount, type ProjectActivity, type DateRange, type NodeDayCount,
} from './lib/projectsDb';
import { STATUS_COLOR, brightenHex } from './lib/colors';
import GanttView from './components/GanttView';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#00c4a7';

const PALETTE = [
  '#00c4a7','#6366f1','#f59e0b','#e879f9','#f87171',
  '#34d399','#60a5fa','#fb923c','#a78bfa','#94a3b8',
];

function fmtDate(d: string | null): string {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${m}/${day}`;
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel = 'confirm', danger = false, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', padding: '28px 32px', width: 420 }}>
        <div style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 2, color: danger ? '#f87171' : 'rgba(255,255,255,0.8)', marginBottom: 14 }}>{title}</div>
        <div style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 28 }}>{body}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onCancel} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '4px 18px' }}>cancel</button>
          <button onClick={onConfirm} style={{ background: 'none', border: `1px solid ${danger ? 'rgba(248,113,113,0.4)' : `${ACC}55`}`, fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, color: danger ? '#f87171' : ACC, cursor: 'pointer', padding: '4px 18px' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, onChange, filled = false }: { status: ProjectStatus; onChange: (s: ProjectStatus) => void; filled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ fontFamily: VT, fontSize: filled ? '0.9rem' : '0.88rem', letterSpacing: 1.5, color: filled ? '#000' : STATUS_COLOR[status], cursor: 'pointer', userSelect: 'none', animation: filled ? 'dot-blink 1.2s step-start infinite' : 'none' }}>
        {`[${status}]`}
      </span>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#111', border: '1px solid rgba(255,255,255,0.1)', marginTop: 4, minWidth: 110 }}>
          {(['active','done','archived'] as ProjectStatus[]).map(s => (
            <div key={s} onClick={e => { e.stopPropagation(); onChange(s); setOpen(false); }}
              style={{ fontFamily: VT, fontSize: '0.78rem', letterSpacing: 1.5, color: STATUS_COLOR[s], padding: '5px 12px', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project modal ─────────────────────────────────────────────────────────────

function ProjectModal({ project, arcs, onSave, onDeleteRequest, onClose }: {
  project: Project; arcs: Arc[];
  onSave: (fields: Partial<Project>) => void;
  onDeleteRequest: () => void; onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.description || '');
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [arcId, setArcId] = useState(project.arc_id);
  const [startDate, setStartDate] = useState(project.start_date ?? '');
  const [endDate, setEndDate] = useState(project.end_date ?? '');

  const save = () => {
    onSave({ name: name.trim() || project.name, description: desc, status, arc_id: arcId, start_date: startDate || null, end_date: endDate || null });
    onClose();
  };

  const inp = { background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', outline: 'none', fontFamily: VT, fontSize: '1rem', letterSpacing: 1, color: 'rgba(255,255,255,0.8)', padding: '3px 0', width: '100%' };
  const lbl = { fontFamily: VT, fontSize: '0.7rem', letterSpacing: 2, color: 'rgba(255,255,255,0.28)', display: 'block' as const, marginBottom: 4 };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) save(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', padding: '32px 36px', width: 480 }}>
        <div style={{ marginBottom: 20 }}>
          <span style={lbl}>NAME</span>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} style={{ ...inp, fontSize: '1.3rem', letterSpacing: 2 }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <span style={lbl}>DESCRIPTION</span>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
            style={{ ...inp, borderBottom: 'none', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', resize: 'none', lineHeight: 1.7, width: '100%', boxSizing: 'border-box' as const }} />
        </div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <span style={lbl}>STATUS</span>
            <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
              style={{ ...inp, color: STATUS_COLOR[status], width: 'auto', cursor: 'pointer' }}>
              {(['active','done','archived'] as ProjectStatus[]).map(s => (
                <option key={s} value={s} style={{ background: '#111', color: STATUS_COLOR[s] }}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <span style={lbl}>ARC</span>
            <select value={arcId} onChange={e => setArcId(e.target.value)} style={{ ...inp, width: 'auto', cursor: 'pointer' }}>
              {arcs.map(a => <option key={a.id} value={a.id} style={{ background: '#111' }}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
          <div style={{ flex: 1 }}><span style={lbl}>START</span><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} /></div>
          <div style={{ flex: 1 }}><span style={lbl}>END</span><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onDeleteRequest}
            style={{ background: 'none', border: 'none', fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, color: 'rgba(248,113,113,0.4)', cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.4)'; }}>delete project</button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '4px 18px' }}>cancel</button>
            <button onClick={save} style={{ background: 'none', border: `1px solid ${ACC}55`, fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, color: ACC, cursor: 'pointer', padding: '4px 18px' }}
              onMouseEnter={e => { e.currentTarget.style.background = `${ACC}18`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, arcColor, counts, activity, onClick, onStatusChange }: {
  project: Project;
  arcColor: string;
  counts: ProjectCounts;
  activity: ProjectActivity | null;
  onClick: () => void;
  onStatusChange: (s: ProjectStatus) => void;
}) {
  const [hov, setHov] = useState(false);
  const dimmed = project.status === 'archived';


  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? `${arcColor}18` : `${arcColor}09`,
        border: `1px solid ${hov ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)'}`,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'background 0.1s, border-color 0.1s',
        display: 'flex', flexDirection: 'column', gap: 10,
        opacity: dimmed ? 0.45 : 1,
        minHeight: 96,
      }}
    >
      {/* Top: icon + name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <span style={{ color: arcColor, flexShrink: 0, marginTop: 2, opacity: 0.7 }}>
          <TeachSharp width={20} height={20} />
        </span>
        <span style={{
          fontFamily: VT, fontSize: '1.2rem', letterSpacing: 1, lineHeight: 1.2,
          color: dimmed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.82)',
          textDecoration: project.status === 'done' ? 'line-through' : 'none',
          flex: 1,
        }}>
          {project.name}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Sparkline */}
      {activity && project.status === 'active' && (
        <div style={{ height: 36, marginBottom: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activity.sparkline.map(v => ({ v }))} barSize={14} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis hide={false} axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} tickLine={false} tick={false} height={6} />
              <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                {activity.sparkline.map((v, i) => (
                  <Cell key={i} fill={v > 0 ? brightenHex(arcColor) : 'rgba(255,255,255,0.1)'} fillOpacity={v > 0 ? 0.8 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom row: status + stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusBadge status={project.status} onChange={onStatusChange} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: VT, fontSize: '1.1rem', color: 'rgba(255,255,255,0.45)', letterSpacing: 1 }}>
            <CheckboxOn width={16} height={16} />
            {counts.nodeCount}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: VT, fontSize: '1.1rem', color: 'rgba(255,255,255,0.45)', letterSpacing: 1 }}>
            <Notes width={16} height={16} />
            {counts.noteCount}
          </span>
        </div>
      </div>

      {/* Date range if present */}
      {(project.start_date || project.end_date) && (
        <div style={{ fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1, color: 'rgba(255,255,255,0.2)' }}>
          {project.start_date ? fmtDate(project.start_date) : '?'}{project.end_date ? ` → ${fmtDate(project.end_date)}` : ''}
        </div>
      )}
    </div>
  );
}

// ── Arc section ───────────────────────────────────────────────────────────────

function ArcSection({ arc, projects, allArcs, counts, arcNodeCounts, activity, onUpdateArc, onDeleteArcRequest, onCascadeStatus, onCreateProject, onUpdateProject, onDeleteProjectRequest }: {
  arc: Arc; projects: Project[]; allArcs: Arc[];
  counts: Map<string, ProjectCounts>;
  arcNodeCounts: Map<string, number>;
  activity: Map<string, ProjectActivity>;
  onUpdateArc: (id: string, fields: Partial<Arc>) => void;
  onDeleteArcRequest: (arc: Arc) => void;
  onCascadeStatus: (arc: Arc, status: ProjectStatus) => void;
  onCreateProject: (arcId: string, name: string) => void;
  onUpdateProject: (id: string, fields: Partial<Project>) => void;
  onDeleteProjectRequest: (project: Project) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(arc.name);
  const [descDraft, setDescDraft] = useState(arc.description);
  const [addingProject, setAddingProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (addingProject) setTimeout(() => newRef.current?.focus(), 0); }, [addingProject]);
  useEffect(() => { setDescDraft(arc.description); setTimeout(autoResizeDesc, 0); }, [arc.id]);

  const commitName = () => {
    if (nameDraft.trim()) onUpdateArc(arc.id, { name: nameDraft.trim() });
    setEditingName(false);
  };

  const commitDesc = () => {
    onUpdateArc(arc.id, { description: descDraft });
  };

  const autoResizeDesc = () => {
    const ta = descRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  };

  const commitNewProject = () => {
    if (newName.trim()) onCreateProject(arc.id, newName.trim());
    setNewName(''); setAddingProject(false);
  };

  const handleArcStatusChange = (s: ProjectStatus) => {
    if (s === 'active') { onUpdateArc(arc.id, { status: s }); return; }
    onCascadeStatus(arc, s);
  };

  // Arc aggregate stats
  const totalNodes = arcNodeCounts.get(arc.id) ?? 0;
  const totalNotes = projects.reduce((n, p) => n + (counts.get(p.id)?.noteCount ?? 0), 0);

  return (
    <div>
      {/* Arc header */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: brightenHex(arc.color_hex) }}>
        <span onClick={() => setCollapsed(c => !c)}
          style={{ fontFamily: VT, fontSize: '1rem', color: 'rgba(0,0,0,0.45)', cursor: 'pointer', userSelect: 'none', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>

        {/* Name + stats column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#000', display: 'flex', alignItems: 'center' }}><Target width={22} height={22} /></span>
            {editingName ? (
              <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                onBlur={commitName} onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.3)', outline: 'none', fontFamily: VT, fontSize: '1.5rem', letterSpacing: 3, color: '#000', padding: '0 2px' }} />
            ) : (
              <span onDoubleClick={() => { setNameDraft(arc.name); setEditingName(true); }}
                style={{ fontFamily: VT, fontSize: '1.5rem', letterSpacing: 3, color: '#000', textTransform: 'uppercase', cursor: 'text', userSelect: 'none' }}>
                {arc.name}
              </span>
            )}
            <StatusBadge status={arc.status} onChange={handleArcStatusChange} filled />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: VT, fontSize: '1rem', color: 'rgba(0,0,0,0.55)', letterSpacing: 1 }}>
              <TeachSharp width={16} height={16} />{projects.length}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: VT, fontSize: '1rem', color: 'rgba(0,0,0,0.55)', letterSpacing: 1 }}>
              <CheckboxOn width={16} height={16} />{totalNodes}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: VT, fontSize: '1rem', color: 'rgba(0,0,0,0.55)', letterSpacing: 1 }}>
              <Notes width={16} height={16} />{totalNotes}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={() => onDeleteArcRequest(arc)}
              style={{ background: 'none', border: 'none', fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1, color: 'rgba(0,0,0,0.6)', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = '#000'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.6)'; }}>[del]</button>
          </div>
        </div>
        </div>
      </div>

      {/* Arc description */}
      <textarea
        ref={descRef}
        value={descDraft}
        onChange={e => { setDescDraft(e.target.value); autoResizeDesc(); }}
        onBlur={commitDesc}
        onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.blur(); } }}
        placeholder="arc description..."
        rows={1}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
          outline: 'none', resize: 'none', overflow: 'hidden',
          fontFamily: VT, fontSize: '1rem', lineHeight: 1.7, letterSpacing: 0.5,
          color: 'rgba(255,255,255,0.45)', caretColor: ACC,
          padding: '4px 0 10px', marginBottom: 20,
        }}
      />

      {/* Project sections */}
      {!collapsed && (() => {
        const active   = projects.filter(p => p.status === 'active');
        const archived = projects.filter(p => p.status === 'archived');
        const done     = projects.filter(p => p.status === 'done');

        const grid = (ps: Project[], extra?: React.ReactNode) => (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {ps.map(p => (
              <ProjectCard
                key={p.id} project={p} arcColor={arc.color_hex}
                counts={counts.get(p.id) ?? { nodeCount: 0, noteCount: 0 }}
                activity={activity.get(p.id) ?? null}
                onClick={() => setEditingProject(p)}
                onStatusChange={s => onUpdateProject(p.id, { status: s })}
              />
            ))}
            {extra}
          </div>
        );

        const sectionLabel = (label: string) => (
          <div style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginTop: 20, marginBottom: 6 }}>{label}</div>
        );

        const addCard = addingProject ? (
          <div style={{ border: `1px dashed ${ACC}55`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: VT, fontSize: '0.9rem', color: ACC }}>›</span>
            <input ref={newRef} value={newName} onChange={e => setNewName(e.target.value)}
              onBlur={commitNewProject}
              onKeyDown={e => { if (e.key === 'Enter') commitNewProject(); if (e.key === 'Escape') { setAddingProject(false); setNewName(''); } }}
              placeholder="project name..."
              style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${ACC}55`, outline: 'none', fontFamily: VT, fontSize: '0.95rem', letterSpacing: 1, color: 'rgba(255,255,255,0.72)', padding: '1px 0', flex: 1 }} />
          </div>
        ) : (
          <div onClick={() => setAddingProject(true)}
            style={{ border: '1px dashed rgba(255,255,255,0.08)', padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.1s, background 0.1s', minHeight: 96 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${ACC}66`; e.currentTarget.style.background = 'rgba(0,196,167,0.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'transparent'; }}>
            <span style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2, color: 'rgba(255,255,255,0.45)' }}>+ project</span>
          </div>
        );

        return (
          <>
            {grid(active, addCard)}
            {archived.length > 0 && <>{sectionLabel('archived')}{grid(archived)}</>}
            {done.length > 0 && <>{sectionLabel('done')}{grid(done)}</>}
          </>
        );
      })()}

      {editingProject && (
        <ProjectModal
          project={editingProject} arcs={allArcs}
          onSave={fields => onUpdateProject(editingProject.id, fields)}
          onDeleteRequest={() => { setEditingProject(null); onDeleteProjectRequest(editingProject); }}
          onClose={() => setEditingProject(null)}
        />
      )}
    </div>
  );
}

// ── New Arc form ──────────────────────────────────────────────────────────────

function NewArcForm({ onSave, onCancel }: { onSave: (name: string, color: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const commit = () => { if (name.trim()) onSave(name.trim(), color); else onCancel(); };
  return (
    <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', padding: '20px 24px', marginBottom: 28 }}>
      <div style={{ fontFamily: VT, fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.28)', marginBottom: 10 }}>NEW ARC</div>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="arc name..."
        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', outline: 'none', fontFamily: VT, fontSize: '1.2rem', letterSpacing: 2, color: '#fff', padding: '2px 0', width: '100%', marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {PALETTE.map(c => (
          <div key={c} onClick={() => setColor(c)}
            style={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, color: 'rgba(255,255,255,0.28)', cursor: 'pointer' }}>cancel</button>
        <button onClick={commit} style={{ background: 'none', border: `1px solid ${ACC}55`, fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, color: ACC, cursor: 'pointer', padding: '3px 18px' }}>create</button>
      </div>
    </div>
  );
}

// ── Analytics Panel ───────────────────────────────────────────────────────────

function AnalyticsPanel({ arcs, history, currentArcId }: {
  arcs: Arc[];
  history: ArcDayCount[];
  currentArcId: string;
}) {
  const [hoveredArcId, setHoveredArcId] = useState<string | null>(null);

  // Last 30 days
  const today = new Date();
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const dailyMap = new Map<string, Map<string, number>>();
  for (const arc of arcs) dailyMap.set(arc.id, new Map());
  for (const row of history) dailyMap.get(row.arc_id)?.set(row.date, row.count);

  const lineData = days.map((date, i) => {
    const pt: Record<string, string | number> = { date: date.slice(5).replace('-', '/') };
    for (const arc of arcs) {
      let cum = 0;
      const m = dailyMap.get(arc.id)!;
      for (let j = 0; j <= i; j++) cum += m.get(days[j]) ?? 0;
      pt[arc.id] = cum;
    }
    return pt;
  });

  const tooltipStyle = { background: '#111', border: '1px solid rgba(255,255,255,0.1)', fontFamily: VT, fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0, height: 200, marginBottom: 28 }}>

      {/* Line chart: cumulative activity per arc over 30 days */}
      <div style={{ width: 1200, minWidth: 0 }}>
        <div style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 2, color: 'rgba(255,255,255,0.55)', marginBottom: 6, textTransform: 'uppercase' }}>30-day activity</div>
        <ResponsiveContainer width="100%" height="88%">
          <LineChart data={lineData} margin={{ top: 0, right: 4, left: 20, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontFamily: VT, fontSize: 15, fill: 'rgba(255,255,255,0.55)' }} axisLine={false} tickLine={false} interval={9} />
            <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
            <Tooltip contentStyle={tooltipStyle} />
            {arcs.map(arc => {
              const thick = hoveredArcId ? arc.id === hoveredArcId : arc.id === currentArcId;
              return (
                <Line key={arc.id} type="monotone" dataKey={arc.id} stroke={brightenHex(arc.color_hex)}
                  strokeWidth={thick ? 2.5 : 1} strokeOpacity={thick ? 1 : 0.6}
                  dot={false} name={arc.name} />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type ConfirmState =
  | { kind: 'delete-arc'; arc: Arc }
  | { kind: 'delete-project'; project: Project }
  | { kind: 'cascade-status'; arc: Arc; status: ProjectStatus };

export default function ProjectsPlugin() {
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Map<string, ProjectCounts>>(new Map());
  const [arcNodeCounts, setArcNodeCounts] = useState<Map<string, number>>(new Map());
  const [history, setHistory] = useState<ArcDayCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewArc, setShowNewArc] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [activity, setActivity] = useState<Map<string, ProjectActivity>>(new Map());
  const [tab, setTab] = useState<'arcs' | 'gantt'>('arcs');
  const [arcRanges, setArcRanges] = useState<Map<string, DateRange>>(new Map());
  const [projectRanges, setProjectRanges] = useState<Map<string, DateRange>>(new Map());
  const [arcNodeDates, setArcNodeDates] = useState<Map<string, NodeDayCount[]>>(new Map());
  const [projectNodeDates, setProjectNodeDates] = useState<Map<string, NodeDayCount[]>>(new Map());

  const load = useCallback(async () => {
    const [a, p, c, anc, h, act, ar, pr, and, pnd] = await Promise.all([
      getAllArcs(), getAllProjects(), getAllProjectCounts(), getAllArcNodeCounts(),
      getArcActivityHistory(), getAllProjectActivity(), getArcDateRanges(), getProjectDateRanges(),
      getArcNodeDates(), getProjectNodeDates(),
    ]);
    setArcs(a); setProjects(p); setCounts(c); setArcNodeCounts(anc); setHistory(h); setActivity(act);
    setArcRanges(ar); setProjectRanges(pr); setArcNodeDates(and); setProjectNodeDates(pnd); setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreateArc = async (name: string, color: string) => {
    const arc = await createArc(name, color);
    setArcs(prev => [...prev, arc]);
    setShowNewArc(false);
  };

  const handleUpdateArc = async (id: string, fields: Partial<Arc>) => {
    await updateArc(id, fields);
    setArcs(prev => prev.map(a => a.id === id ? { ...a, ...fields } : a));
  };

  const handleConfirmDeleteArc = async (arc: Arc) => {
    await deleteArc(arc.id);
    setArcs(prev => prev.filter(a => a.id !== arc.id));
    setProjects(prev => prev.filter(p => p.arc_id !== arc.id));
    setIdx(i => Math.max(0, i - 1));
    setConfirm(null);
  };

  const handleConfirmCascade = async (arc: Arc, status: ProjectStatus) => {
    await cascadeArcStatus(arc.id, status);
    setArcs(prev => prev.map(a => a.id === arc.id ? { ...a, status } : a));
    setProjects(prev => prev.map(p => p.arc_id === arc.id ? { ...p, status } : p));
    setConfirm(null);
  };

  const handleCreateProject = async (arcId: string, name: string) => {
    const p = await createProject(arcId, name);
    setProjects(prev => [...prev, p]);
  };

  const handleUpdateProject = async (id: string, fields: Partial<Project>) => {
    await updateProject(id, fields);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...fields } : p));
  };

  const handleConfirmDeleteProject = async (project: Project) => {
    await deleteProject(project.id);
    setProjects(prev => prev.filter(p => p.id !== project.id));
    setConfirm(null);
  };

  const navigate = useCallback((d: 1 | -1) => {
    setDir(d);
    setIdx(i => (i + d + arcs.length) % arcs.length);
  }, [arcs.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') navigate(1);
      else if (e.key === 'ArrowLeft') navigate(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', fontFamily: VT, color: 'rgba(255,255,255,0.2)', fontSize: '1rem', letterSpacing: 2 }}>loading...</div>
  );

  const sortedArcs = [...arcs].sort((a, b) => {
    const score = (arc: Arc) => {
      const ps = projects.filter(p => p.arc_id === arc.id);
      return ps.length + (arcNodeCounts.get(arc.id) ?? 0) + ps.reduce((n, p) => n + (counts.get(p.id)?.noteCount ?? 0), 0);
    };
    return score(b) - score(a);
  });
  const currentArc = sortedArcs[idx] ?? null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>
      <style>{`@keyframes dot-blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>

      {/* ── Top bar ── */}
      <div style={{ padding: '112px 160px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
          <span style={{ fontFamily: VT, fontSize: '2rem', letterSpacing: 5, color: ACC, textTransform: 'uppercase', lineHeight: 1 }}>arcs & projects</span>
          <div style={{ flex: 1 }} />
          {tab === 'arcs' && (
            <button onClick={() => setShowNewArc(true)}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', fontFamily: VT, fontSize: '0.88rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '4px 18px', transition: 'all 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
              + new arc
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2.4rem', paddingBottom: '0.7rem' }}>
          {(['arcs', 'gantt'] as const).map((t, i) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background:    'none',
                  border:        'none',
                  padding:       0,
                  cursor:        'pointer',
                  fontFamily:    VT,
                  letterSpacing: active ? '3px' : '1.5px',
                  lineHeight:    1,
                  display:       'flex',
                  alignItems:    'center',
                  gap:           '0.4rem',
                  transition:    'all 0.12s ease',
                }}
              >
                <span style={{ fontSize: '1.1rem', color: active ? ACC : 'rgba(255,255,255,0.22)', transition: 'color 0.12s ease' }}>
                  {i + 1}
                </span>
                <span style={{
                  fontSize:      active ? '2.6rem' : '1.45rem',
                  color:         active ? '#fff' : 'rgba(255,255,255,0.28)',
                  textTransform: active ? 'uppercase' : 'lowercase',
                  transition:    'font-size 0.12s ease, color 0.12s ease',
                }}>
                  {t}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'gantt' && (
        <GanttView
          arcs={arcs} projects={projects}
          arcRanges={arcRanges} projectRanges={projectRanges}
          arcNodeDates={arcNodeDates} projectNodeDates={projectNodeDates}
        />
      )}

      {tab === 'arcs' && showNewArc && (
        <div style={{ padding: '0 160px', flexShrink: 0 }}>
          <NewArcForm onSave={handleCreateArc} onCancel={() => setShowNewArc(false)} />
        </div>
      )}

      {tab === 'arcs' && arcs.length === 0 && !showNewArc && (
        <div style={{ padding: '0 160px', fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.1)', letterSpacing: 2 }}>no arcs yet — click + new arc to start</div>
      )}

      {/* ── Analytics ── */}
      {tab === 'arcs' && sortedArcs.length > 0 && (
        <AnalyticsPanel
          arcs={sortedArcs}
          history={history}
          currentArcId={currentArc!.id}
        />
      )}

      {/* ── Dot indicators (outside carousel, always visible) ── */}
      {tab === 'arcs' && sortedArcs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '0 0 20px', flexShrink: 0 }}>
          {sortedArcs.map((a, i) => (
            <div key={a.id} onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i); }}
              style={{ width: i === idx ? 18 : 6, height: 6, background: i === idx ? currentArc!.color_hex : 'rgba(255,255,255,0.15)', cursor: 'pointer', transition: 'width 0.2s ease, background 0.2s ease' }} />
          ))}
        </div>
      )}

      {/* ── Carousel ── */}
      {tab === 'arcs' && sortedArcs.length > 0 && currentArc && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 20 }}>

          <button onClick={() => navigate(-1)}
            style={{ flexShrink: 0, marginTop: 10, background: 'none', border: 'none', fontFamily: VT, fontSize: '1.6rem', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}>‹</button>

          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={currentArc.id}
              custom={dir}
              variants={{
                initial: (d: number) => ({ x: d * 50, opacity: 0 }),
                animate: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -50, opacity: 0 }),
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.32, 0, 0.18, 1] }}
              style={{ width: 1200, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 80 }}
            >
              <ArcSection
                arc={currentArc}
                projects={projects.filter(p => p.arc_id === currentArc.id)}
                allArcs={arcs} counts={counts} arcNodeCounts={arcNodeCounts} activity={activity}
                onUpdateArc={handleUpdateArc}
                onDeleteArcRequest={a => setConfirm({ kind: 'delete-arc', arc: a })}
                onCascadeStatus={(a, s) => setConfirm({ kind: 'cascade-status', arc: a, status: s })}
                onCreateProject={handleCreateProject}
                onUpdateProject={handleUpdateProject}
                onDeleteProjectRequest={p => setConfirm({ kind: 'delete-project', project: p })}
              />
            </motion.div>
          </AnimatePresence>

          <button onClick={() => navigate(1)}
            style={{ flexShrink: 0, marginTop: 10, background: 'none', border: 'none', fontFamily: VT, fontSize: '1.6rem', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}>›</button>

        </div>
      )}

      {confirm?.kind === 'delete-arc' && (
        <ConfirmModal title="delete arc"
          body={`Deleting "${confirm.arc.name}" will permanently remove all its projects and unassign any linked notes and planner tasks. This cannot be undone.`}
          confirmLabel="delete" danger
          onConfirm={() => handleConfirmDeleteArc(confirm.arc)} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'delete-project' && (
        <ConfirmModal title="delete project"
          body={`Deleting "${confirm.project.name}" will unassign any linked notes and planner tasks. This cannot be undone.`}
          confirmLabel="delete" danger
          onConfirm={() => handleConfirmDeleteProject(confirm.project)} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'cascade-status' && (
        <ConfirmModal title="change arc status"
          body={`Setting "${confirm.arc.name}" to "${confirm.status}" will also change all ${projects.filter(p => p.arc_id === confirm.arc.id).length} project(s) in this arc to "${confirm.status}".`}
          onConfirm={() => handleConfirmCascade(confirm.arc, confirm.status)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
