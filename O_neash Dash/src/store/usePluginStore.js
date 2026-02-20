import { create } from 'zustand';
import { plugins } from '../plugins/registry.js'; // Keep your registry!

const usePluginStore = create((set) => ({
  // State
  plugins: plugins,
  activePlugin: null,

  // Action (The "Remote Control")
  setActivePlugin: (id) => set({ activePlugin: id }),
}));

export default usePluginStore;
