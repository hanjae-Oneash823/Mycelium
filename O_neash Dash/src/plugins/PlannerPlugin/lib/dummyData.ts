/**
 * Dummy data generator — dev only.
 * Wipes all planner data and inserts a realistic spread of nodes across
 * every Today-view section: overdue, missed schedule, today, and suggestions.
 */
import { getDb } from '@/lib/db';
import {
  createGroup, createArc, createProject, createNode,
} from './plannerDb';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayAt(hhmm: string): string {
  return `${daysFromNow(0)}T${hhmm}:00`;
}

// ─── Wipe ─────────────────────────────────────────────────────────────────────

async function wipeAll(): Promise<void> {
  const db = getDb();
  // Drop the trigger that blocks cascade deletes, then re-create after wipe
  await db.execute(`DROP TRIGGER IF EXISTS readd_ungrouped_if_empty`);
  await db.execute(`DELETE FROM note_task_links`);
  await db.execute(`DELETE FROM sub_tasks`);
  await db.execute(`DELETE FROM node_groups`);
  await db.execute(`DELETE FROM nodes`);
  await db.execute(`DELETE FROM projects`);
  await db.execute(`DELETE FROM arcs`);
  await db.execute(`DELETE FROM planner_groups WHERE is_ungrouped = 0`);
  // Re-create the guard trigger
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS readd_ungrouped_if_empty AFTER DELETE ON node_groups
    BEGIN
      INSERT OR IGNORE INTO node_groups(node_id, group_id)
      SELECT OLD.node_id, id FROM planner_groups
      WHERE is_ungrouped = 1
        AND NOT EXISTS (
          SELECT 1 FROM node_groups WHERE node_id = OLD.node_id
        );
    END
  `);
}

// ─── Generator ────────────────────────────────────────────────────────────────

export async function generateDummyData(): Promise<void> {
  await wipeAll();

  // ── Groups ────────────────────────────────────────────────────────────────
  const gWork     = await createGroup({ name: 'work',     color_hex: '#64c8ff' });
  const gPersonal = await createGroup({ name: 'personal', color_hex: '#4ade80' });
  const gHealth   = await createGroup({ name: 'health',   color_hex: '#f5a623' });
  const gCreative = await createGroup({ name: 'creative', color_hex: '#c084fc' });

  // ── Arcs ──────────────────────────────────────────────────────────────────
  const arcLaunch   = await createArc({ name: 'Product Launch',   color_hex: '#64c8ff', start_date: daysFromNow(-30) });
  const arcGrowth   = await createArc({ name: 'Personal Growth',  color_hex: '#4ade80', start_date: daysFromNow(-14) });
  const arcFreelance = await createArc({ name: 'Freelance',       color_hex: '#c084fc', start_date: daysFromNow(-7)  });

  // ── Projects ──────────────────────────────────────────────────────────────
  const projBackend  = await createProject({ name: 'Backend API',   color_hex: '#64c8ff', arc_id: arcLaunch   });
  const projDesign   = await createProject({ name: 'UI Design',     color_hex: '#7ecfff', arc_id: arcLaunch   });
  const projMindset  = await createProject({ name: 'Mindset',       color_hex: '#4ade80', arc_id: arcGrowth   });
  const projBranding = await createProject({ name: 'Client Brand',  color_hex: '#c084fc', arc_id: arcFreelance });

  // ── OVERDUE tasks (due date in the past) ──────────────────────────────────
  await createNode({
    title: 'write API integration tests',
    importance_level: 1,
    due_at: daysFromNow(-5),
    estimated_duration_minutes: 120,
    arc_id: arcLaunch, project_id: projBackend,
    group_ids: [gWork],
  });

  await createNode({
    title: 'send invoice to client',
    importance_level: 1,
    due_at: daysFromNow(-2),
    estimated_duration_minutes: 15,
    arc_id: arcFreelance, project_id: projBranding,
    group_ids: [gWork],
  });

  await createNode({
    title: 'book dentist appointment',
    importance_level: 0,
    due_at: daysFromNow(-4),
    estimated_duration_minutes: 10,
    group_ids: [gHealth],
  });

  // ── MISSED SCHEDULE (planned_start_at in past, no due_at) ─────────────────
  await createNode({
    title: 'journal for 10 minutes',
    importance_level: 0,
    planned_start_at: daysFromNow(-2),
    estimated_duration_minutes: 10,
    group_ids: [gPersonal],
  });

  await createNode({
    title: 'review design mockups',
    importance_level: 1,
    planned_start_at: daysFromNow(-1),
    estimated_duration_minutes: 45,
    arc_id: arcLaunch, project_id: projDesign,
    group_ids: [gWork, gCreative],
  });

  // ── TODAY tasks (planned_start_at = today) ────────────────────────────────
  await createNode({
    title: 'fix auth token refresh bug',
    importance_level: 1,
    planned_start_at: daysFromNow(0),
    due_at: daysFromNow(1),
    estimated_duration_minutes: 90,
    arc_id: arcLaunch, project_id: projBackend,
    group_ids: [gWork],
  });

  await createNode({
    title: 'morning run',
    importance_level: 0,
    planned_start_at: daysFromNow(0),
    estimated_duration_minutes: 30,
    group_ids: [gHealth],
  });

  await createNode({
    title: 'sketch landing page hero',
    importance_level: 1,
    planned_start_at: daysFromNow(0),
    estimated_duration_minutes: 60,
    arc_id: arcLaunch, project_id: projDesign,
    group_ids: [gCreative],
  });

  // Task due today (not planned today — shows via due_at)
  await createNode({
    title: 'submit timesheet',
    importance_level: 1,
    due_at: daysFromNow(0),
    estimated_duration_minutes: 10,
    group_ids: [gWork],
  });

  // ── TODAY events ──────────────────────────────────────────────────────────
  await createNode({
    title: 'team standup',
    node_type: 'event',
    planned_start_at: todayAt('10:00'),
    estimated_duration_minutes: 30,
    group_ids: [gWork],
  });

  await createNode({
    title: 'client call — branding review',
    node_type: 'event',
    planned_start_at: todayAt('15:30'),
    estimated_duration_minutes: 60,
    arc_id: arcFreelance, project_id: projBranding,
    group_ids: [gWork],
  });

  // ── SUGGESTIONS (scored candidates) ───────────────────────────────────────

  // High urgency assignment due soon — should score very high
  await createNode({
    title: 'finalize onboarding copy',
    importance_level: 1,
    due_at: daysFromNow(2),
    estimated_duration_minutes: 45,
    arc_id: arcLaunch, project_id: projDesign,
    group_ids: [gWork, gCreative],
  });

  // Important, due in a week
  await createNode({
    title: 'refactor database connection pooling',
    importance_level: 1,
    due_at: daysFromNow(7),
    estimated_duration_minutes: 180,
    arc_id: arcLaunch, project_id: projBackend,
    group_ids: [gWork],
  });

  // Quick win, no deadline
  await createNode({
    title: 'update README badges',
    importance_level: 0,
    estimated_duration_minutes: 15,
    group_ids: [gWork],
  });

  // Personal important flexible task
  await createNode({
    title: 'meditate 20 minutes',
    importance_level: 1,
    estimated_duration_minutes: 20,
    arc_id: arcGrowth, project_id: projMindset,
    group_ids: [gPersonal, gHealth],
  });

  // Due in 3 days, not important — L3
  await createNode({
    title: 'prepare slides for friday demo',
    importance_level: 0,
    due_at: daysFromNow(3),
    estimated_duration_minutes: 90,
    group_ids: [gWork, gCreative],
  });

  // Future event (not today)
  await createNode({
    title: 'product demo presentation',
    node_type: 'event',
    planned_start_at: `${daysFromNow(3)}T14:00:00`,
    estimated_duration_minutes: 90,
    arc_id: arcLaunch,
    group_ids: [gWork],
  });

  // Freelance assignment due in 5 days, important
  await createNode({
    title: 'deliver brand identity package',
    importance_level: 1,
    due_at: daysFromNow(5),
    estimated_duration_minutes: 240,
    arc_id: arcFreelance, project_id: projBranding,
    group_ids: [gWork, gCreative],
  });

  // Low effort, no date — suggestion fodder
  await createNode({
    title: 'read chapter 3 of deep work',
    importance_level: 0,
    estimated_duration_minutes: 30,
    arc_id: arcGrowth, project_id: projMindset,
    group_ids: [gPersonal],
  });
}
