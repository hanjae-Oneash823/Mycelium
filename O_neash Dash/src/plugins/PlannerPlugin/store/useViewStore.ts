import { create } from 'zustand';
import type { PlannerViewType, FocusContext, CreateNodeData } from '../types';

interface ViewStore {
  activeView: PlannerViewType;
  setActiveView: (v: PlannerViewType) => void;
  focusContext: FocusContext | null;
  setFocusContext: (ctx: FocusContext | null) => void;
  taskFormOpen: boolean;
  taskFormDefaults: Partial<CreateNodeData>;
  openTaskForm: (defaults?: Partial<CreateNodeData>) => void;
  closeTaskForm: () => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  activeView: 'today',
  setActiveView: (v) => set({ activeView: v }),
  focusContext: null,
  setFocusContext: (ctx) => set({ focusContext: ctx }),
  taskFormOpen: false,
  taskFormDefaults: {},
  openTaskForm: (defaults = {}) => set({ taskFormOpen: true, taskFormDefaults: defaults }),
  closeTaskForm: () => set({ taskFormOpen: false, taskFormDefaults: {} }),
}));
