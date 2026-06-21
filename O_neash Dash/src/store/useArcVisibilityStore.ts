import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ArcVisibilityStore {
  hiddenArcIds: string[];
  toggleArc: (id: string) => void;
  isHidden: (id: string) => boolean;
}

export const useArcVisibilityStore = create<ArcVisibilityStore>()(
  persist(
    (set, get) => ({
      hiddenArcIds: [],
      toggleArc: (id) => set(s => ({
        hiddenArcIds: s.hiddenArcIds.includes(id)
          ? s.hiddenArcIds.filter(x => x !== id)
          : [...s.hiddenArcIds, id],
      })),
      isHidden: (id) => get().hiddenArcIds.includes(id),
    }),
    { name: 'arc-visibility' },
  ),
);
