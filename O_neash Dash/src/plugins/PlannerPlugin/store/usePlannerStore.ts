import { create } from 'zustand';
import { toast } from '@/components/ui/sonner';
import type { PlannerNode, PlannerGroup, Arc, Project, UserCapacity, CreateNodeData } from '../types';
import * as db from '../lib/plannerDb';

interface PlannerStore {
  nodes: PlannerNode[];
  groups: PlannerGroup[];
  arcs: Arc[];
  projects: Project[];
  capacity: UserCapacity | null;

  loadAll: () => Promise<void>;
  createNode: (data: CreateNodeData) => Promise<string>;
  updateNode: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  rescheduleNode: (id: string, date: string) => Promise<void>;
  completeNode: (id: string) => Promise<void>;
  replaceNodeGroups: (nodeId: string, groupIds: string[]) => Promise<void>;
  addRecurrenceException: (templateId: string, dateStr: string) => Promise<void>;
  createGroup: (data: { name: string; color_hex: string; is_daily_life?: boolean }) => Promise<string>;
  updateGroup: (id: string, patch: { name?: string; color_hex?: string }) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  // Arc CRUD
  createArc: (data: { name: string; color_hex: string; start_date?: string; end_date?: string }) => Promise<string>;
  updateArc: (id: string, patch: Record<string, unknown>) => Promise<void>;
  archiveArc: (id: string) => Promise<void>;
  deleteArc: (id: string) => Promise<void>;
  // Project CRUD
  createProject: (data: { name: string; color_hex?: string; arc_id?: string }) => Promise<string>;
  updateProject: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  // Test utilities
  wipePlannerData: () => Promise<void>;
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
    const id = await db.createNode(data);
    const nodes = await db.loadNodes();
    set({ nodes });
    toast.success(`${data.node_type === 'event' ? 'event' : 'task'} created`);
    return id;
  },

  updateNode: async (id, patch) => {
    await db.updateNode(id, patch);
    const nodes = await db.loadNodes();
    set({ nodes });
    toast.success('task updated');
  },

  deleteNode: async (id) => {
    await db.deleteNode(id);
    const nodes = await db.loadNodes();
    set({ nodes });
    toast('task deleted', { style: { borderColor: 'rgba(255,59,59,0.5)', color: '#ff3b3b' } });
  },

  rescheduleNode: async (id, date) => {
    await db.rescheduleNode(id, date);
    const nodes = await db.loadNodes();
    set({ nodes });
    toast.success('rescheduled');
  },

  completeNode: async (id) => {
    await db.completeNode(id);
    const nodes = await db.loadNodes();
    set({ nodes });
    toast.success('task done ✓');
  },

  replaceNodeGroups: async (nodeId, groupIds) => {
    await db.replaceNodeGroups(nodeId, groupIds);
    const nodes = await db.loadNodes();
    set({ nodes });
  },

  addRecurrenceException: async (templateId, dateStr) => {
    await db.addRecurrenceException(templateId, dateStr);
    const nodes = await db.loadNodes();
    set({ nodes });
    toast.success('occurrence skipped');
  },

  createGroup: async (data) => {
    const id = await db.createGroup(data);
    const groups = await db.loadGroups();
    set({ groups });
    toast.success(`group "${data.name}" created`);
    return id;
  },

  updateGroup: async (id, patch) => {
    await db.updateGroup(id, patch);
    const groups = await db.loadGroups();
    set({ groups });
    toast.success('group updated');
  },

  deleteGroup: async (id) => {
    await db.deleteGroup(id);
    const [nodes, groups] = await Promise.all([db.loadNodes(), db.loadGroups()]);
    set({ nodes, groups });
    toast('group deleted', { style: { borderColor: 'rgba(255,59,59,0.5)', color: '#ff3b3b' } });
  },

  // Arc CRUD
  createArc: async (data) => {
    const id = await db.createArc(data);
    const arcs = await db.loadArcs();
    set({ arcs });
    toast.success(`arc "${data.name}" created`);
    return id;
  },

  updateArc: async (id, patch) => {
    await db.updateArc(id, patch);
    const arcs = await db.loadArcs();
    set({ arcs });
    toast.success('arc updated');
  },

  archiveArc: async (id) => {
    await db.archiveArc(id);
    const [arcs, nodes, projects] = await Promise.all([db.loadArcs(), db.loadNodes(), db.loadProjects()]);
    set({ arcs, nodes, projects });
    toast('arc archived', { style: { borderColor: 'rgba(245,200,66,0.5)', color: '#f5c842' } });
  },

  deleteArc: async (id) => {
    await db.deleteArc(id);
    const [arcs, nodes, projects] = await Promise.all([db.loadArcs(), db.loadNodes(), db.loadProjects()]);
    set({ arcs, nodes, projects });
    toast('arc deleted', { style: { borderColor: 'rgba(255,59,59,0.5)', color: '#ff3b3b' } });
  },

  // Project CRUD
  createProject: async (data) => {
    const id = await db.createProject(data);
    const projects = await db.loadProjects();
    set({ projects });
    toast.success(`project "${data.name}" created`);
    return id;
  },

  updateProject: async (id, patch) => {
    await db.updateProject(id, patch);
    const projects = await db.loadProjects();
    set({ projects });
    toast.success('project updated');
  },

  deleteProject: async (id) => {
    await db.deleteProject(id);
    const [projects, nodes] = await Promise.all([db.loadProjects(), db.loadNodes()]);
    set({ projects, nodes });
    toast('project deleted', { style: { borderColor: 'rgba(255,59,59,0.5)', color: '#ff3b3b' } });
  },

  wipePlannerData: async () => {
    await db.wipePlannerData();
    set({ nodes: [], arcs: [], projects: [], capacity: null });
    const [groups, capacity] = await Promise.all([db.loadGroups(), db.loadUserCapacity()]);
    set({ groups, capacity });
    toast('all planner data wiped', { style: { borderColor: 'rgba(255,59,59,0.5)', color: '#ff3b3b' } });
  },
}));
