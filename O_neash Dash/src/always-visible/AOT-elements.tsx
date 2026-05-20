import { useState, useEffect, useRef } from "react";
import SingleBloomNav from "./SingleBloomNavigator/SingleBloomNav";
import usePluginStore from "../store/usePluginStore";
import { Home } from "pixelarticons/react";
import { CATEGORIES } from "../home/LaunchMenu";
import { SpeakYourMindInput } from "../widgets/widgets/SpeakYourMind";
import { useFloatingEditorStore } from "../store/useFloatingEditorStore";
import { loadNotes } from "../plugins/NotesPlugin/lib/notesDb";
import type { NoteRow } from "../plugins/NotesPlugin/lib/notesDb";
import "./AOT-elements.css";

const VT = "'VT323', 'HBIOS-SYS', monospace";

// Flatten all launchable apps from categories, keeping icon + accent color
const ALL_APPS = CATEGORIES.flatMap((cat) =>
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

function AlwaysOnTop() {
  return (
    <div className="always-on-top">
      <AotMenu />
      <AotRightPanel />
      <SingleBloomNav />
    </div>
  );
}

export default AlwaysOnTop;
