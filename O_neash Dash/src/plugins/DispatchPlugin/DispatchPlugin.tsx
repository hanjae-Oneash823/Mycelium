// cspell:ignore pixelarticons HBIOS dispatch
import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { useDispatchStore } from "./store/useDispatchStore";
import WorkBlockEl from "./components/WorkBlockEl";
import NodePool from "./components/NodePool";
import type { DragAction, PendingBlock, WorkBlock, PoolNode, DispatchLocation } from "./types";

// ── Design tokens ────────────────────────────────────────────────────────────
const VT  = "'VT323', 'HBIOS-SYS', monospace";
const ACC = "#00c4a7";
const PX  = "160px";

// ── Timeline constants ────────────────────────────────────────────────────────
const TIMELINE_END  = 1440;  // midnight
const RULER_H       = 36;
const BODY_H        = 100;
const MIN_BLOCK_DUR = 15;
const MIN_PLACE_DUR = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function shiftDate(d: string, delta: number): string {
  const date = new Date(d + "T12:00:00");
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

function formatDateDisplay(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  }).toUpperCase();
}

function currentTimeMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function formatHour(min: number): string {
  const h = Math.floor(min / 60);
  if (h === 0)  return "12A";
  if (h < 12)   return `${h}A`;
  if (h === 12) return "12P";
  return `${h - 12}P`;
}

function eventToMin(plannedStartAt: string): number {
  if (plannedStartAt.length > 10) {
    const d = new Date(plannedStartAt);
    return d.getHours() * 60 + d.getMinutes();
  }
  return 0;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HeaderBtn({
  label, onClick, accent,
}: { label: string; onClick: () => void; accent?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all: "unset",
        fontFamily: VT,
        fontSize: "0.95rem",
        letterSpacing: 2,
        textTransform: "uppercase",
        color: accent
          ? hov ? "#fff" : ACC
          : hov ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)",
        border: `1px solid ${
          accent
            ? hov ? "rgba(0,196,167,0.7)" : "rgba(0,196,167,0.4)"
            : hov ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)"
        }`,
        padding: "4px 14px",
        cursor: "pointer",
        transition: "color 0.1s, border-color 0.1s",
      }}
    >
      {label}
    </button>
  );
}

function NavArrowBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        all: "unset",
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        color: hov ? "#fff" : "rgba(255,255,255,0.35)",
        transition: "color 0.1s",
        padding: "0 4px",
      }}
    >
      {children}
    </button>
  );
}

// ── Location prompt ───────────────────────────────────────────────────────────

function LocationPromptOverlay({
  locations, screenX, onConfirm, onSkip, onCancel,
}: {
  locations: DispatchLocation[];
  screenX: number;
  onConfirm: (name: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = val
    ? locations.filter(l => l.name.toLowerCase().includes(val.toLowerCase()))
    : locations;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && val.trim()) onConfirm(val.trim());
    if (e.key === "Escape") onCancel();
  };

  const safeLeft = Math.min(Math.max(10, screenX - 110), window.innerWidth - 260);

  return (
    <div
      style={{
        position: "fixed",
        top: "44%",
        left: safeLeft,
        zIndex: 200,
        background: "#0d0d0d",
        border: "1px solid rgba(255,255,255,0.2)",
        padding: "8px 10px",
        display: "flex",
        gap: 8,
        alignItems: "center",
        fontFamily: VT,
        boxShadow: "0 4px 24px rgba(0,0,0,0.9)",
      }}
    >
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={handleKey}
          placeholder="location..."
          style={{
            background: "#000",
            border: `1px solid ${val ? ACC : "rgba(255,255,255,0.25)"}`,
            color: "#fff",
            fontFamily: VT,
            fontSize: "1rem",
            letterSpacing: 1,
            padding: "3px 8px",
            width: 170,
            outline: "none",
            transition: "border-color 0.1s",
          }}
        />
        {filtered.length > 0 && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#111",
            border: "1px solid rgba(255,255,255,0.15)",
            borderTop: "none",
            maxHeight: 130,
            overflowY: "auto",
            zIndex: 201,
          }}>
            {filtered.slice(0, 6).map(l => (
              <div
                key={l.id}
                onMouseDown={e => { e.preventDefault(); onConfirm(l.name); }}
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontFamily: VT,
                  fontSize: "0.9rem",
                  letterSpacing: 1,
                  color: "rgba(255,255,255,0.7)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#1a1a1a")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ width: 8, height: 8, background: l.color, display: "inline-block", flexShrink: 0 }} />
                {l.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <HeaderBtn label="skip" onClick={onSkip} />
      <HeaderBtn label="✕" onClick={onCancel} />
    </div>
  );
}

// ── Main plugin ───────────────────────────────────────────────────────────────

export default function DispatchPlugin() {
  const store = useDispatchStore();
  const scrollRef    = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<DragAction>(null);
  const storeRef     = useRef(store);
  const vsRef        = useRef(540); // visibleStart ref
  const pxPerMinRef  = useRef(2);   // dynamic px-per-minute

  const [drag, setDrag]                   = useState<DragAction>(null);
  const [pendingBlock, setPendingBlock]   = useState<PendingBlock>(null);
  const [selectedPoolNode, setSelectedPoolNode] = useState<string | null>(null);
  const [showEarlyHours, setShowEarlyHours]     = useState(false);
  const [nowMin, setNowMin]               = useState(currentTimeMin());
  const [pxPerMin, setPxPerMin]           = useState(2);

  const selectedPoolNodeRef = useRef<string | null>(null);

  const visibleStart = showEarlyHours ? 0 : 540;
  const isToday      = store.selectedDate === todayStr();

  // Keep refs in sync
  useEffect(() => { storeRef.current = store; }, [store]);
  useEffect(() => { vsRef.current = visibleStart; }, [visibleStart]);
  useEffect(() => { selectedPoolNodeRef.current = selectedPoolNode; }, [selectedPoolNode]);

  // Measure container → compute pxPerMin so timeline exactly fills width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) {
        const ppm = w / (TIMELINE_END - vsRef.current);
        pxPerMinRef.current = ppm;
        setPxPerMin(ppm);
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Recompute when visibleStart changes (early-hours toggle)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0) {
      const ppm = w / (TIMELINE_END - visibleStart);
      pxPerMinRef.current = ppm;
      setPxPerMin(ppm);
    }
  }, [visibleStart]);

  // Load on date change
  useEffect(() => { store.reload(); }, [store.selectedDate]);

  // Now indicator tick
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMin(currentTimeMin()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // clientX → minutes on timeline
  const clientXToMin = useCallback((clientX: number): number => {
    const scroll = scrollRef.current;
    if (!scroll) return 0;
    const rect = scroll.getBoundingClientRect();
    const x = clientX - rect.left;
    return vsRef.current + x / pxPerMinRef.current;
  }, []);

  const snap = (min: number) => Math.round(min / 5) * 5;

  const checkOverlap = useCallback((start: number, end: number, excludeId?: string): boolean => {
    const { workBlocks, eventNodes } = storeRef.current;
    return (
      workBlocks.some(wb => wb.id !== excludeId && wb.start_time < end && wb.end_time > start) ||
      eventNodes.some(e => {
        if (!e.planned_start_at) return false;
        const es = eventToMin(e.planned_start_at);
        const ee = es + (e.estimated_duration_minutes ?? 60);
        return es < end && ee > start;
      })
    );
  }, []);

  // ── Mouse down handlers ─────────────────────────────────────────────────────

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (selectedPoolNodeRef.current) { setSelectedPoolNode(null); return; }
    const snapped = snap(clientXToMin(e.clientX));
    const d: DragAction = { type: "create", startMin: snapped, currentMin: snapped };
    dragRef.current = d;
    setDrag(d);
  }, [clientXToMin]);

  const handleBlockBodyMouseDown = useCallback((e: React.MouseEvent, block: WorkBlock) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rawMin = clientXToMin(e.clientX);
    if (selectedPoolNodeRef.current) {
      const startOffset = snap(Math.max(0, rawMin - block.start_time));
      const d: DragAction = {
        type: "place-node", blockId: block.id,
        nodeId: selectedPoolNodeRef.current, startOffset,
        currentEndOffset: startOffset + 60,
      };
      dragRef.current = d;
      setDrag(d);
    } else {
      const d: DragAction = { type: "move-block", blockId: block.id, grabOffsetMin: rawMin - block.start_time, currentStart: block.start_time };
      dragRef.current = d;
      setDrag(d);
    }
  }, [clientXToMin]);

  const handleStartEdgeMouseDown = useCallback((e: React.MouseEvent, blockId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const block = storeRef.current.workBlocks.find(b => b.id === blockId);
    if (!block) return;
    const d: DragAction = { type: "resize-start", blockId, currentStart: block.start_time };
    dragRef.current = d;
    setDrag(d);
  }, []);

  const handleEndEdgeMouseDown = useCallback((e: React.MouseEvent, blockId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const block = storeRef.current.workBlocks.find(b => b.id === blockId);
    if (!block) return;
    const d: DragAction = { type: "resize-end", blockId, currentEnd: block.end_time };
    dragRef.current = d;
    setDrag(d);
  }, []);

  // ── Window-level drag handlers ──────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const snapped = snap(clientXToMin(e.clientX));
      const blocks  = storeRef.current.workBlocks;

      if (d.type === "create") {
        const u = { ...d, currentMin: Math.min(snapped, TIMELINE_END) };
        dragRef.current = u; setDrag({ ...u });

      } else if (d.type === "move-block") {
        const block = blocks.find(b => b.id === d.blockId);
        if (!block) return;
        const dur = block.end_time - block.start_time;
        let ns = snap(snapped - d.grabOffsetMin);
        ns = Math.max(0, Math.min(TIMELINE_END - dur, ns));
        if (!checkOverlap(ns, ns + dur, d.blockId)) {
          const u = { ...d, currentStart: ns };
          dragRef.current = u; setDrag({ ...u });
        }

      } else if (d.type === "resize-start") {
        const block = blocks.find(b => b.id === d.blockId);
        if (!block) return;
        let ns = snap(snapped);
        ns = Math.max(0, Math.min(block.end_time - MIN_BLOCK_DUR, ns));
        if (!checkOverlap(ns, block.end_time, d.blockId)) {
          const u = { ...d, currentStart: ns };
          dragRef.current = u; setDrag({ ...u });
        }

      } else if (d.type === "resize-end") {
        const block = blocks.find(b => b.id === d.blockId);
        if (!block) return;
        let ne = snap(snapped);
        ne = Math.max(block.start_time + MIN_BLOCK_DUR, Math.min(TIMELINE_END, ne));
        if (!checkOverlap(block.start_time, ne, d.blockId)) {
          const u = { ...d, currentEnd: ne };
          dragRef.current = u; setDrag({ ...u });
        }

      } else if (d.type === "place-node") {
        const block = blocks.find(b => b.id === d.blockId);
        if (!block) return;
        const maxEnd = block.end_time - block.start_time;
        const newEnd = Math.max(d.startOffset + MIN_PLACE_DUR, Math.min(maxEnd, snap(snapped - block.start_time)));
        const u = { ...d, currentEndOffset: newEnd };
        dragRef.current = u; setDrag({ ...u });
      }
    };

    const onUp = async (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDrag(null);
      const s = storeRef.current;

      if (d.type === "create") {
        const start = Math.min(d.startMin, d.currentMin);
        const end   = Math.max(d.startMin, d.currentMin);
        if (end - start >= MIN_BLOCK_DUR && !checkOverlap(start, end)) {
          setPendingBlock({ startMin: start, endMin: end, screenX: e.clientX });
        }
      } else if (d.type === "move-block") {
        const block = s.workBlocks.find(b => b.id === d.blockId);
        if (!block) return;
        await s.moveWorkBlock(d.blockId, d.currentStart, d.currentStart + (block.end_time - block.start_time));
      } else if (d.type === "resize-start") {
        const block = s.workBlocks.find(b => b.id === d.blockId);
        if (!block) return;
        await s.moveWorkBlock(d.blockId, d.currentStart, block.end_time);
      } else if (d.type === "resize-end") {
        const block = s.workBlocks.find(b => b.id === d.blockId);
        if (!block) return;
        await s.moveWorkBlock(d.blockId, block.start_time, d.currentEnd);
      } else if (d.type === "place-node") {
        const dur = Math.max(MIN_PLACE_DUR, d.currentEndOffset - d.startOffset);
        await s.createPlacement(d.blockId, d.nodeId, d.startOffset, dur);
        setSelectedPoolNode(null);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [clientXToMin, checkOverlap]);

  // ── Derived display values ─────────────────────────────────────────────────

  const getBlockDisplay = (wb: WorkBlock) => {
    if (drag?.type === "move-block"    && drag.blockId === wb.id) { const d = wb.end_time - wb.start_time; return { start: drag.currentStart, end: drag.currentStart + d }; }
    if (drag?.type === "resize-start"  && drag.blockId === wb.id) return { start: drag.currentStart, end: wb.end_time };
    if (drag?.type === "resize-end"    && drag.blockId === wb.id) return { start: wb.start_time, end: drag.currentEnd };
    return { start: wb.start_time, end: wb.end_time };
  };

  const placedNodeIds    = new Set(store.placements.map(p => p.node_id));
  const visiblePoolNodes = store.poolNodes.filter(n => !placedNodeIds.has(n.id));

  const hourTicks: number[] = [];
  for (let m = visibleStart; m <= TIMELINE_END; m += 60) hourTicks.push(m);
  const halfTicks: number[] = [];
  for (let m = visibleStart + 30; m < TIMELINE_END; m += 60) halfTicks.push(m);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", height: "100%", background: "#000", display: "flex", flexDirection: "column", color: "#fff", overflow: "hidden" }}>

      {/* blink + scrollbar hide */}
      <style>{`
        @keyframes dp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dp-timeline-scroll { scrollbar-width: none; }
        .dp-timeline-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: `112px ${PX} 0`, flexShrink: 0 }}>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontFamily: VT, fontSize: "2rem", letterSpacing: 5, color: ACC, textTransform: "uppercase", lineHeight: 1 }}>
            dispatch
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {selectedPoolNode && (
              <span style={{ fontFamily: VT, fontSize: "0.9rem", color: ACC, letterSpacing: 2, animation: "dp-blink 1.2s step-end infinite" }}>
                click + drag inside a block
              </span>
            )}
            <HeaderBtn label={showEarlyHours ? "9a ►" : "◄ 12a"} onClick={() => setShowEarlyHours(v => !v)} />
            {!isToday && <HeaderBtn label="today" onClick={() => store.setDate(todayStr())} accent />}
          </div>
        </div>

        {/* Date navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
          <NavArrowBtn onClick={() => store.setDate(shiftDate(store.selectedDate, -1))}>
            <ChevronLeft width={18} height={18} />
          </NavArrowBtn>
          <span style={{ fontFamily: VT, fontSize: "2.6rem", letterSpacing: "3px", color: "#fff", textTransform: "uppercase", lineHeight: 1, minWidth: 260 }}>
            {formatDateDisplay(store.selectedDate)}
          </span>
          <NavArrowBtn onClick={() => store.setDate(shiftDate(store.selectedDate, 1))}>
            <ChevronRight width={18} height={18} />
          </NavArrowBtn>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ marginTop: 28, flexShrink: 0 }}>
        <div style={{ padding: `0 ${PX}` }}>

          {/* Ruler — sits above the bordered box */}
          <div style={{ height: RULER_H, position: "relative", overflow: "visible", marginBottom: 6 }}>
            {hourTicks.map(min => (
              <div key={min} style={{ position: "absolute", left: (min - visibleStart) * pxPerMin, top: 0 }}>
                <div style={{ width: 2, height: 8, background: "rgba(255,255,255,0.35)" }} />
                <span style={{ fontFamily: VT, fontSize: 16, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", display: "block", marginTop: 2, letterSpacing: 1 }}>
                  {formatHour(min)}
                </span>
              </div>
            ))}
            {halfTicks.map(min => (
              <div key={min} style={{ position: "absolute", left: (min - visibleStart) * pxPerMin, top: 0 }}>
                <div style={{ width: 1, height: 5, background: "rgba(255,255,255,0.18)" }} />
              </div>
            ))}
          </div>

        <div
          ref={scrollRef}
          className="dp-timeline-scroll"
          style={{ overflowX: "hidden", overflowY: "hidden", cursor: "crosshair", userSelect: "none", border: "2px solid rgba(255,255,255,0.22)" }}
          onMouseDown={handleTimelineMouseDown}
        >
          <div style={{ width: "100%", position: "relative" }}>

            {/* Work area */}
            <div style={{ height: BODY_H, position: "relative", background: "#000" }}>

              {/* Event blocks */}
              {store.eventNodes.map((e: PoolNode) => {
                if (!e.planned_start_at) return null;
                const evMin = eventToMin(e.planned_start_at);
                const dur   = e.estimated_duration_minutes ?? 60;
                if (evMin + dur <= visibleStart || evMin >= TIMELINE_END) return null;
                const evColor = e.arc_color ?? "rgba(120,120,120,0.6)";
                return (
                  <div key={e.id} style={{
                    position: "absolute",
                    left:   (Math.max(evMin, visibleStart) - visibleStart) * pxPerMin,
                    width:  Math.max(2, dur * pxPerMin),
                    top: 8, bottom: 8,
                    background: evColor,
                    opacity: 0.85,
                    border: "1px solid rgba(0,0,0,0.7)",
                    pointerEvents: "none",
                  }} />
                );
              })}

              {/* Work blocks */}
              {store.workBlocks.map(wb => {
                const { start, end } = getBlockDisplay(wb);
                return (
                  <WorkBlockEl
                    key={wb.id}
                    block={{ ...wb, start_time: start, end_time: end }}
                    placements={store.placements.filter(p => p.work_block_id === wb.id)}
                    pxPerMin={pxPerMin}
                    visibleStart={visibleStart}
                    activeDrag={drag}
                    onBodyMouseDown={handleBlockBodyMouseDown}
                    onStartEdgeMouseDown={handleStartEdgeMouseDown}
                    onEndEdgeMouseDown={handleEndEdgeMouseDown}
                    onDeletePlacement={store.deletePlacement}
                    onDeleteBlock={store.deleteWorkBlock}
                  />
                );
              })}

              {/* Ghost block */}
              {drag?.type === "create" && (() => {
                const s = Math.min(drag.startMin, drag.currentMin);
                const e = Math.max(drag.startMin, drag.currentMin);
                return (
                  <div style={{
                    position: "absolute",
                    left:   (s - visibleStart) * pxPerMin,
                    width:  (e - s) * pxPerMin,
                    top: 8, bottom: 8,
                    background: "rgba(0,196,167,0.07)",
                    border: "1px dashed rgba(0,196,167,0.35)",
                    pointerEvents: "none",
                  }} />
                );
              })()}

              {/* Now line */}
              {isToday && nowMin >= visibleStart && nowMin < TIMELINE_END && (
                <div style={{
                  position: "absolute",
                  left:   (nowMin - visibleStart) * pxPerMin,
                  top: 0, bottom: 0,
                  width: 1,
                  background: "#f5c842",
                  pointerEvents: "none",
                  zIndex: 10,
                }}>
                  <div style={{ position: "absolute", top: -3, left: -3, width: 7, height: 7, background: "#f5c842", borderRadius: "50%" }} />
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* ── Pool ── */}
      <NodePool
        nodes={visiblePoolNodes}
        selectedId={selectedPoolNode}
        onSelect={id => setSelectedPoolNode(prev => prev === id ? null : id)}
        px={PX}
        vt={VT}
        acc={ACC}
      />

      {/* ── Location prompt ── */}
      {pendingBlock && (
        <LocationPromptOverlay
          locations={store.locations}
          screenX={pendingBlock.screenX}
          onConfirm={async name => {
            const loc = await store.upsertLocation(name);
            await store.createWorkBlock(pendingBlock.startMin, pendingBlock.endMin, loc.id);
            setPendingBlock(null);
          }}
          onSkip={async () => {
            await store.createWorkBlock(pendingBlock.startMin, pendingBlock.endMin, null);
            setPendingBlock(null);
          }}
          onCancel={() => setPendingBlock(null)}
        />
      )}
    </div>
  );
}
