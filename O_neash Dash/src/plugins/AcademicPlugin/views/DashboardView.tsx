import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { Project, Arc } from '../../ProjectsPlugin/lib/projectsDb';
import type { AcademicNode, CompletionPoint } from '../lib/academicDb';
import SubjectDetailView from './SubjectDetailView';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#f59e0b';

function fmtDue(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return 'today';
  if (diff === 1) return 'tmrw';
  return `in ${diff}d`;
}

function buildWeeklyActivity(history: CompletionPoint[]): { count: number }[] {
  if (history.length === 0) return [];
  const map = new Map(history.map(p => [p.date, p.count]));
  const firstDate = new Date([...map.keys()].sort()[0] + 'T00:00:00');
  const dow = firstDate.getDay() === 0 ? 6 : firstDate.getDay() - 1;
  firstDate.setDate(firstDate.getDate() - dow);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const result = [];
  for (const d = new Date(firstDate); d <= today; d.setDate(d.getDate() + 7)) {
    let weekTotal = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date(d); day.setDate(d.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      weekTotal += map.get(key) ?? 0;
    }
    result.push({ count: weekTotal });
  }
  return result;
}

// ── Project Picker Modal ──────────────────────────────────────────────────────

function ProjectPicker({
  allProjects, excludeIds, arcs, onSelect, onClose,
}: {
  allProjects: Project[];
  excludeIds: string[];
  arcs: Arc[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const arcMap = new Map(arcs.map(a => [a.id, a]));
  const available = allProjects.filter(p => !excludeIds.includes(p.id));

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.12)', padding: '28px 32px', width: 420, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 3, color: 'rgba(255,255,255,0.5)', marginBottom: 18, textTransform: 'uppercase' }}>
          select subject
        </div>
        {available.length === 0 && (
          <div style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>
            all projects are already added
          </div>
        )}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {available.map(p => {
            const arc = p.arc_id ? arcMap.get(p.arc_id) : null;
            return (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); onClose(); }}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  width: '100%', padding: '10px 14px', background: 'none',
                  border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.08s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 1, color: 'rgba(255,255,255,0.75)' }}>
                  {p.name}
                </span>
                {arc && (
                  <span style={{ fontFamily: VT, fontSize: '0.8rem', letterSpacing: 1, color: arc.color_hex, opacity: 0.7 }}>
                    {arc.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          style={{ marginTop: 18, alignSelf: 'flex-end', background: 'none', border: 'none', fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, color: 'rgba(255,255,255,0.25)', cursor: 'pointer' }}
        >
          cancel
        </button>
      </div>
    </div>
  );
}

// ── Subject Card ──────────────────────────────────────────────────────────────

function SubjectCard({
  project, arc, nodes, history, onRemove, onOpen,
}: {
  project: Project;
  arc: Arc | null;
  nodes: AcademicNode[];
  history: CompletionPoint[];
  onRemove: () => void;
  onOpen: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const accentColor = arc?.color_hex ?? ACC;
  const dailyData = buildWeeklyActivity(history);
  const incomplete = nodes.filter(n => !n.is_completed);

  const nextEvent = incomplete.find(n => n.node_type === 'event');
  const upcomingTasks = incomplete.filter(n => n.node_type === 'task').slice(0, 3);

  const tooltipStyle = {
    background: '#111', border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: VT, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)',
  };

  return (
    <div
      className="subject-card"
      onClick={() => { if (!confirmRemove) onOpen(); }}
      style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
    >
      {/* ── Card Header ── */}
      <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0, marginTop: 8 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: VT, fontSize: '1.55rem', letterSpacing: 1.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.name}
          </div>
          {arc && (
            <div style={{ fontFamily: VT, fontSize: '0.78rem', letterSpacing: 1, color: accentColor, opacity: 0.65, marginTop: 1 }}>
              {arc.name}
            </div>
          )}
        </div>

        {/* Remove button / inline confirm */}
        {confirmRemove ? (
          <div
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
          >
            <span style={{ fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>remove?</span>
            <button
              onClick={e => { e.stopPropagation(); onRemove(); }}
              style={{ background: 'none', border: 'none', fontFamily: VT, fontSize: '0.9rem', color: '#f87171', cursor: 'pointer', padding: '0 4px', letterSpacing: 1 }}
            >
              yes
            </button>
            <button
              onClick={e => { e.stopPropagation(); setConfirmRemove(false); }}
              style={{ background: 'none', border: 'none', fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '0 4px', letterSpacing: 1 }}
            >
              no
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirmRemove(true); }}
            style={{ background: 'none', border: 'none', fontFamily: VT, fontSize: '1.25rem', color: 'rgba(255,255,255,0.18)', cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.18)'; }}
          >
            ×
          </button>
        )}
      </div>

      {/* ── Weekly Activity Graph ── */}
      <div style={{ height: 80, padding: '8px 8px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dailyData} margin={{ top: 10, right: 2, left: 2, bottom: 10 }}>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'completed']} labelFormatter={() => ''} />
            <Line type="monotone" dataKey="count" stroke={accentColor} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Summary ── */}
      <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {nextEvent && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1.5, color: accentColor, flexShrink: 0, textTransform: 'uppercase' }}>
              exam
            </span>
            <span style={{ fontFamily: VT, fontSize: '0.95rem', color: 'rgba(255,255,255,0.7)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nextEvent.title}
            </span>
            <span style={{ fontFamily: VT, fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
              {fmtDue(nextEvent.due_at ?? nextEvent.planned_start_at)}
            </span>
          </div>
        )}
        {upcomingTasks.map(n => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: VT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>›</span>
            <span style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.55)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.title}
            </span>
            <span style={{ fontFamily: VT, fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
              {fmtDue(n.due_at ?? n.planned_start_at)}
            </span>
          </div>
        ))}
        {incomplete.length === 0 && (
          <div style={{ fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 1 }}>
            no pending items
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard View ────────────────────────────────────────────────────────────

interface Props {
  subjects: Project[];
  arcs: Arc[];
  allProjects: Project[];
  subjectIds: string[];
  nodeMap: Map<string, AcademicNode[]>;
  historyMap: Map<string, CompletionPoint[]>;
  onAddSubject: (id: string) => void;
  onRemoveSubject: (id: string) => void;
  onRefresh: () => void;
  onViewAllCanvases: () => void;
}

export default function DashboardView({
  subjects, arcs, allProjects, subjectIds,
  nodeMap, historyMap,
  onAddSubject, onRemoveSubject, onRefresh, onViewAllCanvases,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const arcMap = new Map(arcs.map(a => [a.id, a]));

  const openSubject = (id: string) => {
    setDirection('forward');
    setAnimKey(k => k + 1);
    setSelectedId(id);
  };

  const goBack = () => {
    setDirection('back');
    setAnimKey(k => k + 1);
    setSelectedId(null);
  };

  const transitionClass = direction === 'forward' ? 'page-enter-forward' : 'page-enter-back';

  // ── Detail view ──
  if (selectedId) {
    const project = subjects.find(p => p.id === selectedId);
    if (project) {
      return (
        <div key={animKey} className={transitionClass} style={{ height: '100%' }}>
          <SubjectDetailView
            project={project}
            arc={project.arc_id ? (arcMap.get(project.arc_id) ?? null) : null}
            nodes={nodeMap.get(project.id) ?? []}
            onBack={goBack}
            onRefresh={onRefresh}
            onViewAllCanvases={onViewAllCanvases}
          />
        </div>
      );
    }
  }

  // ── Grid view ──
  return (
    <div key={animKey} className={transitionClass} style={{ height: '100%', overflowY: 'auto', padding: '2.5rem 160px 80px' }}>
      {subjects.length === 0 && (
        <div style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 2, color: 'rgba(255,255,255,0.12)', paddingTop: 40 }}>
          no subjects yet — add one below
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {subjects.map(p => (
          <SubjectCard
            key={p.id}
            project={p}
            arc={p.arc_id ? (arcMap.get(p.arc_id) ?? null) : null}
            nodes={nodeMap.get(p.id) ?? []}
            history={historyMap.get(p.id) ?? []}
            onRemove={() => onRemoveSubject(p.id)}
            onOpen={() => openSubject(p.id)}
          />
        ))}
      </div>

      <button
        onClick={() => setPickerOpen(true)}
        style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2,
          color: 'rgba(255,255,255,0.25)', cursor: 'pointer',
          padding: '4px 20px', transition: 'all 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = ACC; e.currentTarget.style.borderColor = `${ACC}55`; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
      >
        + add subject
      </button>

      {pickerOpen && (
        <ProjectPicker
          allProjects={allProjects}
          excludeIds={subjectIds}
          arcs={arcs}
          onSelect={onAddSubject}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
