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
  const { openTaskForm } = useViewStore();

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
          onEdit={() => openTaskForm({
            title: node.title,
            description: node.description ?? undefined,
            planned_start_at: node.planned_start_at ?? undefined,
            due_at: node.due_at ?? undefined,
            estimated_duration_minutes: node.estimated_duration_minutes ?? undefined,
            importance_level: node.importance_level,
          })}
        />
      ))}
    </div>
  );
}
