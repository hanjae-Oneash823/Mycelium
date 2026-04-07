import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WidgetInstance, WidgetSize } from '../types';
import { WIDGET_REGISTRY } from '../registry';

// Bumped to v2 to clear old layout and apply new defaults
const STORAGE_KEY = 'oneash-widgets-v3';

interface WidgetStore {
  instances: WidgetInstance[];
  addWidget:    (widgetId: string, size?: WidgetSize) => void;
  removeWidget: (instanceId: string) => void;
  resizeWidget: (instanceId: string, size: WidgetSize) => void;
  reorderWidget:(instanceId: string, direction: 'up' | 'down') => void;
  moveWidgetTo: (draggedId: string, targetId: string) => void;
  placeWidget:  (instanceId: string, col: number, row: number) => void;
  resetToDefault: () => void;
}

function defaultInstances(): WidgetInstance[] {
  return [
    { instanceId: 'default-pressure', widgetId: 'pressure-gauge', size: '2x2', order: 0 },
    { instanceId: 'default-frog',     widgetId: 'the-frog',       size: '2x2', order: 1 },
    { instanceId: 'default-tasks',    widgetId: 'daily-tasks',    size: '2x1', order: 2 },
  ];
}

const useWidgetStore = create<WidgetStore>()(
  persist(
    (set, get) => ({
      instances: defaultInstances(),

      addWidget: (widgetId, size) => {
        const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
        if (!def) return;
        const instanceId = `${widgetId}-${Date.now()}`;
        const order = get().instances.length;
        set(s => ({
          instances: [
            ...s.instances,
            { instanceId, widgetId, size: size ?? def.defaultSize, order },
          ],
        }));
      },

      removeWidget: (instanceId) => {
        set(s => ({
          instances: s.instances
            .filter(i => i.instanceId !== instanceId)
            .map((i, idx) => ({ ...i, order: idx })),
        }));
      },

      resizeWidget: (instanceId, size) => {
        set(s => ({
          instances: s.instances.map(i =>
            i.instanceId === instanceId ? { ...i, size } : i,
          ),
        }));
      },

      reorderWidget: (instanceId, direction) => {
        set(s => {
          const sorted = [...s.instances].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex(i => i.instanceId === instanceId);
          if (idx === -1) return s;
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= sorted.length) return s;
          const updated = [...sorted];
          [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
          return { instances: updated.map((i, n) => ({ ...i, order: n })) };
        });
      },

      placeWidget: (instanceId, col, row) => {
        set(s => ({
          instances: s.instances.map(i =>
            i.instanceId === instanceId ? { ...i, col, row } : i
          ),
        }));
      },

      moveWidgetTo: (draggedId, targetId) => {
        if (draggedId === targetId) return;
        set(s => {
          const sorted = [...s.instances].sort((a, b) => a.order - b.order);
          const fromIdx = sorted.findIndex(i => i.instanceId === draggedId);
          const toIdx   = sorted.findIndex(i => i.instanceId === targetId);
          if (fromIdx === -1 || toIdx === -1) return s;
          const updated = [...sorted];
          const [moved] = updated.splice(fromIdx, 1);
          updated.splice(toIdx, 0, moved);
          return { instances: updated.map((i, n) => ({ ...i, order: n })) };
        });
      },

      resetToDefault: () => set({ instances: defaultInstances() }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ instances: s.instances }),
    },
  ),
);

export default useWidgetStore;
