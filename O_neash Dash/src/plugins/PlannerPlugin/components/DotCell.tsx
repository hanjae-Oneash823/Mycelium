import { useDroppable } from '@dnd-kit/core';
import type { PlannerNode, CreateNodeData } from '../types';
import DotNode from './DotNode';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';

interface DotCellProps {
  nodeDate: string | 'overdue';
  rowId: string;
  nodes: PlannerNode[];
  dotScale?: number;
  arcId?: string;
  projectId?: string;
}

export default function DotCell({ nodeDate, rowId, nodes, dotScale = 1, arcId, projectId }: DotCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell-${rowId}-${nodeDate}` });
  const { completeNode, deleteNode } = usePlannerStore();
  const { openTaskForm, openTaskFormEdit } = useViewStore();

  const handleDoubleClick = () => {
    const defaults: Partial<CreateNodeData> = {};
    if (nodeDate !== 'overdue') defaults.planned_start_at = nodeDate;
    if (arcId)     defaults.arc_id     = arcId;
    if (projectId) defaults.project_id = projectId;
    openTaskForm(defaults);
  };

  return (
    <div
      ref={setNodeRef}
      onDoubleClick={handleDoubleClick}
      style={{
        width: '100%',
        height: '100%',
        padding: '4px 6px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 5,
        alignItems: 'center',
        alignContent: 'center',
        justifyContent: 'center',
        border: isOver ? '1px solid var(--teal)' : '1px solid transparent',
        transition: 'border-color 0.15s ease',
        cursor: 'default',
        position: 'relative',
        zIndex: 1,
        boxSizing: 'border-box',
      }}
    >
      {nodes.map(node => (
        <DotNode
          key={node.id}
          node={node}
          scale={dotScale}
          onComplete={() => completeNode(node.id)}
          onDelete={() => deleteNode(node.id)}
          onEdit={() => openTaskFormEdit(node)}
        />
      ))}
    </div>
  );
}
