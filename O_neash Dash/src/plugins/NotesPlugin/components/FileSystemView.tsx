import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';
import { useNotesStore } from '../store/useNotesStore';
import type { NoteRow } from '../lib/notesDb';
import PixelIcon from './PixelIcon';
import type { IconType } from './PixelIcon';

const FONT = "'VT323', 'HBIOS-SYS', monospace";
const ICON_SIZE = 80;

// ── Tile ──────────────────────────────────────────────────────────────────────

interface TileProps {
  icon:       IconType;
  label:      string;
  arcColor?:  string | null;
  badgeCount?: number;
  isNew?:     boolean;
  onClick:    () => void;
}

function Tile({ icon, label, arcColor, badgeCount, isNew, onClick }: TileProps) {
  const [hov, setHov] = useState(false);
  const color = arcColor ?? null;
  const tint = color ? `${color}a6` : 'rgba(255,255,255,0.65)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position:   'relative',
        background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        border:     `1px solid ${hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
        boxShadow:  'none',
        cursor:     'pointer',
        padding:    '16px 14px 0',
        display:    'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        width:      140, boxSizing: 'border-box',
        transform:  hov ? 'scale(1.05)' : 'scale(1)',
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.2s, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex:     hov ? 10 : 1,
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
  onArc, onProject, onDoc, onNewDoc,
}: {
  visibleArcs:     { id: string; name: string; color_hex: string }[];
  visibleProjects: { id: string; name: string }[];
  visibleDocs:     NoteRow[];
  arcColor:        string | null;
  allDocs:         NoteRow[];
  onArc:     (id: string) => void;
  onProject: (id: string) => void;
  onDoc:     (doc: NoteRow) => void;
  onNewDoc:  () => void;
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
              <Tile key={d.id} icon="paper" label={d.title ?? 'untitled'} arcColor={arcColor} onClick={() => onDoc(d)} />
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
}

export default function FileSystemView({ onOpenDoc, onCreateDoc }: Props) {
  const { arcs, projects } = usePlannerStore();
  const { documents }      = useNotesStore();

  const [arcId,     setArcId]     = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const dirRef  = useRef(1);
  const [pageKey, setPageKey] = useState(0);

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 200px 60px' }}>
      <Breadcrumb crumbs={crumbs} arcColors={arcColors} onNav={onNav} />

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
              onDoc={onOpenDoc}
              onNewDoc={() => onCreateDoc(arcId, projectId)}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
