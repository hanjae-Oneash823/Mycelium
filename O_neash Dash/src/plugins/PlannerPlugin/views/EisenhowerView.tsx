import { useMemo, useState } from 'react';
import { ChevronDown } from 'pixelarticons/react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
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
  const { nodes, arcs, projects, capacity, rescheduleNode, wipePlannerData } = usePlannerStore();
  const { openTaskForm } = useViewStore();
  const now = new Date();
  const [activeDragNode, setActiveDragNode] = useState<PlannerNode | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,  { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
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
    rescheduleNode(active.id as string, dateStr);
  };

  // OOPS + today + 5 more days = 7 columns
  const columns = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      { key: 'overdue', monthDay: '', dayName: 'OOPS!', isOverdue: true, dayColor: '#ff5555' },
    ];
    for (let i = 0; i < 6; i++) {
      const dt = addDays(now, i);
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
  }, []);

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
        result.push({ id: `proj-${proj.id}`, label: proj.name, indent: 1, color: proj.color_hex ?? arc.color_hex, hasChildren: false, nodes: projNodes, arcId: arc.id, projectId: proj.id });
      }
    }

    for (const proj of projects.filter(p => !p.arc_id)) {
      const projNodes = getNodesByContext(undefined, proj.id);
      result.push({ id: `proj-${proj.id}`, label: proj.name, indent: 0, color: proj.color_hex ?? 'rgba(255,255,255,0.6)', hasChildren: false, nodes: projNodes, projectId: proj.id });
    }

    const ungrouped = getNodesByContext();
    result.push({ id: 'ungrouped', label: 'no project', indent: 0, color: 'rgba(255,255,255,0.4)', hasChildren: false, nodes: ungrouped });

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


  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: '2rem' }}>

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
                    fontSize: '0.85rem', letterSpacing: '1.5px',
                    color: 'rgba(255,255,255,0.4)',
                    marginBottom: '0px', fontFamily: "'VT323', monospace",
                  }}>
                    {col.monthDay}
                  </div>
                )}
                <div style={{
                  fontSize: col.isOverdue || col.isToday ? '1.4rem' : '1.35rem',
                  letterSpacing: col.isOverdue || col.isToday ? '4px' : '2px',
                  color: col.dayColor,
                  fontFamily: "'VT323', monospace",
                  lineHeight: 1,
                }}>
                  {col.isOverdue || col.isToday ? `[ ${col.dayName} ]` : col.dayName}
                </div>
                {!col.isOverdue && (
                  <div style={{ marginTop: '8px' }}>
                    <DensityBar ratio={getDensityRatio(nodes, col.key, capacityMinutes)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Rows wrapper — position:relative so the TODAY overlay spans exactly the row content */}
          <div style={{ position: 'relative' }}>

            {/* TODAY column overlay — spans only the rows, never the empty viewport below */}
            <div style={{
              position: 'absolute',
              left:  `calc(${LABEL_COL_W}px + (100% - ${LABEL_COL_W}px) / ${columns.length})`,
              width: `calc((100% - ${LABEL_COL_W}px) / ${columns.length})`,
              top: 0, bottom: 0,
              borderLeft:  '1px solid rgba(255,255,255,0.5)',
              borderRight: '1px solid rgba(255,255,255,0.5)',
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
                {/* Horizontal center baseline */}
                <div style={{
                  position: 'absolute', left: LABEL_COL_W, right: 0,
                  top: '50%', height: 2,
                  background: 'rgba(255,255,255,0.18)',
                  pointerEvents: 'none', zIndex: 0,
                }} />

                {/* Row label */}
                <div
                  style={{
                    width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0,
                    padding: `0 0.75rem 0 ${0.75 + row.indent * 1.0}rem`,
                    fontSize: row.indent === 0 ? '1.5rem' : '1.15rem',
                    letterSpacing: row.indent === 0 ? '2px' : '1.5px',
                    color: row.indent === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
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
                  <div style={{ display: 'flex', height: 48 }}>
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

        {/* Footer */}
        <div style={{
          padding: '0.6rem 1rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0, display: 'flex', gap: '0.75rem', alignItems: 'center',
        }}>
          <button
            onClick={() => openTaskForm()}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.22)',
              color: 'rgba(255,255,255,0.6)', padding: '0.25rem 0.9rem',
              fontSize: '1rem', letterSpacing: '2px', cursor: 'pointer',
              fontFamily: "'VT323', monospace",
            }}
          >
            + task
          </button>
          <span style={{ fontSize: '0.72rem', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.2)' }}>
            double-click any cell to add with that date
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={wipePlannerData}
              style={{
                background: 'transparent', border: '1px solid rgba(255,59,59,0.25)',
                color: 'rgba(255,59,59,0.45)', padding: '0.25rem 0.75rem',
                fontSize: '0.85rem', letterSpacing: '2px', cursor: 'pointer',
                fontFamily: "'VT323', monospace",
              }}
            >
              wipe
            </button>
          </div>
        </div>
      </div>

      {/* Drag ghost */}
      <DragOverlay dropAnimation={null}>
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
