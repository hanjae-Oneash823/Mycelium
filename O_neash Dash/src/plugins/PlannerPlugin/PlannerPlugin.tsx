import { useEffect } from 'react';
import './PlannerPlugin.css';
import { usePlannerStore } from './store/usePlannerStore';
import { useViewStore } from './store/useViewStore';
import { useLogicEngine } from './store/useLogicEngine';
import ViewSwitcher from './components/ViewSwitcher';
import TaskForm from './components/TaskForm';
import TodayView from './views/TodayView';
import EisenhowerView from './views/EisenhowerView';
import type { PlannerViewType } from './types';

function PhasePlaceholder({ view }: { view: PlannerViewType }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ fontSize: '2rem', letterSpacing: '6px', color: 'rgba(255,255,255,0.1)', textTransform: 'uppercase' }}>{view}</div>
      <div style={{ fontSize: '0.9rem', letterSpacing: '3px', color: 'rgba(255,255,255,0.08)' }}>coming in phase 2</div>
    </div>
  );
}

export default function PlannerPlugin() {
  const { loadAll } = usePlannerStore();
  const { activeView, taskFormOpen } = useViewStore();

  useEffect(() => {
    loadAll();
  }, []);

  useLogicEngine();

  return (
    <div className="planner-plugin">
      <ViewSwitcher />
      <div className="planner-content">
        {activeView === 'today'      && <TodayView />}
        {activeView === 'eisenhower' && <EisenhowerView />}
        {(activeView === 'calendar' || activeView === 'focus' || activeView === 'arc') &&
          <PhasePlaceholder view={activeView} />
        }
      </div>
      {taskFormOpen && <TaskForm />}
    </div>
  );
}
