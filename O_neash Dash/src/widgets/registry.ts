import type { WidgetDef } from './types';
import { PressureGauge }   from './widgets/PressureGauge';
import { DeadlineHorizon } from './widgets/DeadlineHorizon';
import { TheFrog }         from './widgets/TheFrog';
import { OverdueDebt }     from './widgets/OverdueDebt';
import { DailyTasks }      from './widgets/DailyTasks';
import { PlaceholderWidget } from './widgets/PlaceholderWidget';

export const WIDGET_REGISTRY: WidgetDef[] = [
  // ── Analytics — Planner ──────────────────────────────────────────────────────
  {
    id:           'pressure-gauge',
    label:        'Pressure Gauge',
    description:  'Pie gauge showing current workload pressure level.',
    category:     'analytics-planner',
    defaultSize:  '2x2',
    allowedSizes: ['2x2', '4x2'],
    component:    PressureGauge,
  },
  {
    id:           'the-frog',
    label:        'Eat the Frog',
    description:  'Surfaces your ugliest task — do it first.',
    category:     'analytics-planner',
    defaultSize:  '2x2',
    allowedSizes: ['2x1', '2x2'],
    component:    TheFrog,
  },
  {
    id:           'daily-tasks',
    label:        'Daily Tasks',
    description:  'At-a-glance counters: overdue, tasks, events, tomorrow.',
    category:     'analytics-planner',
    defaultSize:  '2x1',
    allowedSizes: ['2x1', '4x1'],
    component:    DailyTasks,
  },
  {
    id:           'overdue-debt',
    label:        'Overdue Debt',
    description:  'Count and total hours of overdue tasks.',
    category:     'analytics-planner',
    defaultSize:  '2x1',
    allowedSizes: ['2x1', '2x2'],
    component:    OverdueDebt,
  },
  {
    id:           'deadline-horizon',
    label:        'Deadline Horizon',
    description:  '14-day dot timeline coloured by urgency level.',
    category:     'analytics-planner',
    defaultSize:  '4x1',
    allowedSizes: ['4x1', '4x2'],
    component:    DeadlineHorizon,
  },
  // ── Utility (placeholders) ───────────────────────────────────────────────────
  {
    id:           'world-clock',
    label:        'World Clock',
    description:  'Multiple timezone display.',
    category:     'utility',
    defaultSize:  '2x1',
    allowedSizes: ['2x1', '2x2'],
    component:    PlaceholderWidget,
  },
  {
    id:           'pomodoro',
    label:        'Pomodoro Timer',
    description:  'Focus timer strip with session tracking.',
    category:     'utility',
    defaultSize:  '4x1',
    allowedSizes: ['4x1'],
    component:    PlaceholderWidget,
  },
  // ── Fun (placeholders) ───────────────────────────────────────────────────────
  {
    id:           'conways-life',
    label:        "Conway's Game of Life",
    description:  'Seeded from today\'s date. Loops.',
    category:     'fun',
    defaultSize:  '2x2',
    allowedSizes: ['2x2'],
    component:    PlaceholderWidget,
  },
  {
    id:           'desktop-pet',
    label:        'Desktop Pet',
    description:  'Reacts to your pressure score. Panics when critical.',
    category:     'fun',
    defaultSize:  '1x2',
    allowedSizes: ['1x1', '1x2'],
    component:    PlaceholderWidget,
  },
  {
    id:           'pixel-aquarium',
    label:        'Pixel Aquarium',
    description:  'Fish count = tasks completed this week.',
    category:     'fun',
    defaultSize:  '2x1',
    allowedSizes: ['2x1', '4x1'],
    component:    PlaceholderWidget,
  },
  // ── Personal (placeholders) ──────────────────────────────────────────────────
  {
    id:           'photo-of-day',
    label:        'Photo of the Day',
    description:  'Random pull from Film Neg Lab.',
    category:     'personal',
    defaultSize:  '1x2',
    allowedSizes: ['1x1', '1x2', '2x2'],
    component:    PlaceholderWidget,
  },
];

export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find(w => w.id === id);
}
