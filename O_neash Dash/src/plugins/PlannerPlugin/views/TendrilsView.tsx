import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  EdgeLabelRenderer,
  getBezierPath,
  type Connection,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type NodeTypes,
  type EdgeTypes,
  type EdgeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { SquareCursor, ArrowLeftBox, ArrowRightBox, Gps2Sharp, PlusBox, Tournament } from 'pixelarticons/react';
import ProjectForm from '../components/ProjectForm';
import { useViewStore } from '../store/useViewStore';
import { usePlannerStore } from '../store/usePlannerStore';
import {
  loadTendrilEdges,
  loadProjectNodes,
  loadAllProjectNodeCounts,
  createTendrilEdge,
  deleteTendrilEdge,
  createPreNode,
  deletePreNode,
  type TendrilEdge,
  type ProjectNodeCounts,
} from '../lib/plannerDb';
import type { PlannerNode } from '../types';

// ─── Dagre layout ─────────────────────────────────────────────────────────────

const NODE_W = 220;
const NODE_H = 100;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(s: string) {
  const p = s.slice(0, 10).split('-');
  return `${MONTHS[+p[1] - 1]} ${+p[2]}`;
}

function layoutNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (nodes.length === 0) return { nodes, edges };
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 60 });
  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: nodes.map(n => {
      const p = g.node(n.id);
      return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
    }),
    edges,
  };
}

// ─── Module-level callback stores (bypass XyFlow memoization) ────────────────
const _nodeCbs = {
  onDeletePre: (_id: string) => {},
};

// ─── Module-level callback store (bypasses XyFlow edge memoization) ───────────
// XyFlow memoizes edge components and does not re-render them when only `data`
// changes, so callbacks stored in edge data become stale. We keep live refs here
// and read them directly from the edge component instead.
const _edgeCbs = {
  onInsert: (_id: string) => {},
  onDelete: (_id: string) => {},
};

// ─── Custom node ──────────────────────────────────────────────────────────────

type TendrilNodeData = { node: PlannerNode };

const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 10,
  height: 10,
};

function TendrilNode({ data, selected }: { data: TendrilNodeData; selected?: boolean }) {
  const { node } = data;
  const isPre     = !!node.is_pre_node;
  const isDone    = node.is_completed;
  const isOverdue = !isDone && !isPre && node.is_overdue;
  const mono      = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" } as const;

  // Status-derived colours
  const accentColor = isDone
    ? 'rgba(255,255,255,0.12)'
    : isOverdue
      ? '#ff3b3b'
      : isPre
        ? 'rgba(192,132,252,0.45)'
        : '#00c4a7';

  const borderStyle = isPre ? 'dashed' : 'solid';
  const borderColor = selected
    ? accentColor
    : isDone
      ? 'rgba(255,255,255,0.08)'
      : isOverdue
        ? 'rgba(255,59,59,0.55)'
        : isPre
          ? 'rgba(192,132,252,0.3)'
          : 'rgba(255,255,255,0.14)';

  const bgColor = isDone
    ? '#0d0d0d'
    : isOverdue
      ? '#120808'
      : isPre
        ? '#0d0b12'
        : selected
          ? '#071412'
          : '#0d0d0d';

  const badge = isDone
    ? 'DONE'
    : isOverdue
      ? 'OVERDUE'
      : isPre
        ? 'PRE-NODE'
        : node.node_type.toUpperCase();

  const badgeSuffix = selected && !isDone && !isPre ? ' · SELECTED' : '';

  const titleColor = isDone
    ? 'rgba(255,255,255,0.22)'
    : isPre
      ? 'rgba(192,132,252,0.75)'
      : '#fff';

  const dateStr = node.planned_start_at ?? node.due_at ?? null;
  const dateColor = isDone
    ? 'rgba(255,255,255,0.18)'
    : isOverdue
      ? '#ff6b35'
      : '#4ade80';

  return (
    <div style={{
      width: NODE_W,
      minHeight: NODE_H,
      boxSizing: 'border-box',
      padding: '10px 14px 10px 14px',
      background: bgColor,
      border: `1px ${borderStyle} ${borderColor}`,
      boxShadow: selected ? `0 0 0 1px ${accentColor}` : 'none',
      cursor: 'pointer',
      position: 'relative',
      transition: 'border-color 0.12s, box-shadow 0.12s',
    }}>
      <Handle type="target" position={Position.Left}  style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />

      {/* Badge */}
      <div style={{ ...mono, fontSize: '0.65rem', letterSpacing: '2px', color: accentColor, marginBottom: '0.28rem' }}>
        {badge}{badgeSuffix}
      </div>

      {/* Title */}
      <div style={{
        ...mono,
        fontSize: '1.15rem',
        letterSpacing: '0.5px',
        color: titleColor,
        lineHeight: 1.25,
        wordBreak: 'break-word',
        textDecoration: isDone ? 'line-through' : 'none',
        textDecorationColor: 'rgba(255,255,255,0.2)',
        marginBottom: '0.3rem',
      }}>
        {node.title}
      </div>

      {/* Footer row: date or assign hint */}
      {isPre ? (
        <div style={{ ...mono, fontSize: '0.8rem', letterSpacing: '1px', color: 'rgba(192,132,252,0.4)', fontStyle: 'italic' }}>
          + assign date
        </div>
      ) : dateStr ? (
        <div style={{ ...mono, fontSize: '0.88rem', letterSpacing: '1px', color: dateColor }}>
          {fmtDate(dateStr)}
        </div>
      ) : isDone ? (
        <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.18)' }}>
          ✓ complete
        </div>
      ) : null}
    </div>
  );
}

// ─── Custom edge with insert-between button ───────────────────────────────────

type TendrilEdgeData = {
  onInsert: (id: string) => void;
  onDelete: (id: string) => void;
  isDashed?: boolean;
};

function TendrilEdgeComponent(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props;
  const isDashed = (props.data as TendrilEdgeData | undefined)?.isDashed ?? false;
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const onEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const onLeave = () => {
    leaveTimer.current = setTimeout(() => setHovered(false), 120);
  };

  const mono = { fontFamily: "'VT323', monospace" } as const;
  const strokeColor = hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.18)';

  return (
    <>
      {/* Wide transparent hit area */}
      <path
        d={edgePath}
        stroke="transparent"
        strokeWidth={22}
        fill="none"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
      {/* Visible edge */}
      <path
        d={edgePath}
        stroke={strokeColor}
        strokeWidth={hovered ? 1.5 : 1}
        fill="none"
        strokeDasharray={isDashed ? '5 4' : undefined}
        style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
        markerEnd={markerEnd as string | undefined}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
      {/* Midpoint buttons: insert + delete */}
      <EdgeLabelRenderer>
        {hovered && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: 10,
              display: 'flex', gap: 3,
              pointerEvents: 'all',
            }}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            <button
              onClick={() => _edgeCbs.onInsert(id)}
              title="Insert node here"
              style={{
                ...mono, background: '#070707',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.45)',
                fontSize: '0.9rem', width: 20, height: 20,
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                padding: 0, lineHeight: 1,
              }}
            >+</button>
            <button
              onClick={() => _edgeCbs.onDelete(id)}
              title="Remove connection"
              style={{
                ...mono, background: '#070707',
                border: '1px solid rgba(255,59,59,0.35)',
                color: 'rgba(255,59,59,0.55)',
                fontSize: '0.8rem', width: 20, height: 20,
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                padding: 0, lineHeight: 1,
              }}
            >×</button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const NODE_TYPES: NodeTypes = { tendrilNode: TendrilNode as never };
const EDGE_TYPES: EdgeTypes = { tendrilEdge: TendrilEdgeComponent as never };

// ─── Promote panel (pre-node → task) ─────────────────────────────────────────

function PromotePanel({ node, onClose, onRefresh, onDelete }: {
  node: PlannerNode;
  onClose: () => void;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}) {
  const { updateNode, loadAll } = usePlannerStore();
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [closing, setClosing] = useState(false);

  const handleClose = () => { setClosing(true); setTimeout(onClose, 170); };

  const handleDelete = async () => { await onDelete(node.id); onClose(); };

  const handlePromote = async () => {
    if (!date) return;
    await updateNode(node.id, {
      is_pre_node: 0,
      planned_start_at: date,
      due_at: dueDate || null,
    });
    await loadAll(); // refresh main store so Today view picks it up
    onRefresh();     // refresh local project nodes so canvas updates
    handleClose();
  };

  const mono = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" } as const;

  const inputStyle: React.CSSProperties = {
    ...mono,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: '1rem',
    letterSpacing: '1px',
    padding: '3px 8px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    colorScheme: 'dark' as never,
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={handleClose}
    >
      <div
        className={closing ? 'dice-modal-out' : 'dice-modal-in'}
        style={{
          background: '#060606',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '1.4rem 1.6rem',
          minWidth: 310,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ ...mono, fontSize: '0.7rem', letterSpacing: '2.5px', color: 'rgba(0,196,167,0.5)', marginBottom: '0.25rem' }}>
          PRE-NODE
        </div>
        <div style={{ ...mono, fontSize: '1.25rem', letterSpacing: '1px', color: '#fff', marginBottom: '1.1rem', lineHeight: 1.2 }}>
          {node.title}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginBottom: '1rem' }} />

        {/* When field */}
        <div style={{ marginBottom: '0.7rem' }}>
          <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.32)', marginBottom: '0.25rem' }}>
            WHEN TO WORK ON IT
          </div>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            autoFocus
            style={{ ...inputStyle, borderColor: date ? 'rgba(0,196,167,0.45)' : 'rgba(255,255,255,0.15)' }}
          />
        </div>

        {/* Due field */}
        <div style={{ marginBottom: '1.2rem' }}>
          <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.32)', marginBottom: '0.25rem' }}>
            DUE DATE{' '}
            <span style={{ color: 'rgba(255,255,255,0.18)' }}>(optional)</span>
          </div>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={handleDelete}
            style={{
              ...mono, background: 'transparent',
              border: '1px solid rgba(255,59,59,0.3)',
              color: 'rgba(255,59,59,0.5)',
              fontSize: '0.9rem', letterSpacing: '1.5px',
              padding: '3px 14px', cursor: 'pointer',
              marginRight: 'auto',
            }}
          >delete</button>
          <button
            onClick={handleClose}
            style={{
              ...mono, background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.3)',
              fontSize: '0.9rem', letterSpacing: '1.5px',
              padding: '3px 14px', cursor: 'pointer',
            }}
          >cancel</button>
          <button
            onClick={handlePromote}
            disabled={!date}
            style={{
              ...mono, background: 'transparent',
              border: `1px solid ${date ? 'rgba(0,196,167,0.55)' : 'rgba(255,255,255,0.08)'}`,
              color: date ? 'var(--teal)' : 'rgba(255,255,255,0.18)',
              fontSize: '0.9rem', letterSpacing: '1.5px',
              padding: '3px 14px', cursor: date ? 'pointer' : 'default',
            }}
          >promote →</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tendrils Hub ─────────────────────────────────────────────────────────────

function TendrilsHub() {
  const { openTendrils } = useViewStore();
  const { projects, arcs } = usePlannerStore();
  const [hovered, setHovered] = useState<string | null>(null);
  const [countsByProject, setCountsByProject] = useState<Map<string, ProjectNodeCounts>>(new Map());
  const [projFormOpen, setProjFormOpen] = useState(false);

  const mono = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" } as const;

  useEffect(() => {
    loadAllProjectNodeCounts().then(rows => {
      setCountsByProject(new Map(rows.map(r => [r.project_id, r])));
    });
  }, []);

  const activeProjects = projects.filter(p => !p.is_archived);

  // Group projects by arc (null arc = ungrouped)
  const grouped = useMemo(() => {
    const map = new Map<string | null, typeof activeProjects>();
    for (const p of activeProjects) {
      const key = p.arc_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [activeProjects]);

  const arcMap = useMemo(() => new Map(arcs.map(a => [a.id, a])), [arcs]);

  const arcOrder = [
    ...arcs.filter(a => !a.is_archived).map(a => a.id),
    null, // ungrouped last
  ] as (string | null)[];

  if (activeProjects.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...mono, fontSize: '1.1rem', letterSpacing: '3px', color: 'rgba(255,255,255,0.1)' }}>
          no active projects
        </span>
      </div>
    );
  }

  return (
    <>
    <div style={{
      height: '100%', overflowY: 'auto', padding: '2rem 2.5rem',
      display: 'flex', flexDirection: 'column', gap: '2.4rem',
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <SquareCursor size={22} style={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0 }} />
        <span style={{ ...mono, fontSize: '1.5rem', letterSpacing: '4px', color: 'rgba(255,255,255,0.55)' }}>
          SELECT PROJECT
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setProjFormOpen(true)}
          style={{
            ...mono, background: 'transparent',
            border: '1px solid rgba(0,196,167,0.35)',
            color: 'var(--teal)', fontSize: '1rem',
            letterSpacing: '2px', padding: '2px 14px', cursor: 'pointer',
          }}
        >+ new project</button>
      </div>

      {/* Project groups */}
      {arcOrder.map(arcId => {
        const group = grouped.get(arcId);
        if (!group || group.length === 0) return null;
        const arc = arcId ? arcMap.get(arcId) : null;
        const arcColor = arc?.color_hex ?? 'rgba(255,255,255,0.18)';

        return (
          <div key={arcId ?? '__none__'}>
            {/* Arc label */}
            <div style={{
              ...mono, fontSize: '1.4rem', letterSpacing: '3px',
              color: arcColor, marginBottom: '0.9rem',
              display: 'flex', alignItems: 'center', gap: '0.7rem',
            }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, background: arcColor, flexShrink: 0 }} />
              {arc?.name.toUpperCase() ?? 'UNGROUPED'}
            </div>

            {/* Project cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
              {group.map(p => {
                const counts = countsByProject.get(p.id) ?? { total: 0, active: 0, done: 0 };
                const color = p.color_hex ?? '#00c4a7';
                const isHov = hovered === p.id;

                return (
                  <button
                    key={p.id}
                    onClick={() => openTendrils(p.id)}
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      ...mono,
                      background: isHov ? 'rgba(255,255,255,0.04)' : 'transparent',
                      border: `1px solid ${isHov ? color : 'rgba(255,255,255,0.1)'}`,
                      cursor: 'pointer',
                      padding: '0.7rem 1.1rem',
                      minWidth: 180, maxWidth: 260,
                      textAlign: 'left',
                      transition: 'border-color 0.12s, background 0.12s',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Project name */}
                    <div style={{
                      fontSize: '1.2rem', letterSpacing: '1.5px',
                      color: isHov ? color : '#fff',
                      lineHeight: 1.2, marginBottom: '0.35rem',
                      transition: 'color 0.12s',
                    }}>
                      {p.name}
                    </div>

                    {/* Stats — two lines */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                      <span style={{ fontSize: '0.8rem', letterSpacing: '1.5px', color: '#4ade80' }}>
                        {counts.active} active
                      </span>
                      <span style={{ fontSize: '0.8rem', letterSpacing: '1.5px', color: 'rgba(255,80,80,0.5)' }}>
                        {counts.done} done
                      </span>
                    </div>

                    {/* Arrow hint on hover */}
                    {isHov && (
                      <div style={{
                        position: 'absolute', right: 10, top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '1rem', color,
                        opacity: 0.6,
                      }}>→</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>

    {projFormOpen && (
      <ProjectForm
        open={projFormOpen}
        editProject={null}
        defaultArcId={null}
        onClose={() => setProjFormOpen(false)}
      />
    )}
  </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function TendrilsView() {
  const { tendrilsProjectId, openTendrilsHub, openTaskFormEdit, taskFormOpen } = useViewStore();
  const { projects, arcs, loadAll, subTasksByNode, loadSubTasks, toggleSubTask } = usePlannerStore();

  const project = useMemo(
    () => projects.find(p => p.id === tendrilsProjectId),
    [projects, tendrilsProjectId],
  );
  const projectColor = project?.color_hex ?? '#00c4a7';
  const projectArc = useMemo(() => arcs.find(a => a.id === project?.arc_id), [arcs, project]);

  const [projectNodes, setProjectNodes] = useState<PlannerNode[]>([]);
  const [dbEdges, setDbEdges] = useState<TendrilEdge[]>([]);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [promoteNode, setPromoteNode] = useState<PlannerNode | null>(null);
  const [addingNode, setAddingNode] = useState(false);
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const hasAutoFocused = useRef(false);

  const refreshNodes = useCallback(() => {
    if (!tendrilsProjectId) return;
    loadProjectNodes(tendrilsProjectId).then(setProjectNodes);
  }, [tendrilsProjectId]);

  // Find the undone node closest in date to today
  const findClosestUndoneId = useCallback((nodes: PlannerNode[]): string | null => {
    const todayMs = Date.now();
    const candidates = nodes.filter(n => !n.is_completed && !n.is_pre_node);
    if (candidates.length === 0) return nodes.find(n => !n.is_pre_node)?.id ?? nodes[0]?.id ?? null;
    let best: PlannerNode | null = null;
    let bestDist = Infinity;
    for (const n of candidates) {
      const ds = n.planned_start_at ?? n.due_at;
      if (!ds) continue;
      const dist = Math.abs(new Date(ds).getTime() - todayMs);
      if (dist < bestDist) { bestDist = dist; best = n; }
    }
    return best?.id ?? candidates[0].id;
  }, []);

  // Center the viewport on a node and mark it as focused
  const focusNode = useCallback((nodeId: string) => {
    const fn = flowNodes.find(n => n.id === nodeId);
    if (!fn || !rfInstance.current) return;
    const x = fn.position.x + NODE_W / 2;
    const y = fn.position.y + NODE_H / 2;
    rfInstance.current.setCenter(x, y, { duration: 380, zoom: 1.5 });
    setFocusedNodeId(nodeId);
  }, [flowNodes]);

  // Highlight focused node via XyFlow selection
  useEffect(() => {
    if (!focusedNodeId) return;
    setFlowNodes(ns => ns.map(n => ({ ...n, selected: n.id === focusedNodeId })));
  }, [focusedNodeId, setFlowNodes]);

  // Auto-focus closest undone node once after initial layout
  useEffect(() => {
    if (flowNodes.length === 0 || hasAutoFocused.current) return;
    const id = findClosestUndoneId(projectNodes);
    if (!id) return;
    setTimeout(() => { focusNode(id); hasAutoFocused.current = true; }, 500);
  }, [flowNodes, projectNodes, focusNode, findClosestUndoneId]);

  // Reset auto-focus flag when project changes
  useEffect(() => { hasAutoFocused.current = false; }, [tendrilsProjectId]);

  // Predecessors and successors of the focused node
  const predecessors = useMemo(
    () => focusedNodeId ? flowEdges.filter(e => e.target === focusedNodeId).map(e => e.source) : [],
    [focusedNodeId, flowEdges],
  );
  const successors = useMemo(
    () => focusedNodeId ? flowEdges.filter(e => e.source === focusedNodeId).map(e => e.target) : [],
    [focusedNodeId, flowEdges],
  );

  const focusedNode = useMemo(
    () => projectNodes.find(n => n.id === focusedNodeId) ?? null,
    [projectNodes, focusedNodeId],
  );

  const IMPORTANCE_LABELS = ['low', 'medium', 'high', 'critical', 'urgent'];

  // Load subtasks when focused node changes
  useEffect(() => {
    if (focusedNode && (focusedNode.sub_total ?? 0) > 0 && !subTasksByNode[focusedNode.id]) {
      loadSubTasks(focusedNode.id);
    }
  }, [focusedNode, subTasksByNode, loadSubTasks]);

  // Load project nodes (including completed) on mount / project change
  useEffect(() => { refreshNodes(); }, [refreshNodes]);

  // Refresh when TaskForm closes (user may have edited a node)
  const prevTaskFormOpen = useRef(taskFormOpen);
  useEffect(() => {
    if (prevTaskFormOpen.current && !taskFormOpen) refreshNodes();
    prevTaskFormOpen.current = taskFormOpen;
  }, [taskFormOpen, refreshNodes]);

  // Sort nodes by date for chaining: dated nodes first (by planned_start_at ?? due_at),
  // pre-nodes / undated nodes appended at the end sorted by created_at.
  const sortedForChain = useCallback((nodes: PlannerNode[]): PlannerNode[] => {
    const dated = nodes
      .filter(n => n.planned_start_at || n.due_at)
      .sort((a, b) => {
        const da = (a.planned_start_at ?? a.due_at)!;
        const db = (b.planned_start_at ?? b.due_at)!;
        return da.localeCompare(db);
      });
    const undated = nodes
      .filter(n => !n.planned_start_at && !n.due_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return [...dated, ...undated];
  }, []);

  const handleAutoChain = useCallback(async (nodes: PlannerNode[], existingEdges: TendrilEdge[]) => {
    if (!tendrilsProjectId || nodes.length < 2) return;
    // Clear all existing edges first
    await Promise.all(existingEdges.map(e => deleteTendrilEdge(e.id)));
    const ordered = sortedForChain(nodes);
    const newEdges: TendrilEdge[] = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const id = await createTendrilEdge(tendrilsProjectId, ordered[i].id, ordered[i + 1].id);
      newEdges.push({ id, project_id: tendrilsProjectId, source_id: ordered[i].id, target_id: ordered[i + 1].id, created_at: new Date().toISOString() });
    }
    setDbEdges(newEdges);
  }, [tendrilsProjectId, sortedForChain]);

  // Load edges on project change; auto-chain if none exist
  useEffect(() => {
    if (!tendrilsProjectId) return;
    loadTendrilEdges(tendrilsProjectId).then(async edges => {
      if (edges.length === 0 && projectNodes.length > 1) {
        await handleAutoChain(projectNodes, []);
      } else {
        setDbEdges(edges);
      }
    });
  // projectNodes intentionally omitted — only run on project change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tendrilsProjectId]);

  // Rebuild graph when data changes
  useEffect(() => {
    const validIds = new Set(projectNodes.map(n => n.id));
    const preIds   = new Set(projectNodes.filter(n => n.is_pre_node).map(n => n.id));

    const fNodes: FlowNode[] = projectNodes.map(n => ({
      id: n.id,
      type: 'tendrilNode',
      position: { x: 0, y: 0 }, // temp — overridden below
      data: { node: n } as TendrilNodeData,
    }));

    const fEdges: FlowEdge[] = dbEdges
      .filter(e => validIds.has(e.source_id) && validIds.has(e.target_id))
      .map(e => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: 'tendrilEdge',
        data: {
          onInsert: handleInsertBetween,
          onDelete: handleDeleteEdge,
          isDashed: preIds.has(e.source_id) || preIds.has(e.target_id),
        } as TendrilEdgeData,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'rgba(255,255,255,0.22)',
          width: 14, height: 14,
        },
      }));

    const { nodes: laid, edges: laidEdges } = layoutNodes(fNodes, fEdges);
    setFlowNodes(laid);
    setFlowEdges(laidEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectNodes, dbEdges]);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const onConnect = useCallback(async (connection: Connection) => {
    if (!tendrilsProjectId || !connection.source || !connection.target) return;
    const dupe = dbEdges.some(
      e => e.source_id === connection.source && e.target_id === connection.target,
    );
    if (dupe) return;
    const id = await createTendrilEdge(tendrilsProjectId, connection.source, connection.target);
    setDbEdges(prev => [
      ...prev,
      { id, project_id: tendrilsProjectId, source_id: connection.source!, target_id: connection.target!, created_at: new Date().toISOString() },
    ]);
  }, [tendrilsProjectId, dbEdges]);

  const onEdgesDelete = useCallback(async (edges: FlowEdge[]) => {
    await Promise.all(edges.map(e => deleteTendrilEdge(e.id)));
    const removed = new Set(edges.map(e => e.id));
    setDbEdges(prev => prev.filter(e => !removed.has(e.id)));
  }, []);

  const handleDeleteEdge = useCallback(async (edgeId: string) => {
    await deleteTendrilEdge(edgeId);
    setDbEdges(prev => prev.filter(e => e.id !== edgeId));
  }, []);

  const onNodesDelete = useCallback(async (nodes: FlowNode[]) => {
    for (const n of nodes) {
      const pn = projectNodes.find(p => p.id === n.id);
      if (pn?.is_pre_node) await deletePreNode(n.id);
    }
    refreshNodes();
  }, [projectNodes, refreshNodes]);

  const onNodeClick = useCallback((_evt: React.MouseEvent, node: FlowNode) => {
    const pn = projectNodes.find(p => p.id === node.id);
    if (!pn) return;
    if (pn.is_pre_node) {
      setPromoteNode(pn);
    } else {
      openTaskFormEdit(pn);
    }
  }, [projectNodes, openTaskFormEdit]);

  // Phase 3: insert a pre-node between two connected nodes
  const handleInsertBetween = useCallback(async (edgeId: string) => {
    const edge = dbEdges.find(e => e.id === edgeId);
    if (!edge || !tendrilsProjectId) return;

    const newId = await createPreNode(tendrilsProjectId, 'new node');
    await deleteTendrilEdge(edgeId);
    const id1 = await createTendrilEdge(tendrilsProjectId, edge.source_id, newId);
    const id2 = await createTendrilEdge(tendrilsProjectId, newId, edge.target_id);

    refreshNodes();
    setDbEdges(prev => [
      ...prev.filter(e => e.id !== edgeId),
      { id: id1, project_id: tendrilsProjectId, source_id: edge.source_id, target_id: newId, created_at: new Date().toISOString() },
      { id: id2, project_id: tendrilsProjectId, source_id: newId, target_id: edge.target_id, created_at: new Date().toISOString() },
    ]);
  }, [dbEdges, tendrilsProjectId, refreshNodes]);

  // Keep module-level callback stores current — must be after useCallbacks above
  _edgeCbs.onInsert = handleInsertBetween;
  _edgeCbs.onDelete = handleDeleteEdge;
  _nodeCbs.onDeletePre = async (id: string) => {
    await deletePreNode(id);
    refreshNodes();
  };

  const handleAddNode = async () => {
    const title = newNodeTitle.trim();
    if (!title || !tendrilsProjectId) return;
    await createPreNode(tendrilsProjectId, title);
    refreshNodes();
    setNewNodeTitle('');
    setAddingNode(false);
  };

  const mono = { fontFamily: "'VT323', 'HBIOS-SYS', monospace" } as const;

  // ── Hub ↔ Canvas page transition ───────────────────────────────────────────
  const [displayHub, setDisplayHub] = useState(!tendrilsProjectId);
  const [pageAnim, setPageAnim]     = useState<'in' | 'out' | null>(null);
  const prevIsHubRef = useRef(!tendrilsProjectId);

  useEffect(() => {
    const isHub = !tendrilsProjectId;
    if (isHub === prevIsHubRef.current) return;
    prevIsHubRef.current = isHub;
    setPageAnim('out');
    let t2: ReturnType<typeof setTimeout>;
    const t = setTimeout(() => {
      setDisplayHub(isHub);
      setPageAnim('in');
      t2 = setTimeout(() => setPageAnim(null), 220);
    }, 200);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [tendrilsProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageStyle: React.CSSProperties = pageAnim === 'out'
    ? { animation: 'plannerPageOut 0.2s ease forwards' }
    : pageAnim === 'in' ? { animation: 'plannerPageIn 0.22s ease forwards' } : {};

  if (displayHub) return (
    <div style={{ width: '100%', height: '100%', ...pageStyle }}>
      <TendrilsHub />
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...pageStyle }}>

      {/* Header — breadcrumb + count only */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.8rem',
        padding: '0.45rem 0',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {/* ARC / PROJECT breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {projectArc && (
            <>
              <span style={{ ...mono, fontSize: '1.1rem', letterSpacing: '2px', color: projectArc.color_hex }}>
                {projectArc.name}
              </span>
              <span style={{ ...mono, fontSize: '0.9rem', color: 'rgba(255,255,255,0.2)' }}>/</span>
            </>
          )}
          <span style={{ ...mono, color: projectColor, fontSize: '1.1rem', letterSpacing: '2px' }}>
            {project?.name ?? '—'}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Node/edge count */}
        {projectNodes.length > 0 && (
          <span style={{ ...mono, fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)' }}>
            {projectNodes.length} node{projectNodes.length !== 1 ? 's' : ''}
            {dbEdges.length > 0 && <> · {dbEdges.length} edge{dbEdges.length !== 1 ? 's' : ''}</>}
          </span>
        )}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', border: '1.5px solid rgba(255,255,255,0.18)' }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={onNodesDelete}
          onNodeClick={onNodeClick}
          onInit={(inst) => { rfInstance.current = inst; }}
          nodesDraggable={false}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1.5 }}
          minZoom={0.3}
          maxZoom={3}
          deleteKeyCode="Delete"
          style={{ background: '#000', width: '100%', height: '100%' }}
        >
          <Background color="rgba(255,255,255,0.18)" gap={28} size={1.2} variant={BackgroundVariant.Dots} />
          <Controls />
        </ReactFlow>

        {/* Back button — top-left of canvas */}
        <button
          onClick={() => openTendrilsHub()}
          title="Back to project select"
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 10,
            background: 'transparent', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
            color: 'rgba(255,255,255,0.35)', padding: 0,
            transition: 'color 0.12s',
          }}
        >
          <ArrowLeftBox size={20} />
          <Tournament size={20} />
        </button>

        {/* + node button — top right of canvas */}
        {addingNode ? (
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            display: 'flex', gap: 5, alignItems: 'center',
            background: '#0d0d0d', border: '1px solid rgba(0,196,167,0.4)',
            padding: '3px 8px',
          }}>
            <input
              ref={inputRef}
              value={newNodeTitle}
              onChange={e => setNewNodeTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddNode();
                if (e.key === 'Escape') { setAddingNode(false); setNewNodeTitle(''); }
              }}
              placeholder="node title..."
              autoFocus
              style={{
                ...mono, background: 'transparent', border: 'none',
                color: '#fff', fontSize: '0.9rem', letterSpacing: '1px',
                width: 180, outline: 'none',
              }}
            />
            <button onClick={handleAddNode} style={{ ...mono, background: 'transparent', border: 'none', color: 'var(--teal)', fontSize: '0.9rem', cursor: 'pointer', padding: 0 }}>add</button>
            <button onClick={() => { setAddingNode(false); setNewNodeTitle(''); }} style={{ ...mono, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', cursor: 'pointer', padding: 0 }}>✕</button>
          </div>
        ) : (
          <button
            onClick={() => { setAddingNode(true); setTimeout(() => inputRef.current?.focus(), 40); }}
            title="Add pre-node"
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 10,
              background: 'transparent', border: 'none',
              color: 'var(--teal)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', padding: 0,
            }}
          >
            <PlusBox size={22} />
          </button>
        )}

        {/* Floating nav panel — always shows left + right, disabled at ends */}
        {flowNodes.length > 0 && (
          <div style={{
            position: 'absolute', top: 10, left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10, display: 'flex', alignItems: 'center', gap: 0,
            background: '#0d0d0d',
            border: '1px solid rgba(255,255,255,0.12)',
            padding: '2px 4px',
          }}>
            {/* Left arrow — always shown, disabled when no predecessors */}
            <button
              onClick={() => predecessors[0] && focusNode(predecessors[0])}
              title="Previous node"
              disabled={predecessors.length === 0}
              style={{
                background: 'transparent', border: 'none',
                cursor: predecessors.length > 0 ? 'pointer' : 'default',
                color: predecessors.length > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', padding: '2px 4px',
                transition: 'color 0.12s',
              }}
            >
              <ArrowLeftBox size={20} />
            </button>

            {/* GPS — focus nearest undone */}
            <button
              onClick={() => { const id = findClosestUndoneId(projectNodes); if (id) focusNode(id); }}
              title="Focus nearest active task"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--teal)', display: 'flex',
                alignItems: 'center', padding: '2px 6px',
              }}
            >
              <Gps2Sharp size={20} />
            </button>

            {/* Right arrow — always shown, disabled when no successors */}
            <button
              onClick={() => successors[0] && focusNode(successors[0])}
              title="Next node"
              disabled={successors.length === 0}
              style={{
                background: 'transparent', border: 'none',
                cursor: successors.length > 0 ? 'pointer' : 'default',
                color: successors.length > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', padding: '2px 4px',
                transition: 'color 0.12s',
              }}
            >
              <ArrowRightBox size={20} />
            </button>
          </div>
        )}

        {/* Focused node info — just above the node card (above canvas center) */}
        {focusedNode && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(50% + 120px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9,
            pointerEvents: 'none',
            background: 'rgba(0,0,0,0.82)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '6px 14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            minWidth: 200,
          }}>
            {/* Arc / project / groups */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {projectArc && (
                <span style={{ ...mono, fontSize: '1.1rem', letterSpacing: '2px', color: projectArc.color_hex }}>
                  {projectArc.name}
                </span>
              )}
              {projectArc && <span style={{ ...mono, fontSize: '1rem', color: 'rgba(255,255,255,0.2)' }}>/</span>}
              <span style={{ ...mono, fontSize: '1.1rem', letterSpacing: '2px', color: projectColor }}>
                {project?.name}
              </span>
              {focusedNode.groups?.filter(g => !g.is_ungrouped).map(g => (
                <React.Fragment key={g.id}>
                  <span style={{ ...mono, fontSize: '1rem', color: 'rgba(255,255,255,0.2)' }}>/</span>
                  <span style={{ ...mono, fontSize: '1.1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)' }}>
                    {g.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
            {/* Node specifics */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {(() => {
                const URGENCY_COLORS: Record<number, string> = { 0: '#c084fc', 1: '#00c4a7', 2: '#64c8ff', 3: '#ff6b35', 4: '#ff3b3b' };
                const lvl = focusedNode.computed_urgency_level ?? 0;
                return (
                  <span style={{ ...mono, fontSize: '1rem', letterSpacing: '2px', color: URGENCY_COLORS[lvl] }}>
                    L{lvl}
                  </span>
                );
              })()}
              {focusedNode.estimated_duration_minutes && (
                <span style={{ ...mono, fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.45)' }}>
                  {focusedNode.estimated_duration_minutes}min
                </span>
              )}
              {focusedNode.planned_start_at && (
                <span style={{ ...mono, fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.45)' }}>
                  {fmtDate(focusedNode.planned_start_at)}
                </span>
              )}
              {focusedNode.due_at && (
                <span style={{ ...mono, fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.45)' }}>
                  due {fmtDate(focusedNode.due_at)}
                </span>
              )}
            </div>
            {/* Subtask checklist */}
            {(() => {
              const subs = subTasksByNode[focusedNode.id];
              if (!subs || subs.length === 0) return null;
              const done = subs.filter(s => s.is_completed).length;
              const filled = Math.round((done / subs.length) * 5);
              const bar = '■'.repeat(filled) + '□'.repeat(5 - filled);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', width: '100%', marginTop: 2, pointerEvents: 'auto' }}>
                  <div style={{ ...mono, fontSize: '0.9rem', letterSpacing: '2px', color: done === subs.length ? '#4ade80' : 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                    {bar} {done}/{subs.length}
                  </div>
                  {subs.map(s => (
                    <div
                      key={s.id}
                      onClick={() => toggleSubTask(s.id, focusedNode.id, s.is_completed)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', opacity: s.is_completed ? 0.4 : 0.85 }}
                    >
                      <span style={{ ...mono, fontSize: '1rem', color: s.is_completed ? '#4ade80' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                        {s.is_completed ? '[x]' : '[ ]'}
                      </span>
                      <span style={{
                        ...mono, fontSize: '1rem', letterSpacing: '0.5px',
                        color: s.is_completed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
                        textDecoration: s.is_completed ? 'line-through' : 'none',
                      }}>{s.title}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {projectNodes.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '0.4rem', pointerEvents: 'none',
          }}>
            <div style={{ ...mono, fontSize: '1.2rem', letterSpacing: '3px', color: 'rgba(255,255,255,0.08)' }}>
              no nodes yet
            </div>
            <div style={{ ...mono, fontSize: '0.85rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.05)' }}>
              use + node to start mapping
            </div>
          </div>
        )}
      </div>

      {/* Promote panel */}
      {promoteNode && (
        <PromotePanel
          node={promoteNode}
          onClose={() => setPromoteNode(null)}
          onRefresh={refreshNodes}
          onDelete={async (id) => {
            await deletePreNode(id);
            setDbEdges(prev => prev.filter(e => e.source_id !== id && e.target_id !== id));
            refreshNodes();
          }}
        />
      )}
    </div>
  );
}
