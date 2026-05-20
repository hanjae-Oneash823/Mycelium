import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFloatingEditorStore } from '../store/useFloatingEditorStore';
import TypewriterEditor from '../plugins/NotesPlugin/components/TypewriterEditor';
import { getNoteById, updateNote } from '../plugins/NotesPlugin/lib/notesDb';
import type { NoteRow } from '../plugins/NotesPlugin/lib/notesDb';

const VT = "'VT323', monospace";

// ── Note Pill (terminal line style) ──────────────────────────────────────────

function NotePill({ note, onRestore, onClose }: {
  note: NoteRow | undefined;
  onRestore: () => void;
  onClose: () => void;
}) {
  const [hov, setHov] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center',
        cursor: 'pointer', userSelect: 'none',
        padding: '1px 0',
      }}
    >
      {/* › prefix */}
      <span style={{
        fontFamily: VT, fontSize: '0.96rem', letterSpacing: 1,
        color: '#00c4a7', marginRight: 7, flexShrink: 0,
        transition: 'opacity 0.12s',
        opacity: hov ? 1 : 0.7,
      }}>›</span>

      {/* Title */}
      <span
        onClick={onRestore}
        style={{
          fontFamily: VT, fontSize: '0.96rem', letterSpacing: 1,
          color: hov ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.38)',
          transition: 'color 0.14s',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 180,
        }}
      >
        {note?.title || 'untitled'}
      </span>

      {/* Blinking cursor on hover */}
      <AnimatePresence>
        {hov && (
          <motion.span
            key="cursor"
            initial={{ opacity: 0 }}
            animate={{ opacity: [1, 0, 1] }}
            exit={{ opacity: 0 }}
            transition={{ repeat: Infinity, duration: 0.85, ease: 'linear' }}
            style={{
              fontFamily: VT, fontSize: '0.96rem',
              color: 'rgba(255,255,255,0.45)',
              marginLeft: 3, flexShrink: 0,
            }}
          >
            _
          </motion.span>
        )}
      </AnimatePresence>

      {/* Close */}
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        style={{
          background: 'transparent', border: 'none',
          color: hov ? 'rgba(248,113,113,0.8)' : 'rgba(255,255,255,0.18)',
          cursor: 'pointer',
          fontFamily: VT, fontSize: '1.1rem',
          padding: '4px 0 4px 16px',
          lineHeight: 1, flexShrink: 0,
          transition: 'color 0.14s',
        }}
        onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.color = '#f87171'; }}
        onMouseLeave={e => { e.currentTarget.style.color = hov ? 'rgba(248,113,113,0.8)' : 'rgba(255,255,255,0.18)'; }}
      >
        ✕
      </button>
    </motion.div>
  );
}

// ── Main FloatingEditor ───────────────────────────────────────────────────────

export function FloatingEditor() {
  const { docs, poolVisible, minimizeDoc, restoreDoc, closeDoc } = useFloatingEditorStore();
  const [noteRows, setNoteRows] = useState<Record<string, NoteRow>>({});

  const docIdsKey = docs.map(d => d.docId).join(',');

  useEffect(() => {
    docs.forEach(({ docId }) => {
      if (noteRows[docId]) return;
      getNoteById(docId).then(note => {
        if (note) setNoteRows(prev => ({ ...prev, [docId]: note }));
      });
    });
  }, [docIdsKey]);

  const handleSave = useCallback(async (docId: string, title: string, json: string) => {
    await updateNote(docId, { title, content_json: json });
    setNoteRows(prev =>
      prev[docId] ? { ...prev, [docId]: { ...prev[docId], title, content_json: json } } : prev,
    );
  }, []);

  const openEntry = docs.find(d => d.state === 'open');
  const minimizedDocs = docs.filter(d => d.state === 'minimized');

  return createPortal(
    <>
      {/* ── Full overlay ── */}
      <AnimatePresence>
        {openEntry && noteRows[openEntry.docId] && (
          <motion.div
            key={openEntry.docId}
            exit={{ transition: { duration: 0.38 } }}
            style={{
              position: 'fixed', inset: 0, zIndex: 5000,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            }}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeIn' } }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              onClick={() => minimizeDoc(openEntry.docId)}
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(3px)',
              }}
            />

            {/* Close button */}
            <button
              onClick={() => closeDoc(openEntry.docId)}
              style={{
                position: 'fixed', top: 18, right: 18, zIndex: 5010,
                fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1.5,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.28)',
                padding: '3px 12px', cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#f87171';
                e.currentTarget.style.borderColor = 'rgba(248,113,113,0.35)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.28)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              ✕ close
            </button>

            <div style={{
              position: 'fixed', top: 22, left: '50%', transform: 'translateX(-50%)',
              zIndex: 5010,
              fontFamily: VT, fontSize: '0.78rem', letterSpacing: 2,
              color: 'rgba(255,255,255,0.18)',
              pointerEvents: 'none',
            }}>
              click backdrop or ← back to hide
            </div>

            {/* Editor panel */}
            <motion.div
              initial={{ clipPath: 'inset(0 0 100% 0)' }}
              animate={{ clipPath: 'inset(0 0 0% 0)' }}
              exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
              transition={{ delay: 0.12, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'relative', zIndex: 5001,
                width: '85vw', height: '100vh',
                maxWidth: 1100,
              }}>
              <TypewriterEditor
                doc={noteRows[openEntry.docId]}
                onSave={(title, json) => handleSave(openEntry.docId, title, json)}
                onBack={() => minimizeDoc(openEntry.docId)}
                hideOutline
                hideCommentPanel
                transparentBg
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pill tray ── */}
      <AnimatePresence>
        {poolVisible && minimizedDocs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              zIndex: 4000,
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              alignItems: 'flex-end',
            }}
          >
            {minimizedDocs.map(({ docId }) => (
              <NotePill
                key={docId}
                note={noteRows[docId]}
                onRestore={() => restoreDoc(docId)}
                onClose={() => closeDoc(docId)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
