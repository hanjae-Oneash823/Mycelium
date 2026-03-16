import { useEffect, useCallback } from 'react';
import { usePlannerStore } from './usePlannerStore';
import { computeUrgencyLevel, isNodeOverdue } from '../lib/logicEngine';
import { setNodeOverdue, setNodeUrgency } from '../lib/plannerDb';

export function useLogicEngine(): void {
  const nodes   = usePlannerStore((s) => s.nodes);
  const loadAll = usePlannerStore((s) => s.loadAll);

  const runRules = useCallback(async () => {
    const now = new Date();
    let changed = false;

    for (const node of nodes) {
      if (node.is_completed) continue;

      // Rule 2: overdue detection
      if (!node.is_overdue && isNodeOverdue(node, now)) {
        await setNodeOverdue(node.id, true);
        changed = true;
      }

      // Rule 1: recompute urgency from importance + due date
      const expected = computeUrgencyLevel(node.importance_level === 1, node.due_at, now);
      if (expected !== node.computed_urgency_level) {
        await setNodeUrgency(node.id, expected);
        changed = true;
      }
    }

    if (changed) await loadAll();
  }, [nodes, loadAll]);

  // Run once on mount, then every 30 minutes
  useEffect(() => {
    runRules();
    const intervalId = setInterval(runRules, 30 * 60 * 1000);
    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional empty deps — runs once on mount only
}
