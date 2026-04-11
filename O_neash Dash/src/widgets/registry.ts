import type { WidgetDef } from './types';
import { PressureGauge }   from './widgets/PressureGauge';
import { TheFrog }         from './widgets/TheFrog';
import { DailyTasks }      from './widgets/DailyTasks';
import { ConwaysLife }     from './widgets/ConwaysLife';
import { LangtonsAnt }     from './widgets/LangtonsAnt';
import { BriansBrain }     from './widgets/BriansBrain';
import { CodiCA }          from './widgets/CodiCA';
import { Wireworld }       from './widgets/Wireworld';
import { DayAndNight }     from './widgets/DayAndNight';
import { SpeakYourMind }   from './widgets/SpeakYourMind';
import { RecentDocs }         from './widgets/RecentDocs';
import { SleepLastNight }     from './widgets/SleepLastNight';
import { SleepWeeklyReview }  from './widgets/SleepWeeklyReview';
import { EnterESRA }          from './widgets/EnterESRA';

export const WIDGET_REGISTRY: WidgetDef[] = [
  // ── Notes ────────────────────────────────────────────────────────────────────
  {
    id:           'speak-your-mind',
    label:        'Speak Your Mind',
    description:  'Quick memo capture + two most recent memos.',
    category:     'utility',
    defaultSize:  '4x1',
    allowedSizes: ['4x1'],
    component:    SpeakYourMind,
  },
  {
    id:           'recent-docs',
    label:        'Recently Modified Docs',
    description:  'The 4 most recently modified documents from the Notes app.',
    category:     'utility',
    defaultSize:  '4x2',
    allowedSizes: ['4x2'],
    component:    RecentDocs,
  },
  // ── Sleep Tracker ────────────────────────────────────────────────────────────
  {
    id:           'sleep-last-night',
    label:        'Last Night',
    description:  'Duration, bedtime, wake time and delta from target for the most recent sleep session.',
    category:     'analytics-cross',
    defaultSize:  '2x1',
    allowedSizes: ['2x1', '4x1'],
    component:    SleepLastNight,
  },
  {
    id:           'sleep-weekly-review',
    label:        'Sleep — Weekly Review',
    description:  '7-day bar chart of sleep duration, colored by quality vs target.',
    category:     'analytics-cross',
    defaultSize:  '4x2',
    allowedSizes: ['4x2'],
    component:    SleepWeeklyReview,
  },
  // ── L'ESRA ───────────────────────────────────────────────────────────────────
  {
    id:           'enter-esra',
    label:        "Enter L'ESRA",
    description:  "Button shortcut to open the L'ESRA encyclopedia plugin.",
    category:     'utility',
    defaultSize:  '2x1',
    allowedSizes: ['2x1'],
    component:    EnterESRA,
  },
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
  // ── Fun ──────────────────────────────────────────────────────────────────────
  {
    id:           'conways-life',
    label:        "Conway's Game of Life",
    description:  'Cellular automaton — seeded from today\'s date.',
    category:     'fun',
    defaultSize:  '2x2',
    allowedSizes: ['2x2', '4x2'],
    component:    ConwaysLife,
  },
  {
    id:           'langtons-ant',
    label:        "Langton's Ant",
    description:  'Emergent highway pattern from simple rules.',
    category:     'fun',
    defaultSize:  '2x2',
    allowedSizes: ['2x2', '4x2'],
    component:    LangtonsAnt,
  },
  {
    id:           'brians-brain',
    label:        "Brian's Brain",
    description:  '3-state cellular automaton with dying cells.',
    category:     'fun',
    defaultSize:  '2x2',
    allowedSizes: ['2x2', '4x2'],
    component:    BriansBrain,
  },
  {
    id:           'codi-ca',
    label:        'CoDI-CA',
    description:  '4-state cyclic cellular automaton.',
    category:     'fun',
    defaultSize:  '2x2',
    allowedSizes: ['2x2', '4x2'],
    component:    CodiCA,
  },
  {
    id:           'wireworld',
    label:        'Wireworld',
    description:  'Electron signals flowing through a conductor circuit.',
    category:     'fun',
    defaultSize:  '2x2',
    allowedSizes: ['2x2', '4x2'],
    component:    Wireworld,
  },
  {
    id:           'day-and-night',
    label:        'Day and Night',
    description:  'B368/S34678 — symmetric two-state CA with island patterns.',
    category:     'fun',
    defaultSize:  '2x2',
    allowedSizes: ['2x2', '4x2'],
    component:    DayAndNight,
  },
];

export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find(w => w.id === id);
}
