import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { SkullSharp, Archive, Undo, BookOpen } from 'pixelarticons/react';
import { useNotesStore } from '../store/useNotesStore';
import { loadNotes } from '../lib/notesDb';
import type { NoteRow } from '../lib/notesDb';
import { ArcProjectModal } from '../components/ArcProjectModal';

// ── constants ────────────────────────────────────────────────────────────────
const MAX_MEMOS  = 50;
const CARD_W     = 192;
const CARD_H     = 264;
const ARC_RADIUS = 520;
const R          = CARD_H / 2 + ARC_RADIUS;
const ANGLE_STEP = 11;
const WINDOW     = 3;
const FONT       = "'VT323', 'HBIOS-SYS', monospace";

// ── helpers ───────────────────────────────────────────────────────────────────
const d2r = (d: number) => (d * Math.PI) / 180;

function fmtStamp(ts: string): string {
  const utc = ts.endsWith('Z') || ts.includes('+') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(utc);
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const hm  = `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  return `[${ymd}--${hm}]`;
}

function barColor(pct: number) {
  if (pct < 0.6) return '#00c4a7';
  if (pct < 0.85) return '#f5c842';
  return '#ff3b3b';
}

function memoToTipTapJson(content: string): string {
  const paragraphs = content.split('\n').map(line => ({
    type: 'paragraph',
    content: line.trim() ? [{ type: 'text', text: line }] : [],
  }));
  return JSON.stringify({ type: 'doc', content: paragraphs });
}

// ── MemoCard ──────────────────────────────────────────────────────────────────
interface CardProps {
  memo:       NoteRow;
  absIdx:     number;
  selIdx:     number;
  isEditing:  boolean;
  draft:      string;
  onDraft:    (v: string) => void;
  onClick:    () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onPromote?: () => void;
  onDelete:   () => void;
  onDblClick: () => void;
}

function MemoCard({ memo, absIdx, selIdx, isEditing, draft, onDraft, onClick, onArchive, onRestore, onPromote, onDelete, onDblClick }: CardProps) {
  const offset   = absIdx - selIdx;
  const absOff   = Math.abs(offset);
  const isSel    = offset === 0;
  const arcAngle = absIdx * ANGLE_STEP;
  const rad      = d2r(arcAngle);
  const cardLeft = R * Math.sin(rad) - CARD_W / 2;
  const cardTop  = -R * Math.cos(rad) - CARD_H / 2;

  const scale     = isSel ? 1.28 : Math.max(0.74, 1 - absOff * 0.09);
  const localXfrm = `rotate(${arcAngle}deg) scale(${scale})`;

  const brightness = isSel ? 1 : Math.max(0.28, 1 - absOff * 0.22);
  const zIndex     = 100 - absOff * 10;
  const bgL        = Math.max(78, 95 - absOff * 7);
  const bg      = isSel ? '#f0f0f0' : `hsl(0,0%,${bgL}%)`;
  const shadow  = isSel
    ? '0 12px 48px rgba(0,0,0,0.7), 0 3px 12px rgba(0,0,0,0.4)'
    : `0 ${3 + absOff * 2}px ${10 + absOff * 6}px rgba(0,0,0,${0.2 + absOff * 0.07})`;

  return (
    <div
      onClick={isSel ? undefined : onClick}
      onDoubleClick={isSel ? onDblClick : undefined}
      style={{
        position:        'absolute',
        width:           CARD_W,
        height:          CARD_H,
        left:            cardLeft,
        top:             cardTop,
        transform:       localXfrm,
        transformOrigin: 'center center',
        transition:      'transform 0.46s cubic-bezier(0.22, 1, 0.36, 1), filter 0.46s cubic-bezier(0.22, 1, 0.36, 1)',
        filter:          isSel ? 'none' : `brightness(${brightness})`,
        zIndex,
        cursor:          isSel ? 'default' : 'pointer',
        userSelect:      'none',
        background:      bg,
        boxShadow:       shadow,
        border:          '1px solid rgba(0,0,0,0.12)',
        display:         'flex',
        flexDirection:   'column',
        overflow:        'hidden',
        boxSizing:       'border-box',
      }}
    >
      {/* Timestamp — centered blue */}
      <div style={{
        fontFamily: FONT, fontSize: '1rem', color: '#2244bb',
        padding: '10px 11px 3px', letterSpacing: 0.3,
        flexShrink: 0, lineHeight: 1, textAlign: 'center',
      }}>
        {fmtStamp(memo.created_at)}
      </div>

      {/* Thin separator */}
      <div style={{ height: 1, background: 'rgba(34,68,187,0.15)', margin: '4px 10px 0' }} />

      {/* Body */}
      {isEditing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={e => onDraft(e.target.value)}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', fontFamily: FONT, fontSize: '1.2rem', color: '#111',
            padding: '8px 12px 8px', lineHeight: 1.45,
          }}
        />
      ) : (
        <div style={{
          flex: 1, fontFamily: FONT, fontSize: '1.2rem', color: '#111',
          padding: '8px 12px 8px', lineHeight: 1.45,
          overflow: 'hidden', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        }}>
          {memo.content_plain || <span style={{ color: '#bbb' }}>empty</span>}
        </div>
      )}

      {/* Action bar — always visible on selected card */}
      {isSel && (
        <div
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderTop: '1px solid rgba(0,0,0,0.09)',
            flexShrink: 0,
            background: 'rgba(0,0,0,0.05)',
          }}
        >
            {/* Left: Archive / Restore */}
            {onArchive && (
              <IconBtn
                onClick={onArchive}
                color="#777"
                title="archive"
              >
                <Archive size={15} />
              </IconBtn>
            )}
            {onRestore && (
              <IconBtn
                onClick={onRestore}
                color="#00c4a7"
                title="restore"
              >
                <Undo size={15} />
              </IconBtn>
            )}
            {!onArchive && !onRestore && <div style={{ width: 26 }} />}

            {/* Center: Turn into doc (active view only) */}
            {onPromote ? (
              <button
                onClick={e => { e.stopPropagation(); onPromote(); }}
                style={{
                  fontFamily: FONT, fontSize: '0.78rem', letterSpacing: 0.4,
                  background: 'transparent',
                  border: '1px solid #22bb77',
                  color: '#22bb77',
                  padding: '2px 7px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3,
                  transition: 'background 0.12s, color 0.12s',
                  lineHeight: 1.4,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#22bb7722';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <BookOpen size={12} />
                doc
              </button>
            ) : (
              <div style={{ width: 44 }} />
            )}

            {/* Right: Delete */}
            <IconBtn
              onClick={onDelete}
              color="#bb2222"
              title="delete"
            >
              <SkullSharp size={15} />
            </IconBtn>
        </div>
      )}
    </div>
  );
}

function IconBtn({ onClick, color, title, children }: {
  onClick: () => void;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        background: hov ? `${color}22` : 'transparent',
        border: `1px solid ${hov ? color : 'transparent'}`,
        color,
        padding: '2px 4px',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.12s, border-color 0.12s',
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

// ── AnimatedPlaceholder ───────────────────────────────────────────────────────

const PLACEHOLDER_CHARS = "speak your mind".split('');
const STAGGER           = 0.045;
const CHAR_DUR          = 0.22;
const STAGGER_TOTAL     = PLACEHOLDER_CHARS.length * STAGGER + CHAR_DUR + 0.05;

function AnimatedPlaceholder({ visible }: { visible: boolean }) {
  const [waving, setWaving] = useState(false);

  useEffect(() => {
    if (!visible) { setWaving(false); return; }
    const t = setTimeout(() => setWaving(true), STAGGER_TOTAL * 1000);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          style={{
            position: 'absolute', left: 14, top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex', pointerEvents: 'none',
            fontFamily: FONT, fontSize: '1.2rem', letterSpacing: 1,
          }}
        >
          {PLACEHOLDER_CHARS.map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={waving ? {
                y:       [0, -3, 0],
                opacity: ch === ' ' ? 0 : [0.5, 0.8, 0.5],
              } : {
                opacity: ch === ' ' ? 0 : 0.65,
                y: 0,
              }}
              transition={waving ? {
                y:       { duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09, repeatDelay: 2 },
                opacity: { duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09, repeatDelay: 2 },
              } : {
                delay: i * STAGGER, duration: CHAR_DUR, ease: 'easeOut',
              }}
              style={{ display: 'inline-block', color: 'rgba(255,255,255,0.65)' }}
            >
              {ch === ' ' ? '\u00a0' : ch}
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── MemoPool ──────────────────────────────────────────────────────────────────
interface MemoPoolProps {
  onPromoteToDoc?: (doc: NoteRow) => void;
  pendingMemoId?:  string | null;
  onMemoFocused?:  () => void;
}

export default function MemoPool({ onPromoteToDoc, pendingMemoId, onMemoFocused }: MemoPoolProps) {
  const {
    memos, archivedMemos,
    loadMemos, loadArchivedMemos,
    createMemo, updateMemo,
    archiveMemo, restoreMemo, deleteNote,
    createDocument, updateDocument, promoteToDoc,
  } = useNotesStore();
  const [view, setView] = useState<'active' | 'archived'>('active');
  const visibleMemos = view === 'active' ? memos : archivedMemos;

  const [selIdx,      setSelIdx]      = useState(0);
  const [input,       setInput]       = useState('');
  const [editId,      setEditId]      = useState<string | null>(null);
  const [draft,       setDraft]       = useState('');
  const [focused,     setFocused]     = useState(false);
  const [pulseKey,    setPulseKey]    = useState(0);
  const [launchItem,  setLaunchItem]  = useState<{ text: string; x: number; y: number } | null>(null);
  const [promoteMemo, setPromoteMemo] = useState<NoteRow | null>(null);
  const boxRef       = useRef<HTMLDivElement>(null);
  const squishCtrl   = useAnimationControls();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(560);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadMemos(); loadArchivedMemos(); }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setContainerH(e.contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (visibleMemos.length === 0) { setSelIdx(0); return; }
    setSelIdx(i => Math.min(i, visibleMemos.length - 1));
  }, [visibleMemos.length]);

  useEffect(() => {
    if (!pendingMemoId || memos.length === 0) return;
    const idx = memos.findIndex(m => m.id === pendingMemoId);
    if (idx !== -1) {
      setView('active');
      setSelIdx(idx);
      onMemoFocused?.();
    }
  }, [pendingMemoId, memos]);

  const pivotY = containerH * 0.42 + R;

  const startEdit = useCallback((id: string, content: string) => {
    setEditId(id); setDraft(content);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    updateMemo(editId, draft);
    setEditId(null);
  }, [editId, draft, updateMemo]);

  const handleDraft = (val: string) => {
    setDraft(val);
    if (!editId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => updateMemo(editId, val), 800);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft')  { setSelIdx(i => Math.max(0, i - 1)); setEditId(null); }
      if (e.key === 'ArrowRight') { setSelIdx(i => Math.min(visibleMemos.length - 1, i + 1)); setEditId(null); }
      if (e.key === 'Escape')     { commitEdit(); }
      if (e.key === 'Enter' && visibleMemos.length > 0 && !editId) {
        const m = visibleMemos[selIdx];
        if (m) startEdit(m.id, m.content_plain ?? '');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [memos, selIdx, editId, startEdit, commitEdit]);

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
    setSelIdx(0);
  };

  const handleArchive = async (id: string) => {
    commitEdit();
    await archiveMemo(id);
    setSelIdx(i => Math.max(0, i - 1));
  };

  const handleDelete = async (id: string) => {
    commitEdit();
    await deleteNote(id);
    setSelIdx(i => Math.max(0, i - 1));
  };

  const handlePromoteConfirm = async (arcId: string | null, projectId: string | null) => {
    if (!promoteMemo) return;
    const content = promoteMemo.content_plain ?? '';
    const title = content.split('\n')[0].trim().slice(0, 80) || 'Untitled';
    const contentJson = memoToTipTapJson(content);

    // Create the new document
    const newDocId = await createDocument(title, arcId, projectId);
    await updateDocument(newDocId, title, contentJson);
    // Archive the original memo
    await archiveMemo(promoteMemo.id);

    setPromoteMemo(null);
    setSelIdx(i => Math.max(0, i - 1));

    // Open the new doc in DocumentsView
    if (onPromoteToDoc) {
      const docs = await loadNotes('document');
      const newDoc = docs.find(d => d.id === newDocId) ?? null;
      if (newDoc) onPromoteToDoc(newDoc);
    }
  };

  const startIdx = Math.max(0, selIdx - WINDOW);
  const endIdx   = Math.min(visibleMemos.length - 1, selIdx + WINDOW);

  const pct    = memos.length / MAX_MEMOS;
  const bColor = barColor(pct);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}
      onClick={() => { if (editId) commitEdit(); }}
    >
      {/* ── Promote modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {promoteMemo && (
          <ArcProjectModal
            title="turn into doc"
            subtitle={`"${(promoteMemo.content_plain ?? '').split('\n')[0].trim().slice(0, 60) || 'Untitled'}"`}
            confirmLabel="create doc →"
            onConfirm={handlePromoteConfirm}
            onCancel={() => setPromoteMemo(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Storage indicator ─────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 22, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 20,
        zIndex: 200, pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        <div style={{ textAlign: 'center', lineHeight: 1 }}>
          <div style={{ fontFamily: FONT, fontSize: '2.6rem', color: '#fff', letterSpacing: 1, lineHeight: 1 }}>
            {memos.length}
          </div>
          <div style={{ fontFamily: FONT, fontSize: '1.3rem', color: 'rgba(255,255,255,0.38)', letterSpacing: 2, marginTop: 1 }}>
            memos
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 5 }}>
            memo pool storage: <span style={{ color: bColor, fontSize: '1.3rem' }}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ width: 180, height: 7, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: bColor, transition: 'width 0.4s, background 0.4s' }} />
          </div>
        </div>
      </div>

      {/* ── View toggle ───────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 110, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', zIndex: 200,
      }}>
        {(['active', 'archived'] as const).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); setSelIdx(0); setEditId(null); }}
            style={{
              fontFamily: FONT, fontSize: '0.82rem', letterSpacing: 1.5,
              background: view === v ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: `1px solid ${view === v ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
              color: view === v ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)',
              padding: '2px 14px', cursor: 'pointer', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {v === 'active' ? 'pool' : `archive${archivedMemos.length > 0 ? ` (${archivedMemos.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── Arc pivot div ─────────────────────────────────────────── */}
      <div style={{
        position:   'absolute',
        left:       '50%',
        top:        pivotY,
        width:      0,
        height:     0,
        transform:  `rotate(${-selIdx * ANGLE_STEP}deg)`,
        transition: 'transform 0.46s cubic-bezier(0.22, 1, 0.36, 1)',
        zIndex:     100,
      }}>
        {visibleMemos.slice(startIdx, endIdx + 1).map((memo, localIdx) => {
          const absIdx = startIdx + localIdx;
          return (
            <MemoCard
              key={memo.id}
              memo={memo}
              absIdx={absIdx}
              selIdx={selIdx}
              isEditing={absIdx === selIdx && editId === memo.id}
              draft={draft}
              onDraft={handleDraft}
              onClick={() => { setSelIdx(absIdx); setEditId(null); }}
              onDblClick={() => view === 'active' ? startEdit(memo.id, memo.content_plain ?? '') : undefined}
              onArchive={view === 'active' ? () => handleArchive(memo.id) : undefined}
              onRestore={view === 'archived' ? () => { restoreMemo(memo.id); setSelIdx(i => Math.max(0, i - 1)); } : undefined}
              onPromote={view === 'active' ? () => setPromoteMemo(memo) : undefined}
              onDelete={() => handleDelete(memo.id)}
            />
          );
        })}
      </div>

      {visibleMemos.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontFamily: FONT, color: 'rgba(255,255,255,0.1)', fontSize: '1.1rem', letterSpacing: 3 }}>
            {view === 'active' ? 'the pool is empty' : 'no archived memos'}
          </span>
        </div>
      )}

      {view === 'active' && (<>
      {/* ── Launch ghost ──────────────────────────────────────────── */}
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

      {/* ── Input bar ─────────────────────────────────────────────── */}
      <motion.div
        ref={boxRef}
        animate={squishCtrl}
        style={{
          position: 'absolute', bottom: 155, left: '50%',
          translateX: '-50%', zIndex: 300,
        }}
      >
      <motion.div
        animate={{
          borderColor:     focused ? 'rgba(0,196,167,0.55)' : 'rgba(255,255,255,0.2)',
          boxShadow:       focused
            ? '0 0 0 1px rgba(0,196,167,0.2), 0 0 28px rgba(0,196,167,0.15)'
            : '0 0 0 0px rgba(0,196,167,0)',
          backgroundColor: focused ? 'rgba(0,12,10,0.96)' : 'rgba(0,0,0,0.92)',
          width:           focused ? 480 : 440,
          y:               focused ? -6  : 0,
        }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: 'flex', alignItems: 'stretch',
          border: '1px solid rgba(255,255,255,0.2)',
          overflow: 'hidden',
        }}>

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

        {/* Input + animated placeholder */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <AnimatedPlaceholder visible={!focused && !input} />
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setPulseKey(k => k + 1); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder=""
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.72)', fontFamily: FONT,
              fontSize: '1.2rem', padding: '9px 14px', letterSpacing: 1, outline: 'none',
              width: '100%',
            }}
          />
        </div>

        {/* Animated arrow button */}
        <button
          onClick={handleSubmit}
          style={{
            background: 'none', border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.14)',
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
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
            </svg>
          </motion.div>
        </button>
      </motion.div>
      </motion.div>
      </>)}
    </div>
  );
}
