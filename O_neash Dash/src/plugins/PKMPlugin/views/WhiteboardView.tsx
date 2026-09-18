import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Link as LinkIcon } from 'pixelarticons/react';
import {
  loadWhiteboards, createWhiteboard, loadWhiteboardCards, loadWhiteboardEdges,
  placeCardOnWhiteboard, updateCardPlacement, removeCardFromWhiteboard,
  addManualEdge, createCard, loadCards,
  type PkmWhiteboard, type WhiteboardCardPlacement, type WhiteboardEdge, type PkmCard,
} from '../lib/pkmDb';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#f59e0b';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

interface WhiteboardViewProps {
  onOpenCard: (id: string) => void;
}

export default function WhiteboardView({ onOpenCard }: WhiteboardViewProps) {
  const [whiteboards, setWhiteboards] = useState<PkmWhiteboard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cards, setCards] = useState<WhiteboardCardPlacement[]>([]);
  const [edges, setEdges] = useState<WhiteboardEdge[]>([]);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allCards, setAllCards] = useState<PkmCard[]>([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const camera = useRef({ scale: 1, x: 0, y: 0 });
  const panState = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const dragState = useRef<{ cardId: string; startX: number; startY: number; origX: number; origY: number; liveX: number; liveY: number } | null>(null);

  const applyTransform = () => {
    if (!worldRef.current) return;
    const { scale, x, y } = camera.current;
    worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };

  // ── Load whiteboards ─────────────────────────────────────────────────────────
  useEffect(() => { loadWhiteboards().then(rows => { setWhiteboards(rows); if (rows[0]) setActiveId(rows[0].id); }); }, []);

  const refreshBoard = useCallback((id: string) => {
    loadWhiteboardCards(id).then(setCards);
    loadWhiteboardEdges(id).then(setEdges);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    camera.current = { scale: 1, x: 0, y: 0 };
    applyTransform();
    refreshBoard(activeId);
  }, [activeId, refreshBoard]);

  const handleNewWhiteboard = async () => {
    const name = `Whiteboard ${whiteboards.length + 1}`;
    const id = await createWhiteboard(name);
    const rows = await loadWhiteboards();
    setWhiteboards(rows);
    setActiveId(id);
  };

  // ── Card picker (add existing card to this board) ─────────────────────────────
  const openPicker = () => {
    loadCards().then(setAllCards);
    setPickerOpen(true);
  };

  const handlePlaceExisting = async (cardId: string) => {
    if (!activeId) return;
    await placeCardOnWhiteboard(activeId, cardId, { x: 60 - camera.current.x, y: 60 - camera.current.y });
    setPickerOpen(false);
    refreshBoard(activeId);
  };

  const handleNewCardOnBoard = async () => {
    if (!activeId) return;
    const id = await createCard({ title: '' });
    await placeCardOnWhiteboard(activeId, id, { x: 60 - camera.current.x, y: 60 - camera.current.y });
    refreshBoard(activeId);
  };

  // ── Pan / zoom ─────────────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = viewportRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.92 : 1.09;
    const cam = camera.current;
    const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.scale * delta));
    cam.x = mx - (mx - cam.x) * (newScale / cam.scale);
    cam.y = my - (my - cam.y) * (newScale / cam.scale);
    cam.scale = newScale;
    applyTransform();
  };

  const onViewportMouseDown = (e: React.MouseEvent) => {
    if (e.target !== viewportRef.current && e.target !== worldRef.current) return;
    panState.current = { sx: e.clientX, sy: e.clientY, ox: camera.current.x, oy: camera.current.y };
  };

  const onCardMouseDown = (e: React.MouseEvent, card: WhiteboardCardPlacement) => {
    if (linkMode) {
      e.stopPropagation();
      if (!linkFrom) { setLinkFrom(card.card_id); }
      else if (linkFrom !== card.card_id && activeId) {
        addManualEdge(activeId, linkFrom, card.card_id).then(() => refreshBoard(activeId));
        setLinkFrom(null);
      }
      return;
    }
    e.stopPropagation();
    dragState.current = { cardId: card.card_id, startX: e.clientX, startY: e.clientY, origX: card.x, origY: card.y, liveX: card.x, liveY: card.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragState.current) {
      const drag = dragState.current;
      const scale = camera.current.scale;
      const nx = drag.origX + (e.clientX - drag.startX) / scale;
      const ny = drag.origY + (e.clientY - drag.startY) / scale;
      const el = worldRef.current?.querySelector<HTMLElement>(`[data-card-id="${drag.cardId}"]`);
      if (el) { el.style.left = `${nx}px`; el.style.top = `${ny}px`; }
      drag.liveX = nx;
      drag.liveY = ny;
      return;
    }
    if (panState.current) {
      const { sx, sy, ox, oy } = panState.current;
      camera.current.x = ox + (e.clientX - sx);
      camera.current.y = oy + (e.clientY - sy);
      applyTransform();
    }
  };

  const onMouseUp = () => {
    if (dragState.current && activeId) {
      const { cardId, liveX, liveY } = dragState.current;
      updateCardPlacement(activeId, cardId, { x: liveX, y: liveY }).then(() => refreshBoard(activeId));
    }
    dragState.current = null;
    panState.current = null;
  };

  const cardById = new Map(cards.map(c => [c.card_id, c]));

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', flexDirection: 'column', color: '#fff', overflow: 'hidden' }}>
      {/* Header — whiteboard tabs */}
      <div style={{ padding: '16px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {whiteboards.map(wb => (
          <button
            key={wb.id}
            onClick={() => setActiveId(wb.id)}
            style={{
              fontFamily: VT, fontSize: '0.88rem', letterSpacing: 0.5,
              padding: '5px 12px',
              background: wb.id === activeId ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${wb.id === activeId ? ACC : 'rgba(255,255,255,0.1)'}`,
              color: wb.id === activeId ? ACC : 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
            }}
          >
            {wb.name}
          </button>
        ))}
        <button onClick={handleNewWhiteboard} title="new whiteboard" style={{
          background: 'none', border: '1px dashed rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.4)', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}>
          <Plus width={14} height={14} />
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => { setLinkMode(m => !m); setLinkFrom(null); }}
            title="link cards"
            style={{
              fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1,
              background: linkMode ? 'rgba(245,158,11,0.15)' : 'none',
              border: `1px solid ${linkMode ? ACC : 'rgba(255,255,255,0.15)'}`,
              color: linkMode ? ACC : 'rgba(255,255,255,0.5)',
              padding: '5px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <LinkIcon width={14} height={14} /> {linkMode ? (linkFrom ? 'pick target…' : 'pick source…') : 'link'}
          </button>
          <button onClick={openPicker} style={{
            fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1,
            background: 'none', border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.5)', padding: '5px 10px', cursor: 'pointer',
          }}>
            add existing
          </button>
          <button onClick={handleNewCardOnBoard} style={{
            fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1,
            background: `${ACC}18`, border: `1px solid ${ACC}55`,
            color: ACC, padding: '5px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Plus width={14} height={14} /> new card
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={viewportRef}
        onWheel={onWheel}
        onMouseDown={onViewportMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'default' }}
      >
        <div ref={worldRef} style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0' }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
            {edges.map(edge => {
              const a = cardById.get(edge.from_card_id);
              const b = cardById.get(edge.to_card_id);
              if (!a || !b) return null;
              const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
              const bx = b.x + b.width / 2, by = b.y + b.height / 2;
              return (
                <line
                  key={`${edge.from_card_id}-${edge.to_card_id}`}
                  x1={ax} y1={ay} x2={bx} y2={by}
                  stroke={edge.kind === 'wiki' ? 'rgba(0,196,167,0.5)' : 'rgba(245,158,11,0.6)'}
                  strokeWidth={edge.kind === 'wiki' ? 1.4 : 1.8}
                  strokeDasharray={edge.kind === 'wiki' ? '4 3' : undefined}
                />
              );
            })}
          </svg>

          {cards.map(card => (
            <div
              key={card.card_id}
              data-card-id={card.card_id}
              onMouseDown={e => onCardMouseDown(e, card)}
              onDoubleClick={() => onOpenCard(card.card_id)}
              style={{
                position: 'absolute', left: card.x, top: card.y, width: card.width, height: card.height,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${linkFrom === card.card_id ? ACC : card.color_hex ?? 'rgba(255,255,255,0.15)'}`,
                padding: '10px 12px', cursor: linkMode ? 'crosshair' : 'grab',
                display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: VT, fontSize: '0.92rem', color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.title || 'untitled'}
                </span>
                <span
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => activeId && removeCardFromWhiteboard(activeId, card.card_id).then(() => refreshBoard(activeId))}
                  title="remove from whiteboard"
                  style={{ color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  ×
                </span>
              </div>
              <div style={{
                fontFamily: VT, fontSize: '0.76rem', color: 'rgba(255,255,255,0.35)',
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const,
              }}>
                {card.content_plain ?? ''}
              </div>
            </div>
          ))}
        </div>

        {whiteboards.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12, color: 'rgba(255,255,255,0.15)',
          }}>
            <div style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 0.5 }}>no whiteboards yet</div>
            <button onClick={handleNewWhiteboard} style={{
              fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1,
              background: `${ACC}18`, border: `1px solid ${ACC}55`, color: ACC,
              padding: '6px 16px', cursor: 'pointer',
            }}>
              + create one
            </button>
          </div>
        )}
      </div>

      {/* Add-existing-card picker */}
      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            width: 360, maxHeight: '60vh', overflowY: 'auto',
            background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.15)', padding: 14,
          }}>
            <div style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 10, textTransform: 'uppercase' }}>
              add card to whiteboard
            </div>
            {allCards.filter(c => !cardById.has(c.id)).map(c => (
              <button
                key={c.id}
                onClick={() => handlePlaceExisting(c.id)}
                style={{
                  all: 'unset', display: 'block', width: '100%', cursor: 'pointer',
                  fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)',
                  padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {c.title || 'untitled'}
              </button>
            ))}
            {allCards.filter(c => !cardById.has(c.id)).length === 0 && (
              <div style={{ fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.2)' }}>
                every card is already on this whiteboard
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
