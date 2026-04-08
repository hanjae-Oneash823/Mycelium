import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';

const FONT = "'VT323', 'HBIOS-SYS', monospace";

export function Chip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: FONT, fontSize: '0.82rem', letterSpacing: 0.5,
        background: active ? `${color}22` : 'transparent',
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
        color: active ? color : 'rgba(255,255,255,0.38)',
        padding: '2px 10px', cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}

export function ModalBtn({ label, onClick, color, solid }: { label: string; onClick: () => void; color: string; solid?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: FONT, fontSize: '0.88rem', letterSpacing: 0.5,
        background: solid ? (hov ? color : `${color}22`) : 'transparent',
        border: `1px solid ${color}`,
        color: solid ? (hov ? '#000' : color) : color,
        padding: '4px 16px', cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}

interface ArcProjectModalProps {
  title:     string;
  subtitle?: string;
  confirmLabel?: string;
  onConfirm: (arcId: string | null, projectId: string | null) => void;
  onCancel:  () => void;
}

export function ArcProjectModal({ title, subtitle, confirmLabel = 'create doc →', onConfirm, onCancel }: ArcProjectModalProps) {
  const { arcs, projects, loadAll } = usePlannerStore();
  const [selArc,     setSelArc]     = useState<string | null>(null);
  const [selProject, setSelProject] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const filteredProjects = selArc ? projects.filter(p => p.arc_id === selArc) : projects;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1,    y: 0,  opacity: 1 }}
        exit={{    scale: 0.92, y: 16, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '28px 32px 24px',
          minWidth: 380, maxWidth: 480,
          fontFamily: FONT,
        }}
      >
        <div style={{ fontSize: '1.5rem', color: '#fff', letterSpacing: 1, marginBottom: subtitle ? 6 : 22 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5, marginBottom: 22 }}>
            {subtitle}
          </div>
        )}

        {/* Arc picker */}
        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5, marginBottom: 8 }}>
          ARC
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          <Chip label="none" active={selArc === null} color="rgba(255,255,255,0.22)"
            onClick={() => { setSelArc(null); setSelProject(null); }} />
          {arcs.map(arc => (
            <Chip key={arc.id} label={arc.name} active={selArc === arc.id} color={arc.color_hex}
              onClick={() => { setSelArc(arc.id); setSelProject(null); }} />
          ))}
        </div>

        {/* Project picker */}
        {selArc ? (
          <>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5, marginBottom: 8 }}>
              PROJECT
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
              <Chip label="none" active={selProject === null} color="rgba(255,255,255,0.22)"
                onClick={() => setSelProject(null)} />
              {filteredProjects.map(p => (
                <Chip key={p.id} label={p.name} active={selProject === p.id} color="rgba(255,255,255,0.5)"
                  onClick={() => setSelProject(p.id)} />
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.18)', letterSpacing: 0.5, marginBottom: 28 }}>
            select an arc to assign a project
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <ModalBtn label="cancel" onClick={onCancel} color="rgba(255,255,255,0.3)" />
          <ModalBtn label={confirmLabel} onClick={() => onConfirm(selArc, selProject)} color="#22bb77" solid />
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
