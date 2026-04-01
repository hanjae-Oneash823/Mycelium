import { useMemo, useState } from 'react';
import { ChevronDown } from 'pixelarticons/react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, Modifier } from '@dnd-kit/core';

// Centers the DragOverlay on the cursor instead of anchoring to the element's top-left
const snapToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent || !('clientX' in activatorEvent)) return transform;
  const e = activatorEvent as MouseEvent;
  return {
    ...transform,
    x: transform.x + (e.clientX - draggingNodeRect.left - draggingNodeRect.width  / 2),
    y: transform.y + (e.clientY - draggingNodeRect.top  - draggingNodeRect.height / 2),
  };
};
import { usePlannerStore } from '../store/usePlannerStore';
import { toDateString, isSameDay } from '../lib/logicEngine';
import { getDensityRatio } from '../lib/densityCalc';
import DotCell from '../components/DotCell';
import DensityBar from '../components/DensityBar';
import type { PlannerNode } from '../types';
import { getDotColor, getDotDiameter, getDotAnimClass } from '../types';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getDayColor(date: Date): string {
  const dow = date.getDay();
  if (dow === 0) return '#ff6b35';
  if (dow === 6) return '#64c8ff';
  return 'rgba(255,255,255,0.75)';
}

interface GridRow {
  id: string;
  label: string;
  indent: number;
  color: string;
  hasChildren: boolean;
  nodes: PlannerNode[];
  arcId?: string;
  projectId?: string;
}

interface ColDef {
  key: string;
  monthDay: string;
  dayName: string;
  isOverdue?: boolean;
  isToday?: boolean;
  dayColor: string;
}

export default function EisenhowerView() {
  const { nodes, arcs, projects, capacity, rescheduleNode } = usePlannerStore();
  const now = new Date();
  const [activeDragNode, setActiveDragNode] = useState<PlannerNode | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,  { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  const [futureOffset, setFutureOffset] = useState(0);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [collapsedArcs, setCollapsedArcs] = useState<Set<string>>(() => new Set(arcs.map(a => a.id)));
  const [arcCollapseKeys, setArcCollapseKeys] = useState<Record<string, number>>({});

  const toggleArc = (arcId: string) => {
    setCollapsedArcs(prev => {
      const next = new Set(prev);
      if (next.has(arcId)) {
        next.delete(arcId);
      } else {
        next.add(arcId);
        // Increment key only on collapse — triggers dot arrive animation on arc row
        setArcCollapseKeys(p => ({ ...p, [arcId]: (p[arcId] ?? 0) + 1 }));
      }
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const nodeId = event.active.id as string;
    setActiveDragNode(nodes.find(n => n.id === nodeId) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragNode(null);
    const { active, over } = event;
    if (!over) return;
    const overId = over.id as string;
    if (!overId.startsWith('cell-')) return;
    const rest = overId.slice(5);
    if (rest.endsWith('-overdue')) return;
    const dateStr = rest.slice(-10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    // Block dragging an assignment past its due date
    const node = nodes.find(n => n.id === (active.id as string));
    if (node?.due_at && dateStr > node.due_at.slice(0, 10)) return;
    if (node?.planned_start_at?.slice(0, 10) === dateStr) return;
    rescheduleNode(active.id as string, dateStr);
  };

  const hasOverdue = useMemo(
    () => nodes.some(n => (n.is_overdue || n.is_missed_schedule) && !n.is_completed),
    [nodes],
  );

  // Conditionally show OOPS + today + 5 sliding future days
  const columns = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [];
    if (hasOverdue) {
      cols.push({ key: 'overdue', monthDay: '', dayName: 'OOPS!', isOverdue: true, dayColor: '#ff5555' });
    }
    // TODAY is always slot 0; future slots slide by futureOffset
    for (let i = 0; i < 6; i++) {
      const dayIndex = i === 0 ? 0 : i + futureOffset;
      const dt = addDays(now, dayIndex);
      const key = toDateString(dt);
      const local = new Date(key + 'T12:00:00');
      cols.push({
        key,
        monthDay: i === 0 ? '' : `${local.getMonth() + 1}/${local.getDate()}`,
        dayName:  i === 0 ? 'TODAY' : local.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday:  i === 0,
        dayColor: i === 0 ? '#ffffff' : getDayColor(local),
      });
    }
    return cols;
  }, [hasOverdue, futureOffset]);

  const rows = useMemo<GridRow[]>(() => {
    const result: GridRow[] = [];

    const getNodesByContext = (arcId?: string, projectId?: string) =>
      nodes.filter(n => {
        if (projectId) return n.project_id === projectId;
        if (arcId)     return n.arc_id === arcId && !n.project_id;
        return !n.arc_id && !n.project_id;
      });

    for (const arc of arcs) {
      const arcProjects = projects.filter(p => p.arc_id === arc.id);
      const arcDirectNodes = getNodesByContext(arc.id, undefined);
      result.push({ id: `arc-${arc.id}`, label: arc.name, indent: 0, color: arc.color_hex, hasChildren: arcProjects.length > 0, nodes: arcDirectNodes, arcId: arc.id });
      for (const proj of arcProjects) {
        const projNodes = getNodesByContext(undefined, proj.id);
        result.push({ id: `proj-${proj.id}`, label: proj.name, indent: 1, color: arc.color_hex, hasChildren: false, nodes: projNodes, arcId: arc.id, projectId: proj.id });
      }
    }

    for (const proj of projects.filter(p => !p.arc_id)) {
      const projNodes = getNodesByContext(undefined, proj.id);
      result.push({ id: `proj-${proj.id}`, label: proj.name, indent: 0, color: 'rgba(255,255,255,0.6)', hasChildren: false, nodes: projNodes, projectId: proj.id });
    }

    // Collect all node IDs that were assigned to a row above
    const assignedIds = new Set(result.flatMap(r => r.nodes.map(n => n.id)));
    // Ungrouped: nodes with no project/arc, PLUS any orphaned nodes missed by the rows above
    const ungrouped = nodes.filter(n => !assignedIds.has(n.id) && (!n.arc_id && !n.project_id));
    const orphaned  = nodes.filter(n => !assignedIds.has(n.id) && (n.arc_id || n.project_id));
    result.push({ id: 'ungrouped', label: 'no project', indent: 0, color: 'rgba(255,255,255,0.4)', hasChildren: false, nodes: [...ungrouped, ...orphaned] });

    return result;
  }, [nodes, arcs, projects]);

  const getEffectiveNodes = (row: GridRow): PlannerNode[] => {
    if (row.arcId && !row.projectId && collapsedArcs.has(row.arcId)) {
      return nodes.filter(n => n.arc_id === row.arcId);
    }
    return row.nodes;
  };

  const getCellNodes = (rowNodes: PlannerNode[], colKey: string): PlannerNode[] => {
    if (colKey === 'overdue') return rowNodes.filter(n => n.is_overdue || n.is_missed_schedule);
    const colDate = new Date(colKey + 'T12:00:00');
    return rowNodes.filter(n => {
      if (n.is_overdue) return false;
      // Prefer planned_start_at — only fall back to due_at when there is no planned date
      if (n.planned_start_at) return isSameDay(n.planned_start_at, colDate);
      return isSameDay(n.due_at, colDate);
    });
  };

  const LABEL_COL_W   = 280;
  const CELL_MIN_W    = 100;
  const ROW_H         = 68;
  const ROW_H_SUB     = 52;
  const capacityMinutes = capacity?.daily_minutes ?? 480;


  const todayColIndex = columns.findIndex(c => c.isToday);

  const getDayMinutes = (dateStr: string) =>
    nodes
      .filter(n => !n.is_completed && !n.is_overdue && isSameDay(n.planned_start_at, new Date(dateStr + 'T12:00:00')))
      .reduce((sum, n) => sum + (n.estimated_duration_minutes ?? 0), 0);

  const navBtn: React.CSSProperties = {
    background: 'none', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)',
    fontFamily: "'VT323', monospace", fontSize: '1.1rem', letterSpacing: '1px',
    padding: '0.1rem 0.6rem', cursor: 'pointer', lineHeight: 1,
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: '1rem' }}>

        {/* Future-day navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', padding: '0 1.2rem 0.5rem' }}>
          <button style={{ ...navBtn, opacity: futureOffset === 0 ? 0.25 : 1 }} disabled={futureOffset === 0} onClick={() => setFutureOffset(o => Math.max(0, o - 5))}>
            ‹ prev
          </button>
          <span style={{ fontFamily: "'VT323', monospace", fontSize: '1rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', minWidth: 72, textAlign: 'center' }}>
            {futureOffset === 0 ? 'next 5 days' : `+${futureOffset + 1} – +${futureOffset + 5}`}
          </span>
          <button style={navBtn} onClick={() => setFutureOffset(o => o + 5)}>
            next ›
          </button>
        </div>

        {/* Scrollable body — header lives inside so column widths share the same layout context,
            keeping the sticky header and row cells perfectly aligned */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>

          {/* Sticky header — inside scroll container so its flex widths match the body cells exactly */}
          <div style={{
            display: 'flex', flexShrink: 0,
            background: '#000', position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0 }} />
            {columns.map(col => (
              <div
                key={col.key}
                style={{
                  flex: 1, minWidth: CELL_MIN_W,
                  padding: '0.6rem 0.5rem 0.5rem',
                  textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: col.isOverdue ? 'center' : 'flex-end',
                }}
              >
                {!col.isOverdue && !col.isToday && (
                  <div style={{
                    fontSize: '1.1rem', letterSpacing: '1.5px',
                    color: 'rgba(255,255,255,0.4)',
                    marginBottom: '0px', fontFamily: "'VT323', monospace",
                  }}>
                    {col.monthDay}
                  </div>
                )}
                <div style={{
                  fontSize: col.isOverdue || col.isToday ? '1.7rem' : '1.6rem',
                  letterSpacing: col.isOverdue || col.isToday ? '4px' : '2px',
                  color: col.dayColor,
                  fontFamily: "'VT323', monospace",
                  lineHeight: 1,
                }}>
                  {col.isOverdue || col.isToday ? `[ ${col.dayName} ]` : col.dayName}
                </div>
                {!col.isOverdue && (() => {
                  const mins = getDayMinutes(col.key);
                  return (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <DensityBar ratio={getDensityRatio(nodes, col.key, capacityMinutes)} />
                      {mins > 0 && (
                        <span style={{ fontFamily: "'VT323', monospace", fontSize: '0.82rem', letterSpacing: '0.5px', padding: '0.1rem 0.45rem', background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                          {(mins / 60).toFixed(1)}h
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Rows wrapper — position:relative so the TODAY overlay spans exactly the row content */}
          <div style={{ position: 'relative' }}>

            {/* TODAY column overlay — spans only the rows, never the empty viewport below */}
            <div style={{
              position: 'absolute',
              left:  `calc(${LABEL_COL_W}px + ${todayColIndex} * (100% - ${LABEL_COL_W}px) / ${columns.length})`,
              width: `calc((100% - ${LABEL_COL_W}px) / ${columns.length})`,
              top: 24, bottom: 0,
              background: 'rgba(255,255,255,0.07)',
              pointerEvents: 'none',
              zIndex: 3,
            }} />

          {/* Top spacer */}
          <div style={{ display: 'flex', height: 24 }}>
            <div style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0 }} />
            {columns.map(col => (
              <div key={col.key} style={{ flex: 1, minWidth: CELL_MIN_W }} />
            ))}
          </div>
          {rows.map((row, idx) => {
            const isProjectRow   = row.indent > 0 && !!row.arcId;
            const isHiddenByArc  = isProjectRow && collapsedArcs.has(row.arcId!);
            const isArcTogglable = !!row.arcId && !row.projectId && row.hasChildren;

            const rowContent = (
              <div
                style={{
                  display: 'flex', position: 'relative',
                  minHeight: row.indent > 0 ? ROW_H_SUB : ROW_H,
                }}
              >
                {/* Horizontal center baseline + column tick marks */}
                <div style={{
                  position: 'absolute', left: LABEL_COL_W, right: 0,
                  top: '50%', height: 2,
                  background: 'rgba(255,255,255,0.18)',
                  pointerEvents: 'none', zIndex: 0,
                }}>
                  {columns.slice(1).map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${((i + 1) / columns.length) * 100}%`,
                      top: '50%', transform: 'translate(-50%, -50%)',
                      width: 1, height: 8,
                      background: 'rgba(255,255,255,0.35)',
                    }} />
                  ))}
                </div>

                {/* Row label */}
                <div
                  style={{
                    width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0,
                    padding: `0 0.75rem 0 ${0.75 + row.indent * 1.0}rem`,
                    fontSize: row.indent === 0 ? '1.25rem' : '1rem',
                    letterSpacing: row.indent === 0 ? '2px' : '1.5px',
                    color: row.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem',
                    overflow: 'hidden', zIndex: 1, background: '#000',
                    cursor: isArcTogglable ? 'pointer' : 'default',
                  }}
                  title={row.label}
                  onClick={isArcTogglable ? () => toggleArc(row.arcId!) : undefined}
                >
                  <span style={{ overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.1, textAlign: 'right' }}>
                    {row.label}
                  </span>
                  {isArcTogglable && (
                    <ChevronDown size={14} style={{
                      flexShrink: 0, opacity: 0.5,
                      transform: collapsedArcs.has(row.arcId!) ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.25s ease',
                    }} />
                  )}
                  <div style={{
                    width: 8, height: 8, flexShrink: 0,
                    background: row.color,
                    opacity: row.indent === 0 ? 0.9 : 0.7,
                  }} />
                </div>

                {/* Cells — on arc collapse, cell keys change → remount → dotsArrive animation plays */}
                {columns.map(col => {
                  const cellKey  = `${row.id}-${col.key}`;
                  const isHovered = hoveredCell === cellKey;
                  const collapseKey = isArcTogglable ? (arcCollapseKeys[row.arcId!] ?? 0) : 0;
                  return (
                    <div
                      key={`${col.key}-${collapseKey}`}
                      className={collapseKey > 0 ? 'arc-dots-arrive' : undefined}
                      onMouseEnter={() => setHoveredCell(cellKey)}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{
                        flex: 1, minWidth: CELL_MIN_W,
                        position: 'relative', zIndex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isHovered ? 'rgba(255,255,255,0.12)' : 'transparent',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <DotCell
                        nodeDate={col.key}
                        rowId={row.id}
                        nodes={getCellNodes(getEffectiveNodes(row), col.key)}
                        dotScale={1.2}
                        arcId={row.arcId}
                        projectId={row.projectId}
                        isToday={!!col.isToday}
                      />
                    </div>
                  );
                })}
              </div>
            );

            return (
              <div key={row.id}>
                {/* Spacer between arc blocks */}
                {idx > 0 && row.indent === 0 && (
                  <div style={{ display: 'flex', height: 20 }}>
                    <div style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0 }} />
                    {columns.map(col => (
                      <div key={col.key} style={{ flex: 1, minWidth: CELL_MIN_W }} />
                    ))}
                  </div>
                )}

                {/* Project rows animate via CSS grid collapse */}
                {isProjectRow ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateRows: isHiddenByArc ? '0fr' : '1fr',
                    opacity: isHiddenByArc ? 0 : 1,
                    transition: 'grid-template-rows 0.28s ease, opacity 0.2s ease',
                  }}>
                    <div style={{ overflow: 'hidden', minHeight: 0 }}>
                      {rowContent}
                    </div>
                  </div>
                ) : rowContent}
              </div>
            );
          })}
          </div>{/* end rows wrapper */}
        </div>

      </div>

      {/* Drag ghost */}
      <DragOverlay dropAnimation={null} modifiers={[snapToCursor]}>
        {activeDragNode && (
          <div
            className={`dot ${getDotAnimClass(activeDragNode)}`}
            style={{
              width:  getDotDiameter(activeDragNode.estimated_duration_minutes),
              height: getDotDiameter(activeDragNode.estimated_duration_minutes),
              backgroundColor: getDotColor(activeDragNode),
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
