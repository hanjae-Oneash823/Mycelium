import { useEffect, useCallback } from 'react';
import './PlannerPlugin.css';
import { usePlannerStore } from './store/usePlannerStore';
import { fillMissingRoutineNodes } from './lib/routineDb';
import { useViewStore } from './store/useViewStore';
import { useLogicEngine } from './store/useLogicEngine';
import ViewSwitcher from './components/ViewSwitcher';
import TaskForm from './components/TaskForm';
import CommandPalette from './components/CommandPalette';
import TodayView from './views/TodayView';
import EisenhowerView from './views/EisenhowerView';
import FocusView from './views/FocusView';
import RoutinesView from './views/RoutinesView';
import type { PlannerViewType } from './types';

function renderView(v: PlannerViewType) {
  if (v === 'today')      return <TodayView />;
  if (v === 'eisenhower') return <EisenhowerView />;
  if (v === 'focus')      return <FocusView />;
  if (v === 'routines')   return <RoutinesView />;
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
      <div className="planner-content">
        {renderView(activeView)}
      </div>
      {taskFormOpen && <TaskForm />}
      {commandPaletteOpen && <CommandPalette />}
    </div>
  );
}
