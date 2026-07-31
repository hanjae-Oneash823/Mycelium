import { useState, useEffect, useRef, useCallback } from "react";
import SingleBloomNav from "./SingleBloomNavigator/SingleBloomNav";
import usePluginStore from "../store/usePluginStore";
import { Home } from "pixelarticons/react";
import { CATEGORIES } from "../home/LaunchMenu";
import { SpeakYourMindInput } from "../widgets/widgets/SpeakYourMind";
import { useFloatingEditorStore } from "../store/useFloatingEditorStore";
import { loadNotes } from "../plugins/NotesPlugin/lib/notesDb";
import type { NoteRow } from "../plugins/NotesPlugin/lib/notesDb";
import { useSessionStore } from "../plugins/PlannerPlugin/store/useSessionStore";
import "./AOT-elements.css";

const VT_OTC = "var(--font-main), var(--font-kr), monospace";
const OTC_ACC = '#f59e0b';

function fmtTimer(secs: number) {
  const m = Math.floor(Math.abs(secs) / 60);
  const s = Math.abs(secs) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── On The Clock AOT section ──────────────────────────────────────────────────

function OnTheClockSection({ isOpen }: { isOpen: boolean }) {
  const store = useSessionStore();
  const { activeSession, activeSessionNodes, activePauses, todaySessions, locations } = store;

  // Timer state
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // UI state
  const [forceStopOpen, setForceStopOpen] = useState(false);
  const [startingUnplanned, setStartingUnplanned] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [confirmAllDone, setConfirmAllDone] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null | 'orphan'>('orphan');
  const [showMovePanel, setShowMovePanel] = useState(false);

  useEffect(() => { if (isOpen) store.load(); }, [isOpen]);

  // Compute session elapsed from actual_start + pauses
  const computeSessionElapsed = useCallback(() => {
    if (!activeSession?.actual_start) return 0;
    const startMs = new Date(activeSession.actual_start).getTime();
    const pauseMs = activePauses.reduce((sum, p) => {
      if (!p.resumed_at) return sum;
      return sum + (new Date(p.resumed_at).getTime() - new Date(p.paused_at).getTime());
    }, 0);
    const currentPause = activePauses.find(p => !p.resumed_at);
    const cappedNow = currentPause ? new Date(currentPause.paused_at).getTime() : Date.now();
    return Math.floor((cappedNow - startMs - pauseMs) / 1000);
  }, [activeSession, activePauses]);

  // Timer tick — only when active
  const isActive = activeSession?.status === 'active';

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setSessionElapsed(computeSessionElapsed()), 1000);
    return () => clearInterval(id);
  }, [isActive, computeSessionElapsed]);

  const isPaused = activeSession?.status === 'paused';
  const currentPause = activePauses.find(p => !p.resumed_at);
  const hasUnfinished = activeSessionNodes.some(n => n.status === 'queued' || n.status === 'in_progress');

  const handleEndSession = () => {
    if (hasUnfinished) setForceStopOpen(true);
    else store.endClean();
  };

  const handleResume = async () => {
    if (!currentPause) return;
    await store.resume(currentPause.id);
  };

  const handleManualPause = async () => {
    await store.pauseManual();
  };

  // ── Idle view ──
  if (!activeSession) {
    return (
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 8 }}>
        <div style={{ fontFamily: VT_OTC, fontSize: '0.72rem', letterSpacing: 3, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 8 }}>
          [on the clock]
        </div>

        {/* Start session */}
        {startingUnplanned ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: VT_OTC, fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', letterSpacing: 2, marginBottom: 6 }}>
              select location:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocationId(loc.id)}
                  style={{
                    fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1,
                    background: selectedLocationId === loc.id ? `${OTC_ACC}22` : 'none',
                    border: `1px solid ${selectedLocationId === loc.id ? OTC_ACC : 'rgba(255,255,255,0.18)'}`,
                    color: selectedLocationId === loc.id ? OTC_ACC : 'rgba(255,255,255,0.45)',
                    padding: '3px 10px', cursor: 'pointer',
                  }}
                >
                  {loc.name}
                </button>
              ))}
              {locations.length === 0 && (
                <div style={{ fontFamily: VT_OTC, fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)' }}>
                  add locations in On the Clock view
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={async () => { if (selectedLocationId) { await store.startUnplanned(selectedLocationId); setStartingUnplanned(false); setSelectedLocationId(null); } }}
                disabled={!selectedLocationId}
                style={{
                  fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1, flex: 1,
                  background: selectedLocationId ? `${OTC_ACC}22` : 'none',
                  border: `1px solid ${selectedLocationId ? OTC_ACC : 'rgba(255,255,255,0.1)'}`,
                  color: selectedLocationId ? OTC_ACC : 'rgba(255,255,255,0.2)',
                  padding: '4px 0', cursor: selectedLocationId ? 'pointer' : 'default',
                }}
              >
                go
              </button>
              <button
                onClick={() => { setStartingUnplanned(false); setSelectedLocationId(null); }}
                style={{
                  fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1,
                  background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.3)', padding: '4px 10px', cursor: 'pointer',
                }}
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setStartingUnplanned(true)}
            style={{
              fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1, width: '100%',
              background: 'none', border: '1px dashed rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.3)', padding: '5px 0', cursor: 'pointer', marginTop: 4,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = OTC_ACC; e.currentTarget.style.borderColor = `${OTC_ACC}44`; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          >
            + start session
          </button>
        )}
      </div>
    );
  }

  // ── Active / paused view ──
  const inProgress = activeSessionNodes.filter(n => n.status === 'in_progress');
  const queued = activeSessionNodes.filter(n => n.status === 'queued');
  const done = activeSessionNodes.filter(n => n.status === 'done' || n.status === 'incomplete');

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 8, position: 'relative' }}>

      {/* Force-stop overlay */}
      {forceStopOpen && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.95)',
          zIndex: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontFamily: VT_OTC, fontSize: '1rem', letterSpacing: 2, color: '#fff' }}>end session early</div>
          <div style={{ fontFamily: VT_OTC, fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 4 }}>
            unfinished nodes — choose what to do:
          </div>
          {[
            { label: 'carry over — return unfinished to planner', action: () => { store.carryOver(); setForceStopOpen(false); } },
          ].map(opt => (
            <button key={opt.label} onClick={opt.action} style={{
              fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 1, textAlign: 'left',
              background: 'none', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.65)', padding: '6px 10px', cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
            >
              {opt.label}
            </button>
          ))}
          {/* Move to session */}
          {showMovePanel ? (
            <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: 8 }}>
              <div style={{ fontFamily: VT_OTC, fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginBottom: 6, letterSpacing: 1 }}>move to:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto', marginBottom: 8 }}>
                {todaySessions.filter(s => s.id !== activeSession.id && s.status === 'planned').map(s => (
                  <button key={s.id} onClick={() => setMoveTarget(s.id)} style={{
                    fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1, textAlign: 'left',
                    background: moveTarget === s.id ? `${OTC_ACC}18` : 'none',
                    border: `1px solid ${moveTarget === s.id ? OTC_ACC : 'rgba(255,255,255,0.1)'}`,
                    color: moveTarget === s.id ? OTC_ACC : 'rgba(255,255,255,0.5)',
                    padding: '4px 8px', cursor: 'pointer',
                  }}>{s.title}</button>
                ))}
                <button onClick={() => setMoveTarget('orphan')} style={{
                  fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1, textAlign: 'left',
                  background: moveTarget === 'orphan' ? 'rgba(255,255,255,0.06)' : 'none',
                  border: `1px solid ${moveTarget === 'orphan' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  color: moveTarget === 'orphan' ? '#fff' : 'rgba(255,255,255,0.4)',
                  padding: '4px 8px', cursor: 'pointer',
                }}>orphan — no session</button>
              </div>
              <button onClick={async () => {
                await store.moveUnfinished(moveTarget === 'orphan' ? null : (moveTarget ?? null));
                setForceStopOpen(false); setShowMovePanel(false);
              }} style={{
                fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 1, width: '100%',
                background: `${OTC_ACC}18`, border: `1px solid ${OTC_ACC}55`,
                color: OTC_ACC, padding: '5px 0', cursor: 'pointer',
              }}>confirm move</button>
            </div>
          ) : (
            <button onClick={() => setShowMovePanel(true)} style={{
              fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 1, textAlign: 'left',
              background: 'none', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.65)', padding: '6px 10px', cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
            >
              move unfinished to another session
            </button>
          )}
          {/* Mark all done */}
          {confirmAllDone ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={async () => { await store.forceAllDone(); setForceStopOpen(false); setConfirmAllDone(false); }} style={{
                fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1, flex: 1,
                background: 'rgba(74,222,128,0.12)', border: '1px solid #4ade80',
                color: '#4ade80', padding: '5px 0', cursor: 'pointer',
              }}>confirm</button>
              <button onClick={() => setConfirmAllDone(false)} style={{
                fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1,
                background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.35)', padding: '5px 10px', cursor: 'pointer',
              }}>back</button>
            </div>
          ) : (
            <button onClick={() => setConfirmAllDone(true)} style={{
              fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 1, textAlign: 'left',
              background: 'none', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.65)', padding: '6px 10px', cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
            >
              mark all done
            </button>
          )}
          <button onClick={() => { setForceStopOpen(false); setConfirmAllDone(false); setShowMovePanel(false); }} style={{
            fontFamily: VT_OTC, fontSize: '0.85rem', letterSpacing: 1, marginTop: 4,
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)',
            cursor: 'pointer', padding: '4px 0',
          }}>cancel</button>
        </div>
      )}

      {/* Session header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: VT_OTC, fontSize: '0.72rem', letterSpacing: 3, color: OTC_ACC, textTransform: 'uppercase' }}>
          {isPaused ? '⏸ paused' : '● live'}
        </span>
        <span style={{ fontFamily: VT_OTC, fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeSession.location_name ?? activeSession.title}
        </span>
      </div>

      {/* Timer */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px' }}>
          <div style={{ fontFamily: VT_OTC, fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', letterSpacing: 2, marginBottom: 2 }}>SESSION</div>
          <div style={{ fontFamily: VT_OTC, fontSize: '1.6rem', color: '#fff', letterSpacing: 3, lineHeight: 1 }}>
            {fmtTimer(sessionElapsed)}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {isPaused ? (
          <button onClick={handleResume} style={{
            fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 1, flex: 1,
            background: 'rgba(96,165,250,0.12)', border: '1px solid #60a5fa',
            color: '#60a5fa', padding: '5px 0', cursor: 'pointer',
          }}>▶ resume</button>
        ) : (
          <button onClick={handleManualPause} style={{
            fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 1, flex: 1,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.65)', padding: '5px 0', cursor: 'pointer',
          }}>⏸ pause</button>
        )}
        {!isPaused && (
          <button onClick={handleEndSession} style={{
            fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 1, flex: 1,
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.4)',
            color: '#f87171', padding: '5px 0', cursor: 'pointer',
          }}>■ end</button>
        )}
      </div>

      {/* Node list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
        {inProgress.map(n => (
          <NodeRow key={n.node_id} node={n} isPaused={isPaused} store={store} accentColor={OTC_ACC} />
        ))}
        {queued.map(n => (
          <NodeRow key={n.node_id} node={n} isPaused={isPaused} store={store} accentColor={OTC_ACC} />
        ))}
        {done.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, paddingTop: 4 }}>
            {done.map(n => (
              <div key={n.node_id} style={{
                fontFamily: VT_OTC, fontSize: '0.82rem', letterSpacing: 0.5,
                color: n.status === 'done' ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.45)',
                textDecoration: n.status === 'done' ? 'line-through' : 'none',
                padding: '3px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{n.title}</div>
            ))}
          </div>
        )}
        {activeSessionNodes.length === 0 && (
          <div style={{ fontFamily: VT_OTC, fontSize: '0.78rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 1 }}>
            no nodes — add some from the today page
          </div>
        )}
      </div>
    </div>
  );
}

function NodeRow({ node, isPaused, store, accentColor }: {
  node: import('../plugins/PlannerPlugin/lib/onTheClockDb').SessionNodeWithNode;
  isPaused: boolean;
  store: ReturnType<typeof useSessionStore.getState>;
  accentColor: string;
}) {
  const [hov, setHov] = useState(false);
  const isInProgress = node.status === 'in_progress';

  return (
    <div
      onMouseEnter={() => !isPaused && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 8px',
        border: `1px solid ${isInProgress ? `${accentColor}55` : 'rgba(255,255,255,0.08)'}`,
        background: isInProgress ? `${accentColor}0a` : 'none',
        transition: 'border-color 0.1s',
      }}
    >
      {isInProgress && <span style={{ width: 5, height: 5, background: accentColor, flexShrink: 0, borderRadius: 0 }} />}
      <span style={{
        fontFamily: VT_OTC, fontSize: '0.88rem', letterSpacing: 0.5, flex: 1,
        color: isInProgress ? '#fff' : 'rgba(255,255,255,0.55)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {node.title}
      </span>
      {!isPaused && hov && (
        <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {!isInProgress && (
            <button onClick={() => store.startNode(node.node_id)} title="start" style={{ ...iconBtn, color: accentColor }}>▶</button>
          )}
          {isInProgress && (
            <>
              <button onClick={() => store.finishNode(node.node_id)} title="done" style={{ ...iconBtn, color: '#4ade80' }}>✓</button>
              <button onClick={() => store.returnToQueue(node.node_id)} title="back to queue" style={{ ...iconBtn, color: 'rgba(255,255,255,0.4)' }}>↩</button>
            </>
          )}
          <button onClick={() => store.removeNode(node.node_id)} title="remove" style={{ ...iconBtn, color: '#f87171' }}>×</button>
        </span>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  fontFamily: VT_OTC, fontSize: '0.95rem', lineHeight: 1,
  background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
};

const VT = "var(--font-main), var(--font-kr), monospace";

// Flatten all launchable apps from categories, keeping icon + accent color.
// Arcade games are excluded — they stay reachable from the home launcher only.
const ALL_APPS = CATEGORIES.filter((cat) => cat.id !== "arcade").flatMap((cat) =>
  cat.apps
    .filter((app) => app.pluginId)
    .map((app) => ({ ...app, accent: cat.accent }))
);

function AotMenu() {
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  const activePlugin = usePluginStore((state) => state.activePlugin);
  const [isOpen, setIsOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const menuRef  = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const recentApps = recent
    .map((id) => ALL_APPS.find((a) => a.pluginId === id))
    .filter(Boolean) as typeof ALL_APPS;

  // Track recently visited plugins
  useEffect(() => {
    if (activePlugin !== null) {
      setRecent((prev) => {
        const filtered = prev.filter((id) => id !== activePlugin);
        return [activePlugin, ...filtered].slice(0, 3);
      });
    }
  }, [activePlugin]);

  // Slide out when cursor hits the left edge within the panel's Y range
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX > 4) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) setIsOpen(true);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const navigate = (id: string | null) => {
    setActivePlugin(id);
    setIsOpen(false);
  };

  return (
    <div
      className={`aot-menu-wrapper${isOpen ? " is-open" : ""}`}
      ref={menuRef}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="aot-menu-panel" ref={panelRef}>

        <button className="aot-menu-item aot-menu-home" onClick={() => navigate(null)}>
          <Home className="aot-menu-item-icon" />
          <span>HOMEPAGE</span>
        </button>

        {recentApps.length > 0 && (
          <>
            <div className="aot-menu-section-label">[recent]</div>
            {recentApps.map((app, i) => (
              <button
                key={app.pluginId}
                className="aot-menu-item"
                style={{ color: app.accent }}
                onClick={() => navigate(app.pluginId!)}
              >
                <span className="aot-menu-item-num">{i + 1}</span>
                <span className="aot-menu-item-icon">{app.icon}</span>
                <span>{app.label.toUpperCase()}</span>
              </button>
            ))}
          </>
        )}

        <div className="aot-menu-section-label">[all]</div>
        {ALL_APPS.map((app) => (
          <button
            key={app.pluginId}
            className="aot-menu-item"
            style={{ color: app.accent }}
            onClick={() => navigate(app.pluginId!)}
          >
            <span className="aot-menu-item-icon">{app.icon}</span>
            <span>{app.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Floating Notes Section ────────────────────────────────────────────────────

function FloatingNotesSection({ isOpen }: { isOpen: boolean }) {
  const [query, setQuery]   = useState('');
  const [allDocs, setAllDocs] = useState<NoteRow[]>([]);
  const { docs: poolDocs, poolVisible, openDoc, togglePool } = useFloatingEditorStore();

  const fetchDocs = () =>
    loadNotes('document')
      .then(rows => setAllDocs(rows.filter(r => r.note_type === 'document')))
      .catch(() => {});

  // Load on mount and refresh each time the panel opens
  useEffect(() => { fetchDocs(); }, []);
  useEffect(() => { if (isOpen) fetchDocs(); }, [isOpen]);

  const displayed = query.trim()
    ? allDocs.filter(d => (d.title ?? '').toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : allDocs.slice(0, 5);

  const poolFull = poolDocs.length >= 3;

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="aot-menu-section-label" style={{ margin: 0 }}>[floating notes]</span>
        <button
          onClick={togglePool}
          style={{
            fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1.5,
            background: 'transparent',
            border: `1px solid ${poolVisible ? 'rgba(0,196,167,0.4)' : 'rgba(255,255,255,0.15)'}`,
            color: poolVisible ? '#00c4a7' : 'rgba(255,255,255,0.3)',
            padding: '1px 8px', cursor: 'pointer', transition: 'all 0.12s',
          }}
        >
          {poolVisible ? 'pool on' : 'pool off'}
        </button>
      </div>

      {/* Search input */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="search documents..."
        style={{
          width: '100%', boxSizing: 'border-box' as const,
          fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff', padding: '4px 10px', outline: 'none',
          marginBottom: 6,
        }}
      />

      {/* Recent / search results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {displayed.length === 0 && (
          <div style={{ fontFamily: VT, fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)', padding: '4px 2px' }}>
            no documents found
          </div>
        )}
        {displayed.map(doc => {
          const inPool = poolDocs.some(d => d.docId === doc.id);
          const isPoolOpen = poolDocs.find(d => d.docId === doc.id)?.state === 'open';
          return (
            <button
              key={doc.id}
              onClick={() => openDoc(doc.id)}
              disabled={poolFull && !inPool}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: isPoolOpen ? 'rgba(0,196,167,0.1)' : inPool ? 'rgba(255,255,255,0.04)' : 'none',
                border: 'none',
                padding: '4px 6px', cursor: poolFull && !inPool ? 'default' : 'pointer',
                textAlign: 'left' as const, width: '100%',
                opacity: poolFull && !inPool ? 0.35 : 1,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!(poolFull && !inPool)) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isPoolOpen ? 'rgba(0,196,167,0.1)' : inPool ? 'rgba(255,255,255,0.04)' : 'none'; }}
            >
              <span style={{
                fontFamily: VT, fontSize: '0.88rem', letterSpacing: 1,
                color: isPoolOpen ? '#00c4a7' : inPool ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.45)',
                flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {doc.title || 'Untitled'}
              </span>
              {inPool && (
                <span style={{ fontFamily: VT, fontSize: '0.65rem', color: '#00c4a7', letterSpacing: 1, flexShrink: 0 }}>
                  {isPoolOpen ? '▶' : '▪'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {poolFull && (
        <div style={{ fontFamily: VT, fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', marginTop: 6, letterSpacing: 1 }}>
          pool full (3/3) — close one to add another
        </div>
      )}
    </div>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────────

function AotRightPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX < window.innerWidth - 4) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) setIsOpen(true);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className={`aot-right-wrapper${isOpen ? " is-open" : ""}`}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="aot-right-panel" ref={panelRef}>
        <SpeakYourMindInput />
        <FloatingNotesSection isOpen={isOpen} />
      </div>
    </div>
  );
}

function AotOnTheClockPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX < window.innerWidth - 4) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) setIsOpen(true);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className={`aot-otc-wrapper${isOpen ? " is-open" : ""}`}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="aot-otc-panel" ref={panelRef}>
        <OnTheClockSection isOpen={isOpen} />
      </div>
    </div>
  );
}

function AlwaysOnTop() {
  return (
    <div className="always-on-top">
      <AotMenu />
      <div className="aot-right-group">
        <AotRightPanel />
        <AotOnTheClockPanel />
      </div>
      <SingleBloomNav />
    </div>
  );
}

export default AlwaysOnTop;
