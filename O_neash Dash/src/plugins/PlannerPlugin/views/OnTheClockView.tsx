import { useState, useEffect, useCallback, useMemo } from 'react';
import '../PlannerPlugin.css';
import { useSessionStore } from '../store/useSessionStore';
import { Feather } from 'pixelarticons/react/Feather';
import { Computer } from 'pixelarticons/react/Computer';
import { BracesContent } from 'pixelarticons/react/BracesContent';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Dot } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
  loadAllSessions, loadSessionNodes, loadBrowsableNodes, loadSessionPomoBlocks,
  endOpenPomoWorkBlock, startPomoBlock, deleteSession, updateSessionEndTime,
} from '../lib/onTheClockDb';
import type { WorkSession, SessionNodeWithNode, BrowsableNode, SessionPause, SessionPomoBlock } from '../lib/onTheClockDb';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#f59e0b';
const POMO = '#ef4444';

function fmtTimer(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string | null) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtMs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  if (m < 1) return '<1m';
  return `${m}m`;
}

function fmtDuration(start: string | null, end: string | null) {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return fmtMs(ms);
}

const STATUS_COLOR: Record<string, string> = {
  planned: 'rgba(255,255,255,0.35)',
  active: ACC,
  paused: '#60a5fa',
  completed: '#4ade80',
  interrupted: '#f87171',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkelBar({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return <div className="skel-shimmer" style={{ width: w, height: h, flexShrink: 0 }} />;
}

function Skeleton() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 24px', justifyContent: 'center' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 4, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>No Session Active</span>
      </div>

      {/* Boxes row — mirrors the four boxes */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'stretch', flexShrink: 0 }}>

        {/* Session timer box (220px) */}
        <div style={{ width: 220, border: '1px solid rgba(255,255,255,0.07)', background: '#0d0d0d', padding: '16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <SkelBar w={90} h={9} />
          <SkelBar w={110} h={30} />
          <div style={{ display: 'flex', gap: 6 }}>
            <SkelBar w={72} h={22} />
            <SkelBar w={56} h={22} />
          </div>
        </div>

        {/* Pomo timer box (160px) */}
        <div style={{ width: 160, border: '1px solid rgba(239,68,68,0.12)', background: '#0d0d0d', padding: '16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <SkelBar w={70} h={9} />
          <SkelBar w={80} h={30} />
          <div style={{ display: 'flex', gap: 4 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width: 6, height: 6, background: 'rgba(239,68,68,0.08)' }} />)}
          </div>
        </div>

        {/* Node list box (flex: 1) */}
        <div style={{ flex: 1, minWidth: 260, maxWidth: 560, border: '1px solid rgba(255,255,255,0.07)', background: '#0d0d0d', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <SkelBar w={60} h={9} />
          {['78%','55%','88%','62%','70%'].map((w, i) => <SkelBar key={i} w={w} h={13} />)}
        </div>

        {/* Activity box (260px) */}
        <div style={{ width: 260, border: '1px solid rgba(255,255,255,0.07)', background: '#0d0d0d', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <SkelBar w={55} h={9} />
          {['65%','80%','50%','72%'].map((w, i) => <SkelBar key={i} w={w} h={13} />)}
        </div>

      </div>
    </div>
  );
}

// ── Active session stage ──────────────────────────────────────────────────────

function ActiveStage({
  activeSession, activeSessionNodes, activePauses,
}: {
  activeSession: WorkSession;
  activeSessionNodes: SessionNodeWithNode[];
  activePauses: SessionPause[];
}) {
  const { pauseManual, resume, endClean, endAt } = useSessionStore();
  const [tick, setTick] = useState(0);
  const [endMode, setEndMode] = useState(false);
  const [customEndTime, setCustomEndTime] = useState('');

  const openEndMode = () => {
    const now = new Date();
    setCustomEndTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
    setEndMode(true);
  };

  const confirmEndAt = async () => {
    const [hh, mm] = customEndTime.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) return;
    const candidate = new Date();
    candidate.setHours(hh, mm, 0, 0);
    if (candidate.getTime() > Date.now()) candidate.setDate(candidate.getDate() - 1);
    await endAt(candidate.toISOString());
    setEndMode(false);
  };
  const [pomoBlocks, setPomoBlocks] = useState<SessionPomoBlock[]>([]);
  const [pomoReload, setPomoReload] = useState(0);

  const isActive = activeSession.status === 'active';
  const isPaused = activeSession.status === 'paused';

  const reloadPomoBlocks = useCallback(() => setPomoReload(n => n + 1), []);

  useEffect(() => {
    loadSessionPomoBlocks(activeSession.id).then(async blocks => {
      const openBlock = [...blocks].reverse().find(b => !b.ended_at);
      if (openBlock) {
        const elapsed = (Date.now() - new Date(openBlock.started_at).getTime()) / 1000;
        if (elapsed > 30 * 60) {
          await endOpenPomoWorkBlock(activeSession.id);
          const fresh = await loadSessionPomoBlocks(activeSession.id);
          setPomoBlocks(fresh);
          return;
        }
      }
      setPomoBlocks(blocks);
    }).catch(() => {});
  }, [activeSession.id, activePauses.length, pomoReload]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  // Session elapsed
  const sessionElapsed = useMemo(() => {
    if (!activeSession.actual_start) return 0;
    const startMs = new Date(activeSession.actual_start).getTime();
    const pauseMs = activePauses.reduce((sum, p) => {
      if (!p.resumed_at) return sum;
      return sum + (new Date(p.resumed_at).getTime() - new Date(p.paused_at).getTime());
    }, 0);
    const cap = activePauses.find(p => !p.resumed_at);
    const now = cap ? new Date(cap.paused_at).getTime() : Date.now();
    return Math.floor((now - startMs - pauseMs) / 1000);
  }, [tick, activeSession, activePauses]);

  const currentPomoBlock = [...pomoBlocks].reverse().find(b => !b.ended_at) ?? null;

  const pomoBlockElapsed = useMemo(() => {
    if (!currentPomoBlock) return null;
    const blockStart = new Date(currentPomoBlock.started_at).getTime();
    const pauseMs = activePauses.reduce((sum, p) => {
      if (!p.resumed_at) return sum;
      const pStart = Math.max(new Date(p.paused_at).getTime(), blockStart);
      if (pStart >= new Date(p.resumed_at).getTime()) return sum;
      return sum + (new Date(p.resumed_at).getTime() - pStart);
    }, 0);
    const currentPause = activePauses.find(p => !p.resumed_at);
    const cap = currentPause ? new Date(currentPause.paused_at).getTime() : Date.now();
    return Math.max(0, Math.floor((cap - blockStart - pauseMs) / 1000));
  }, [tick, currentPomoBlock, activePauses]);

  const pomoWorkDone = pomoBlocks.filter(b => b.block_type === 'work' && b.ended_at).length;

  // Activity log: manual pauses + pomo blocks, sorted by time
  const activityItems = useMemo(() => {
    const now = Date.now();
    type Item = { time: string; label: string; durMs: number; ongoing: boolean; color: string };
    const items: Item[] = [];
    for (const p of activePauses) {
      if (p.pause_type !== 'manual') continue;
      const durMs = p.resumed_at
        ? new Date(p.resumed_at).getTime() - new Date(p.paused_at).getTime()
        : now - new Date(p.paused_at).getTime();
      items.push({ time: p.paused_at, label: '⏸ pause', durMs, ongoing: !p.resumed_at, color: '#60a5fa' });
    }
    for (const b of pomoBlocks) {
      const durMs = b.ended_at
        ? new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()
        : now - new Date(b.started_at).getTime();
      const label = b.block_type === 'work' ? '● work' : b.block_type === 'short_break' ? '◐ break' : '◑ long brk';
      items.push({ time: b.started_at, label, durMs, ongoing: !b.ended_at, color: b.block_type === 'work' ? ACC : '#60a5fa' });
    }
    return items.sort((a, b) => a.time.localeCompare(b.time));
  }, [activePauses, pomoBlocks, tick]);

  const inProgress = activeSessionNodes.filter(n => n.status === 'in_progress');
  const queued     = activeSessionNodes.filter(n => n.status === 'queued');
  const done       = activeSessionNodes.filter(n => n.status === 'done' || n.status === 'incomplete');
  const statusColor = isPaused ? '#60a5fa' : ACC;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 24px', justifyContent: 'center' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexShrink: 0 }}>
        <span style={{ fontFamily: VT, fontSize: '1.15rem', letterSpacing: 4, color: statusColor, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          {isPaused ? '⏸ paused' : <><span className={isActive ? 'otc-live-blink' : ''}>●</span> active</>}
        </span>
        {activeSession.location_name && (
          <span style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.22)', padding: '1px 12px' }}>
            @{activeSession.location_name}
          </span>
        )}
        <span style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
          {activeSession.title}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>

        {/* Left: timers + node list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Timers + node list box */}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignSelf: 'center', alignItems: 'stretch' }}>
            <div style={{ width: 220, border: '1px solid rgba(255,255,255,0.35)', background: '#111', padding: '16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <div style={{ fontFamily: VT, fontSize: '0.78rem', letterSpacing: 3, color: 'rgba(255,255,255,0.6)', marginBottom: -4 }}>CURRENT SESSION</div>
              <div style={{ fontFamily: VT, fontSize: '1.85rem', letterSpacing: 3, color: isPaused ? '#60a5fa' : '#fff', lineHeight: 1 }}>
                {fmtTimer(sessionElapsed)}
              </div>
              {endMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <div style={{ fontFamily: VT, fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)' }}>SET END TIME</div>
                  <input
                    type="time"
                    value={customEndTime}
                    onChange={e => setCustomEndTime(e.target.value)}
                    style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 2, background: '#0d0d0d', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', padding: '3px 10px', outline: 'none', width: 100, textAlign: 'center' }}
                  />
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      onClick={confirmEndAt}
                      style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', padding: '2px 12px', cursor: 'pointer' }}
                    >✓ confirm</button>
                    <button
                      onClick={() => setEndMode(false)}
                      style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)', padding: '2px 10px', cursor: 'pointer' }}
                    >✗</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                  {isPaused ? (
                    <button
                      onClick={() => { const p = activePauses.find(x => !x.resumed_at); if (p) resume(p.id); }}
                      style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.35)', color: '#60a5fa', padding: '3px 14px', cursor: 'pointer' }}
                    >▶ resume</button>
                  ) : (
                    <button
                      onClick={pauseManual}
                      style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', padding: '3px 14px', cursor: 'pointer' }}
                    >⏸ pause</button>
                  )}
                  <button
                    onClick={openEndMode}
                    style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.28)', color: '#f87171', padding: '3px 14px', cursor: 'pointer' }}
                  >■ end</button>
                </div>
              )}
            </div>
            <div style={{ width: 160, border: `1px solid ${POMO}99`, background: '#111', padding: '16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontFamily: VT, fontSize: '0.78rem', letterSpacing: 3, color: POMO, marginBottom: -4 }}>
                {currentPomoBlock?.block_type === 'short_break' ? 'BREAK' : currentPomoBlock?.block_type === 'long_break' ? 'LONG BRK' : 'POMODORO'}
              </div>
              <div style={{ fontFamily: VT, fontSize: '1.85rem', letterSpacing: 3, color: pomoBlockElapsed !== null ? POMO : `${POMO}44`, lineHeight: 1 }}>
                {pomoBlockElapsed !== null ? fmtTimer(pomoBlockElapsed) : '--:--'}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ width: 6, height: 6, background: i < Math.min(pomoWorkDone, 4) ? POMO : 'rgba(255,255,255,0.1)' }} />
                ))}
              </div>
              {isActive && !isPaused && (
                <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
                  {pomoBlockElapsed !== null ? (
                    <button
                      onClick={async () => { await endOpenPomoWorkBlock(activeSession.id); reloadPomoBlocks(); }}
                      style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, background: `${POMO}15`, border: `1px solid ${POMO}55`, color: POMO, padding: '3px 14px', cursor: 'pointer' }}
                    >■ stop</button>
                  ) : (
                    <button
                      onClick={async () => { await startPomoBlock(activeSession.id, 'work'); reloadPomoBlocks(); }}
                      style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${POMO}55`, color: `${POMO}cc`, padding: '3px 14px', cursor: 'pointer' }}
                    >▶ start</button>
                  )}
                </div>
              )}
            </div>

            {/* Node list box */}
            <div style={{ border: '1px solid rgba(255,255,255,0.2)', background: '#111', padding: '12px 14px', display: 'flex', flexDirection: 'column', minWidth: 420, maxWidth: 560, overflow: 'hidden', flex: 1 }}>
              <div style={{ fontFamily: VT, fontSize: '0.62rem', letterSpacing: 2, color: 'rgba(255,255,255,0.25)', marginBottom: 8, textTransform: 'uppercase', flexShrink: 0 }}>nodes</div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[...inProgress, ...queued, ...done].map(n => {
                  const nc = n.status === 'done' ? '#4ade80' : n.status === 'incomplete' ? '#f87171' : n.status === 'in_progress' ? ACC : 'rgba(255,255,255,0.28)';
                  const mins = n.total_minutes != null ? (n.total_minutes < 1 ? '<1m' : `${Math.round(n.total_minutes)}m`) : null;
                  return (
                    <div key={n.node_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, background: nc, flexShrink: 0 }} />
                      <span style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5, color: n.status === 'done' ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.72)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: n.status === 'done' ? 'line-through' : 'none' }}>
                        {n.title}
                      </span>
                      {mins && <span style={{ fontFamily: VT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>{mins}</span>}
                    </div>
                  );
                })}
                {activeSessionNodes.length === 0 && (
                  <div style={{ fontFamily: VT, fontSize: '0.82rem', color: 'rgba(255,255,255,0.14)', letterSpacing: 1 }}>no nodes</div>
                )}
              </div>
            </div>


            {/* Activity box */}
            <div style={{ border: '1px solid rgba(255,255,255,0.2)', background: '#111', padding: '12px 14px', display: 'flex', flexDirection: 'column', width: 260, flexShrink: 0, overflow: 'hidden' }}>
              <div style={{ fontFamily: VT, fontSize: '0.62rem', letterSpacing: 2, color: 'rgba(255,255,255,0.25)', marginBottom: 8, textTransform: 'uppercase', flexShrink: 0 }}>activity</div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {activityItems.length === 0 && (
                  <div style={{ fontFamily: VT, fontSize: '0.8rem', color: 'rgba(255,255,255,0.1)', letterSpacing: 1 }}>—</div>
                )}
                {activityItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, color: item.ongoing ? item.color : 'rgba(255,255,255,0.38)' }}>
                      {item.label}{item.ongoing ? ' ···' : ''}
                    </span>
                    <span style={{ fontFamily: VT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                      {fmtMs(item.durMs)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Session log entry ─────────────────────────────────────────────────────────

function SessionLogEntry({ session, onDelete }: { session: WorkSession; onDelete: () => void }) {
  const [nodes, setNodes] = useState<SessionNodeWithNode[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);
  const [endTimeInput, setEndTimeInput] = useState('');

  useEffect(() => {
    loadSessionNodes(session.id).then(setNodes).catch(() => {});
  }, [session.id]);

  const color = STATUS_COLOR[session.status] ?? 'rgba(255,255,255,0.35)';
  const duration = fmtDuration(session.actual_start, session.actual_end);
  const doneCount = nodes.filter(n => n.status === 'done').length;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    deleteSession(session.id).then(onDelete).catch(() => {});
  };

  const openEditEnd = () => {
    const t = session.actual_end ? new Date(session.actual_end) : new Date();
    setEndTimeInput(`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`);
    setEditingEnd(true);
  };

  const confirmEditEnd = async () => {
    const [hh, mm] = endTimeInput.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) return;
    const base = new Date(session.planned_date + 'T00:00:00');
    base.setHours(hh, mm, 0, 0);
    if (session.actual_start && base.getTime() < new Date(session.actual_start).getTime()) {
      base.setDate(base.getDate() + 1);
    }
    await updateSessionEndTime(session.id, base.toISOString());
    setEditingEnd(false);
    onDelete();
  };

  const statusLabel = session.status === 'completed' ? 'COMPLETED' : session.status === 'interrupted' ? 'INTERRUPTED' : session.status === 'planned' ? 'PLANNED' : session.status.toUpperCase();

  return (
    <div style={{ marginBottom: 18, fontFamily: VT }}>
      {/* $ prompt line */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, marginBottom: 2 }}>
        <span style={{ color: '#fff', fontSize: '0.95rem', letterSpacing: 1, marginRight: 6, flexShrink: 0 }}>$</span>
        <span style={{ color, fontSize: '0.95rem', letterSpacing: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>{session.title}</span>
        <span style={{ flex: 1, borderBottom: '1px dashed rgba(255,255,255,0.3)', margin: '0 8px', position: 'relative', top: '-3px' }} />
        <span style={{ color, fontSize: '0.85rem', letterSpacing: 2, flexShrink: 0 }}>{statusLabel}</span>
      </div>

      {/* Meta line */}
      <div style={{ paddingLeft: 16, display: 'flex', alignItems: 'baseline', gap: 0, flexWrap: 'wrap' }}>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', letterSpacing: 1 }}>time</span>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', letterSpacing: 0.5, marginLeft: 8 }}>
          {session.actual_start ? (
            <>
              {fmtTime(session.actual_start)} {' → '}
              {editingEnd ? (
                <>
                  <input
                    type="time"
                    value={endTimeInput}
                    onChange={e => setEndTimeInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmEditEnd(); if (e.key === 'Escape') setEditingEnd(false); }}
                    autoFocus
                    style={{ fontFamily: VT, fontSize: '0.85rem', background: '#0d0d0d', border: '1px solid rgba(245,158,11,0.4)', color: ACC, padding: '0 4px', outline: 'none', width: 76, letterSpacing: 1 }}
                  />
                  {' '}
                  <span
                    onClick={confirmEditEnd}
                    style={{ color: ACC, cursor: 'pointer', fontSize: '0.82rem' }}
                    title="confirm"
                  >✓</span>
                  {' '}
                  <span
                    onClick={() => setEditingEnd(false)}
                    style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.82rem' }}
                    title="cancel"
                  >✗</span>
                </>
              ) : (
                <span
                  onClick={openEditEnd}
                  title="edit end time"
                  style={{ cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.2)', paddingBottom: 1 }}
                  onMouseEnter={e => { e.currentTarget.style.color = ACC; e.currentTarget.style.borderBottomColor = `${ACC}88`; }}
                  onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.2)'; }}
                >{fmtTime(session.actual_end)}</span>
              )}
              {duration && !editingEnd && <span style={{ color: 'rgba(255,255,255,0.35)' }}>  ({duration})</span>}
            </>
          ) : 'not started'}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.85rem', margin: '0 10px' }}>·</span>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', letterSpacing: 1 }}>where</span>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', letterSpacing: 0.5, marginLeft: 8 }}>
          {session.location_name ? `@ ${session.location_name}` : '—'} · {fmtDate(session.planned_date)}
        </span>
        <span style={{ flex: 1 }} />
        {nodes.length > 0 && (
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', letterSpacing: 1, flexShrink: 0 }}>{doneCount} / {nodes.length} done</span>
        )}
      </div>

      {/* Nodes */}
      <div style={{ paddingLeft: 16, marginTop: 6 }}>
{nodes.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.85rem', letterSpacing: 1 }}>no nodes</div>
          ) : (
            <>
              {nodes.map(n => {
                const done = n.status === 'done';
                const mins = n.total_minutes != null ? (n.total_minutes < 1 ? '<1m' : `${Math.round(n.total_minutes)}m`) : '—';
                const sym = done ? '✓' : n.status === 'incomplete' ? '✗' : '○';
                const symColor = done ? '#4ade80' : n.status === 'incomplete' ? '#f87171' : 'rgba(255,255,255,0.3)';
                return (
                  <div key={n.node_id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ color: symColor, fontSize: '0.85rem', flexShrink: 0, width: 12 }}>{sym}</span>
                    <span style={{ color: done ? `${n.arc_color}66` : n.arc_color, fontSize: '0.88rem', letterSpacing: 0.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.78rem', flexShrink: 0 }}>{mins}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

      {/* Delete */}
      <div style={{ paddingLeft: 16, marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.78rem' }}>{'─'.repeat(4)}</span>
        <button
          onClick={handleDelete}
          onMouseLeave={() => setConfirming(false)}
          style={{
            fontFamily: VT, fontSize: '0.78rem', letterSpacing: 1,
            background: 'none', border: 'none',
            color: confirming ? '#f87171' : 'rgba(255,255,255,0.18)',
            cursor: 'pointer', padding: 0, transition: 'color 0.1s',
          }}
          onMouseEnter={e => { if (!confirming) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >{confirming ? 'confirm? [y]' : 'rm session'}</button>
      </div>
    </div>
  );
}

// ── Location editor popup ─────────────────────────────────────────────────────

function LocationEditorPopup({ onClose }: { onClose: () => void }) {
  const { locations, addLocation, removeLocation } = useSessionStore();
  const [newName, setNewName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await addLocation(name);
    setNewName('');
  };

  const handleDelete = async (id: string) => {
    if (confirmId === id) {
      await removeLocation(id);
      setConfirmId(null);
    } else {
      setConfirmId(id);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.2)', width: 340, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 3, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>edit location list</span>
          <button onClick={onClose} style={{ fontFamily: VT, fontSize: '1.1rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }} onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>×</button>
        </div>

        {/* Location list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 16px', maxHeight: 260, overflowY: 'auto' }}>
          {locations.length === 0 && (
            <div style={{ fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.2)', letterSpacing: 2 }}>no locations yet</div>
          )}
          {locations.map(loc => (
            <div key={loc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 1, color: 'rgba(255,255,255,0.7)' }}>{loc.name}</span>
              <button
                onClick={() => handleDelete(loc.id)}
                style={{ fontFamily: VT, fontSize: '0.8rem', letterSpacing: 1, background: confirmId === loc.id ? 'rgba(248,113,113,0.15)' : 'none', border: `1px solid ${confirmId === loc.id ? '#f87171' : 'rgba(255,255,255,0.1)'}`, color: confirmId === loc.id ? '#f87171' : 'rgba(255,255,255,0.25)', padding: '2px 8px', cursor: 'pointer', transition: 'all 0.1s' }}
                onMouseEnter={e => { if (confirmId !== loc.id) e.currentTarget.style.color = '#f87171'; }}
                onMouseLeave={e => { if (confirmId !== loc.id) e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
              >
                {confirmId === loc.id ? 'confirm?' : 'delete'}
              </button>
            </div>
          ))}
        </div>

        {/* Add new */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="new location name..."
            style={{ flex: 1, fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1, background: 'transparent', border: `1px solid rgba(255,255,255,0.15)`, color: '#fff', padding: '5px 10px', outline: 'none' }}
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, background: newName.trim() ? `${ACC}22` : 'none', border: `1px solid ${newName.trim() ? ACC : 'rgba(255,255,255,0.1)'}`, color: newName.trim() ? ACC : 'rgba(255,255,255,0.2)', padding: '5px 14px', cursor: newName.trim() ? 'pointer' : 'default', transition: 'all 0.1s' }}
          >add</button>
        </div>
      </div>
    </div>
  );
}

// ── Session builder ───────────────────────────────────────────────────────────

function SessionBuilder() {
  const { locations, activeSession, createPlanned, load } = useSessionStore();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [calOpen, setCalOpen] = useState(false);
  const [editingLocations, setEditingLocations] = useState(false);
  const date = `${selectedDay.getFullYear()}-${String(selectedDay.getMonth()+1).padStart(2,'0')}-${String(selectedDay.getDate()).padStart(2,'0')}`;
  const [browsableNodes, setBrowsableNodes] = useState<BrowsableNode[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadBrowsableNodes().then(setBrowsableNodes).catch(() => {}); }, [date]);

  const filteredNodes = browsableNodes.filter(n =>
    n.planned_date === date && n.node_type !== 'event' && !n.is_routine
  );
  const grouped = filteredNodes.reduce<Record<string, BrowsableNode[]>>((acc, n) => {
    const day = n.planned_date ?? 'unscheduled';
    if (!acc[day]) acc[day] = [];
    acc[day].push(n);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort();

  const toggleNode = (id: string) => setSelectedNodeIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const handleSave = async () => {
    if (!selectedLocationId) return;
    setSaving(true);
    await createPlanned(selectedLocationId, date, [...selectedNodeIds]);
    setSelectedNodeIds(new Set()); setSaving(false); await load();
  };

  const canSave = !!selectedLocationId && !activeSession;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      {editingLocations && <LocationEditorPopup onClose={() => setEditingLocations(false)} />}

      {/* Locations */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 3, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>location</div>
          <button onClick={() => setEditingLocations(true)} style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 2, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.25)', padding: '2px 8px', cursor: 'pointer', textTransform: 'uppercase' }} onMouseEnter={e => { e.currentTarget.style.color = ACC; e.currentTarget.style.borderColor = `${ACC}55`; }} onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>edit list</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 12 }}>
          {locations.map(loc => (
            <button key={loc.id} onClick={() => setSelectedLocationId(loc.id === selectedLocationId ? null : loc.id)} style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1, background: selectedLocationId === loc.id ? `${ACC}22` : 'none', border: `1px solid ${selectedLocationId === loc.id ? ACC : 'rgba(255,255,255,0.15)'}`, color: selectedLocationId === loc.id ? ACC : 'rgba(255,255,255,0.5)', padding: '3px 10px', cursor: 'pointer', transition: 'all 0.1s' }}>{loc.name}</button>
          ))}
          {locations.length === 0 && (
            <span style={{ fontFamily: VT, fontSize: '0.8rem', color: 'rgba(255,255,255,0.18)', letterSpacing: 1 }}>no locations — use edit list to add</span>
          )}
        </div>
      </div>

      {/* Date */}
      <div>
        <div style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 3, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>date</div>
        <div style={{ paddingLeft: 12 }}><Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '4px 14px', cursor: 'pointer', textAlign: 'left' }}>
              {selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.15)', zIndex: 9999 }}>
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={(day) => { if (day) { setSelectedDay(day); setCalOpen(false); } }}
              disabled={{ before: (() => { const t = new Date(); t.setHours(0,0,0,0); return t; })() }}
              initialFocus
            />
          </PopoverContent>
        </Popover></div>
      </div>

      {/* Node browser */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: VT, fontSize: '0.95rem', letterSpacing: 3, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 8, flexShrink: 0 }}>nodes — {selectedNodeIds.size} selected</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 12 }}>
          {filteredNodes.length === 0 ? (
            <div style={{ fontFamily: VT, fontSize: '0.82rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 1 }}>no tasks planned for this date</div>
          ) : filteredNodes.map(n => {
            const sel = selectedNodeIds.has(n.id);
            return (
              <div key={n.id} onClick={() => toggleNode(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', cursor: 'pointer', background: sel ? 'rgba(245,158,11,0.08)' : 'none', border: `1px solid ${sel ? `${ACC}44` : 'transparent'}`, transition: 'all 0.1s' }}>
                <span style={{ width: 6, height: 6, background: n.arc_color, flexShrink: 0 }} />
                <span style={{ fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5, color: sel ? '#fff' : 'rgba(255,255,255,0.5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                {sel && <span style={{ fontFamily: VT, fontSize: '0.75rem', color: ACC, flexShrink: 0 }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={handleSave} disabled={!canSave || saving} style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 2, background: canSave ? `${ACC}22` : 'none', border: `1px solid ${canSave ? ACC : 'rgba(255,255,255,0.1)'}`, color: canSave ? ACC : 'rgba(255,255,255,0.2)', padding: '6px 0', cursor: canSave ? 'pointer' : 'default', transition: 'all 0.15s', width: '100%' }}>
        {saving ? 'saving...' : activeSession ? 'end session to plan' : 'plan session'}
      </button>
    </div>
  );
}

// ── Analytics panel ───────────────────────────────────────────────────────────

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const weekRange = (): { from: string; to: string } => {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { from: fmt(mon), to: fmt(sun) };
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', alignItems: 'center', textAlign: 'center' }}>
      <span style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: 2, color: '#fff', lineHeight: 1 }}>{value}</span>
    </div>
  );
}

const TEAL = '#00c4a7';

// ── Work sparkline ────────────────────────────────────────────────────────────

function WorkSparkline({ sessions, activeSession }: { sessions: WorkSession[]; activeSession: WorkSession | null }) {
  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayDs = todayStr();
    const days: { ds: string; label: string; hours: number; isToday: boolean }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const isToday = ds === todayDs;
      const label = (i % 7 === 0 || isToday)
        ? isToday ? 'today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';
      days.push({ ds, label, hours: 0, isToday });
    }
    for (const s of sessions) {
      if (!s.actual_start || !s.planned_date) continue;
      const idx = days.findIndex(d => d.ds === s.planned_date);
      if (idx === -1) continue;
      const start = new Date(s.actual_start).getTime();
      const end = s.actual_end ? new Date(s.actual_end).getTime() : s.id === activeSession?.id ? Date.now() : start;
      days[idx].hours += Math.max(0, end - start) / 3600000;
    }
    return days;
  }, [sessions, activeSession?.id]);

  return (
    <div>
      <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6 }}>14-day pulse</div>
      <ChartContainer config={{ hours: { label: 'Hours', color: TEAL } }} style={{ width: '100%', height: 120 }}>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={(props: { x: number; y: number; payload: { value: string }; index: number }) => {
              const { x, y, payload, index } = props;
              if (!payload.value) return <g />;
              const isToday = data[index]?.isToday;
              return (
                <g transform={`translate(${x},${y})`}>
                  <text x={0} y={12} textAnchor="middle" fill={isToday ? ACC : 'rgba(255,255,255,0.25)'} fontSize={10} fontFamily={VT}>
                    {payload.value}
                  </text>
                </g>
              );
            }}
          />
          <YAxis hide domain={[0, 'auto']} />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const pt = payload[0].payload as { ds: string; hours: number };
              const h = Math.floor(pt.hours), m = Math.round((pt.hours - h) * 60);
              return (
                <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 10px', fontFamily: VT, fontSize: '0.88rem', color: '#fff' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>{pt.ds}</span>
                  {' · '}
                  <span style={{ color: TEAL }}>{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>
                </div>
              );
            }}
          />
          <Bar dataKey="hours" fill={TEAL} opacity={0.18} radius={[2, 2, 0, 0]} />
          <Line
            type="monotone"
            dataKey="hours"
            stroke={TEAL}
            strokeWidth={2}
            dot={(props: { cx: number; cy: number; index: number }) => {
              const { cx, cy, index } = props;
              const pt = data[index];
              if (!pt) return <g />;
              return (
                <Dot
                  key={index}
                  cx={cx} cy={cy}
                  r={pt.isToday ? 5 : 3}
                  fill={pt.isToday ? ACC : TEAL}
                  stroke={pt.isToday ? '#000' : 'none'}
                  strokeWidth={pt.isToday ? 1.5 : 0}
                />
              );
            }}
            activeDot={{ r: 5, fill: ACC, stroke: '#000', strokeWidth: 1.5 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

// ── Location rank ─────────────────────────────────────────────────────────────

function LocationRank({ sessions }: { sessions: WorkSession[] }) {
  const ranked = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s.actual_start) continue;
      const name = s.location_name ?? 'unknown';
      const ms = Math.max(0,
        (s.actual_end ? new Date(s.actual_end).getTime() : new Date(s.actual_start).getTime())
        - new Date(s.actual_start).getTime()
      );
      map.set(name, (map.get(name) ?? 0) + ms);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, ms]) => ({ name, hours: ms / 3600000 }));
  }, [sessions]);

  if (!ranked.length) return null;
  const maxH = ranked[0].hours;

  const fmtH = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return hh > 0 ? `${hh}h${mm > 0 ? ` ${mm}m` : ''}` : `${mm}m`;
  };

  return (
    <div>
      <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10 }}>by location</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ranked.map((loc, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, color: 'rgba(255,255,255,0.6)' }}>{loc.name}</span>
              <span style={{ fontFamily: VT, fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>{fmtH(loc.hours)}</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, right: `${(1 - loc.hours / maxH) * 100}%`, background: i === 0 ? ACC : TEAL, opacity: 0.7 + i * -0.1 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Analytics panel ── (stat chips + charts) ──────────────────────────────────

function AnalyticsPanel({ sessions, activeSession }: { sessions: WorkSession[]; activeSession: WorkSession | null }) {
  const [tasksDoneToday, setTasksDoneToday] = useState(0);
  const [tick, setTick] = useState(0);

  // Live tick for active session time
  useEffect(() => {
    if (!activeSession?.actual_start) return;
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, [activeSession?.actual_start]);

  // Load done tasks for today's sessions
  useEffect(() => {
    const today = todayStr();
    const todaySessions = sessions.filter(s => s.planned_date === today);
    if (!todaySessions.length) { setTasksDoneToday(0); return; }
    Promise.all(todaySessions.map(s => loadSessionNodes(s.id)))
      .then(results => {
        const done = results.flat().filter(n => n.status === 'done').length;
        setTasksDoneToday(done);
      })
      .catch(() => {});
  }, [sessions]);

  // Time today (ms)
  const timeToday = useMemo(() => {
    const today = todayStr();
    return sessions
      .filter(s => s.planned_date === today)
      .reduce((sum, s) => {
        if (!s.actual_start) return sum;
        const start = new Date(s.actual_start).getTime();
        const end = s.actual_end ? new Date(s.actual_end).getTime() : (s.id === activeSession?.id ? Date.now() : start);
        return sum + Math.max(0, end - start);
      }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, activeSession?.id, tick]);

  // Sessions this week
  const sessionsThisWeek = useMemo(() => {
    const { from, to } = weekRange();
    return sessions.filter(s => s.planned_date >= from && s.planned_date <= to).length;
  }, [sessions]);

  const fmtMs = (ms: number) => {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
    return `${m}m`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <StatChip label="time today" value={timeToday > 0 ? fmtMs(timeToday) : '—'} />
        <StatChip label="sessions this week" value={String(sessionsThisWeek)} />
        <StatChip label="tasks done today" value={String(tasksDoneToday)} />
      </div>
      <WorkSparkline sessions={sessions} activeSession={activeSession} />
      <LocationRank sessions={sessions} />
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function OnTheClockView() {
  const store = useSessionStore();
  const { activeSession, activeSessionNodes, activePauses } = store;
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    const all = await loadAllSessions();
    setSessions(all);
    setLoadingSessions(false);
  }, []);

  useEffect(() => { store.load(); fetchSessions(); }, [store.load, fetchSessions]);
  useEffect(() => { fetchSessions(); }, [activeSession?.id, activeSession?.status, fetchSessions]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

      {/* ── Central stage ── */}
      <div style={{
        height: 280, flexShrink: 0,
        background: activeSession ? 'rgba(255,255,255,0.015)' : 'transparent',
      }}>
        {activeSession
          ? <ActiveStage activeSession={activeSession} activeSessionNodes={activeSessionNodes} activePauses={activePauses} />
          : <Skeleton />
        }
      </div>

      {/* ── Bottom two columns ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Session planner */}
        <div style={{ width: 400, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: VT, fontSize: '1.1rem', letterSpacing: 3, color: '#fff', textTransform: 'uppercase', marginBottom: 16 }}><Feather style={{ width: 18, height: 18, flexShrink: 0 }} />Plan New Session</div>
          <SessionBuilder />
        </div>

        {/* Session log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ padding: '20px 24px 14px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: VT, fontSize: '1.1rem', letterSpacing: 3, color: '#fff', textTransform: 'uppercase' }}><Computer style={{ width: 18, height: 18, flexShrink: 0 }} />session log</div>
          </div>
          <div className="otc-session-log" style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px' }}>
            {loadingSessions ? (
              <div style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.1)', letterSpacing: 2 }}>loading...</div>
            ) : sessions.length === 0 ? (
              <div style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.1)', letterSpacing: 2 }}>no sessions yet</div>
            ) : (
              sessions.map(s => <SessionLogEntry key={s.id} session={s} onDelete={fetchSessions} />)
            )}
          </div>
        </div>

        {/* Analytics */}
        <div style={{ width: 400, flexShrink: 0, overflow: 'hidden', padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: VT, fontSize: '1.1rem', letterSpacing: 3, color: '#fff', textTransform: 'uppercase', marginBottom: 14 }}>
            <BracesContent style={{ width: 18, height: 18, flexShrink: 0 }} />analytics
          </div>
          <AnalyticsPanel sessions={sessions} activeSession={activeSession} />
        </div>
      </div>
    </div>
  );
}
