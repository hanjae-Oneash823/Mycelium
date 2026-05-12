import { useState } from "react";
import type { WorkBlock, PlacedNode, DragAction } from "../types";

const VT = "'VT323', 'HBIOS-SYS', monospace";
const LABEL_H = 18; // px — top label strip height

function fmtMin(m: number) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${period}`;
}

interface Props {
  block: WorkBlock;
  placements: PlacedNode[];
  pxPerMin: number;
  visibleStart: number;
  activeDrag: DragAction;
  onBodyMouseDown: (e: React.MouseEvent, block: WorkBlock) => void;
  onStartEdgeMouseDown: (e: React.MouseEvent, blockId: string) => void;
  onEndEdgeMouseDown: (e: React.MouseEvent, blockId: string) => void;
  onDeletePlacement: (id: string) => void;
  onDeleteBlock: (id: string) => void;
}

export default function WorkBlockEl({
  block, placements, pxPerMin, visibleStart,
  activeDrag, onBodyMouseDown, onStartEdgeMouseDown, onEndEdgeMouseDown,
  onDeletePlacement, onDeleteBlock,
}: Props) {
  const [hovDel, setHovDel] = useState(false);
  const [hov, setHov] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const left  = (block.start_time - visibleStart) * pxPerMin;
  const width = Math.max(6, (block.end_time - block.start_time) * pxPerMin);
  const color = block.location?.color ?? "#4a4a4a";
  const label = block.location?.name ?? "—";

  const ghostNode = activeDrag?.type === "place-node" && activeDrag.blockId === block.id
    ? activeDrag : null;

  return (
    <div
      style={{
        position: "absolute",
        left, width,
        top: 5, bottom: 5,
        background: color,
        opacity: 0.82,
        border: "1px solid rgba(0,0,0,0.7)",
        cursor: "grab",
        userSelect: "none",
      }}
      onMouseDown={e => onBodyMouseDown(e, block)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      {/* Left resize handle — invisible, just cursor */}
      <div
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize", zIndex: 2 }}
        onMouseDown={e => { e.stopPropagation(); onStartEdgeMouseDown(e, block.id); }}
      />
      {/* Right resize handle */}
      <div
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize", zIndex: 2 }}
        onMouseDown={e => { e.stopPropagation(); onEndEdgeMouseDown(e, block.id); }}
      />

      {/* Label strip */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: LABEL_H,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 6px",
        background: "rgba(255,255,255,0.15)",
      }}>
        <span style={{
          fontFamily: VT, fontSize: "0.85rem", color: "rgba(255,255,255,0.9)",
          letterSpacing: 1, lineHeight: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {label}{placements.length > 0 ? `  ·  ${placements.length}` : ""}
        </span>
        <button
          onMouseEnter={() => setHovDel(true)}
          onMouseLeave={() => setHovDel(false)}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDeleteBlock(block.id); }}
          style={{
            all: "unset", cursor: "pointer", flexShrink: 0,
            color: hovDel ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
            fontSize: 12, lineHeight: 1, padding: "0 1px",
            transition: "color 0.1s",
          }}
        >×</button>
      </div>

      {/* Body: placed node bars */}
      <div style={{ position: "absolute", top: LABEL_H, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        {placements.map(p => {
          const dur = p.duration_override ?? p.estimated_duration_minutes ?? 60;
          return (
            <NodeBar
              key={p.id}
              placement={p}
              dur={dur}
              pxPerMin={pxPerMin}
              onDelete={onDeletePlacement}
            />
          );
        })}

        {/* Ghost node during placement drag */}
        {ghostNode && (
          <div style={{
            position: "absolute",
            left:   ghostNode.startOffset * pxPerMin,
            width:  Math.max(2, (ghostNode.currentEndOffset - ghostNode.startOffset) * pxPerMin),
            top: 0, bottom: 0,
            background: "rgba(0,0,0,0.25)",
            borderLeft: "1px dashed rgba(255,255,255,0.5)",
            pointerEvents: "none",
          }} />
        )}
      </div>

      {/* Hover tooltip — fixed so it escapes overflow:hidden parents */}
      {hov && (
        <div
          style={{
            position: "fixed",
            left: mousePos.x + 14,
            top: mousePos.y - 56,
            background: "rgba(10,10,10,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            padding: "5px 9px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 9999,
            fontFamily: VT,
            fontSize: "0.82rem",
            color: "rgba(255,255,255,0.85)",
            lineHeight: 1.5,
            letterSpacing: 0.5,
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ color: color, marginBottom: 2 }}>{label}</div>
          <div>{fmtMin(block.start_time)} – {fmtMin(block.end_time)}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.75rem" }}>
            {block.end_time - block.start_time}min
            {placements.length > 0 ? `  ·  ${placements.length} node${placements.length !== 1 ? "s" : ""}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeBar({ placement, dur, pxPerMin, onDelete }: {
  placement: PlacedNode;
  dur: number;
  pxPerMin: number;
  onDelete: (id: string) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "absolute",
        left:  placement.start_offset * pxPerMin,
        width: Math.max(2, dur * pxPerMin),
        top: 0, bottom: 0,
        background: hov ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.32)",
        border: "1px solid rgba(0,0,0,0.7)",
        borderLeft: `2px solid rgba(255,255,255,${hov ? "0.5" : "0.25"})`,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        transition: "background 0.1s, border-color 0.1s",
      }}
      title={`${placement.node_title}${placement.arc_name ? ` · ${placement.arc_name}` : ""}\n${dur}min`}
    >
      {hov && (
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(placement.id); }}
          style={{ all: "unset", cursor: "pointer", color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "0 3px", lineHeight: 1 }}
        >×</button>
      )}
    </div>
  );
}
