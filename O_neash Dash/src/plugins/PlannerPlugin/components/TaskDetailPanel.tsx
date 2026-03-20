import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CheckboxOn, PenSquare, SkullSharp } from 'pixelarticons/react';
import type { PlannerNode, NoteHit } from '../types';
import { formatDueLabel, formatEffortLabel } from '../lib/logicEngine';
import { getLinkedNoteIds, unlinkNoteFromTask } from '../lib/noteLinks';
import { loadNotesByIds } from '../lib/noteSearch';

interface TaskDetailPanelProps {
  node:       PlannerNode;
  anchorX:    number;
  anchorY:    number;
  onClose:    () => void;
  onComplete: () => void;
  onEdit:     () => void;
  onDelete:   () => void;
}

const DIVIDER: CSSProperties = { borderTop: '1px solid rgba(255,255,255,0.07)', margin: '8px 0' };
const KEY:     CSSProperties = { color: 'rgba(255,255,255,0.28)', minWidth: 52, textAlign: 'right', flexShrink: 0, fontSize: '0.9rem' };
const VAL:     CSSProperties = { color: 'rgba(255,255,255,0.70)', fontSize: '0.95rem' };
const ROW:     CSSProperties = { display: 'flex', gap: 10, alignItems: 'baseline', letterSpacing: '0.4px' };

export default function TaskDetailPanel({
  node, anchorX, anchorY, onClose, onComplete, onEdit, onDelete,
}: TaskDetailPanelProps) {
  const panelRef    = useRef<HTMLDivElement>(null);
  const now         = new Date();
  const dueLabel    = formatDueLabel(node.due_at, now);
  const whenLabel   = formatDueLabel(node.planned_start_at, now);
  const effortLabel = formatEffortLabel(node.estimated_duration_minutes);

  const [linkedNotes, setLinkedNotes] = useState<NoteHit[]>([]);
  const [top, setTop]                 = useState(anchorY - 220);

  const w    = 300;
  const left = Math.max(8, Math.min(anchorX - w / 2, window.innerWidth - w - 8));

  const visibleGroups = node.groups?.filter(g => !g.is_ungrouped) ?? [];

  useEffect(() => {
    let cancelled = false;
    getLinkedNoteIds(node.id)
      .then(ids => loadNotesByIds(ids))
      .then(hits => { if (!cancelled) setLinkedNotes(hits); });
    return () => { cancelled = true; };
  }, [node.id]);

  useLayoutEffect(() => {
    if (panelRef.current) {
      setTop(Math.max(8, anchorY - panelRef.current.offsetHeight - 12));
    }
  }, [linkedNotes.length, anchorY]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside — delayed to avoid closing on the opening click
  useEffect(() => {
    let handler: ((e: MouseEvent) => void) | null = null;
    const t = setTimeout(() => {
      handler = (e: MouseEvent) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handler, true);
    }, 150);
    return () => {
      clearTimeout(t);
      if (handler) document.removeEventListener('mousedown', handler, true);
    };
  }, [onClose]);

  const handleUnlink = async (compositeId: string) => {
    await unlinkNoteFromTask(compositeId, node.id);
    setLinkedNotes(prev => prev.filter(n => n.compositeId !== compositeId));
  };

  return createPortal(
    <div
      ref={panelRef}
      onClick={e => e.stopPropagation()}
      style={{
        position:   'fixed',
        left,
        top,
        width:      w,
        background: '#080808',
        border:     '1px solid rgba(255,255,255,0.14)',
        padding:    '12px 14px 10px',
        zIndex:     9001,
        boxShadow:  '0 8px 40px rgba(0,0,0,0.92)',
        fontFamily: "'VT323', 'IBM Plex Mono', monospace",
        color:      '#fff',
      }}
    >
      {/* Title */}
      <div style={{ fontSize: '1.35rem', letterSpacing: '0.8px', lineHeight: 1.15, marginBottom: 8 }}>
        &gt;&nbsp;{node.title}
      </div>

      <div style={DIVIDER} />

      {/* Meta rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {whenLabel && (
          <div style={ROW}>
            <span style={KEY}>when</span>
            <span style={VAL}>{whenLabel}</span>
          </div>
        )}
        {dueLabel && (
          <div style={ROW}>
            <span style={KEY}>due</span>
            <span style={{ ...VAL, color: node.is_overdue ? '#ff3b3b' : 'rgba(255,255,255,0.70)' }}>
              {dueLabel}
            </span>
          </div>
        )}
        {effortLabel && (
          <div style={ROW}>
            <span style={KEY}>effort</span>
            <span style={VAL}>{effortLabel}</span>
          </div>
        )}
        {visibleGroups.length > 0 && (
          <div style={ROW}>
            <span style={KEY}>groups</span>
            <span style={{ ...VAL, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {visibleGroups.map(g => (
                <span key={g.id} style={{ color: g.color_hex }}>{g.name}</span>
              ))}
            </span>
          </div>
        )}
        {node.is_recovery && (
          <div style={ROW}>
            <span style={KEY}>&nbsp;</span>
            <span style={{ ...VAL, color: '#ff6b35' }}>⚠ recovery</span>
          </div>
        )}
        {node.is_missed_schedule && (
          <div style={ROW}>
            <span style={KEY}>&nbsp;</span>
            <span style={{ ...VAL, color: '#f5c842' }}>! missed schedule</span>
          </div>
        )}
      </div>

      {/* Description */}
      {node.description && (
        <>
          <div style={DIVIDER} />
          <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.42)', lineHeight: 1.55, letterSpacing: '0.3px' }}>
            {node.description.length > 160 ? node.description.slice(0, 160) + '…' : node.description}
          </div>
        </>
      )}

      {/* Linked notes */}
      {linkedNotes.length > 0 && (
        <>
          <div style={DIVIDER} />
          {linkedNotes.map(n => (
            <div key={n.compositeId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: n.groupColor, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: '0.88rem', color: '#c084fc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.title || '(untitled)'}
              </span>
              <button
                onClick={() => handleUnlink(n.compositeId)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.28)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '1rem', padding: '0 2px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}

      <div style={DIVIDER} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1.4rem', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={onComplete} style={actionBtn('#4ade80')}>
          <CheckboxOn size={13} style={{ verticalAlign: 'middle', marginRight: 4, marginBottom: 2 }} />
          done
        </button>
        <button onClick={onEdit} style={actionBtn('rgba(255,255,255,0.50)')}>
          <PenSquare size={13} style={{ verticalAlign: 'middle', marginRight: 4, marginBottom: 2 }} />
          edit
        </button>
        <button onClick={onDelete} style={actionBtn('#ff3b3b')}>
          <SkullSharp size={13} style={{ verticalAlign: 'middle', marginRight: 4, marginBottom: 2 }} />
          del
        </button>
      </div>
    </div>,
    document.body,
  );
}

function actionBtn(color: string): CSSProperties {
  return {
    background:    'none',
    border:        'none',
    color,
    cursor:        'pointer',
    fontFamily:    "'VT323', monospace",
    fontSize:      '1.05rem',
    letterSpacing: '1px',
    padding:       0,
    display:       'inline-flex',
    alignItems:    'center',
  };
}
