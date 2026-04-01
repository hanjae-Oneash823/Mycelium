import { create } from 'zustand';
import { createElement } from 'react';
import { CheckboxOn } from 'pixelarticons/react';
import { toast } from '@/components/ui/sonner';
import type { PlannerNode, PlannerGroup, Arc, Project, UserCapacity, CreateNodeData, SubTask } from '../types';
import * as db from '../lib/plannerDb';

interface PlannerStore {
  nodes: PlannerNode[];
  groups: PlannerGroup[];
  arcs: Arc[];
  projects: Project[];
  capacity: UserCapacity | null;
  subTasksByNode: Record<string, SubTask[]>;

  loadAll: () => Promise<void>;
  createNode: (data: CreateNodeData) => Promise<string>;
  updateNode: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  rescheduleNode: (id: string, date: string) => Promise<void>;
  completeNode: (id: string) => Promise<void>;
  replaceNodeGroups: (nodeId: string, groupIds: string[]) => Promise<void>;
  createGroup: (data: { name: string; color_hex: string }) => Promise<string>;
  updateGroup: (id: string, patch: { name?: string; color_hex?: string }) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  // Arc CRUD
  createArc: (data: { name: string; color_hex: string }) => Promise<string>;
  updateArc: (id: string, patch: Record<string, unknown>) => Promise<void>;
  archiveArc: (id: string) => Promise<void>;
  deleteArc: (id: string) => Promise<void>;
  // Project CRUD
  createProject: (data: { name: string; arc_id?: string }) => Promise<string>;
  updateProject: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  uncompleteNode: (id: string) => Promise<void>;
  // Sub-tasks
  loadSubTasks: (nodeId: string) => Promise<void>;
  createSubTask: (nodeId: string, title: string) => Promise<void>;
  toggleSubTask: (id: string, nodeId: string, current: boolean) => Promise<void>;
  updateSubTaskTitle: (id: string, nodeId: string, title: string) => Promise<void>;
  deleteSubTask: (id: string, nodeId: string) => Promise<void>;
  reorderSubTasks: (nodeId: string, orderedIds: string[]) => Promise<void>;
  // Test utilities
  wipePlannerData: () => Promise<void>;
}

// Patches sub_total/sub_done on the affected node in-place from a fresh subtask list
function patchNodeCounts(nodes: PlannerNode[], nodeId: string, subTasks: SubTask[]): PlannerNode[] {
  return nodes.map(n => n.id === nodeId
    ? { ...n, sub_total: subTasks.length, sub_done: subTasks.filter(s => s.is_completed).length }
    : n,
  );
}

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  nodes: [],
  groups: [],
  arcs: [],
  projects: [],
  capacity: null,
  subTasksByNode: {},

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
    try {
      await db.deleteNode(id);
    } catch (e) {
      console.error('deleteNode sync error (node was deleted):', e);
    }
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
    toast('task done', {
      icon: createElement(CheckboxOn, { size: 16, style: { color: '#4ade80', flexShrink: 0, marginRight: 8 } }),
      style: { borderColor: 'rgba(74,222,128,0.45)', color: '#4ade80' },
    });
  },

  uncompleteNode: async (id) => {
    await db.uncompleteNode(id);
    const nodes = await db.loadNodes();
    set({ nodes });
    toast('task unfinished', { style: { borderColor: 'rgba(251,146,60,0.5)', color: '#fb923c' } });
  },

  replaceNodeGroups: async (nodeId, groupIds) => {
    await db.replaceNodeGroups(nodeId, groupIds);
    const nodes = await db.loadNodes();
    set({ nodes });
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

  // Sub-tasks
  loadSubTasks: async (nodeId) => {
    const subTasks = await db.loadSubTasks(nodeId);
    set(s => ({
      subTasksByNode: { ...s.subTasksByNode, [nodeId]: subTasks },
      nodes: patchNodeCounts(s.nodes, nodeId, subTasks),
    }));
  },

  createSubTask: async (nodeId, title) => {
    const existing = get().subTasksByNode[nodeId] ?? [];
    const subTask  = await db.createSubTask(nodeId, title, existing.length);
    const updated  = [...existing, subTask];
    set(s => ({
      subTasksByNode: { ...s.subTasksByNode, [nodeId]: updated },
      nodes: patchNodeCounts(s.nodes, nodeId, updated),
    }));
  },

  toggleSubTask: async (id, nodeId, current) => {
    await db.updateSubTask(id, { is_completed: !current });
    const updated = (get().subTasksByNode[nodeId] ?? []).map(s =>
      s.id === id ? { ...s, is_completed: !current } : s,
    );
    set(s => ({
      subTasksByNode: { ...s.subTasksByNode, [nodeId]: updated },
      nodes: patchNodeCounts(s.nodes, nodeId, updated),
    }));
  },

  updateSubTaskTitle: async (id, nodeId, title) => {
    await db.updateSubTask(id, { title });
    const updated = (get().subTasksByNode[nodeId] ?? []).map(s =>
      s.id === id ? { ...s, title } : s,
    );
    set(s => ({ subTasksByNode: { ...s.subTasksByNode, [nodeId]: updated } }));
  },

  deleteSubTask: async (id, nodeId) => {
    await db.deleteSubTask(id);
    const updated = (get().subTasksByNode[nodeId] ?? []).filter(s => s.id !== id);
    set(s => ({
      subTasksByNode: { ...s.subTasksByNode, [nodeId]: updated },
      nodes: patchNodeCounts(s.nodes, nodeId, updated),
    }));
  },

  reorderSubTasks: async (nodeId, orderedIds) => {
    await db.reorderSubTasks(nodeId, orderedIds);
    const current = get().subTasksByNode[nodeId] ?? [];
    const byId    = Object.fromEntries(current.map(s => [s.id, s]));
    const updated = orderedIds.map((id, i) => ({ ...byId[id], sort_order: i }));
    set(s => ({ subTasksByNode: { ...s.subTasksByNode, [nodeId]: updated } }));
  },

  wipePlannerData: async () => {
    await db.wipePlannerData();
    set({ nodes: [], arcs: [], projects: [], capacity: null, subTasksByNode: {} });
    const [groups, capacity] = await Promise.all([db.loadGroups(), db.loadUserCapacity()]);
    set({ groups, capacity });
    toast('all planner data wiped', { style: { borderColor: 'rgba(255,59,59,0.5)', color: '#ff3b3b' } });
  },

}));
