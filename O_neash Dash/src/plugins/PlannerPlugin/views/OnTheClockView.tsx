import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import '../PlannerPlugin.css';
import { useSessionStore } from '../store/useSessionStore';
import { Feather } from 'pixelarticons/react/Feather';
import { Computer } from 'pixelarticons/react/Computer';
import { BracesContent } from 'pixelarticons/react/BracesContent';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ReferenceLine, Label } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { loadAllSessions, loadAllTimedSessions, loadSessionNodes, deleteSession, updateSessionEndTime } from '../lib/onTheClockDb';
import type { WorkSession, SessionNodeWithNode, SessionPause } from '../lib/onTheClockDb';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#f59e0b';

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

// ── Session status bar ────────────────────────────────────────────────────────
// Slim control strip — full detail (node list, activity log) already lives in
// the Today page's IN SESSION panel, so this only surfaces what's actionable here.

function SessionStatusBar({
  activeSession, activePauses,
}: {
  activeSession: WorkSession;
  activePauses: SessionPause[];
}) {
  const { pauseManual, resume, endAt } = useSessionStore();
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
  const isActive = activeSession.status === 'active';
  const isPaused = activeSession.status === 'paused';

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

  const SESSION_YELLOW = '#f5c842';
  const PAUSE_BLUE = '#0055FF';
  const statusColor = isPaused ? PAUSE_BLUE : '#000';

  return (
    <div style={{
      flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 16,
      margin: '16px 20px 0',
      padding: '6px 24px',
      background: SESSION_YELLOW,
    }}>
      <span style={{ fontFamily: VT, fontSize: '1.5rem', letterSpacing: 3, color: statusColor, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {isPaused ? '⏸ paused' : <><span className={isActive ? 'otc-live-blink' : ''}>●</span> active</>}
      </span>

      {activeSession.location_name && (
        <span style={{ fontFamily: VT, fontSize: '1.4rem', letterSpacing: 1, color: PAUSE_BLUE, flexShrink: 0 }}>
          @{activeSession.location_name}
        </span>
      )}

      <span style={{ fontFamily: VT, fontSize: '1.4rem', letterSpacing: 1, color: 'rgba(0,0,0,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
        {activeSession.title}
      </span>

      <span style={{ fontFamily: VT, fontSize: '1.7rem', letterSpacing: 2, color: isPaused ? PAUSE_BLUE : '#000', flexShrink: 0 }}>
        {fmtTimer(sessionElapsed)}
      </span>

      {endMode ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <input
            type="time"
            value={customEndTime}
            onChange={e => setCustomEndTime(e.target.value)}
            style={{ fontFamily: VT, fontSize: '1.05rem', letterSpacing: 1, background: '#0d0d0d', border: '1px solid rgba(0,0,0,0.35)', color: '#f87171', padding: '3px 8px', outline: 'none', width: 100 }}
          />
          <button
            onClick={confirmEndAt}
            style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 1, background: 'rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.4)', color: '#c0392b', padding: '3px 12px', cursor: 'pointer' }}
          >✓</button>
          <button
            onClick={() => setEndMode(false)}
            style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 1, background: 'none', border: '1px solid rgba(0,0,0,0.25)', color: 'rgba(0,0,0,0.5)', padding: '3px 10px', cursor: 'pointer' }}
          >✗</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {isPaused ? (
            <button
              onClick={() => { const p = activePauses.find(x => !x.resumed_at); if (p) resume(p.id); }}
              style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 1, background: 'rgba(0,85,255,0.1)', border: '1px solid rgba(0,85,255,0.4)', color: PAUSE_BLUE, padding: '4px 14px', cursor: 'pointer' }}
            >▶ resume</button>
          ) : (
            <button
              onClick={pauseManual}
              style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 1, background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.3)', color: 'rgba(0,0,0,0.6)', padding: '4px 14px', cursor: 'pointer' }}
            >⏸ pause</button>
          )}
          <button
            onClick={openEndMode}
            style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 1, background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(192,57,43,0.5)', color: '#c0392b', padding: '4px 14px', cursor: 'pointer' }}
          >■ end</button>
        </div>
      )}
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
    <div style={{ marginBottom: 2, fontFamily: VT }}>
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
      <div style={{ paddingLeft: 16, marginTop: 3 }}>
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
                  <div key={n.node_id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 1 }}>
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
      <div style={{ paddingLeft: 16, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
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

function SessionBuilder({ onEditLocations }: { onEditLocations: () => void }) {
  const { locations, startUnplanned } = useSessionStore();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (!selectedLocationId) return;
    setStarting(true);
    await startUnplanned(selectedLocationId);
    setSelectedLocationId(null);
    setStarting(false);
  };

  const canStart = !!selectedLocationId;
  const selectedLocation = locations.find(loc => loc.id === selectedLocationId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Locations */}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {locations.map((loc, i) => {
            const selected = loc.id === selectedLocationId;
            return (
              <span key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.9rem' }}>·</span>}
                <button
                  onClick={() => setSelectedLocationId(selected ? null : loc.id)}
                  style={{ fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1, background: 'none', border: 'none', color: selected ? ACC : 'rgba(255,255,255,0.5)', padding: 0, cursor: 'pointer', transition: 'color 0.1s' }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                >{loc.name}</button>
              </span>
            );
          })}
          {locations.length === 0 && (
            <button
              onClick={onEditLocations}
              style={{ fontFamily: VT, fontSize: '0.8rem', letterSpacing: 1, background: 'none', border: 'none', color: 'rgba(255,255,255,0.22)', cursor: 'pointer', padding: 0, transition: 'color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.color = ACC)}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.22)')}
            >no locations — edit list to add</button>
          )}
        </div>
      </div>

      <button onClick={handleStart} disabled={!canStart || starting} style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 2, background: canStart ? `${ACC}18` : 'none', border: 'none', color: canStart ? ACC : 'rgba(255,255,255,0.2)', padding: '6px 0', cursor: canStart ? 'pointer' : 'default', transition: 'all 0.15s', width: '100%' }}>
        {starting ? 'starting...' : selectedLocation ? `start @${selectedLocation.name}` : 'start session'}
      </button>
    </div>
  );
}

// ── Analytics panel ───────────────────────────────────────────────────────────

const TEAL = '#00c4a7';

// ── Session duration histogram ──────────────────────────────────────────────────

const DURATION_BUCKETS = [
  { label: '0-1', maxMs: 60 * 60000 },
  { label: '1-2', maxMs: 120 * 60000 },
  { label: '2-3', maxMs: 180 * 60000 },
  { label: '3-4', maxMs: 240 * 60000 },
  { label: '4-5', maxMs: 300 * 60000 },
  { label: '5-6', maxMs: 360 * 60000 },
  { label: '6+', maxMs: Infinity },
];

type DurationMetric = 'count' | 'hours';

function SessionDurationHistogram({ sessions, activeSession }: { sessions: WorkSession[]; activeSession: WorkSession | null }) {
  const [metric, setMetric] = useState<DurationMetric>('count');

  const { data, medianMs } = useMemo(() => {
    const buckets = DURATION_BUCKETS.map(b => ({ label: b.label, count: 0, totalMs: 0, hours: 0 }));
    const durations: number[] = [];
    for (const s of sessions) {
      if (!s.actual_start) continue;
      const start = new Date(s.actual_start).getTime();
      const end = s.actual_end ? new Date(s.actual_end).getTime() : s.id === activeSession?.id ? Date.now() : start;
      const dur = end - start;
      if (dur <= 0) continue;
      durations.push(dur);
      const idx = DURATION_BUCKETS.findIndex(b => dur <= b.maxMs);
      const bucket = buckets[idx === -1 ? buckets.length - 1 : idx];
      bucket.count += 1;
      bucket.totalMs += dur;
    }
    for (const b of buckets) b.hours = Math.round((b.totalMs / 3600000) * 10) / 10;
    durations.sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const median = durations.length === 0
      ? 0
      : durations.length % 2 === 1 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
    return { data: buckets, medianMs: median };
  }, [sessions, activeSession?.id]);

  const hasData = data.some(d => d.count > 0);
  if (!hasData) return null;
  const maxValue = Math.max(1, ...data.map(d => d[metric]));
  const medianBucketLabel = (DURATION_BUCKETS.find(b => medianMs <= b.maxMs) ?? DURATION_BUCKETS[DURATION_BUCKETS.length - 1]).label;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>session length</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: VT, fontSize: '0.68rem', letterSpacing: 1, textTransform: 'uppercase' }}>
          <button
            onClick={() => setMetric('count')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: metric === 'count' ? ACC : 'rgba(255,255,255,0.3)' }}
          >
            sessions
          </button>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
          <button
            onClick={() => setMetric('hours')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: metric === 'hours' ? ACC : 'rgba(255,255,255,0.3)' }}
          >
            hours
          </button>
        </div>
      </div>
      <ChartContainer config={{ count: { label: 'Sessions', color: TEAL }, hours: { label: 'Hours', color: TEAL } }} style={{ width: '100%', height: 120 }}>
        <BarChart data={data} margin={{ top: 20, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={{ fontFamily: VT, fontSize: 12, fill: 'rgba(255,255,255,0.6)' }}
          />
          <YAxis hide domain={[0, 'auto']} />
          <ChartTooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const pt = payload[0].payload as { label: string; count: number; hours: number; totalMs: number };
              return (
                <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 10px', fontFamily: VT, fontSize: '0.88rem', color: '#fff', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>{pt.label}</span>
                  {' · '}
                  <span style={{ color: TEAL }}>
                    {metric === 'count' ? `${pt.count} session${pt.count === 1 ? '' : 's'}` : fmtMs(pt.totalMs)}
                  </span>
                </div>
              );
            }}
          />
          <ReferenceLine x={medianBucketLabel} stroke={ACC} strokeDasharray="3 3" strokeWidth={1.5}>
            <Label value={`median ${fmtMs(medianMs)}`} position="top" fill={ACC} fontSize={14} fontFamily={VT} />
          </ReferenceLine>
          <Bar dataKey={metric} radius={0}>
            {data.map((d, i) => (
              <Cell key={i} fill={d[metric] === maxValue ? ACC : TEAL} fillOpacity={d[metric] === 0 ? 0.08 : 0.35 + (d[metric] / maxValue) * 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ── Work heatmap (day × hour, all-time) ─────────────────────────────────────────

const DOW_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const HEATMAP_HOUR_MARKS = new Set([0, 6, 12, 18]);
const HEATMAP_GAP = 2;

// Viridis: perceptually-uniform, colorblind-safe colormap — monotonic luminance ramp
// so intensity reads correctly even for viewers who can't distinguish hue.
const VIRIDIS_STOPS: [number, number, number][] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [180, 222, 44],
  [253, 231, 37],
];

function viridisRgb(t: number): string {
  const scaled = Math.min(1, Math.max(0, t)) * (VIRIDIS_STOPS.length - 1);
  const i = Math.min(VIRIDIS_STOPS.length - 2, Math.floor(scaled));
  const frac = scaled - i;
  const [r0, g0, b0] = VIRIDIS_STOPS[i];
  const [r1, g1, b1] = VIRIDIS_STOPS[i + 1];
  const r = Math.round(r0 + (r1 - r0) * frac);
  const g = Math.round(g0 + (g1 - g0) * frac);
  const b = Math.round(b0 + (b1 - b0) * frac);
  return `${r},${g},${b}`;
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

function WorkHeatmap({ sessions, activeSession }: { sessions: WorkSession[]; activeSession: WorkSession | null }) {
  const [now, setNow] = useState(() => new Date());
  const [hovered, setHovered] = useState<{ dow: number; hour: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const nowDow = (now.getDay() + 6) % 7;
  const nowHour = now.getHours();

  const grid = useMemo(() => {
    const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    for (const s of sessions) {
      if (!s.actual_start) continue;
      const start = new Date(s.actual_start).getTime();
      const end = s.actual_end
        ? new Date(s.actual_end).getTime()
        : s.id === activeSession?.id ? Date.now() : start;
      if (end <= start) continue;

      let cursor = start;
      while (cursor < end) {
        const d = new Date(cursor);
        const dow = (d.getDay() + 6) % 7; // 0=Mon .. 6=Sun
        const hour = d.getHours();
        const hourEnd = new Date(d);
        hourEnd.setMinutes(0, 0, 0);
        hourEnd.setHours(hour + 1);
        const boundary = Math.min(hourEnd.getTime(), end);
        cells[dow][hour] += boundary - cursor;
        cursor = boundary;
      }
    }
    return cells;
  }, [sessions, activeSession?.id]);

  const maxMs = Math.max(1, ...grid.flatMap(row => row));
  const hasData = grid.some(row => row.some(ms => ms > 0));
  if (!hasData) return null;

  return (
    <div>
      <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10 }}>
        by day / hour
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: HEATMAP_GAP }}>
        {DOW_LABELS.map((label, dow) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: '3ch', flexShrink: 0, fontFamily: VT, fontSize: '0.75rem', letterSpacing: 1, color: 'rgba(255,255,255,0.6)' }}>
              {label}
            </span>
            <div style={{ display: 'flex', flex: 1, minWidth: 0, gap: HEATMAP_GAP }}>
              {grid[dow].map((ms, hour) => {
                const intensity = ms / maxMs;
                const rgb = viridisRgb(0.12 + intensity * 0.88);
                const bg = ms === 0 ? 'rgba(255,255,255,0.05)' : `rgba(${rgb},0.9)`;
                const glow = intensity > 0.75 ? `0 0 6px rgba(${rgb},0.6)` : 'none';
                const isNow = dow === nowDow && hour === nowHour;
                const isHovered = hovered?.dow === dow && hovered?.hour === hour;
                const align = hour < 4 ? 'left' : hour > 19 ? 'right' : 'center';
                return (
                  <div
                    key={hour}
                    onMouseEnter={() => setHovered({ dow, hour })}
                    onMouseLeave={() => setHovered(prev => (prev?.dow === dow && prev?.hour === hour ? null : prev))}
                    style={{
                      position: 'relative',
                      flex: '1 1 0%', minWidth: 0, aspectRatio: '1', background: bg, borderRadius: 2, boxShadow: glow,
                      outline: isNow ? `1px solid ${ACC}` : isHovered ? '1px solid rgba(255,255,255,0.5)' : 'none',
                      outlineOffset: isNow || isHovered ? 1 : 0,
                      transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                      transition: 'transform 0.08s ease-out',
                      zIndex: isHovered ? 2 : 1,
                    }}
                  >
                    {isHovered && (
                      <div
                        style={{
                          position: 'absolute', bottom: '100%', marginBottom: 6,
                          left: align === 'left' ? 0 : align === 'center' ? '50%' : 'auto',
                          right: align === 'right' ? 0 : 'auto',
                          transform: align === 'center' ? 'translateX(-50%)' : 'none',
                          background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', padding: '4px 9px',
                          fontFamily: VT, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
                        }}
                      >
                        <div style={{ fontSize: '0.6rem', letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                          {label} {hourLabel(hour)}{isNow ? ' · now' : ''}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: ms > 0 ? `rgb(${rgb})` : 'rgba(255,255,255,0.3)' }}>
                          {ms > 0 ? fmtMs(ms) : 'no activity'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: HEATMAP_GAP, marginLeft: 'calc(3ch + 6px)', marginTop: 2 }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              style={{
                flex: '1 1 0%', minWidth: 0, textAlign: 'center', overflow: 'visible', whiteSpace: 'nowrap',
                fontFamily: VT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)',
              }}
            >
              {HEATMAP_HOUR_MARKS.has(hour) ? hourLabel(hour) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Location rank ─────────────────────────────────────────────────────────────

const LOC_COLORS = [ACC, TEAL, '#e879f9', '#60a5fa', '#34d399'];

function LocationRank({ sessions }: { sessions: WorkSession[] }) {
  const [tick, setTick] = useState(0);
  const [barCols, setBarCols] = useState(16);
  const wrapRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 650);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const measure = () => {
      if (!wrapRef.current || !charRef.current) return;
      const charW = charRef.current.getBoundingClientRect().width / 20;
      if (charW < 1) return;
      const totalW = wrapRef.current.getBoundingClientRect().width;
      // fixed chars: name col (11) + gap (0.5) + '[' (1) + ']' (1) + time gap (0.4) + max time label (8)
      const fixedChs = 11 + 0.5 + 1 + 1 + 0.4 + 8;
      setBarCols(Math.max(4, Math.floor((totalW - fixedChs * charW) / charW)));
    };
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    measure();
    return () => ro.disconnect();
  }, []);

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
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Hidden span to measure exact char pixel width at this font/size/spacing */}
      <span ref={charRef} aria-hidden style={{
        position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
        fontFamily: VT, fontSize: '0.95rem', letterSpacing: 1, whiteSpace: 'pre',
      }}>{'|'.repeat(20)}</span>

      <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10 }}>by location</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranked.map((loc, i) => {
          const color   = LOC_COLORS[i % LOC_COLORS.length];
          const fill    = Math.round((loc.hours / maxH) * barCols);
          const flicker = fill > 0 ? 1 + (i % 2) : 0;
          const stable  = Math.max(0, fill - flicker);
          const flickOn = (tick + i) % 2 === 0;
          const empty   = barCols - fill;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', fontFamily: VT, fontSize: '0.95rem', letterSpacing: 1 }}>
              <span style={{ display: 'inline-block', width: '11ch', textAlign: 'right', overflow: 'hidden', whiteSpace: 'nowrap', color, flexShrink: 0, marginRight: '0.5ch' }}>
                {loc.name}
              </span>
              <span style={{ whiteSpace: 'pre', display: 'flex', alignItems: 'baseline' }}>
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>[</span>
                <span style={{ color }}>{'|'.repeat(stable)}</span>
                <span style={{ color: flickOn ? color : 'transparent' }}>{'|'.repeat(flicker)}</span>
                <span style={{ color: 'rgba(255,255,255,0.07)' }}>{' '.repeat(empty)}</span>
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>]</span>
                <span style={{ color: 'rgba(255,255,255,0.9)', marginLeft: '0.4ch' }}>{fmtH(loc.hours)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Analytics panel ── (stat chips + charts) ──────────────────────────────────

function AnalyticsPanel({ allTimeSessions, activeSession }: { allTimeSessions: WorkSession[]; activeSession: WorkSession | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SessionDurationHistogram sessions={allTimeSessions} activeSession={activeSession} />
      <WorkHeatmap sessions={allTimeSessions} activeSession={activeSession} />
      <LocationRank sessions={allTimeSessions} />
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function OnTheClockView() {
  const store = useSessionStore();
  const { activeSession, activePauses, locations } = store;
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [allTimeSessions, setAllTimeSessions] = useState<WorkSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [editingLocations, setEditingLocations] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    const [all, allTimed] = await Promise.all([loadAllSessions(), loadAllTimedSessions()]);
    setSessions(all);
    setAllTimeSessions(allTimed);
    setLoadingSessions(false);
  }, []);

  useEffect(() => { store.load(); fetchSessions(); }, [store.load, fetchSessions]);
  useEffect(() => { fetchSessions(); }, [activeSession?.id, activeSession?.status, fetchSessions]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

      {/* ── Session status bar (active session only) ── */}
      {activeSession && (
        <SessionStatusBar activeSession={activeSession} activePauses={activePauses} />
      )}

      {/* ── Bottom two columns ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: Session log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

        {/* Right: Start Session + Analytics stacked */}
        <div style={{ width: 400, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {editingLocations && <LocationEditorPopup onClose={() => setEditingLocations(false)} />}
          {!activeSession && (
            <div style={{ padding: '20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: VT, fontSize: '1.1rem', letterSpacing: 3, color: '#fff', textTransform: 'uppercase' }}><Feather style={{ width: 18, height: 18, flexShrink: 0 }} />Start Session</div>
                {locations.length > 0 && (
                  <button
                    onClick={() => setEditingLocations(true)}
                    style={{ fontFamily: VT, fontSize: '0.75rem', letterSpacing: 1, background: 'none', border: 'none', color: 'rgba(255,255,255,0.22)', cursor: 'pointer', padding: 0, textTransform: 'uppercase', transition: 'color 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = ACC)}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.22)')}
                  >edit list</button>
                )}
              </div>
              <SessionBuilder onEditLocations={() => setEditingLocations(true)} />
            </div>
          )}

          <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: VT, fontSize: '1.1rem', letterSpacing: 3, color: '#fff', textTransform: 'uppercase', marginBottom: 14 }}>
              <BracesContent style={{ width: 18, height: 18, flexShrink: 0 }} />analytics
            </div>
            <AnalyticsPanel allTimeSessions={allTimeSessions} activeSession={activeSession} />
          </div>
        </div>
      </div>
    </div>
  );
}
