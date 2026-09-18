import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface TerminalInstance {
  id: string;
  label: string;
  cwd: string | null;
  createdAt: number;
}

interface TerminalStore {
  terminals: TerminalInstance[];
  activeTabId: string | null;
  peekTerminalId: string | null;
  spawnTerminal: (cwd?: string) => Promise<string>;
  closeTerminal: (id: string) => Promise<void>;
  setActiveTab: (id: string | null) => void;
  setPeekTerminal: (id: string | null) => void;
}

const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeTabId: null,
  peekTerminalId: null,

  spawnTerminal: async (cwd) => {
    const id = await invoke<string>('spawn_terminal', { cwd: cwd ?? null });
    const instance: TerminalInstance = {
      id,
      label: `shell #${get().terminals.length + 1}`,
      cwd: cwd ?? null,
      createdAt: Date.now(),
    };
    set((state) => ({
      terminals: [...state.terminals, instance],
      activeTabId: id,
      peekTerminalId: state.peekTerminalId ?? id,
    }));
    return id;
  },

  closeTerminal: async (id) => {
    await invoke('kill_terminal', { id });
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      const activeTabId = state.activeTabId === id ? (terminals.at(-1)?.id ?? null) : state.activeTabId;
      const peekTerminalId = state.peekTerminalId === id ? (terminals.at(-1)?.id ?? null) : state.peekTerminalId;
      return { terminals, activeTabId, peekTerminalId };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),
  setPeekTerminal: (id) => set({ peekTerminalId: id }),
}));

export default useTerminalStore;
