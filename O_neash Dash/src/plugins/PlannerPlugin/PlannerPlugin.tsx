import { useEffect, useCallback } from 'react';
import './PlannerPlugin.css';
import { usePlannerStore } from './store/usePlannerStore';
import { fillMissingRoutineNodes } from './lib/routineDb';
import { useViewStore } from './store/useViewStore';
import { useLogicEngine } from './store/useLogicEngine';
import ViewSwitcher from './components/ViewSwitcher';
import TaskForm from './components/TaskForm';
import CommandPalette from './components/CommandPalette';
import WeeklyTimetablePanel from './components/WeeklyTimetablePanel';
import TodayView from './views/TodayView';
import EisenhowerView from './views/EisenhowerView';
import RoutinesView from './views/RoutinesView';
import OnTheClockView from './views/OnTheClockView';
import type { PlannerViewType } from './types';

function renderView(v: PlannerViewType) {
  if (v === 'today')        return <TodayView />;
  if (v === 'eisenhower')   return <EisenhowerView />;
  if (v === 'routines')     return <RoutinesView />;
  if (v === 'on-the-clock') return <OnTheClockView />;
  return null;
}


export default function PlannerPlugin() {
  const { loadAll } = usePlannerStore();
  const { activeView, taskFormOpen, commandPaletteOpen, openCommandPalette, closeCommandPalette } = useViewStore();

  useEffect(() => {
    const init = async () => {
      // Fill any missing routine nodes for the next year (non-destructive)
      try { await fillMissingRoutineNodes(); } catch (e) { console.error('routine fill error:', e); }
      await loadAll();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLogicEngine();

  // Global Ctrl+K handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (commandPaletteOpen) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    }
  }, [commandPaletteOpen, openCommandPalette, closeCommandPalette]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="planner-plugin">
      <ViewSwitcher />
      <div className="planner-content" style={{ display: 'flex', overflow: 'hidden' }}>
        <div
          style={{
            flex: '0 0 22%',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <WeeklyTimetablePanel />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {renderView(activeView)}
        </div>
      </div>
      {taskFormOpen && <TaskForm />}
      {commandPaletteOpen && <CommandPalette />}
    </div>
  );
}
