import { useState, useEffect } from 'react';
import { ArrowDownDiamond } from 'pixelarticons/react';
import { loadNotes } from '../../plugins/NotesPlugin/lib/notesDb';
import type { NoteRow } from '../../plugins/NotesPlugin/lib/notesDb';
import PixelIcon from '../../plugins/NotesPlugin/components/PixelIcon';
import { useNotesStore } from '../../plugins/NotesPlugin/store/useNotesStore';
import { usePlannerStore } from '../../plugins/PlannerPlugin/store/usePlannerStore';
import usePluginStore from '../../store/usePluginStore';
import type { WidgetProps } from '../types';

const FONT   = "'VT323', monospace";
const YELLOW = '#f5c842';

// ── Doc tile ───────────────────────────────────────────────────────────────────

function DocTile({ doc, arcColor, onClick }: { doc: NoteRow; arcColor: string | null; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const tint = arcColor ? `${arcColor}a6` : 'rgba(255,255,255,0.65)';
  const title = doc.title ?? 'untitled';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        gap: 6,
        padding: '14px 8px 10px',
        background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: `1px solid ${hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
        cursor: 'pointer',
        transform: hov ? 'scale(1.05)' : 'scale(1)',
        transition: 'background 0.15s, border-color 0.15s, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        width: 52, height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: hov ? 'rotate(6deg)' : 'rotate(0deg)',
        transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <PixelIcon type="paper" size={52} hovered={hov} tintColor={tint} />
      </div>
      <span style={{
        fontFamily: FONT, fontSize: '0.95rem', letterSpacing: 0.8,
        color: hov ? '#fff' : 'rgba(255,255,255,0.85)',
        textAlign: 'center', lineHeight: 1.25,
        wordBreak: 'break-word',
        transition: 'color 0.1s',
        width: '100%',
      }}>
        {title.length > 20 ? title.slice(0, 19) + '…' : title}
      </span>
    </button>
  );
}

// ── Widget ─────────────────────────────────────────────────────────────────────

export function RecentDocs({ }: WidgetProps) {
  const [docs, setDocs] = useState<NoteRow[]>([]);
  const arcs = usePlannerStore(s => s.arcs);
  const setPendingOpenDocId = useNotesStore(s => s.setPendingOpenDocId);
  const setActivePlugin = usePluginStore(s => s.setActivePlugin);

  useEffect(() => {
    loadNotes('document').then(all => {
      setDocs(
        [...all]
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .slice(0, 4)
      );
    });
  }, []);

  function handleOpen(doc: NoteRow) {
    setPendingOpenDocId(doc.id);
    setActivePlugin('notes');
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT,
      padding: '32px 24px 10px',
      boxSizing: 'border-box',
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowDownDiamond width={18} height={18} style={{ color: YELLOW }} />
        <span style={{ fontSize: '1.05rem', letterSpacing: '2px', color: YELLOW, lineHeight: 1 }}>
          RECENTLY MODIFIED DOCS
        </span>
      </div>

      {/* Tiles */}
      {docs.length === 0 ? (
        <div style={{
          fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.15)',
        }}>
          no documents yet
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, height: 140, width: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
          {docs.map(doc => {
            const arc = doc.arc_id ? arcs.find(a => a.id === doc.arc_id) : null;
            return (
              <DocTile
                key={doc.id}
                doc={doc}
                arcColor={arc?.color_hex ?? null}
                onClick={() => handleOpen(doc)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
