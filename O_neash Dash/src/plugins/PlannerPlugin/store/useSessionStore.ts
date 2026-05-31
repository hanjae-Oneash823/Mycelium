import { create } from 'zustand';
import * as otc from '../lib/onTheClockDb';

export type { WorkLocation, WorkSession, SessionNodeWithNode, SessionPause, BrowsableNode } from '../lib/onTheClockDb';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface SessionState {
  activeSession: otc.WorkSession | null;
  activeSessionNodes: otc.SessionNodeWithNode[];
  activePauses: otc.SessionPause[];
  todaySessions: otc.WorkSession[];
  locations: otc.WorkLocation[];

  load: () => Promise<void>;
  reloadNodes: () => Promise<void>;

  startPlanned: (sessionId: string) => Promise<void>;
  startUnplanned: (locationId: string) => Promise<void>;
  pauseManual: () => Promise<string>;
  resume: (pauseId: string) => Promise<void>;
  endClean: () => Promise<void>;
  endAt: (isoTime: string) => Promise<void>;
  carryOver: () => Promise<void>;
  moveUnfinished: (targetSessionId: string | null) => Promise<void>;
  forceAllDone: () => Promise<void>;

  startNode: (nodeId: string) => Promise<void>;
  finishNode: (nodeId: string) => Promise<void>;
  markIncomplete: (nodeId: string) => Promise<void>;
  returnToQueue: (nodeId: string) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  addNodes: (nodeIds: string[]) => Promise<void>;

  createPlanned: (locationId: string, date: string, nodeIds: string[]) => Promise<void>;
  addLocation: (name: string) => Promise<void>;
  removeLocation: (id: string) => Promise<void>;

  startPomoBreak: (type: 'pomo_short' | 'pomo_long') => Promise<{ pauseId: string; pomoBlockId: string }>;
  endPomoBreak: (pauseId: string, pomoBlockId: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  activeSession: null,
  activeSessionNodes: [],
  activePauses: [],
  todaySessions: [],
  locations: [],

  load: async () => {
    const [active, todaySess, locs] = await Promise.all([
      otc.loadActiveSession(),
      otc.loadTodaySessions(todayStr()),
      otc.loadLocations(),
    ]);
    const [nodes, pauses] = active
      ? await Promise.all([otc.loadSessionNodes(active.id), otc.loadSessionPauses(active.id)])
      : [[], []];
    set({ activeSession: active, activeSessionNodes: nodes, activePauses: pauses, todaySessions: todaySess, locations: locs });
  },

  reloadNodes: async () => {
    const { activeSession } = get();
    if (!activeSession) return;
    const [nodes, pauses] = await Promise.all([
      otc.loadSessionNodes(activeSession.id),
      otc.loadSessionPauses(activeSession.id),
    ]);
    set({ activeSessionNodes: nodes, activePauses: pauses });
  },

  startPlanned: async (sessionId) => {
    await otc.startSession(sessionId);
    await get().load();
  },

  startUnplanned: async (locationId) => {
    const id = await otc.createSession(locationId, todayStr());
    await otc.startSession(id);
    await get().load();
  },

  pauseManual: async () => {
    const { activeSession } = get();
    if (!activeSession) return '';
    const pauseId = await otc.pauseSession(activeSession.id, 'manual');
    await get().load();
    return pauseId;
  },

  resume: async (pauseId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.resumeSession(activeSession.id, pauseId);
    await get().load();
  },

  endClean: async () => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.endSession(activeSession.id, 'completed');
    await get().load();
  },

  endAt: async (isoTime) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.endSessionAt(activeSession.id, 'completed', isoTime);
    await get().load();
  },

  carryOver: async () => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.carryOverUnfinished(activeSession.id);
    await otc.endSession(activeSession.id, 'interrupted');
    await get().load();
  },

  moveUnfinished: async (targetSessionId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.moveUnfinishedToSession(activeSession.id, targetSessionId);
    await otc.endSession(activeSession.id, 'interrupted');
    await get().load();
  },

  forceAllDone: async () => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.markAllNodesDone(activeSession.id);
    await otc.endSession(activeSession.id, 'completed');
    await get().load();
  },

  startNode: async (nodeId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.startNode(activeSession.id, nodeId);
    await get().reloadNodes();
  },

  finishNode: async (nodeId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.finishNode(activeSession.id, nodeId);
    await get().reloadNodes();
  },

  markIncomplete: async (nodeId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.markNodeIncomplete(activeSession.id, nodeId);
    await get().reloadNodes();
  },

  returnToQueue: async (nodeId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.returnNodeToQueue(activeSession.id, nodeId);
    await get().reloadNodes();
  },

  removeNode: async (nodeId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.removeNodeFromSession(activeSession.id, nodeId);
    await get().reloadNodes();
  },

  addNodes: async (nodeIds) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.addNodesToSession(activeSession.id, nodeIds);
    await get().reloadNodes();
  },

  createPlanned: async (locationId, date, nodeIds) => {
    const id = await otc.createSession(locationId, date);
    await otc.addNodesToSession(id, nodeIds);
    await get().load();
  },

  addLocation: async (name) => {
    await otc.createLocation(name);
    const locs = await otc.loadLocations();
    set({ locations: locs });
  },

  removeLocation: async (id) => {
    await otc.deleteLocation(id);
    const locs = await otc.loadLocations();
    set({ locations: locs });
  },

  startPomoBreak: async (type) => {
    const { activeSession } = get();
    if (!activeSession) return { pauseId: '', pomoBlockId: '' };
    await otc.endOpenPomoWorkBlock(activeSession.id);
    const pauseId = await otc.pauseSession(activeSession.id, type);
    const blockType = type === 'pomo_short' ? 'short_break' : 'long_break';
    const pomoBlockId = await otc.startPomoBlock(activeSession.id, blockType);
    await get().load();
    return { pauseId, pomoBlockId };
  },

  endPomoBreak: async (pauseId, pomoBlockId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    await otc.endPomoBlock(pomoBlockId);
    await otc.resumeSession(activeSession.id, pauseId);
    await otc.startPomoBlock(activeSession.id, 'work');
    await get().load();
  },
}));
