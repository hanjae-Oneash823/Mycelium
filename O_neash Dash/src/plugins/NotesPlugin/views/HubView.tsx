import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { ArrowDownDiamond, Laugh, Notes, Computer, Search, Folder } from 'pixelarticons/react';
import { useNotesStore } from '../store/useNotesStore';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';
import { loadNotes } from '../lib/notesDb';
import type { NoteRow } from '../lib/notesDb';
import PixelIcon from '../components/PixelIcon';
import { DocPreview, extractPreviewLines, Tile } from '../components/FileSystemView';
import { ArcProjectModal } from '../components/ArcProjectModal';

const FONT      = "'VT323', 'HBIOS-SYS', monospace";
const YELLOW    = '#f5c842';
const MAX_MEMOS = 50;

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtActivity(ts: string): string {
  const utc = ts.endsWith('Z') || ts.includes('+') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(utc);
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const hm  = `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  return `[${ymd}-${hm}]`;
}

function countWords(note: NoteRow): number {
  if (note.note_type === 'memo') {
    return (note.content_plain ?? '').trim().split(/\s+/).filter(Boolean).length;
  }
  if (!note.content_json) return 0;
  try {
    const words: string[] = [];
    function traverse(node: any) {
      if (node?.type === 'text' && node.text) words.push(...node.text.trim().split(/\s+/).filter(Boolean));
      node?.content?.forEach(traverse);
    }
    traverse(JSON.parse(note.content_json));
    return words.length;
  } catch { return 0; }
}

function isCreated(note: NoteRow): boolean {
  return Math.abs(new Date(note.updated_at).getTime() - new Date(note.created_at).getTime()) < 5000;
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
      <span style={{ color: YELLOW, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{
        fontFamily: FONT, fontSize: '1.6rem', letterSpacing: '4px',
        color: YELLOW, textTransform: 'uppercase', lineHeight: 1,
      }}>{label}</span>
    </div>
  );
}

// ── Recently modified docs header with new doc button ─────────────────────────
function NewDocHeader({ onNew }: { onNew: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
      <span style={{ color: YELLOW, display: 'flex', alignItems: 'center' }}>
        <ArrowDownDiamond size={22} />
      </span>
      <span style={{
        fontFamily: FONT, fontSize: '1.6rem', letterSpacing: '4px',
        color: YELLOW, textTransform: 'uppercase', lineHeight: 1,
      }}>recently modified docs</span>
      <button
        onClick={onNew}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          marginLeft: '0.8rem',
          fontFamily: FONT, fontSize: '0.82rem', letterSpacing: 1.5,
          background:  hov ? 'rgba(255,255,255,0.08)' : 'transparent',
          border:      `1px solid ${hov ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}`,
          color:       hov ? '#fff' : 'rgba(255,255,255,0.35)',
          padding:     '2px 10px', cursor: 'pointer',
          transition:  'all 0.12s',
          lineHeight:  1.6,
        }}
      >
        + new doc
      </button>
    </div>
  );
}

// ── Doc tile (mirrors FileSystemView Tile for paper type) ─────────────────────
function DocTile({ doc, arcColor, onOpen }: { doc: NoteRow; arcColor: string | null; onOpen: () => void }) {
  const [hov, setHov] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(false);
  const tint = arcColor ? `${arcColor}a6` : 'rgba(255,255,255,0.65)';
  const previewLines = extractPreviewLines(doc.content_json ?? null);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', zIndex: hov ? 10 : 1 }}
      onMouseEnter={e => { setHov(true); setMouse({ x: e.clientX, y: e.clientY }); setShowPreview(true); }}
      onMouseMove={e => setMouse({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => { setHov(false); setShowPreview(false); }}
    >
      <button
        onClick={onOpen}
        style={{
          position:   'relative',
          background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
          border:     `1px solid ${hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
          cursor:     'pointer',
          padding:    '16px 14px 0',
          display:    'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          width:      120, boxSizing: 'border-box',
          transform:  hov ? 'scale(1.05)' : 'scale(1)',
          transition: 'background 0.15s, border-color 0.15s, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div style={{
          transform:  hov ? 'rotate(6deg)' : 'rotate(0deg)',
          transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          <PixelIcon type="paper" size={80} hovered={hov} tintColor={tint} />
        </div>
        <span style={{
          fontFamily: FONT, fontSize: '1rem', letterSpacing: 0.8,
          color: hov ? '#fff' : 'rgba(255,255,255,0.85)',
          overflow: 'hidden', maxWidth: '100%', lineHeight: 1.25,
          maxHeight: '2.5rem',
          textAlign: 'center', paddingBottom: 10,
          wordBreak: 'break-word',
          transition: 'color 0.1s',
        }}>
          {((t) => t.length > 22 ? t.slice(0, 21) + '…' : t)(doc.title ?? 'untitled')}
        </span>
      </button>
      {showPreview && (
        <DocPreview lines={previewLines} title={doc.title ?? 'untitled'} mouse={mouse} />
      )}
    </div>
  );
}

// ── Search helpers ────────────────────────────────────────────────────────────

function extractPlainText(contentJson: string | null): string {
  if (!contentJson) return '';
  try {
    const parts: string[] = [];
    function traverse(node: any) {
      if (node?.type === 'text' && node.text) parts.push(node.text);
      node?.content?.forEach(traverse);
    }
    traverse(JSON.parse(contentJson));
    return parts.join(' ');
  } catch { return ''; }
}

// Renders text with the first occurrence of query highlighted (blue bg)
function Hl({ text, query, dimColor }: { text: string; query: string; dimColor?: string }) {
  const q   = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <span style={{ color: dimColor }}>{text}</span>;
  return (
    <span style={{ color: dimColor }}>
      {text.slice(0, idx)}
      <span style={{ background: '#1a4acc', color: '#fff', padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </span>
  );
}

type MatchKind = 'title' | 'arc_project' | 'content';
interface SearchResult {
  note:        NoteRow;
  arcName:     string | null;
  arcColor:    string | null;
  projectName: string | null;
  kind:        MatchKind;
  snippet:     string | null; // content snippet for 'content' kind
}

// ── Search section ────────────────────────────────────────────────────────────
function DocSearchSection({
  allDocs, arcs, projects, onOpenDoc,
}: {
  allDocs:   NoteRow[];
  arcs:      { id: string; name: string; color_hex: string }[];
  projects:  { id: string; name: string; arc_id: string | null }[];
  onOpenDoc: (doc: NoteRow) => void;
}) {
  const [query,  setQuery]  = useState('');
  const [selIdx, setSelIdx] = useState(0);
  const inputRef            = useRef<HTMLInputElement>(null);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const enrich = (note: NoteRow, kind: MatchKind, snippet: string | null = null): SearchResult => {
      const arc     = note.arc_id     ? arcs.find(a => a.id === note.arc_id)         : null;
      const project = note.project_id ? projects.find(p => p.id === note.project_id) : null;
      return { note, arcName: arc?.name ?? null, arcColor: arc?.color_hex ?? null, projectName: project?.name ?? null, kind, snippet };
    };

    const titleMatches = allDocs
      .filter(d => (d.title ?? '').toLowerCase().includes(q))
      .slice(0, 4)
      .map(d => enrich(d, 'title'));

    const titleIds = new Set(titleMatches.map(r => r.note.id));

    const arcProjectMatches = allDocs
      .filter(d => {
        if (titleIds.has(d.id)) return false;
        const arc  = d.arc_id     ? arcs.find(a => a.id === d.arc_id)         : null;
        const proj = d.project_id ? projects.find(p => p.id === d.project_id) : null;
        return (arc?.name ?? '').toLowerCase().includes(q) || (proj?.name ?? '').toLowerCase().includes(q);
      })
      .slice(0, 3)
      .map(d => enrich(d, 'arc_project'));

    const apIds = new Set([...titleIds, ...arcProjectMatches.map(r => r.note.id)]);

    const contentMatches = allDocs
      .filter(d => {
        if (apIds.has(d.id)) return false;
        return extractPlainText(d.content_json ?? null).toLowerCase().includes(q);
      })
      .slice(0, 3)
      .map(d => {
        const text  = extractPlainText(d.content_json ?? null);
        const idx   = text.toLowerCase().indexOf(q);
        const CTX   = 28;
        const start = Math.max(0, idx - CTX);
        const end   = Math.min(text.length, idx + q.length + CTX);
        const snip  = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
        return enrich(d, 'content', snip);
      });

    return [...titleMatches, ...arcProjectMatches, ...contentMatches];
  }, [query, allDocs, arcs, projects]);

  useEffect(() => { setSelIdx(0); }, [query]);

  const open = useCallback((r: SearchResult) => {
    onOpenDoc(r.note);
    setQuery('');
  }, [onOpenDoc]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(results.length - 1, i + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && results.length > 0) { open(results[selIdx]); }
    if (e.key === 'Escape')    { setQuery(''); inputRef.current?.blur(); }
  };

  return (
    <div style={{ marginBottom: '2.8rem' }}>
      <SectionHead icon={<Search size={22} />} label="search" />

      <div style={{ position: 'relative', maxWidth: 400, marginLeft: '1.6rem' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="search documents…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.18)',
            outline: 'none',
            fontFamily: FONT, fontSize: '1.05rem', letterSpacing: 1,
            color: 'rgba(255,255,255,0.75)',
            padding: '7px 14px',
          }}
        />

        {results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: '#080808',
            border: '1px solid rgba(255,255,255,0.14)',
            borderTop: 'none',
            zIndex: 200,
          }}>
            {results.map((r, i) => {
              const active   = i === selIdx;
              const arcLabel = [r.arcName, r.projectName].filter(Boolean).join(' / ');
              const accentColor = r.arcColor ?? 'rgba(255,255,255,0.4)';
              return (
                <div
                  key={r.note.id}
                  onMouseEnter={() => setSelIdx(i)}
                  onClick={() => open(r)}
                  style={{
                    padding: '6px 14px 5px',
                    background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                    cursor: 'pointer',
                    borderLeft: `2px solid ${active ? accentColor : 'transparent'}`,
                    transition: 'background 0.08s',
                  }}
                >
                  {/* Line 1 — title */}
                  <div style={{
                    fontFamily: FONT, fontSize: '1.05rem', letterSpacing: 0.8,
                    color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                    lineHeight: 1.2,
                  }}>
                    {r.kind === 'title'
                      ? <Hl text={r.note.title ?? 'untitled'} query={query} />
                      : (r.note.title ?? 'untitled')
                    }
                  </div>

                  {/* Line 2 — context depending on match kind */}
                  <div style={{
                    fontFamily: FONT, fontSize: '0.88rem', letterSpacing: 0.4,
                    lineHeight: 1.2,
                  }}>
                    {r.kind === 'title' && (
                      <span style={{ color: arcLabel ? `${accentColor}cc` : 'rgba(255,255,255,0.22)' }}>
                        {arcLabel || '—'}
                      </span>
                    )}
                    {r.kind === 'arc_project' && (
                      <Hl text={arcLabel || '—'} query={query} dimColor={`${accentColor}dd`} />
                    )}
                    {r.kind === 'content' && r.snippet && (
                      <Hl text={r.snippet} query={query} dimColor="rgba(255,255,255,0.35)" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── HubView ───────────────────────────────────────────────────────────────────
interface HubViewProps {
  onOpenDoc:  (doc: NoteRow) => void;
  onOpenMemo: (memo: NoteRow) => void;
  onGoToDocs: () => void;
}

export default function HubView({ onOpenDoc, onOpenMemo, onGoToDocs }: HubViewProps) {
  const { memos, documents, loadMemos, loadDocuments, createMemo, createDocument } = useNotesStore();
  const { arcs, projects, loadAll } = usePlannerStore();
  const [recentDocs,      setRecentDocs]      = useState<NoteRow[]>([]);
  const [allNotes,        setAllNotes]        = useState<NoteRow[]>([]);
  const [input,           setInput]           = useState('');
  const [showNewDocModal, setShowNewDocModal] = useState(false);

  // Submit animation state
  const [pulseKey,   setPulseKey]   = useState(0);
  const [launchItem, setLaunchItem] = useState<{ text: string; x: number; y: number } | null>(null);
  const [focused,    setFocused]    = useState(false);
  const boxRef     = useRef<HTMLDivElement>(null);
  const squishCtrl = useAnimationControls();

  useEffect(() => { loadMemos(); loadDocuments(); loadAll(); }, []);

  useEffect(() => {
    (async () => {
      const all = await loadNotes();
      setAllNotes(all);
      const docs = all
        .filter(n => n.note_type === 'document')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 8);
      setRecentDocs(docs);
    })();
  }, [documents, memos]);

  const allDocs    = allNotes.filter(n => n.note_type === 'document');
  const totalWords = allNotes.reduce((s, n) => s + countWords(n), 0);

  const activityLog = [...allNotes]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 8);

  const pct    = memos.length / MAX_MEMOS;
  const barColor = pct < 0.6 ? '#00c4a7' : pct < 0.85 ? '#f5c842' : '#ff3b3b';

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;

    const rect = boxRef.current?.getBoundingClientRect();
    const lx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const ly = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.75;

    squishCtrl.start({
      scaleY: [1, 0.78, 1.07, 1],
      scaleX: [1, 1.05, 0.97, 1],
      transition: { duration: 0.42, times: [0, 0.28, 0.65, 1], ease: 'easeOut' },
    });
    setLaunchItem({ text, x: lx, y: ly });
    setInput('');
    await createMemo(text);
  };

  return (
    <div style={{
      height: '100%', overflow: 'hidden',
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      background: '#000',
    }}>
      <style>{`
        .hub-log-latest { background: rgba(255,255,255,0.82); color: #000; }
        .hub-log-latest span { color: inherit !important; }
        .hub-log-latest .hub-log-ts { color: #1133cc !important; }
      `}</style>

      {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
      <div style={{
        padding: '2.5rem 3rem 2rem 15rem',
        overflowY: 'auto', scrollbarWidth: 'none',
      }}>

        {/* SEARCH */}
        <DocSearchSection
          allDocs={allDocs}
          arcs={arcs}
          projects={projects}
          onOpenDoc={onOpenDoc}
        />

        {/* RECENTLY MODIFIED DOCS */}
        <NewDocHeader onNew={() => setShowNewDocModal(true)} />

        <AnimatePresence>
          {showNewDocModal && (
            <ArcProjectModal
              title="new document"
              confirmLabel="create doc →"
              onConfirm={async (arcId, projectId) => {
                setShowNewDocModal(false);
                const newId  = await createDocument('New Document', arcId, projectId);
                const docs   = await loadNotes('document');
                const newDoc = docs.find(d => d.id === newId) ?? null;
                if (newDoc) onOpenDoc(newDoc);
              }}
              onCancel={() => setShowNewDocModal(false)}
            />
          )}
        </AnimatePresence>

        {recentDocs.length === 0 ? (
          <div style={{ fontFamily: FONT, fontSize: '1rem', color: 'rgba(255,255,255,0.18)', letterSpacing: 2, marginBottom: '2.5rem' }}>
            no documents yet
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2.8rem' }}>
            {recentDocs.map(doc => {
              const arc = doc.arc_id ? arcs.find(a => a.id === doc.arc_id) : null;
              return (
                <DocTile
                  key={doc.id}
                  doc={doc}
                  arcColor={arc?.color_hex ?? null}
                  onOpen={() => onOpenDoc(doc)}
                />
              );
            })}
          </div>
        )}

        {/* KEY ARCS / PROJECTS */}
        {(() => {
          const topArcs = [...arcs]
            .sort((a, b) => allDocs.filter(d => d.arc_id === b.id).length - allDocs.filter(d => d.arc_id === a.id).length)
            .slice(0, 2);
          const topProjects = [...projects]
            .sort((a, b) => allDocs.filter(d => d.project_id === b.id).length - allDocs.filter(d => d.project_id === a.id).length)
            .slice(0, 2);
          if (topArcs.length === 0 && topProjects.length === 0) return null;
          return (
            <div style={{ marginBottom: '2.8rem' }}>
              <SectionHead icon={<Folder size={22} />} label="key arcs / projects" />
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {topArcs.map(a => (
                  <Tile
                    key={a.id}
                    icon="arc"
                    label={a.name}
                    arcColor={a.color_hex}
                    badgeCount={allDocs.filter(d => d.arc_id === a.id).length}
                    tileWidth={120}
                    onClick={onGoToDocs}
                  />
                ))}
                {topProjects.map(p => {
                  const arc = p.arc_id ? arcs.find(a => a.id === p.arc_id) : null;
                  return (
                    <Tile
                      key={p.id}
                      icon="folder"
                      label={p.name}
                      arcColor={arc?.color_hex ?? null}
                      badgeCount={allDocs.filter(d => d.project_id === p.id).length}
                      tileWidth={120}
                      onClick={onGoToDocs}
                    />
                  );
                })}
              </div>
            </div>
          );
        })()}

      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
      <div style={{ padding: '2.5rem 15rem 2rem 3rem', overflowY: 'auto', scrollbarWidth: 'none' }}>

        {/* STATS */}
        <SectionHead icon={<Notes size={22} />} label="stats" />

        <div style={{ paddingLeft: '1.6rem', marginBottom: '2.2rem' }}>
          <div style={{ fontFamily: FONT, fontSize: '1.05rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.5px', lineHeight: 1.35 }}>
            <div>
              <span style={{ color: '#fff' }}>{memos.length}</span>
              {' memos'}
            </div>
            {/* Memo pool bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', margin: '3px 0 6px' }}>
              <div style={{
                flex: 1, maxWidth: 160, height: 5,
                background: 'rgba(255,255,255,0.1)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.min(pct * 100, 100)}%`,
                  background: barColor,
                  transition: 'width 0.4s ease, background 0.4s ease',
                }} />
              </div>
              <span style={{ color: barColor, fontSize: '0.9rem', letterSpacing: 0.5 }}>
                {Math.round(pct * 100)}% pool
              </span>
            </div>
            <div>
              {'total documents: '}
              <span style={{ color: '#fff' }}>{documents.length}</span>
            </div>
            <div>
              {'total words written: '}
              <span style={{ color: '#fff' }}>{totalWords.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* MEMOS - SPEAK YOUR MIND */}
        <SectionHead icon={<Laugh size={22} />} label='memos - "speak your mind"' />

        {/* Launch ghost portal */}
        {launchItem && createPortal(
          <motion.div
            initial={{ opacity: 1, scale: 1, y: 0 }}
            animate={{ opacity: 0, scale: 0.55, y: -260 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setLaunchItem(null)}
            style={{
              position: 'fixed',
              left: launchItem.x, top: launchItem.y,
              translateX: '-50%', translateY: '-50%',
              fontFamily: FONT, fontSize: '1.2rem', letterSpacing: 1,
              color: '#00c4a7',
              textShadow: '0 0 22px rgba(0,196,167,0.7)',
              pointerEvents: 'none', zIndex: 9999,
              whiteSpace: 'nowrap',
            }}
          >
            {launchItem.text}
          </motion.div>,
          document.body
        )}

        {/* Outer squish wrapper */}
        <motion.div
          ref={boxRef}
          animate={squishCtrl}
          style={{ maxWidth: 440, marginLeft: '1.6rem', marginBottom: '0.5rem' }}
        >
          {/* Inner focus/border */}
          <motion.div
            animate={{
              borderColor:     focused ? 'rgba(0,196,167,0.55)' : 'rgba(255,255,255,0.18)',
              boxShadow:       focused
                ? '0 0 0 1px rgba(0,196,167,0.2), 0 0 28px rgba(0,196,167,0.15)'
                : '0 0 0 0px rgba(0,196,167,0)',
              backgroundColor: focused ? 'rgba(0,12,10,0.96)' : 'rgba(0,0,0,0.0)',
              width:           focused ? 440 : 400,
              y:               focused ? -4 : 0,
            }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'flex', alignItems: 'stretch',
              border: '1px solid rgba(255,255,255,0.18)',
              overflow: 'hidden', position: 'relative',
            }}
          >
            {/* Keystroke pulse overlay */}
            <AnimatePresence>
              <motion.div
                key={pulseKey}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
                style={{
                  position: 'absolute', inset: -1,
                  border: '2px solid rgba(0,196,167,1)',
                  boxShadow: '0 0 18px rgba(0,196,167,0.55), inset 0 0 12px rgba(0,196,167,0.15)',
                  pointerEvents: 'none', zIndex: 10,
                }}
              />
            </AnimatePresence>

            <input
              value={input}
              onChange={e => { setInput(e.target.value); setPulseKey(k => k + 1); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="speak your mind"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: FONT, fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)',
                padding: '9px 14px', letterSpacing: 1,
              }}
            />
            <button
              onClick={handleSubmit}
              style={{
                background: 'none', border: 'none',
                borderLeft: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.4)',
                padding: '0 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                transition: 'color 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                </svg>
              </motion.div>
            </button>
          </motion.div>
        </motion.div>

        {/* Recent memos list */}
        {(() => {
          const recent = [...memos]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 3);
          if (recent.length === 0) return null;
          return (
            <div style={{ maxWidth: 440, marginLeft: '1.6rem', marginBottom: '1.6rem', marginTop: '0.4rem', display: 'flex', flexDirection: 'column' }}>
              {recent.map((memo, i) => {
                const text = (memo.content_plain ?? '').replace(/\n/g, ' ').trim();
                const label = text.length > 44 ? text.slice(0, 43) + '…' : text || '(empty)';
                const ts = fmtActivity(memo.created_at);
                return (
                  <button
                    key={memo.id}
                    onClick={() => onOpenMemo(memo)}
                    style={{
                      background: 'none', border: 'none',
                      borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                      padding: '2px 0',
                      textAlign: 'left', cursor: 'pointer',
                      fontFamily: FONT, fontSize: '0.92rem', letterSpacing: 0.4,
                      color: 'rgba(255,255,255,0.32)',
                      lineHeight: 1.2,
                      transition: 'color 0.12s',
                      display: 'flex', alignItems: 'baseline', gap: '0.7rem',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.72)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.32)')}
                  >
                    <span style={{ color: '#2255dd', flexShrink: 0, fontSize: '0.88rem' }}>{ts}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* ACTIVITY LOG */}
        <SectionHead icon={<Computer size={22} />} label="activity log" />

        <div style={{ paddingLeft: '1.6rem', display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
          {activityLog.length === 0 ? (
            <div style={{ fontFamily: FONT, fontSize: '1rem', color: 'rgba(255,255,255,0.18)', letterSpacing: 2 }}>
              no activity yet
            </div>
          ) : activityLog.map((note, i) => {
            const ts      = isCreated(note) ? note.created_at : note.updated_at;
            const label   = note.note_type === 'memo'
              ? 'memo created'
              : `${note.title ?? 'untitled'} – ${isCreated(note) ? 'created' : 'modified'}`;
            const isDoc   = note.note_type === 'document';
            const isFirst = i === 0;
            return (
              <div
                key={note.id}
                className={isFirst ? 'hub-log-latest' : undefined}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: '0.9rem',
                  fontFamily: FONT, fontSize: '1rem', letterSpacing: '0.5px',
                }}
              >
                <span className="hub-log-ts" style={{ color: '#2255dd', flexShrink: 0 }}>
                  {fmtActivity(ts)}
                </span>
                <span
                  style={{ cursor: isDoc ? 'pointer' : 'default' }}
                  onClick={() => { if (isDoc) onOpenDoc(note); }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
