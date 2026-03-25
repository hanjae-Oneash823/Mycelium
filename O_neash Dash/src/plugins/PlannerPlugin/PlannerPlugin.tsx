import { useEffect, useCallback, useState } from 'react';
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
import ArcView from './views/ArcView';
import TendrilsView from './views/TendrilsView';
import type { PlannerViewType } from './types';

function renderView(v: PlannerViewType) {
  if (v === 'today')      return <TodayView />;
  if (v === 'eisenhower') return <EisenhowerView />;
  if (v === 'focus')      return <FocusView />;
  if (v === 'arc')        return <ArcView />;
  if (v === 'tendrils')   return <TendrilsView />;
  return null;
}

function AnimatedContent({ view }: { view: PlannerViewType }) {
  const [displayed, setDisplayed] = useState(view);
  const [exiting, setExiting]     = useState<PlannerViewType | null>(null);

  useEffect(() => {
    if (view === displayed) return;
    setExiting(displayed);
    setDisplayed(view);
    const t = setTimeout(() => setExiting(null), 220);
    return () => clearTimeout(t);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {exiting && (
        <div style={{ position: 'absolute', inset: 0, animation: 'plannerViewOut 0.2s ease forwards', pointerEvents: 'none', zIndex: 1 }}>
          {renderView(exiting)}
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, animation: 'plannerViewIn 0.22s ease forwards', zIndex: 2 }}>
        {renderView(displayed)}
      </div>
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
        <AnimatedContent view={activeView} />
      </div>
      {taskFormOpen && <TaskForm />}
      {commandPaletteOpen && <CommandPalette />}
    </div>
  );
}
