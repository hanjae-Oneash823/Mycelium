import { useMemo, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
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

interface GridRow {
  id: string;
  label: string;
  indent: number;
  nodes: PlannerNode[];
  arcId?: string;
  projectId?: string;
}

export default function EisenhowerView() {
  const { nodes, arcs, projects, capacity, rescheduleNode } = usePlannerStore();
  const { openTaskForm } = useViewStore();
  const now = new Date();
  const [activeDragNode, setActiveDragNode] = useState<PlannerNode | null>(null);

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
    // Extract colKey: cell-{rowId}-{colKey}
    // colKey is 'overdue' or 'YYYY-MM-DD' (10 chars)
    const rest = overId.slice(5); // remove "cell-"
    if (rest.endsWith('-overdue')) return; // block drop to OOPS
    const dateStr = rest.slice(-10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    rescheduleNode(active.id as string, dateStr);
  };

  // Build column dates: overdue + today + D+1..D+8
  const columns = useMemo(() => {
    const cols: Array<{ key: string; label: string; isOverdue?: boolean; isToday?: boolean }> = [
      { key: 'overdue', label: 'OOPS', isOverdue: true },
    ];
    for (let i = 0; i < 9; i++) {
      const d = addDays(now, i);
      const key = toDateString(d);
      const label = i === 0 ? 'TODAY' : `${d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} ${d.getDate()}`;
      cols.push({ key, label, isToday: i === 0 });
    }
    return cols;
  }, []);

  // Build rows from arc/project hierarchy
  const rows = useMemo<GridRow[]>(() => {
    const result: GridRow[] = [];

    // Helper: get nodes for a specific project/arc/ungrouped context
    const getNodesByContext = (arcId?: string, projectId?: string) =>
      nodes.filter(n => {
        if (projectId) return n.project_id === projectId;
        if (arcId)     return n.arc_id === arcId && !n.project_id;
        return !n.arc_id && !n.project_id;
      });

    // Arcs and their projects
    for (const arc of arcs) {
      const arcProjects = projects.filter(p => p.arc_id === arc.id);
      const arcDirectNodes = getNodesByContext(arc.id, undefined);
      result.push({ id: `arc-${arc.id}`, label: arc.name, indent: 0, nodes: arcDirectNodes, arcId: arc.id });

      for (const proj of arcProjects) {
        const projNodes = getNodesByContext(undefined, proj.id);
        result.push({ id: `proj-${proj.id}`, label: proj.name, indent: 1, nodes: projNodes, arcId: arc.id, projectId: proj.id });
      }
    }

    // Projects without arcs
    for (const proj of projects.filter(p => !p.arc_id)) {
      const projNodes = getNodesByContext(undefined, proj.id);
      result.push({ id: `proj-${proj.id}`, label: proj.name, indent: 0, nodes: projNodes, projectId: proj.id });
    }

    // Ungrouped row (no arc, no project)
    const ungrouped = getNodesByContext();
    result.push({ id: 'ungrouped', label: 'ungrouped', indent: 0, nodes: ungrouped });

    return result;
  }, [nodes, arcs, projects]);

  // Get nodes for a specific (rowId, colKey) cell
  const getCellNodes = (rowNodes: PlannerNode[], colKey: string): PlannerNode[] => {
    if (colKey === 'overdue') return rowNodes.filter(n => n.is_overdue);
    return rowNodes.filter(n =>
      !n.is_overdue && (
        isSameDay(n.planned_start_at, new Date(colKey)) ||
        isSameDay(n.due_at, new Date(colKey))
      )
    );
  };

  const LABEL_COL_W = 160;
  const CELL_MIN_W  = 90;

  const capacityMinutes = capacity?.daily_minutes ?? 480;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sticky header row */}
        <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.12)', background: '#000', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0, padding: '0.5rem 0.75rem', fontSize: '0.7rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
            arc / project
          </div>
          {columns.map(col => (
            <div
              key={col.key}
              style={{
                flex: 1, minWidth: CELL_MIN_W, padding: '0.5rem 0.4rem',
                fontSize: '0.78rem', letterSpacing: '2px', textTransform: 'uppercase',
                color: col.isOverdue ? '#ff3b3b' : col.isToday ? 'var(--teal)' : 'rgba(255,255,255,0.45)',
                borderLeft: '1px solid rgba(255,255,255,0.07)',
                background: col.isOverdue ? 'rgba(255,59,59,.03)' : col.isToday ? 'rgba(0,196,167,.04)' : 'transparent',
                textAlign: 'center',
              }}
            >
              {col.label}
              {!col.isOverdue && (
                <DensityBar ratio={getDensityRatio(nodes, col.key, capacityMinutes)} />
              )}
            </div>
          ))}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          {rows.map(row => (
            <div
              key={row.id}
              style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 52 }}
            >
              {/* Row label */}
              <div
                style={{
                  width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0,
                  padding: `0.4rem 0.75rem 0.4rem ${0.75 + row.indent * 1.2}rem`,
                  fontSize: row.indent === 0 ? '1.0rem' : '0.9rem',
                  letterSpacing: '1.5px', color: row.indent === 0 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'flex-start', paddingTop: '0.55rem',
                  overflow: 'hidden',
                }}
                title={row.label}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.indent > 0 && <span style={{ marginRight: '0.3rem', opacity: 0.4 }}>└</span>}
                  {row.label}
                </span>
              </div>

              {/* Cells */}
              {columns.map(col => (
                <div
                  key={col.key}
                  style={{
                    flex: 1, minWidth: CELL_MIN_W,
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                    background: col.isOverdue ? 'rgba(255,59,59,.02)' : col.isToday ? 'rgba(0,196,167,.025)' : 'transparent',
                  }}
                >
                  <DotCell
                    nodeDate={col.key}
                    rowId={row.id}
                    nodes={getCellNodes(row.nodes, col.key)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer: add task button */}
        <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => openTaskForm()}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', padding: '0.25rem 0.9rem', fontSize: '0.95rem', letterSpacing: '2px', cursor: 'pointer', fontFamily: "'VT323', monospace" }}
          >
            + task
          </button>
          <span style={{ fontSize: '0.78rem', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.2)' }}>
            double-click any cell to add with that date
          </span>
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
