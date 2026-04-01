import type { ComponentType } from 'react';

// ── Grid sizes ─────────────────────────────────────────────────────────────────
// W × H in grid-column / grid-row units
export type WidgetSize = '1x1' | '2x1' | '1x2' | '2x2' | '3x1' | '3x2' | '4x1' | '4x2';

export interface GridSpan {
  colSpan: number;
  rowSpan: number;
}

export const SIZE_SPANS: Record<WidgetSize, GridSpan> = {
  '1x1': { colSpan: 1, rowSpan: 1 },
  '2x1': { colSpan: 2, rowSpan: 1 },
  '1x2': { colSpan: 1, rowSpan: 2 },
  '2x2': { colSpan: 2, rowSpan: 2 },
  '3x1': { colSpan: 3, rowSpan: 1 },
  '3x2': { colSpan: 3, rowSpan: 2 },
  '4x1': { colSpan: 4, rowSpan: 1 },
  '4x2': { colSpan: 4, rowSpan: 2 },
};

// ── Categories ─────────────────────────────────────────────────────────────────
export type WidgetCategory =
  | 'analytics-planner'
  | 'analytics-cross'
  | 'utility'
  | 'fun'
  | 'personal';

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  'analytics-planner': 'Analytics — Planner',
  'analytics-cross':   'Analytics — Cross-App',
  'utility':           'Utility',
  'fun':               'Fun',
  'personal':          'Personal',
};

// ── Widget definition (static, from registry) ──────────────────────────────────
export interface WidgetProps {
  size: WidgetSize;
  instanceId: string;
}

export interface WidgetDef {
  id:           string;
  label:        string;
  description:  string;
  category:     WidgetCategory;
  defaultSize:  WidgetSize;
  allowedSizes: WidgetSize[];
  component:    ComponentType<WidgetProps>;
}

// ── Widget instance (user-placed, persisted) ───────────────────────────────────
export interface WidgetInstance {
  instanceId: string;   // unique per placement
  widgetId:   string;   // references WidgetDef.id
  size:       WidgetSize;
  order:      number;   // display order in grid
}
