import { useMemo, useState } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import { formatDueLabel, formatEffortLabel } from '../lib/logicEngine';
import DotNode from '../components/DotNode';
import ArcForm from '../components/ArcForm';
import ProjectForm from '../components/ProjectForm';
import type { PlannerNode, Arc, Project } from '../types';

const SWATCH_COLORS = [
  '#00c4a7', '#64c8ff', '#4ade80', '#f5c842',
  '#ff6b35', '#ff3b3b', '#c084fc', '#f472b6',
  '#38bdf8', '#a3e635',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

interface ContextItem {
  type: 'all' | 'arc' | 'project' | 'group';
  id: string;
  label: string;
  color?: string;
  parentId?: string;
  taskCount: number;
  doneCount: number;
  raw?: Arc | Project | { id: string; name: string; color_hex: string };
}

function TaskRow({
  node,
  onComplete,
  onDelete,
  onEdit,
}: {
  node: PlannerNode;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const now = new Date();
  const dueLabel    = formatDueLabel(node.due_at, now);
  const effortLabel = formatEffortLabel(node.estimated_duration_minutes);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.045)',
        opacity: node.is_completed ? 0.3 : 1,
      }}
    >
      <DotNode node={node} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} />

      <span
        style={{
          flex: 1, fontSize: '0.9rem', letterSpacing: '0.5px',
          color: node.is_completed ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.82)',
          textDecoration: node.is_completed ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {node.title}
      </span>

      {dueLabel && (
        <span style={{ fontSize: '0.72rem', letterSpacing: '1px', color: node.is_overdue ? '#ff3b3b' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
          {dueLabel}
        </span>
      )}

      {effortLabel && (
        <span style={{ fontSize: '0.72rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.1)', padding: '1px 5px' }}>
          {effortLabel}
        </span>
      )}

      {node.groups?.filter(g => !g.is_ungrouped).map(g => (
        <span key={g.id} style={{ fontSize: '0.65rem', color: g.color_hex, whiteSpace: 'nowrap' }}>
          #{g.name}
        </span>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FocusView() {
  const { nodes, groups, arcs, projects, completeNode, deleteNode, updateGroup, deleteGroup, deleteArc, deleteProject } = usePlannerStore();
  const { focusContext, setFocusContext, openTaskFormEdit } = useViewStore();

  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  // Arc form
  const [arcFormOpen, setArcFormOpen] = useState(false);
  const [editArc, setEditArc]         = useState<Arc | null>(null);
  // Project form
  const [projFormOpen, setProjFormOpen] = useState(false);
  const [editProject, setEditProject]   = useState<Project | null>(null);
  // Group inline edit
  const [groupEditId, setGroupEditId]         = useState<string | null>(null);
  const [groupEditName, setGroupEditName]     = useState('');
  const [groupEditColor, setGroupEditColor]   = useState('');

  const startGroupEdit = (g: { id: string; name: string; color_hex: string }) => {
    setGroupEditId(g.id);
    setGroupEditName(g.name);
    setGroupEditColor(g.color_hex);
  };

  const commitGroupEdit = async () => {
    if (!groupEditId || !groupEditName.trim()) return;
    await updateGroup(groupEditId, { name: groupEditName.trim(), color_hex: groupEditColor });
    setGroupEditId(null);
  };

  // Build context items for left panel
  const contextItems = useMemo<ContextItem[]>(() => {
    const items: ContextItem[] = [];

    const allActive = nodes.filter(n => !n.is_completed);
    items.push({ type: 'all', id: '__all__', label: 'all tasks', taskCount: allActive.length, doneCount: 0 });

    for (const arc of arcs) {
      const arcNodes = nodes.filter(n => n.arc_id === arc.id);
      const arcDone  = arcNodes.filter(n => n.is_completed).length;
      items.push({ type: 'arc', id: arc.id, label: arc.name, color: arc.color_hex, taskCount: arcNodes.length, doneCount: arcDone, raw: arc });

      for (const proj of projects.filter(p => p.arc_id === arc.id)) {
        const pn   = nodes.filter(n => n.project_id === proj.id);
        const done = pn.filter(n => n.is_completed).length;
        items.push({ type: 'project', id: proj.id, label: proj.name, color: proj.color_hex ?? arc.color_hex, parentId: arc.id, taskCount: pn.length, doneCount: done, raw: proj });
      }
    }

    for (const proj of projects.filter(p => !p.arc_id)) {
      const pn   = nodes.filter(n => n.project_id === proj.id);
      const done = pn.filter(n => n.is_completed).length;
      items.push({ type: 'project', id: proj.id, label: proj.name, color: proj.color_hex ?? undefined, taskCount: pn.length, doneCount: done, raw: proj });
    }

    for (const g of groups.filter(grp => !grp.is_ungrouped)) {
      const gn   = nodes.filter(n => n.groups?.some(ng => ng.id === g.id));
      const done = gn.filter(n => n.is_completed).length;
      items.push({ type: 'group', id: g.id, label: g.name, color: g.color_hex, taskCount: gn.length, doneCount: done, raw: g });
    }

    return items;
  }, [nodes, groups, arcs, projects]);

  const filteredNodes = useMemo<PlannerNode[]>(() => {
    let pool: PlannerNode[];
    if (!focusContext || focusContext.id === '__all__') {
      pool = nodes;
    } else if (focusContext.type === 'arc') {
      pool = nodes.filter(n => n.arc_id === focusContext.id);
    } else if (focusContext.type === 'project') {
      pool = nodes.filter(n => n.project_id === focusContext.id);
    } else if (focusContext.type === 'group') {
      pool = nodes.filter(n => n.groups?.some(g => g.id === focusContext.id));
    } else {
      pool = nodes;
    }
    return [...pool].sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      if (b.computed_urgency_level !== a.computed_urgency_level) return b.computed_urgency_level - a.computed_urgency_level;
      const aTime = a.planned_start_at ? new Date(a.planned_start_at).getTime() : Infinity;
      const bTime = b.planned_start_at ? new Date(b.planned_start_at).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [nodes, focusContext]);

  const activeItem = contextItems.find(c => c.id === (focusContext?.id ?? '__all__')) ?? contextItems[0];

  const doneCount  = filteredNodes.filter(n => n.is_completed).length;
  const totalCount = filteredNodes.length;
  const pct        = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left: context tree ──────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ padding: '0.6rem 0.75rem 0.4rem', fontSize: '0.65rem', letterSpacing: '2.5px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
          context
        </div>

        {contextItems.map(item => {
          const isActive   = (focusContext?.id ?? '__all__') === item.id;
          const isHovered  = hoveredId === item.id;
          const isEditing  = item.type === 'group' && groupEditId === item.id;
          const indent     = item.type === 'project' && item.parentId ? 16 : 0;
          const barPct     = item.taskCount > 0 ? item.doneCount / item.taskCount : 0;

          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => { setHoveredId(null); }}
            >
              {/* Inline group edit form */}
              {isEditing ? (
                <div style={{ padding: `4px 12px 6px ${12 + indent}px`, borderLeft: '2px solid #f5c842', background: 'rgba(245,200,66,0.06)' }}>
                  <input
                    autoFocus
                    value={groupEditName}
                    onChange={e => setGroupEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitGroupEdit(); if (e.key === 'Escape') setGroupEditId(null); }}
                    style={{
                      width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(245,200,66,0.4)',
                      color: '#fff', fontSize: '0.85rem', fontFamily: "'VT323', monospace",
                      letterSpacing: '0.5px', outline: 'none', padding: '2px 0', marginBottom: 6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {SWATCH_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setGroupEditColor(c)}
                        style={{
                          width: 10, height: 10, borderRadius: '50%', background: c, border: 'none',
                          outline: groupEditColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2, cursor: 'pointer', flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={commitGroupEdit} style={{ background: 'transparent', border: '1px solid rgba(245,200,66,0.5)', color: '#f5c842', fontSize: '0.7rem', letterSpacing: '1px', padding: '2px 8px', cursor: 'pointer', fontFamily: "'VT323', monospace" }}>SAVE</button>
                    <button onClick={() => setGroupEditId(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer', fontFamily: "'VT323', monospace" }}>✕</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setFocusContext(item.type === 'all' ? null : { type: item.type as 'arc' | 'project' | 'group', id: item.id })}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: `5px 8px 5px ${12 + indent}px`,
                    background: isActive ? 'rgba(0,196,167,0.08)' : isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                    borderLeft: isActive ? '2px solid #00c4a7' : '2px solid transparent',
                    display: 'flex', flexDirection: 'column', gap: 3,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontSize: '0.85rem', letterSpacing: '0.5px', color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {item.color && (
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: item.color, marginRight: 6 }} />
                      )}
                      {item.label}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>
                      {item.taskCount}t
                    </span>
                    {/* Edit/delete actions on hover (non-all items) */}
                    {item.type !== 'all' && isHovered && (
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          title="edit"
                          onClick={e => {
                            e.stopPropagation();
                            if (item.type === 'arc') { setEditArc(item.raw as Arc); setArcFormOpen(true); }
                            else if (item.type === 'project') { setEditProject(item.raw as Project); setProjFormOpen(true); }
                            else if (item.type === 'group') { startGroupEdit(item.raw as { id: string; name: string; color_hex: string }); }
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px', lineHeight: 1 }}
                        >✎</button>
                        <button
                          title="delete"
                          onClick={async e => {
                            e.stopPropagation();
                            if (item.type === 'arc') {
                              if (confirm(`Delete arc "${item.label}"?`)) { await deleteArc(item.id); if (focusContext?.id === item.id) setFocusContext(null); }
                            } else if (item.type === 'project') {
                              if (confirm(`Delete project "${item.label}"?`)) { await deleteProject(item.id); if (focusContext?.id === item.id) setFocusContext(null); }
                            } else if (item.type === 'group') {
                              if (confirm(`Delete group "${item.label}"?`)) { await deleteGroup(item.id); if (focusContext?.id === item.id) setFocusContext(null); }
                            }
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'rgba(255,59,59,0.5)', cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px', lineHeight: 1 }}
                        >×</button>
                      </div>
                    )}
                  </div>
                  {item.type !== 'all' && item.taskCount > 0 && (
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.07)', width: '100%' }}>
                      <div style={{ height: '100%', width: `${barPct * 100}%`, background: item.color ?? '#00c4a7', transition: 'width 0.3s' }} />
                    </div>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Right: filtered task list ────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.75)' }}>
            {activeItem?.label ?? 'all tasks'}
          </span>
          <span style={{ fontSize: '0.75rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)' }}>
            {totalCount} tasks · {pct}% done
          </span>
          {totalCount > 0 && (
            <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#00c4a7', transition: 'width 0.3s' }} />
            </div>
          )}
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredNodes.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.9rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.1)' }}>
              no tasks here
            </div>
          ) : (
            filteredNodes.map(node => (
              <TaskRow
                key={node.id}
                node={node}
                onComplete={() => completeNode(node.id)}
                onDelete={() => deleteNode(node.id)}
                onEdit={() => openTaskFormEdit(node)}
              />
            ))
          )}
        </div>
      </div>

      {/* Edit modals */}
      <ArcForm
        open={arcFormOpen}
        editArc={editArc}
        onClose={() => { setArcFormOpen(false); setEditArc(null); }}
      />
      <ProjectForm
        open={projFormOpen}
        editProject={editProject}
        onClose={() => { setProjFormOpen(false); setEditProject(null); }}
      />
    </div>
  );
}
