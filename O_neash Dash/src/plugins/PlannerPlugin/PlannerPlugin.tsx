import { useEffect, useCallback } from 'react';
import './PlannerPlugin.css';
import { usePlannerStore } from './store/usePlannerStore';
import { useViewStore } from './store/useViewStore';
import { useLogicEngine } from './store/useLogicEngine';
import ViewSwitcher from './components/ViewSwitcher';
import TaskForm from './components/TaskForm';
import CommandPalette from './components/CommandPalette';
import TodayView from './views/TodayView';
import EisenhowerView from './views/EisenhowerView';
import FocusView from './views/FocusView';
import CalendarView from './views/CalendarView';
import ArcView from './views/ArcView';
import type { PlannerViewType } from './types';

function PhasePlaceholder({ view }: { view: PlannerViewType }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ fontSize: '2rem', letterSpacing: '6px', color: 'rgba(255,255,255,0.1)', textTransform: 'uppercase' }}>{view}</div>
      <div style={{ fontSize: '0.9rem', letterSpacing: '3px', color: 'rgba(255,255,255,0.08)' }}>coming in phase 3</div>
    </div>
  );
}

export default function PlannerPlugin() {
  const { loadAll } = usePlannerStore();
  const { activeView, taskFormOpen, commandPaletteOpen, openCommandPalette, closeCommandPalette } = useViewStore();

  useEffect(() => {
    loadAll();
  }, []);

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
        {activeView === 'today'      && <TodayView />}
        {activeView === 'calendar'   && <CalendarView />}
        {activeView === 'eisenhower' && <EisenhowerView />}
        {activeView === 'focus'      && <FocusView />}
        {activeView === 'arc'        && <ArcView />}
      </div>
      {taskFormOpen && <TaskForm />}
      {commandPaletteOpen && <CommandPalette />}
    </div>
  );
}
