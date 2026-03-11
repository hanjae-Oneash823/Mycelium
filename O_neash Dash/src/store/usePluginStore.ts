import { create } from 'zustand';
import { plugins } from '../plugins/registry';
import type { PluginItem } from '@/types';

interface PluginStore {
  plugins: PluginItem[];
  activePlugin: string | null;
  setActivePlugin: (id: string | null) => void;
}

const usePluginStore = create<PluginStore>((set) => ({
  // State
  plugins: plugins,
  activePlugin: null,

  // Action (The "Remote Control")
  setActivePlugin: (id) => set({ activePlugin: id }),
}));

export default usePluginStore;
