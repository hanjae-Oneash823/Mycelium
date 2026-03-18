import { useState, useEffect } from 'react';
import { getLinkedNodeIds, unlinkNoteFromTask } from '../PlannerPlugin/lib/noteLinks';
import { loadNodeById, completeNode } from '../PlannerPlugin/lib/plannerDb';
import type { PlannerNode } from '../PlannerPlugin/types';

interface LinkedTasksPanelProps {
  compositeNoteId: string;
}

const DOT_COLORS: Record<number, string> = {
  0: '#7ecfff', 1: '#3dbfbf', 2: '#4ade80', 3: '#f5a623', 4: '#ff6b35',
};

export default function LinkedTasksPanel({ compositeNoteId }: LinkedTasksPanelProps) {
  const [tasks, setTasks]         = useState<PlannerNode[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!compositeNoteId) return;
    let cancelled = false;
    async function load() {
      const ids    = await getLinkedNodeIds(compositeNoteId);
      const loaded = await Promise.all(ids.map(id => loadNodeById(id)));
      if (!cancelled) setTasks(loaded.filter((n): n is PlannerNode => n !== null));
    }
    load();
    return () => { cancelled = true; };
  }, [compositeNoteId]);

  const handleComplete = async (nodeId: string) => {
    await completeNode(nodeId);
    setTasks(prev => prev.map(t => t.id === nodeId ? { ...t, is_completed: true } : t));
  };

  const handleUnlink = async (nodeId: string) => {
    await unlinkNoteFromTask(compositeNoteId, nodeId);
    setTasks(prev => prev.filter(t => t.id !== nodeId));
  };

  if (tasks.length === 0) return null;

  return (
    <div className="note-linked-tasks">
      <button
        className="note-linked-tasks-header"
        onClick={() => setCollapsed(c => !c)}
      >
        <span>linked tasks ({tasks.length})</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && tasks.map(task => {
        const color = task.is_overdue ? '#ff3b3b' : DOT_COLORS[task.computed_urgency_level] ?? DOT_COLORS[0];
        return (
          <div key={task.id} className={`note-linked-task-row ${task.is_completed ? 'note-linked-task-done-row' : ''}`}>
            <span className="note-linked-task-dot" style={{ background: color }} />
            <span className={`note-linked-task-title ${task.is_completed ? 'note-linked-task-completed' : ''}`}>
              {task.title}
            </span>
            {task.due_at && (
              <span className="note-linked-task-due" style={{ color: task.is_overdue ? '#ff3b3b' : 'rgba(255,255,255,0.3)' }}>
                {new Date(task.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {!task.is_completed && (
              <button
                className="note-linked-task-action"
                onClick={() => handleComplete(task.id)}
                title="mark complete"
              >✓</button>
            )}
            <button
              className="note-linked-task-action note-linked-task-unlink"
              onClick={() => handleUnlink(task.id)}
              title="unlink"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
