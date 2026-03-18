import { useDroppable } from '@dnd-kit/core';
import type { PlannerNode, CreateNodeData } from '../types';
import DotNode from './DotNode';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';

interface DotCellProps {
  nodeDate: string | 'overdue';
  rowId: string;
  nodes: PlannerNode[];
}

export default function DotCell({ nodeDate, rowId, nodes }: DotCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell-${rowId}-${nodeDate}` });
  const { completeNode, deleteNode } = usePlannerStore();
  const { openTaskForm, openTaskFormEdit } = useViewStore();

  const handleDoubleClick = () => {
    const defaults: Partial<CreateNodeData> = {};
    if (nodeDate !== 'overdue') defaults.planned_start_at = nodeDate;
    openTaskForm(defaults);
  };

  return (
    <div
      ref={setNodeRef}
      onDoubleClick={handleDoubleClick}
      style={{
        minHeight: 48,
        padding: '6px 4px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 5,
        alignContent: 'flex-start',
        border: isOver ? '1px solid var(--teal)' : '1px solid transparent',
        transition: 'border-color 0.15s ease',
        cursor: 'default',
      }}
    >
      {nodes.map(node => (
        <DotNode
          key={node.id}
          node={node}
          onComplete={() => completeNode(node.id)}
          onDelete={() => deleteNode(node.id)}
          onEdit={() => openTaskFormEdit(node)}
        />
      ))}
    </div>
  );
}
