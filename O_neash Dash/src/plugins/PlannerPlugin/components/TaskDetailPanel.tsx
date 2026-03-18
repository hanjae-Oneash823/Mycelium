import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { CheckboxOn, PenSquare, SkullSharp } from 'pixelarticons/react';
import type { PlannerNode, NoteHit } from '../types';
import { formatDueLabel, formatEffortLabel } from '../lib/logicEngine';
import { getLinkedNoteIds, unlinkNoteFromTask } from '../lib/noteLinks';
import { loadNotesByIds } from '../lib/noteSearch';

interface TaskDetailPanelProps {
  node: PlannerNode;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TaskDetailPanel({
  node, anchorX, anchorY, onClose, onComplete, onEdit, onDelete,
}: TaskDetailPanelProps) {
  const now         = new Date();
  const dueLabel    = formatDueLabel(node.due_at, now);
  const effortLabel = formatEffortLabel(node.estimated_duration_minutes);

  const panelRef = useRef<HTMLDivElement>(null);
  const [adjustedTop, setAdjustedTop] = useState(anchorY - 188);
  const [linkedNotes, setLinkedNotes] = useState<NoteHit[]>([]);

  const panelWidth = 280;
  const left = Math.max(8, Math.min(anchorX - panelWidth / 2, window.innerWidth - panelWidth - 8));

  // Load linked notes on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = await getLinkedNoteIds(node.id);
      const hits = await loadNotesByIds(ids);
      if (!cancelled) setLinkedNotes(hits);
    }
    load();
    return () => { cancelled = true; };
  }, [node.id]);

  // Reposition above the dot after content changes height
  useLayoutEffect(() => {
    if (panelRef.current) {
      setAdjustedTop(Math.max(8, anchorY - panelRef.current.offsetHeight - 8));
    }
  }, [linkedNotes.length, anchorY]);

  const handleUnlink = async (compositeId: string) => {
    await unlinkNoteFromTask(compositeId, node.id);
    setLinkedNotes(prev => prev.filter(n => n.compositeId !== compositeId));
  };

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left,
        top: adjustedTop,
        width: panelWidth,
        background: '#0a0a0a',
        border: '1px solid rgba(255,255,255,0.18)',
        padding: '1rem',
        zIndex: 9000,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        fontFamily: "'VT323', 'IBM Plex Mono', monospace",
        color: '#fff',
      }}
    >
      {/* Title */}
      <div style={{ fontSize: '1.3rem', letterSpacing: '2px', marginBottom: '0.5rem', color: '#fff' }}>
        {node.title}
      </div>

      {/* Recovery badge */}
      {node.is_recovery && (
        <div style={{ fontSize: '0.8rem', color: '#ff6b35', letterSpacing: '2px', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
          ⚠ recovery
        </div>
      )}

      {/* Meta chips */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        {dueLabel && (
          <span style={{ fontSize: '0.85rem', padding: '0.1rem 0.4rem', border: '1px solid rgba(255,255,255,0.2)', color: node.is_overdue ? '#ff3b3b' : 'rgba(255,255,255,0.6)', letterSpacing: '1px' }}>
            {dueLabel}
          </span>
        )}
        {effortLabel && (
          <span style={{ fontSize: '0.85rem', padding: '0.1rem 0.4rem', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', letterSpacing: '1px' }}>
            {effortLabel}
          </span>
        )}
      </div>

      {/* Groups */}
      {(node.groups?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          {node.groups!.filter(g => !g.is_ungrouped).map(g => (
            <span key={g.id} style={{ fontSize: '0.8rem', padding: '0.1rem 0.4rem', background: g.color_hex + '22', border: `1px solid ${g.color_hex}55`, color: g.color_hex, letterSpacing: '1px' }}>
              {g.name}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {node.description && (
        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.75rem', lineHeight: '1.5', letterSpacing: '0.3px' }}>
          {node.description.length > 120 ? node.description.slice(0, 120) + '…' : node.description}
        </div>
      )}

      {/* Linked notes */}
      {linkedNotes.length > 0 && (
        <div style={{ marginBottom: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.5rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            linked notes
          </div>
          {linkedNotes.map(n => (
            <div key={n.compositeId} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: n.groupColor, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: '0.85rem', color: '#c084fc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.5px' }}>
                {n.title || '(untitled)'}
              </span>
              <button onClick={() => handleUnlink(n.compositeId)} style={{ ...actionBtnStyle('rgba(255,59,59,0.6)'), padding: '0 0.3rem', fontSize: '0.75rem' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.6rem' }}>
        <button onClick={onComplete} style={{ ...actionBtnStyle('#4ade80'), display: 'flex', alignItems: 'center', gap: 4 }}><CheckboxOn size={13} /> done</button>
        <button onClick={onEdit}    style={{ ...actionBtnStyle('rgba(255,255,255,0.5)'), display: 'flex', alignItems: 'center', gap: 4 }}><PenSquare size={13} /> edit</button>
        <button onClick={onDelete}  style={{ ...actionBtnStyle('#ef4444'), display: 'flex', alignItems: 'center', gap: 4 }}><SkullSharp size={13} /> del</button>
        <button onClick={onClose}   style={{ ...actionBtnStyle('rgba(255,255,255,0.25)'), marginLeft: 'auto' }}>×</button>
      </div>
    </div>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    padding: '0.2rem 0.6rem',
    fontSize: '0.85rem',
    letterSpacing: '1px',
    textTransform: 'lowercase',
    cursor: 'pointer',
    fontFamily: "'VT323', monospace",
  };
}
