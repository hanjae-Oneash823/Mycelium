import { create } from 'zustand';
import type { PlannerNode, PlannerGroup, Arc, Project, UserCapacity, CreateNodeData } from '../types';
import * as db from '../lib/plannerDb';

interface PlannerStore {
  nodes: PlannerNode[];
  groups: PlannerGroup[];
  arcs: Arc[];
  projects: Project[];
  capacity: UserCapacity | null;

  loadAll: () => Promise<void>;
  createNode: (data: CreateNodeData) => Promise<void>;
  updateNode: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  rescheduleNode: (id: string, date: string) => Promise<void>;
  completeNode: (id: string) => Promise<void>;
  createGroup: (data: { name: string; color_hex: string; is_daily_life?: boolean }) => Promise<string>;
  deleteGroup: (id: string) => Promise<void>;
}

export const usePlannerStore = create<PlannerStore>((set) => ({
  nodes: [],
  groups: [],
  arcs: [],
  projects: [],
  capacity: null,

  loadAll: async () => {
    const [nodes, groups, arcs, projects, capacity] = await Promise.all([
      db.loadNodes(),
      db.loadGroups(),
      db.loadArcs(),
      db.loadProjects(),
      db.loadUserCapacity(),
    ]);
    set({ nodes, groups, arcs, projects, capacity });
  },

  createNode: async (data) => {
    await db.createNode(data);
    const nodes = await db.loadNodes();
    set({ nodes });
  },

  updateNode: async (id, patch) => {
    await db.updateNode(id, patch);
    const nodes = await db.loadNodes();
    set({ nodes });
  },

  deleteNode: async (id) => {
    await db.deleteNode(id);
    const nodes = await db.loadNodes();
    set({ nodes });
  },

  rescheduleNode: async (id, date) => {
    await db.rescheduleNode(id, date);
    const nodes = await db.loadNodes();
    set({ nodes });
  },

  completeNode: async (id) => {
    await db.completeNode(id);
    const nodes = await db.loadNodes();
    set({ nodes });
  },

  createGroup: async (data) => {
    const id = await db.createGroup(data);
    const groups = await db.loadGroups();
    set({ groups });
    return id;
  },

  deleteGroup: async (id) => {
    await db.deleteGroup(id);
    const [nodes, groups] = await Promise.all([db.loadNodes(), db.loadGroups()]);
    set({ nodes, groups });
  },
}));
