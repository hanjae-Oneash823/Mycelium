import { create } from 'zustand';
import type { Routine, RoutineRule } from '../types';
import * as db from '../lib/routineDb';

function toDS(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface RoutineStore {
  routines: Routine[];

  loadAll:               () => Promise<void>;
  createRoutine:         (data: Omit<Routine, 'id' | 'created_at' | 'updated_at' | 'rules'>) => Promise<string>;
  /** Creates routine + saves rules (recurring + manual) + generates all nodes. */
  createRoutineComplete: (
    data:      Omit<Routine, 'id'|'created_at'|'updated_at'|'rules'>,
    rules:     Omit<RoutineRule, 'id'|'routine_id'>[],
    groupIds?: string[],
  ) => Promise<string>;
  /** Updates routine fields + replaces all rules + updates groups + regenerates nodes. */
  updateRoutineWithRules: (
    id:       string,
    patch:    Partial<Omit<Routine, 'rules'>>,
    rules:    Omit<RoutineRule, 'id'|'routine_id'>[],
    groupIds?: string[],
  ) => Promise<void>;
  updateRoutine:   (id: string, patch: Partial<Routine>) => Promise<void>;
  deleteRoutine:   (id: string) => Promise<void>;
  generateNodes:   (routineId: string, from: string, to: string) => Promise<void>;
}

export const useRoutineStore = create<RoutineStore>((set, get) => ({
  routines: [],

  loadAll: async () => {
    const routines = await db.loadRoutines();
    set({ routines });
  },

  createRoutine: async (data) => {
    const id = await db.createRoutine(data);
    await get().loadAll();
    return id;
  },

  createRoutineComplete: async (data, rules, groupIds) => {
    const id = await db.createRoutine(data);

    if (groupIds?.length) await db.setRoutineGroups(id, groupIds);

    for (let i = 0; i < rules.length; i++) {
      await db.createRoutineRule(id, rules[i], i);
    }

    // Generate nodes for all rules (recurring within 1 year, manual rules always spawn)
    if (rules.length > 0) {
      const today   = new Date(); today.setHours(0, 0, 0, 0);
      const yearOut = new Date(today); yearOut.setFullYear(yearOut.getFullYear() + 1);
      await db.generateAndInsertRoutineNodes(id, toDS(today), toDS(yearOut));
    }

    await get().loadAll();
    return id;
  },

  updateRoutineWithRules: async (id, patch, rules, groupIds) => {
    await db.updateRoutine(id, patch);
    await db.replaceRoutineRules(id, rules);
    // Update group memberships before regenerating so new nodes get correct groups
    if (groupIds !== undefined) await db.setRoutineGroups(id, groupIds);
    await db.regenerateRoutineNodes(id);
    await get().loadAll();
  },

  updateRoutine: async (id, patch) => {
    await db.updateRoutine(id, patch);
    await get().loadAll();
  },

  deleteRoutine: async (id) => {
    await db.deleteRoutine(id);
    set(s => ({ routines: s.routines.filter(r => r.id !== id) }));
  },

  generateNodes: async (routineId, from, to) => {
    await db.generateAndInsertRoutineNodes(routineId, from, to);
  },
}));
