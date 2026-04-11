import { useState, useRef, useEffect } from 'react';
import type { CommentRow } from '../lib/notesDb';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const PT = "'SUSE', 'KOTRAGothic', monospace";

interface Props {
  hasSelection:    boolean;
  composing:       boolean;
  onStartCompose:  () => void;
  onSubmitComment: (body: string) => void;
  onCancelCompose: () => void;
  comments:        CommentRow[];
  activeId:        string | null;
  onDelete:        (id: string) => void;
  onUpdate:        (id: string, body: string) => void;
  onSetActive:     (id: string | null) => void;
}

export default function CommentPanel({
  hasSelection, composing,
  onStartCompose, onSubmitComment, onCancelCompose,
  comments, activeId, onDelete, onUpdate, onSetActive,
}: Props) {
  const [draft, setDraft] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (composing) {
      setDraft('');
      setTimeout(() => taRef.current?.focus(), 30);
    }
  }, [composing]);

  function submit() {
    if (!draft.trim()) return;
    onSubmitComment(draft.trim());
    setDraft('');
  }

  return (
    <div style={{
      position:      'absolute',
      right:         0,
      top:           0,
      bottom:        0,
      width:         240,
      background:    'transparent',
      display:       'flex',
      flexDirection: 'column',
      overflowY:     'auto',
      overflowX:     'hidden',
      padding:       '20px 10px 40px',
      gap:           8,
      zIndex:        10,
      scrollbarWidth: 'none',
    }}>

      {/* ── "Add comment" trigger ── */}
      {hasSelection && !composing && (
        <button
          onMouseDown={e => { e.preventDefault(); onStartCompose(); }}
          style={{
            width:         '100%',
            background:    'rgba(245,180,60,0.07)',
            border:        '1px solid rgba(245,180,60,0.28)',
            color:         'rgba(245,180,60,0.88)',
            fontFamily:    VT,
            fontSize:      '0.88rem',
            letterSpacing: 1,
            padding:       '7px 0',
            cursor:        'pointer',
            flexShrink:    0,
          }}
        >+ add comment</button>
      )}

      {/* ── Inline compose box ── */}
      {composing && (
        <div style={{
          background: '#fff',
          border:     '1px solid rgba(0,0,0,0.08)',
          borderLeft: '3px solid rgba(245,160,30,0.7)',
          padding:    '10px 10px 8px',
          flexShrink: 0,
        }}>
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              if (e.key === 'Escape') { onCancelCompose(); }
            }}
            placeholder="Add a comment…"
            rows={3}
            style={{
              width:      '100%',
              boxSizing:  'border-box',
              background: 'transparent',
              border:     'none',
              outline:    'none',
              resize:     'none',
              fontFamily: PT,
              fontSize:   '0.78rem',
              color:      '#1a1a1a',
              lineHeight: 1.55,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button
              onMouseDown={e => { e.preventDefault(); onCancelCompose(); }}
              style={{ all: 'unset', fontFamily: VT, fontSize: '0.7rem', letterSpacing: 1, color: 'rgba(0,0,0,0.3)', cursor: 'pointer' }}
            >cancel</button>
            <button
              onMouseDown={e => { e.preventDefault(); submit(); }}
              style={{ all: 'unset', fontFamily: VT, fontSize: '0.7rem', letterSpacing: 1, color: 'rgba(200,120,20,0.9)', cursor: 'pointer' }}
            >submit</button>
          </div>
        </div>
      )}

      {/* ── Comment cards ── */}
      {comments.map(c => (
        <CommentCard
          key={c.id}
          comment={c}
          isActive={c.id === activeId}
          onDelete={onDelete}
          onUpdate={onUpdate}
          onSetActive={onSetActive}
        />
      ))}
    </div>
  );
}

function CommentCard({ comment, isActive, onDelete, onUpdate, onSetActive }: {
  comment:     CommentRow;
  isActive:    boolean;
  onDelete:    (id: string) => void;
  onUpdate:    (id: string, body: string) => void;
  onSetActive: (id: string | null) => void;
}) {
  const [hov,   setHov]   = useState(false);
  const [body,  setBody]  = useState(comment.body);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Keep local body in sync if the store updates (e.g. another card reloads)
  useEffect(() => { setBody(comment.body); }, [comment.body]);

  function handleChange(val: string) {
    setBody(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onUpdate(comment.id, val), 600);
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [body]);

  return (
    <div
      onClick={() => onSetActive(isActive ? null : comment.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: isActive ? '#fffbe8' : '#f5f2ee',
        border:     `1px solid ${isActive ? 'rgba(245,180,60,0.4)' : 'rgba(0,0,0,0.07)'}`,
        borderLeft: '4px solid rgba(245,160,30,0.8)',
        padding:    '10px 12px 8px',
        cursor:     'default',
        transition: 'background 0.12s',
        flexShrink: 0,
      }}
    >
      <textarea
        ref={taRef}
        value={body}
        onChange={e => { e.stopPropagation(); handleChange(e.target.value); }}
        onClick={e => e.stopPropagation()}
        rows={1}
        style={{
          width:      '100%',
          boxSizing:  'border-box',
          display:    'block',
          background: 'transparent',
          border:     'none',
          outline:    'none',
          resize:     'none',
          overflow:   'hidden',
          fontFamily: PT,
          fontSize:   '0.85rem',
          lineHeight: 1.6,
          color:      '#1a1a1a',
          padding:    0,
          cursor:     'text',
        }}
      />
      {hov && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onMouseDown={e => { e.stopPropagation(); onDelete(comment.id); }}
            style={{ all: 'unset', fontFamily: VT, fontSize: '0.78rem', letterSpacing: 1, color: 'rgba(210,50,50,0.8)', cursor: 'pointer' }}
          >✕ delete</button>
        </div>
      )}
    </div>
  );
}
