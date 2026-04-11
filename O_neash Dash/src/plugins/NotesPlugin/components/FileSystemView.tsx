import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';
import { useNotesStore } from '../store/useNotesStore';
import type { NoteRow } from '../lib/notesDb';
import PixelIcon from './PixelIcon';
import type { IconType } from './PixelIcon';

const FONT     = "'VT323', 'HBIOS-SYS', monospace";
const PT       = "'Inconsolata', 'IBM Plex Mono KR', monospace";
const ICON_SIZE = 80;

// ── Doc preview helpers ───────────────────────────────────────────────────────

export function extractPreviewLines(contentJson: string | null): string[] {
  if (!contentJson) return [];
  try {
    const json = JSON.parse(contentJson);
    const lines: string[] = [];
    function walk(node: any) {
      if (node.type === 'text' && node.text) return node.text;
      if (!node.content) return '';
      return node.content.map(walk).join('');
    }
    for (const node of (json.content ?? [])) {
      if (lines.length >= 12) break;
      const text = walk(node).trim();
      if (text) lines.push(text);
    }
    return lines;
  } catch { return []; }
}

export function DocPreview({ lines, title, mouse }: {
  lines:  string[];
  title:  string;
  mouse:  { x: number; y: number };
}) {
  const W   = 260;
  const GAP = 16;
  const left = mouse.x + GAP + W > window.innerWidth
    ? mouse.x - W - GAP
    : mouse.x + GAP;
  const top = Math.min(mouse.y + GAP, window.innerHeight - 320);

  return createPortal(
    <div style={{
      position: 'fixed', top, left, width: W, zIndex: 9999,
      background: '#0a0a0a',
      border: '1px solid rgba(255,255,255,0.09)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      padding: '12px 14px',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: FONT, fontSize: '1rem', letterSpacing: 1,
        color: 'rgba(255,255,255,0.7)', marginBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 6,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {title || 'untitled'}
      </div>
      {lines.length === 0 ? (
        <div style={{ fontFamily: PT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
          empty document
        </div>
      ) : lines.map((l, i) => (
        <div key={i} style={{
          fontFamily: PT, fontSize: '0.72rem', lineHeight: 1.5,
          color: 'rgba(255,255,255,0.45)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: 1,
        }}>
          {l}
        </div>
      ))}
    </div>,
    document.body
  );
}

// ── Tile ──────────────────────────────────────────────────────────────────────

interface TileProps {
  icon:         IconType;
  label:        string;
  arcColor?:    string | null;
  badgeCount?:  number;
  isNew?:       boolean;
  previewLines?: string[];
  tileWidth?:   number;
  onClick:      () => void;
  onDelete?:    () => void;
}

export function Tile({ icon, label, arcColor, badgeCount, isNew, previewLines, tileWidth, onClick, onDelete }: TileProps) {
  const [hov, setHov]           = useState(false);
  const [armed, setArmed]       = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [mouse, setMouse]       = useState({ x: 0, y: 0 });
  const btnRef   = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const color = arcColor ?? null;
  const tint = color ? `${color}a6` : 'rgba(255,255,255,0.65)';

  const handleEnter = (ev: React.MouseEvent) => {
    setHov(true);
    setMouse({ x: ev.clientX, y: ev.clientY });
    if (previewLines) {
      setShowPreview(true);
    }
  };
  const handleMove = (ev: React.MouseEvent) => {
    setMouse({ x: ev.clientX, y: ev.clientY });
  };
  const handleLeave = () => {
    setHov(false);
    setShowPreview(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', zIndex: hov ? 10 : 1 }}
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <button
        ref={btnRef}
        onClick={onClick}
        style={{
          position:   'relative',
          background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
          border:     `1px solid ${hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
          boxShadow:  'none',
          cursor:     'pointer',
          padding:    '16px 14px 0',
          display:    'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          width:      tileWidth ?? 140, boxSizing: 'border-box',
          transform:  hov ? 'scale(1.05)' : 'scale(1)',
          transition: 'background 0.15s, border-color 0.15s, box-shadow 0.2s, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Badge */}
        {!isNew && badgeCount !== undefined && badgeCount > 0 && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            fontFamily: FONT, fontSize: '0.8rem', lineHeight: 1.5,
            color:      color ?? 'rgba(255,255,255,0.5)',
            background: color ? `${color}22` : 'rgba(255,255,255,0.07)',
            border:     `1px solid ${color ?? 'rgba(255,255,255,0.12)'}`,
            padding:    '0 5px', minWidth: 18, textAlign: 'center',
          }}>
            {badgeCount}
          </div>
        )}

        {/* Icon */}
        <div style={{
          transform:  icon === 'paper' && hov ? 'rotate(6deg)' : 'rotate(0deg)',
          transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          {isNew ? (
            <div style={{
              width: ICON_SIZE, height: ICON_SIZE,
              border: '2px dashed rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: FONT, fontSize: '2.4rem', color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>+</span>
            </div>
          ) : (
            <PixelIcon type={icon} size={ICON_SIZE} hovered={hov} tintColor={tint} />
          )}
        </div>

        {/* Label */}
        <span style={{
          fontFamily:   FONT, fontSize: '1.05rem', letterSpacing: 0.8,
          color:        hov ? '#fff' : 'rgba(255,255,255,0.85)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', maxWidth: '100%', lineHeight: 1.25,
          transition: 'color 0.1s',
        }}>
          {isNew ? 'new document' : label}
        </span>
      </button>

      {/* Delete button — sibling of tile button so clicks don't open the doc */}
      {!isNew && onDelete && hov && (
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            if (armed) { onDelete(); }
            else { setArmed(true); }
          }}
          onBlur={() => setArmed(false)}
          style={{
            position:   'absolute', top: 6, right: 6,
            fontFamily: FONT, fontSize: '0.72rem', letterSpacing: 0.5,
            background: armed ? 'rgba(200,40,40,0.18)' : 'rgba(0,0,0,0.5)',
            border:     `1px solid ${armed ? 'rgba(200,40,40,0.5)' : 'rgba(255,255,255,0.12)'}`,
            color:      armed ? '#e05555' : 'rgba(255,255,255,0.4)',
            cursor:     'pointer',
            padding:    '1px 6px',
            transition: 'all 0.12s',
            zIndex:     20,
            whiteSpace: 'nowrap',
          }}
        >
          {armed ? 'sure?' : '✕'}
        </button>
      )}

      {showPreview && previewLines && (
        <DocPreview lines={previewLines} title={label} mouse={mouse} />
      )}
    </div>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

interface Crumb { label: string; arcId: string | null; projectId: string | null }

function Breadcrumb({
  crumbs, arcColors, onNav,
}: {
  crumbs:    Crumb[];
  arcColors: Record<string, string>;
  onNav:     (c: Crumb, idx: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 0 24px', fontFamily: FONT, fontSize: '1rem', flexShrink: 0 }}>
      {crumbs.map((c, i) => {
        const isLast    = i === crumbs.length - 1;
        const dotColor  = c.arcId ? arcColors[c.arcId] : null;
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>}
            {dotColor && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: dotColor, display: 'inline-block', flexShrink: 0,
                opacity: isLast ? 1 : 0.5,
              }} />
            )}
            <button
              onClick={() => onNav(c, i)}
              style={{
                background: 'none', border: 'none',
                cursor:     isLast ? 'default' : 'pointer',
                fontFamily: FONT, fontSize: '1rem', letterSpacing: 1, padding: 0,
                color:      isLast ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.38)',
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => { if (!isLast) e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
              onMouseLeave={e => { if (!isLast) e.currentTarget.style.color = 'rgba(255,255,255,0.38)'; }}
            >
              {c.label.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ── Recent docs ───────────────────────────────────────────────────────────────

const RECENT_KEY = 'notes-recent-docs';
const MAX_RECENT = 8;

function loadRecentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}
function pushRecentId(id: string) {
  const next = [id, ...loadRecentIds().filter(x => x !== id)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function RecentTray({
  recentDocs, arcs, projects, onOpen,
}: {
  recentDocs: NoteRow[];
  arcs:       { id: string; name: string; color_hex: string }[];
  projects:   { id: string; name: string; arc_id?: string | null }[];
  onOpen:     (doc: NoteRow) => void;
}) {
  if (recentDocs.length === 0) return null;

  return (
    <div style={{ marginBottom: 24, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: FONT, fontSize: '1.2rem', letterSpacing: 3, color: 'rgba(255,255,255,0.22)' }}>
          RECENT
        </div>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
        {recentDocs.map(doc => {
          const arc     = doc.arc_id     ? arcs.find(a => a.id === doc.arc_id)         : null;
          const project = doc.project_id ? projects.find(p => p.id === doc.project_id) : null;
          const color   = arc?.color_hex ?? null;
          return (
            <RecentCard key={doc.id} doc={doc} arc={arc ?? null} project={project ?? null} color={color} onOpen={onOpen} />
          );
        })}
      </div>
    </div>
  );
}

function RecentCard({ doc, arc, project, color, onOpen }: {
  doc:     NoteRow;
  arc:     { name: string; color_hex: string } | null;
  project: { name: string } | null;
  color:   string | null;
  onOpen:  (doc: NoteRow) => void;
}) {
  const [hov, setHov] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(false);
  const previewLines = extractPreviewLines(doc.content_json ?? null);

  return (
    <>
      <button
        onClick={() => onOpen(doc)}
        onMouseEnter={e => { setHov(true); setMouse({ x: e.clientX, y: e.clientY }); setShowPreview(true); }}
        onMouseMove={e => setMouse({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => { setHov(false); setShowPreview(false); }}
        style={{
          flexShrink:  0,
          width:       180,
          background:  hov ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
          border:      `1px solid ${hov ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
          padding:     '10px 12px',
          cursor:      'pointer',
          textAlign:   'left',
          transition:  'background 0.12s, border-color 0.12s',
          boxSizing:   'border-box',
        }}
      >
        <div style={{
          fontFamily:   FONT, fontSize: '1rem', letterSpacing: 0.5,
          color:        hov ? '#fff' : 'rgba(255,255,255,0.8)',
          whiteSpace:   'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: 5, lineHeight: 1.2,
          transition:   'color 0.1s',
        }}>
          {doc.title || 'untitled'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {arc && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: arc.color_hex,
              color: '#fff',
              fontFamily: FONT, fontSize: '0.65rem', letterSpacing: 1.5,
              padding: '1px 6px 1px 4px',
              textTransform: 'uppercase', flexShrink: 0,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', flexShrink: 0 }} />
              {arc.name}
            </span>
          )}
          {project && (
            <span style={{
              fontFamily: FONT, fontSize: '0.65rem', letterSpacing: 1,
              color: 'rgba(255,255,255,0.3)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textTransform: 'uppercase',
            }}>
              {project.name}
            </span>
          )}
        </div>
      </button>
      {showPreview && (
        <DocPreview lines={previewLines} title={doc.title ?? 'untitled'} mouse={mouse} />
      )}
    </>
  );
}

// ── Slide variants ────────────────────────────────────────────────────────────

const variants = {
  enter:  (dir: number) => ({ x: dir > 0 ? '16%' : '-16%', opacity: 0 }),
  center: ()            => ({ x: 0, opacity: 1 }),
  exit:   (dir: number) => ({ x: dir > 0 ? '-16%' : '16%', opacity: 0 }),
};
const transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 }}>
      <div style={{ fontFamily: FONT, fontSize: '1.2rem', letterSpacing: 3, color: 'rgba(255,255,255,0.22)' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );
}

// ── Page content ──────────────────────────────────────────────────────────────

function PageContent({
  visibleArcs, visibleProjects, visibleDocs,
  arcColor, allDocs,
  onArc, onProject, onDoc, onNewDoc, onDeleteDoc,
}: {
  visibleArcs:     { id: string; name: string; color_hex: string }[];
  visibleProjects: { id: string; name: string }[];
  visibleDocs:     NoteRow[];
  arcColor:        string | null;
  allDocs:         NoteRow[];
  onArc:       (id: string) => void;
  onProject:   (id: string) => void;
  onDoc:       (doc: NoteRow) => void;
  onNewDoc:    () => void;
  onDeleteDoc: (id: string) => void;
}) {
  const empty = !visibleArcs.length && !visibleProjects.length && !visibleDocs.length;

  return (
    <div style={{ overflowY: 'auto', scrollbarWidth: 'none', flex: 1 }}>
      {empty && (
        <div style={{ fontFamily: FONT, color: 'rgba(255,255,255,0.15)', fontSize: '1rem', letterSpacing: 2 }}>
          nothing here
        </div>
      )}

      {visibleArcs.length > 0 && (
        <>
          <SectionLabel label="arcs" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
            {visibleArcs.map(a => (
              <Tile
                key={a.id} icon="arc" label={a.name} arcColor={a.color_hex}
                badgeCount={allDocs.filter(d => d.arc_id === a.id).length}
                onClick={() => onArc(a.id)}
              />
            ))}
          </div>
        </>
      )}

      {visibleProjects.length > 0 && (
        <>
          <SectionLabel label="projects" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
            {visibleProjects.map(p => (
              <Tile
                key={p.id} icon="folder" label={p.name} arcColor={arcColor}
                badgeCount={allDocs.filter(d => d.project_id === p.id).length}
                onClick={() => onProject(p.id)}
              />
            ))}
          </div>
        </>
      )}

      {(visibleDocs.length > 0 || true) && (
        <>
          <SectionLabel label="documents" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
            {visibleDocs.map(d => (
              <Tile key={d.id} icon="paper" label={d.title ?? 'untitled'} arcColor={arcColor}
                previewLines={extractPreviewLines(d.content_json ?? null)}
                onClick={() => onDoc(d)}
                onDelete={() => onDeleteDoc(d.id)} />
            ))}
            <Tile icon="paper" label="new document" isNew onClick={onNewDoc} />
          </div>
        </>
      )}
    </div>
  );
}

// ── FileSystemView ────────────────────────────────────────────────────────────

interface Props {
  onOpenDoc:   (doc: NoteRow) => void;
  onCreateDoc: (arcId: string | null, projectId: string | null) => void;
  onDeleteDoc: (id: string) => void;
}

export default function FileSystemView({ onOpenDoc, onCreateDoc, onDeleteDoc }: Props) {
  const { arcs, projects } = usePlannerStore();
  const { documents }      = useNotesStore();

  const [arcId,     setArcId]     = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>(loadRecentIds);
  const dirRef  = useRef(1);
  const [pageKey, setPageKey] = useState(0);

  const handleOpenDoc = (doc: NoteRow) => {
    pushRecentId(doc.id);
    setRecentIds(loadRecentIds());
    onOpenDoc(doc);
  };

  const navigate = (newArcId: string | null, newProjectId: string | null, dir: 1 | -1) => {
    dirRef.current = dir;
    setArcId(newArcId);
    setProjectId(newProjectId);
    setPageKey(k => k + 1);
  };

  // Breadcrumb
  const crumbs: Crumb[] = [{ label: 'all', arcId: null, projectId: null }];
  if (arcId)     crumbs.push({ label: arcs.find(a => a.id === arcId)?.name ?? arcId, arcId, projectId: null });
  if (projectId) crumbs.push({ label: projects.find(p => p.id === projectId)?.name ?? projectId, arcId, projectId });

  const arcColors = Object.fromEntries(arcs.map(a => [a.id, a.color_hex]));
  const currentArcColor = arcId ? (arcColors[arcId] ?? null) : null;

  const onNav = (c: Crumb, idx: number) => {
    if (idx === crumbs.length - 1) return;
    navigate(c.arcId, c.projectId, -1);
  };

  // Visible items
  const visibleArcs     = !arcId ? arcs : [];
  const visibleProjects = !projectId ? projects.filter(p => arcId ? p.arc_id === arcId : !p.arc_id) : [];
  const visibleDocs     = documents.filter(d => {
    if (projectId) return d.project_id === projectId;
    if (arcId)     return d.arc_id === arcId && !d.project_id;
    return !d.arc_id;
  });

  const recentDocs = recentIds
    .map(id => documents.find(d => d.id === id))
    .filter((d): d is NoteRow => !!d);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 200px 60px' }}>
      <Breadcrumb crumbs={crumbs} arcColors={arcColors} onNav={onNav} />
      <RecentTray recentDocs={recentDocs} arcs={arcs} projects={projects} onOpen={handleOpenDoc} />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="popLayout" custom={dirRef.current}>
          <motion.div
            key={pageKey}
            custom={dirRef.current}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
          >
            <PageContent
              visibleArcs={visibleArcs}
              visibleProjects={visibleProjects}
              visibleDocs={visibleDocs}
              arcColor={currentArcColor}
              allDocs={documents}
              onArc={id  => navigate(id, null, 1)}
              onProject={id => navigate(arcId, id, 1)}
              onDoc={handleOpenDoc}
              onNewDoc={() => onCreateDoc(arcId, projectId)}
              onDeleteDoc={onDeleteDoc}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
