import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlannerViewType, FocusContext, CreateNodeData, PlannerNode } from '../types';

interface ViewStore {
  activeView: PlannerViewType;
  setActiveView: (v: PlannerViewType) => void;
  focusContext: FocusContext | null;
  setFocusContext: (ctx: FocusContext | null) => void;
  taskFormOpen: boolean;
  taskFormDefaults: Partial<CreateNodeData>;
  editNode: PlannerNode | null;
  openTaskForm: (defaults?: Partial<CreateNodeData>) => void;
  openTaskFormEdit: (node: PlannerNode) => void;
  closeTaskForm: () => void;
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  // Tendrils view removed — stubs kept so dormant files still compile
  tendrilsProjectId: string | null;
  openTendrils: (projectId: string) => void;
  openTendrilsHub: () => void;
  suggestionsOn: boolean;
  setSuggestionsOn: (v: boolean) => void;
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      activeView: 'today',
      setActiveView: (v) => set({ activeView: v }),
      focusContext: null,
      setFocusContext: (ctx) => set({ focusContext: ctx }),
      taskFormOpen: false,
      taskFormDefaults: {},
      editNode: null,
      openTaskForm: (defaults = {}) => set({ taskFormOpen: true, taskFormDefaults: defaults, editNode: null }),
      openTaskFormEdit: (node) => set({ taskFormOpen: true, taskFormDefaults: {}, editNode: node }),
      closeTaskForm: () => set({ taskFormOpen: false, taskFormDefaults: {}, editNode: null }),
      commandPaletteOpen: false,
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
      tendrilsProjectId: null,
      openTendrils: (_projectId) => {},
      openTendrilsHub: () => {},
      suggestionsOn: true,
      setSuggestionsOn: (v) => set({ suggestionsOn: v }),
    }),
    {
      name: 'planner-view-store',
      partialize: (state) => ({ suggestionsOn: state.suggestionsOn }),
    }
  )
);
