import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotesStore } from '../store/useNotesStore';
import type { NoteRow } from '../lib/notesDb';

// ── constants ────────────────────────────────────────────────────────────────
const MAX_MEMOS  = 50;
const CARD_W     = 192;
const CARD_H     = 264;
const ARC_RADIUS = 520;                    // px from card bottom to arc pivot
const R          = CARD_H / 2 + ARC_RADIUS; // 392px — pivot centre to card centre
const ANGLE_STEP = 11;                     // degrees between adjacent cards
const WINDOW     = 3;                      // cards visible each side of centre
const FONT       = "'VT323', 'HBIOS-SYS', monospace";

// ── helpers ───────────────────────────────────────────────────────────────────
const d2r = (d: number) => (d * Math.PI) / 180;

function fmtStamp(ts: string): string {
  const d = new Date(ts);
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const hm  = `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  return `[${ymd}--${hm}]`;
}

function barColor(pct: number) {
  if (pct < 0.6) return '#00c4a7';
  if (pct < 0.85) return '#f5c842';
  return '#ff3b3b';
}

// ── MemoCard ──────────────────────────────────────────────────────────────────
// Cards live inside the pivot div. `absIdx` is the card's permanent position on
// the arc; the pivot div's rotation is what moves them relative to screen centre.
interface CardProps {
  memo:       NoteRow;
  absIdx:     number;   // permanent arc slot
  selIdx:     number;   // which slot is currently centred
  isEditing:  boolean;
  draft:      string;
  onDraft:    (v: string) => void;
  onClick:    () => void;
  onArchive:  () => void;
  onDelete:   () => void;
  onDblClick: () => void;
}

function MemoCard({ memo, absIdx, selIdx, isEditing, draft, onDraft, onClick, onArchive, onDelete, onDblClick }: CardProps) {
  const offset   = absIdx - selIdx;
  const absOff   = Math.abs(offset);
  const isSel    = offset === 0;

  // Fixed position on the arc inside the pivot div.
  // The pivot div's rotation brings this slot to centre.
  const arcAngle = absIdx * ANGLE_STEP;         // degrees
  const rad      = d2r(arcAngle);
  const cardLeft = R * Math.sin(rad) - CARD_W / 2;
  const cardTop  = -R * Math.cos(rad) - CARD_H / 2;

  // Local transform: tilt tangent to arc + depth scale.
  // NO translation here — position comes entirely from left/top above.
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
        filter:  isSel ? 'none' : `brightness(${brightness})`,
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
      {/* Timestamp */}
      <div style={{
        fontFamily: FONT, fontSize: '0.85rem', color: '#2244bb',
        padding: '9px 11px 4px', letterSpacing: 0.3, flexShrink: 0, lineHeight: 1,
      }}>
        {fmtStamp(memo.created_at)}
      </div>

      {/* Body */}
      {isEditing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={e => onDraft(e.target.value)}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', fontFamily: FONT, fontSize: '1.05rem', color: '#111',
            padding: '5px 11px 8px', lineHeight: 1.45,
          }}
        />
      ) : (
        <div style={{
          flex: 1, fontFamily: FONT, fontSize: '1.05rem', color: '#111',
          padding: '5px 11px 8px', lineHeight: 1.45,
          overflow: 'hidden', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        }}>
          {memo.content_plain || <span style={{ color: '#bbb' }}>empty</span>}
        </div>
      )}

      {/* Actions — centre card only */}
      {isSel && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 4,
          padding: '5px 8px', borderTop: '1px solid rgba(0,0,0,0.09)',
          flexShrink: 0, background: 'rgba(0,0,0,0.04)',
        }}>
          <SmallBtn label="archive" onClick={onArchive} color="#555" />
          <SmallBtn label="delete"  onClick={onDelete}  color="#bb2222" />
        </div>
      )}
    </div>
  );
}

function SmallBtn({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: FONT, fontSize: '0.82rem',
        background: hov ? color : 'transparent',
        border: `1px solid ${color}`,
        color: hov ? '#fff' : color,
        padding: '1px 8px', cursor: 'pointer', letterSpacing: 0.5,
        transition: 'background 0.12s, color 0.12s', lineHeight: 1.5,
      }}
    >
      {label}
    </button>
  );
}

// ── MemoPool ──────────────────────────────────────────────────────────────────
export default function MemoPool() {
  const { memos, loadMemos, createMemo, updateMemo, archiveMemo, deleteNote } = useNotesStore();

  const [selIdx,  setSelIdx]  = useState(0);
  const [input,   setInput]   = useState('');
  const [editId,  setEditId]  = useState<string | null>(null);
  const [draft,   setDraft]   = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(560);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadMemos(); }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setContainerH(e.contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (memos.length === 0) { setSelIdx(0); return; }
    setSelIdx(i => Math.min(i, memos.length - 1));
  }, [memos.length]);

  // Pivot is placed so the centre card appears at 42% down the container.
  // All cards live at fixed arc positions inside the pivot div;
  // only the pivot's rotation changes when selection changes.
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
      if (e.key === 'ArrowRight') { setSelIdx(i => Math.min(memos.length - 1, i + 1)); setEditId(null); }
      if (e.key === 'Escape')     { commitEdit(); }
      if (e.key === 'Enter' && memos.length > 0 && !editId) {
        const m = memos[selIdx];
        if (m) startEdit(m.id, m.content_plain ?? '');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [memos, selIdx, editId, startEdit, commitEdit]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;
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

  // Only mount cards within the visible window
  const startIdx = Math.max(0, selIdx - WINDOW);
  const endIdx   = Math.min(memos.length - 1, selIdx + WINDOW);

  const pct    = memos.length / MAX_MEMOS;
  const bColor = barColor(pct);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}
      onClick={() => { if (editId) commitEdit(); }}
    >
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
          <div style={{ fontFamily: FONT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.38)', letterSpacing: 2, marginTop: 1 }}>
            memos
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 5 }}>
            memo pool storage: <span style={{ color: bColor }}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ width: 180, height: 7, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: bColor, transition: 'width 0.4s, background 0.4s' }} />
          </div>
        </div>
      </div>

      {/* ── Arc pivot div ─────────────────────────────────────────────
          Sits at the mathematical centre of the arc circle.
          Its rotation = -selIdx * ANGLE_STEP, bringing card[selIdx] to 0°.
          When selection changes, only this one transform value animates,
          and every card sweeps along the arc in unison.         ──── */}
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
        {memos.slice(startIdx, endIdx + 1).map((memo, localIdx) => {
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
              onDblClick={() => startEdit(memo.id, memo.content_plain ?? '')}
              onArchive={() => handleArchive(memo.id)}
              onDelete={() => handleDelete(memo.id)}
            />
          );
        })}
      </div>

      {memos.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontFamily: FONT, color: 'rgba(255,255,255,0.1)', fontSize: '1.1rem', letterSpacing: 3 }}>
            the pool is empty
          </span>
        </div>
      )}

      {/* ── Input bar ─────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'stretch',
        width: 440,
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(0,0,0,0.92)',
        zIndex: 300,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="speak your mind"
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.72)', fontFamily: FONT,
            fontSize: '1.2rem', padding: '9px 14px', letterSpacing: 1, outline: 'none',
          }}
        />
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
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
