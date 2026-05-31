import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Goal, Sticker, ThumbsUp } from 'pixelarticons/react';
import { ComposedChart, BarChart, Bar, LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { Project, Arc } from '../../ProjectsPlugin/lib/projectsDb';
import type { AcademicNode } from '../lib/academicDb';
import { createAcademicNode } from '../lib/academicDb';
import { loadCanvases, createCanvas } from '../lib/canvasDb';
import type { AcademicCanvas } from '../lib/canvasDb';
import CanvasView from './CanvasView';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#f59e0b';

function fmtDue(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return 'today';
  if (diff === 1) return 'tmrw';
  return `in ${diff}d`;
}

function fmtStartTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${month}/${day} · ${h % 12 || 12}:${min}${ampm}`;
}

function buildWeeklyBars(nodes: AcademicNode[]): { label: string; count: number }[] {
  const completed = nodes.filter(n => n.actual_completed_at);
  if (completed.length === 0) return [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - dow);
  const firstDate = new Date([...completed.map(n => n.actual_completed_at!.slice(0, 10))].sort()[0] + 'T00:00:00');
  const firstDow = firstDate.getDay() === 0 ? 6 : firstDate.getDay() - 1;
  const firstMonday = new Date(firstDate); firstMonday.setDate(firstDate.getDate() - firstDow);
  const weeks: { label: string; count: number }[] = [];
  let weekNum = 1;
  for (const cursor = new Date(firstMonday); cursor <= thisMonday; cursor.setDate(cursor.getDate() + 7)) {
    const start = new Date(cursor);
    const end = new Date(cursor); end.setDate(cursor.getDate() + 6);
    const count = completed.filter(n => {
      const d = new Date(n.actual_completed_at!.slice(0, 10) + 'T00:00:00');
      return d >= start && d <= end;
    }).length;
    weeks.push({ label: `W${weekNum++}`, count });
  }
  return weeks;
}

function buildDailyActivity(nodes: AcademicNode[]): { date: string; task: number; event: number }[] {
  const completed = nodes.filter(n => n.actual_completed_at);
  if (completed.length === 0) return [];
  const dates = [...new Set(completed.map(n => n.actual_completed_at!.slice(0, 10)))].sort();
  return dates.map(date => ({
    date,
    task:  completed.filter(n => n.actual_completed_at!.slice(0, 10) === date && n.node_type === 'task'  && !n.is_routine).length,
    event: completed.filter(n => n.actual_completed_at!.slice(0, 10) === date && n.node_type === 'event').length,
  }));
}

type Tab = 'list' | 'canvas';
type SectionKey = 'tasks' | 'assignments' | 'routines' | 'events';

const NODE_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'tasks',       label: 'tasks' },
  { key: 'assignments', label: 'assignments' },
  { key: 'routines',    label: 'routines' },
  { key: 'events',      label: 'events' },
];

function matchSection(n: { node_type: string; is_routine: boolean }, key: SectionKey): boolean {
  if (key === 'routines')    return n.is_routine;
  if (key === 'events')      return n.node_type === 'event' && !n.is_routine;
  if (key === 'tasks')       return n.node_type === 'task' && !n.is_routine;
  if (key === 'assignments') return false; // reserved for future node type
  return false;
}

function AcademicQuickAdd({ onCommit, accentColor }: { onCommit: (title: string) => Promise<void>; accentColor: string }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  const handleCommit = async () => {
    const title = value.trim();
    if (!title) return;
    await onCommit(title);
    setValue('');
    setPulseKey(k => k + 1);
  };

  return (
    <motion.div
      animate={{
        borderColor: focused ? `${accentColor}88` : 'rgba(255,255,255,0.28)',
        backgroundColor: focused ? 'rgba(0,0,0,0.96)' : 'rgba(0,0,0,0.88)',
      }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid rgba(255,255,255,0.28)', overflow: 'hidden', position: 'relative' }}
    >
      <AnimatePresence>
        <motion.div
          key={pulseKey}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -1, border: `2px solid ${accentColor}`, boxShadow: `0 0 14px ${accentColor}55`, pointerEvents: 'none', zIndex: 10 }}
        />
      </AnimatePresence>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); handleCommit(); }
          if (e.key === 'Escape') { e.preventDefault(); setValue(''); }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="new task..."
        style={{
          flex: 1, background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.82)',
          fontFamily: VT, fontSize: '1rem', padding: '6px 10px',
          letterSpacing: 1, outline: 'none',
        }}
      />
      <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', fontFamily: VT, fontSize: '0.75rem', color: 'rgba(255,255,255,0.18)', letterSpacing: 1 }}>
        enter ↵
      </div>
    </motion.div>
  );
}

interface Props {
  project: Project;
  arc: Arc | null;
  nodes: AcademicNode[];
  onBack: () => void;
  onRefresh: () => void;
  onViewAllCanvases: () => void;
}

export default function SubjectDetailView({ project, arc, nodes, onBack, onRefresh, onViewAllCanvases }: Props) {
  const [activeTab, setActiveTab]           = useState<Tab>('list');
  const [canvases, setCanvases]             = useState<AcademicCanvas[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [newCanvasName, setNewCanvasName]   = useState('');

  const accentColor   = arc?.color_hex ?? ACC;
  const incomplete    = nodes.filter(n => !n.is_completed);
  const completed     = nodes.filter(n =>  n.is_completed);

  const totalCount     = nodes.length;
  const completedCount = nodes.filter(n => n.is_completed).length;
  const completionRate = totalCount > 0 ? completedCount / totalCount : 0;
  const weeklyBars    = buildWeeklyBars(nodes);
  const dailyActivity = buildDailyActivity(nodes);

  const weeklyConfig: ChartConfig = { count: { label: 'completed', color: accentColor } };
  const tooltipStyle = {
    background: '#111', border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: VT, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)',
  };

  useEffect(() => {
    loadCanvases(project.id).then(cs => {
      setCanvases(cs);
      if (cs.length > 0) setSelectedCanvasId(cs[0].id);
    });
  }, [project.id]);

  const handleCreateCanvas = async () => {
    const name = newCanvasName.trim();
    if (!name) return;
    const id = await createCanvas(project.id, name);
    const updated = await loadCanvases(project.id);
    setCanvases(updated);
    setSelectedCanvasId(id);
    setNewCanvasName('');
    setCreatingCanvas(false);
    setActiveTab('canvas');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '1rem 160px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2,
              color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center',
              transition: 'color 0.1s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
          >
            ←
          </button>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
          <span style={{ fontFamily: VT, fontSize: '2.2rem', letterSpacing: 2, color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>
            {project.name}
          </span>
          {/* ── Tab bar ── */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.8rem', alignItems: 'center' }}>
          {(['list', 'canvas'] as Tab[]).map((tab, i) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: VT, letterSpacing: active ? '3px' : '1.5px',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  transition: 'all 0.12s ease',
                }}
              >
                <span style={{ fontSize: '1rem', color: active ? accentColor : 'rgba(255,255,255,0.22)' }}>
                  {i + 1}
                </span>
                <span style={{
                  fontSize: active ? '2rem' : '1.2rem',
                  color: active ? '#fff' : 'rgba(255,255,255,0.28)',
                  textTransform: active ? 'uppercase' : 'lowercase',
                  transition: 'font-size 0.12s ease, color 0.12s ease',
                }}>
                  {tab}
                </span>
              </button>
            );
          })}
          </div>
        </div>
        {arc && (
          <div style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2, color: accentColor, opacity: 0.6, paddingLeft: 22, marginBottom: 10 }}>
            {arc.name}
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <AcademicQuickAdd
            accentColor={accentColor}
            onCommit={async (title) => {
              await createAcademicNode(project.id, arc?.id ?? null, title);
              onRefresh();
            }}
          />
        </div>
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 0 }} />
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* List tab */}
        {activeTab === 'list' && (
          <div style={{ height: 'calc(100% - 40px)', display: 'flex', gap: 12, overflow: 'hidden', marginLeft: 160, marginRight: 160 }}>

            {/* Analytics column */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1.5px solid rgba(255,255,255,0.28)' }}>
              <div style={{ flexShrink: 0, padding: '10px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontFamily: VT, fontSize: '1.3rem', letterSpacing: 3, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Goal size={18} /><span>analytics</span>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px' }}>

              {/* Completion rate */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 2.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 6 }}>completion</div>
                <div style={{ fontFamily: VT, fontSize: '1.5rem', letterSpacing: 1, color: 'rgba(255,255,255,0.7)', lineHeight: 1, marginBottom: 8 }}>
                  {completedCount} <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.22)' }}>/ {totalCount}</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${completionRate * 100}%`, background: accentColor, borderRadius: 2 }} />
                </div>
                <div style={{ fontFamily: VT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)', marginTop: 5, letterSpacing: 1 }}>
                  {Math.round(completionRate * 100)}% done
                </div>
              </div>

              {/* Weekly bar chart */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 2.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8 }}>weekly output</div>
                <div style={{ position: 'relative', height: 72 }}>
                  {/* Line layer — bottom */}
                  <div style={{ position: 'absolute', inset: 0, height: 72, pointerEvents: 'none' }}>
                    <ResponsiveContainer width="100%" height={72}>
                      <ComposedChart data={weeklyBars} barSize={22} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <Bar dataKey="count" opacity={0} />
                        <Line type="monotone" dataKey="count" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Bar layer — top */}
                  <ChartContainer config={weeklyConfig} style={{ position: 'absolute', inset: 0, height: 72 }} className="w-full">
                    <BarChart data={weeklyBars} barSize={22} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>

              {/* Daily activity line */}
              <div>
                <div style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 2.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8 }}>activity — 28d</div>
                <ResponsiveContainer width="100%" height={72}>
                  <LineChart data={dailyActivity} margin={{ top: 10, right: 2, left: 2, bottom: 10 }}>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [v, String(name)]} labelFormatter={(l) => l} />
                    <Line type="monotone" dataKey="task"  stroke={accentColor}            strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="event" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 14, height: 2, background: accentColor }} />
                    <span style={{ fontFamily: VT, fontSize: '0.65rem', letterSpacing: 1, color: 'rgba(255,255,255,0.22)' }}>task</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 14, height: 2, background: 'rgba(255,255,255,0.35)' }} />
                    <span style={{ fontFamily: VT, fontSize: '0.65rem', letterSpacing: 1, color: 'rgba(255,255,255,0.22)' }}>event</span>
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Pending column */}
            <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1.5px solid rgba(255,255,255,0.28)' }}>
              <div style={{ flexShrink: 0, padding: '10px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontFamily: VT, fontSize: '1.3rem', letterSpacing: 3, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sticker size={18} /><span>to-do!</span>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                {/* Tasks & Assignments */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                  {(['tasks', 'assignments'] as SectionKey[]).map(key => {
                    const label = NODE_SECTIONS.find(s => s.key === key)!.label;
                    const group = incomplete.filter(n => matchSection(n, key));
                    return (
                      <div key={key} style={{ marginBottom: 28 }}>
                        <div style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 3, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8 }}>
                          {label} {group.length > 0 && <span style={{ opacity: 0.5 }}>— {group.length}</span>}
                        </div>
                        {group.length === 0 ? (
                          <div style={{ fontFamily: VT, fontSize: '0.8rem', color: 'rgba(255,255,255,0.08)', letterSpacing: 1 }}>—</div>
                        ) : group.map(n => (
                          <div key={n.id} className="node-row">
                            <span style={{ fontSize: '0.75rem', color: accentColor, flexShrink: 0 }}>◆</span>
                            <span style={{ flex: 1 }}>{n.title}</span>
                            <span className="due-label" style={{ color: 'rgba(255,255,255,0.25)' }}>{fmtDue(n.due_at ?? n.planned_start_at)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {/* Routines & Events */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px' }}>
                  {(['routines', 'events'] as SectionKey[]).map(key => {
                    const label = NODE_SECTIONS.find(s => s.key === key)!.label;
                    const group = incomplete.filter(n => matchSection(n, key));
                    return (
                      <div key={key} style={{ marginBottom: 28 }}>
                        <div style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 3, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8 }}>
                          {label} {group.length > 0 && <span style={{ opacity: 0.5 }}>— {group.length}</span>}
                        </div>
                        {group.length === 0 ? (
                          <div style={{ fontFamily: VT, fontSize: '0.8rem', color: 'rgba(255,255,255,0.08)', letterSpacing: 1 }}>—</div>
                        ) : group.map(n => (
                          <div key={n.id} className="node-row" style={{ alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '0.75rem', color: accentColor, flexShrink: 0, marginTop: 3 }}>◆</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
                              <span>{n.title}</span>
                              {(n.planned_start_at || n.due_at) && (
                                <span style={{ fontFamily: VT, fontSize: '0.75rem', color: 'rgba(255,255,255,0.28)', letterSpacing: 1, marginTop: -4 }}>
                                  {fmtStartTime(n.planned_start_at ?? n.due_at)}
                                </span>
                              )}
                            </div>
                            <span className="due-label" style={{ color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>{fmtDue(n.due_at ?? n.planned_start_at)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Done column */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1.5px solid rgba(255,255,255,0.28)' }}>
              <div style={{ flexShrink: 0, padding: '10px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontFamily: VT, fontSize: '1.3rem', letterSpacing: 3, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ThumbsUp size={18} /><span>done</span>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px' }}>
              {NODE_SECTIONS.map(({ key, label }) => {
                const group = completed.filter(n => matchSection(n, key));
                return (
                  <div key={key} style={{ marginBottom: 28 }}>
                    <div style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 3, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8 }}>
                      {label} {group.length > 0 && <span style={{ opacity: 0.5 }}>— {group.length}</span>}
                    </div>
                    {group.length === 0 ? (
                      <div style={{ fontFamily: VT, fontSize: '0.8rem', color: 'rgba(255,255,255,0.06)', letterSpacing: 1 }}>—</div>
                    ) : group.map(n => (
                      <div key={n.id} className="node-row completed">
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.12)', flexShrink: 0 }}>◆</span>
                        <span style={{ flex: 1 }}>{n.title}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              </div>
            </div>

          </div>
        )}

        {/* Canvas tab */}
        {activeTab === 'canvas' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0, padding: '0 160px 20px' }}>
              {selectedCanvasId ? (
                <div style={{ height: '100%', overflow: 'hidden' }}>
                  <CanvasView
                    key={selectedCanvasId}
                    canvasId={selectedCanvasId}
                    nodes={nodes}
                    accentColor={accentColor}
                    onRefresh={onRefresh}
                    canvases={canvases}
                    selectedCanvasId={selectedCanvasId}
                    onSelectCanvas={setSelectedCanvasId}
                    creatingCanvas={creatingCanvas}
                    newCanvasName={newCanvasName}
                    setNewCanvasName={setNewCanvasName}
                    setCreatingCanvas={setCreatingCanvas}
                    onCreateCanvas={handleCreateCanvas}
                    onViewAllCanvases={onViewAllCanvases}
                  />
                </div>
              ) : (
                <div style={{ height: '100%', overflow: 'hidden' }}>
                  <CanvasView
                    key="__empty__"
                    canvasId=""
                    nodes={nodes}
                    accentColor={accentColor}
                    canvases={canvases}
                    selectedCanvasId=""
                    onSelectCanvas={setSelectedCanvasId}
                    creatingCanvas={creatingCanvas}
                    newCanvasName={newCanvasName}
                    setNewCanvasName={setNewCanvasName}
                    setCreatingCanvas={setCreatingCanvas}
                    onCreateCanvas={handleCreateCanvas}
                    onViewAllCanvases={onViewAllCanvases}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
