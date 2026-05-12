import { create } from 'zustand';
import type { WorkBlock, PlacedNode, DispatchLocation, PoolNode } from '../types';
import * as dbOps from '../lib/dispatchDb';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DispatchStore {
  selectedDate: string;
  workBlocks: WorkBlock[];
  placements: PlacedNode[];
  locations: DispatchLocation[];
  poolNodes: PoolNode[];
  eventNodes: PoolNode[];
  loading: boolean;

  setDate: (date: string) => void;
  reload: () => Promise<void>;
  createWorkBlock: (startMin: number, endMin: number, locationId: string | null) => Promise<void>;
  moveWorkBlock: (id: string, newStart: number, newEnd: number) => Promise<void>;
  deleteWorkBlock: (id: string) => Promise<void>;
  setWorkBlockLocation: (id: string, locationId: string) => Promise<void>;
  createPlacement: (workBlockId: string, nodeId: string, startOffset: number, durationOverride: number | null) => Promise<void>;
  deletePlacement: (id: string) => Promise<void>;
  upsertLocation: (name: string) => Promise<DispatchLocation>;
}

export const useDispatchStore = create<DispatchStore>((set, get) => ({
  selectedDate: todayStr(),
  workBlocks: [],
  placements: [],
  locations: [],
  poolNodes: [],
  eventNodes: [],
  loading: false,

  setDate: (date) => set({ selectedDate: date }),

  reload: async () => {
    set({ loading: true });
    const date = get().selectedDate;
    const [workBlocks, placements, poolNodes, eventNodes, locations] = await Promise.all([
      dbOps.getWorkBlocksForDate(date),
      dbOps.getPlacementsForDate(date),
      dbOps.getPoolNodesForDate(date),
      dbOps.getEventNodesForDate(date),
      dbOps.getLocations(),
    ]);
    set({ workBlocks, placements, poolNodes, eventNodes, locations, loading: false });
  },

  createWorkBlock: async (startMin, endMin, locationId) => {
    const date = get().selectedDate;
    const wb = await dbOps.createWorkBlock(date, startMin, endMin, locationId);
    const loc = locationId ? (get().locations.find(l => l.id === locationId) ?? null) : null;
    wb.location = loc;
    set(s => ({
      workBlocks: [...s.workBlocks, wb].sort((a, b) => a.start_time - b.start_time),
    }));
  },

  moveWorkBlock: async (id, newStart, newEnd) => {
    await dbOps.updateWorkBlock(id, { start_time: newStart, end_time: newEnd });
    set(s => ({
      workBlocks: s.workBlocks
        .map(wb => wb.id === id ? { ...wb, start_time: newStart, end_time: newEnd } : wb)
        .sort((a, b) => a.start_time - b.start_time),
    }));
  },

  deleteWorkBlock: async (id) => {
    await dbOps.deleteWorkBlock(id);
    set(s => ({
      workBlocks: s.workBlocks.filter(wb => wb.id !== id),
      placements: s.placements.filter(p => p.work_block_id !== id),
    }));
  },

  setWorkBlockLocation: async (id, locationId) => {
    await dbOps.updateWorkBlock(id, { location_id: locationId });
    const loc = get().locations.find(l => l.id === locationId) ?? null;
    set(s => ({
      workBlocks: s.workBlocks.map(wb =>
        wb.id === id ? { ...wb, location_id: locationId, location: loc } : wb
      ),
    }));
  },

  createPlacement: async (workBlockId, nodeId, startOffset, durationOverride) => {
    const p = await dbOps.createPlacement(workBlockId, nodeId, startOffset, durationOverride);
    const node = get().poolNodes.find(n => n.id === nodeId);
    const placed: PlacedNode = {
      ...p,
      node_title: node?.title ?? '?',
      arc_name: node?.arc_name ?? null,
      estimated_duration_minutes: durationOverride ?? node?.estimated_duration_minutes ?? null,
    };
    set(s => ({ placements: [...s.placements, placed] }));
  },

  deletePlacement: async (id) => {
    await dbOps.deletePlacement(id);
    set(s => ({ placements: s.placements.filter(p => p.id !== id) }));
  },

  upsertLocation: async (name) => {
    const loc = await dbOps.upsertLocation(name);
    set(s => {
      const exists = s.locations.some(l => l.id === loc.id);
      return exists ? s : { locations: [...s.locations, loc] };
    });
    return loc;
  },
}));
