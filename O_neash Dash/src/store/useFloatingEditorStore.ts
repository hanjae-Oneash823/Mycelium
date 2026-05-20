import { create } from 'zustand';

export interface FloatingDoc {
  docId: string;
  state: 'open' | 'minimized';
}

interface FloatingEditorStore {
  docs: FloatingDoc[];
  poolVisible: boolean;
  openDoc: (docId: string) => void;
  minimizeDoc: (docId: string) => void;
  restoreDoc: (docId: string) => void;
  closeDoc: (docId: string) => void;
  togglePool: () => void;
}

export const useFloatingEditorStore = create<FloatingEditorStore>((set) => ({
  docs: [],
  poolVisible: true,

  openDoc: (docId) => set((s) => {
    const existing = s.docs.find(d => d.docId === docId);
    if (existing) {
      return { docs: s.docs.map(d => ({ ...d, state: d.docId === docId ? 'open' : 'minimized' })) };
    }
    if (s.docs.length >= 3) {
      const firstMinIdx = s.docs.findIndex(d => d.state === 'minimized');
      if (firstMinIdx === -1) return s;
      const next = s.docs.filter((_, i) => i !== firstMinIdx).map(d => ({ ...d, state: 'minimized' as const }));
      return { docs: [...next, { docId, state: 'open' }] };
    }
    return {
      docs: [
        ...s.docs.map(d => ({ ...d, state: 'minimized' as const })),
        { docId, state: 'open' },
      ],
    };
  }),

  minimizeDoc: (docId) => set((s) => ({
    docs: s.docs.map(d => d.docId === docId ? { ...d, state: 'minimized' } : d),
  })),

  restoreDoc: (docId) => set((s) => ({
    docs: s.docs.map(d => ({ ...d, state: d.docId === docId ? 'open' : 'minimized' })),
  })),

  closeDoc: (docId) => set((s) => ({
    docs: s.docs.filter(d => d.docId !== docId),
  })),

  togglePool: () => set((s) => ({ poolVisible: !s.poolVisible })),
}));
