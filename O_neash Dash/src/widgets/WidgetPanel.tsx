import { useState, useRef, useEffect, useMemo } from 'react';
import useWidgetStore from './store/useWidgetStore';
import { WIDGET_REGISTRY, getWidgetDef } from './registry';
import { WidgetShell } from './WidgetShell';
import { CATEGORY_LABELS, SIZE_SPANS } from './types';
import type { WidgetCategory, WidgetInstance, WidgetSize } from './types';

// ── Dynamic grid algorithm ─────────────────────────────────────────────────────
function computeGrid(W: number, H: number): { cols: number; cellPx: number } {
  let bestS = 100, bestU = -Infinity;
  for (let s = 100; s <= 120; s++) {
    const nRaw = Math.floor(W / s);
    const n = nRaw % 2 === 0 ? nRaw : nRaw - 1;
    const m = Math.floor(H / s);
    if (n === 0 || m === 0) continue;
    const E = (n * m * s * s) / (W * H);
    const U = E - (s - 100) * 0.002;
    if (U > bestU || (U === bestU && s < bestS)) { bestU = U; bestS = s; }
  }
  const nRaw = Math.floor(W / bestS);
  return { cols: Math.max(2, nRaw % 2 === 0 ? nRaw : nRaw - 1), cellPx: bestS };
}

// ── Layout engine: assign explicit col/row to every instance ──────────────────
interface Positioned extends WidgetInstance { col: number; row: number; }

function computePositions(instances: WidgetInstance[], cols: number): Positioned[] {
  if (cols === 0) return [];
  const occ = new Set<string>();
  const k = (c: number, r: number) => `${c},${r}`;
  const free = (c0: number, r0: number, cs: number, rs: number) => {
    if (c0 < 1 || c0 + cs - 1 > cols) return false;
    for (let r = r0; r < r0 + rs; r++)
      for (let c = c0; c < c0 + cs; c++)
        if (occ.has(k(c, r))) return false;
    return true;
  };
  const mark = (c0: number, r0: number, cs: number, rs: number) => {
    for (let r = r0; r < r0 + rs; r++)
      for (let c = c0; c < c0 + cs; c++)
        occ.add(k(c, r));
  };

  const sorted = [...instances].sort((a, b) => a.order - b.order);
  const result: Positioned[] = [];

  // Pass 1: pin explicitly-placed widgets
  for (const inst of sorted) {
    if (inst.col != null && inst.row != null) {
      const { colSpan, rowSpan } = SIZE_SPANS[inst.size];
      const col = Math.max(1, Math.min(inst.col, cols - colSpan + 1));
      const row = Math.max(1, inst.row);
      mark(col, row, colSpan, rowSpan);
      result.push({ ...inst, col, row });
    }
  }

  // Pass 2: auto-flow the rest
  for (const inst of sorted) {
    if (inst.col != null && inst.row != null) continue;
    const { colSpan, rowSpan } = SIZE_SPANS[inst.size];
    let placed = false;
    for (let r = 1; r <= 200 && !placed; r++)
      for (let c = 1; c <= cols - colSpan + 1 && !placed; c++)
        if (free(c, r, colSpan, rowSpan)) {
          mark(c, r, colSpan, rowSpan);
          result.push({ ...inst, col: c, row: r });
          placed = true;
        }
  }
  return result;
}

// ── Check if a placement overlaps any other widget ─────────────────────────────
function isValidPlacement(
  col: number, row: number, cs: number, rs: number,
  draggedId: string, positioned: Positioned[], cols: number,
): boolean {
  if (col < 1 || col + cs - 1 > cols || row < 1) return false;
  for (const p of positioned) {
    if (p.instanceId === draggedId) continue;
    const { colSpan, rowSpan } = SIZE_SPANS[p.size];
    const noOverlap =
      col + cs - 1 < p.col ||
      col > p.col + colSpan - 1 ||
      row + rs - 1 < p.row ||
      row > p.row + rowSpan - 1;
    if (!noOverlap) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
export function WidgetPanel() {
  const [editMode,  setEditMode]  = useState(false);
  const [addOpen,   setAddOpen]   = useState(false);
  const [filterCat, setFilterCat] = useState<WidgetCategory | 'all'>('all');
  const [gridCols,  setGridCols]  = useState(4);
  const [cellPx,    setCellPx]    = useState(110);

  // Drag state
  const [draggedId,  setDraggedId]  = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverCell,  setHoverCell]  = useState<{ col: number; row: number } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const instances      = useWidgetStore(s => s.instances);
  const addWidget      = useWidgetStore(s => s.addWidget);
  const resetToDefault = useWidgetStore(s => s.resetToDefault);
  const placeWidget    = useWidgetStore(s => s.placeWidget);

  useEffect(() => {
    if (!panelRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const { cols, cellPx: px } = computeGrid(width, height);
      setGridCols(cols);
      setCellPx(px);
    });
    obs.observe(panelRef.current);
    return () => obs.disconnect();
  }, []);

  const positioned = useMemo(
    () => computePositions(instances, gridCols),
    [instances, gridCols],
  );

  // How many rows to show in edit mode
  const maxContentRow = positioned.length > 0
    ? Math.max(...positioned.map(p => p.row + SIZE_SPANS[p.size].rowSpan - 1))
    : 0;
  const ghostRows = editMode ? maxContentRow + 4 : 0;

  // Dragged widget span
  const dragSpan = useMemo((): { colSpan: number; rowSpan: number } | null => {
    if (!draggedId) return null;
    const inst = instances.find(i => i.instanceId === draggedId);
    return inst ? SIZE_SPANS[inst.size] : null;
  }, [draggedId, instances]);

  // Compute drop zone top-left (clamped)
  const dropZone = useMemo(() => {
    if (!hoverCell || !dragSpan) return null;
    return {
      col: Math.max(1, Math.min(hoverCell.col, gridCols - dragSpan.colSpan + 1)),
      row: Math.max(1, hoverCell.row),
    };
  }, [hoverCell, dragSpan, gridCols]);

  const dropValid = useMemo(() => {
    if (!dropZone || !draggedId || !dragSpan) return false;
    return isValidPlacement(
      dropZone.col, dropZone.row,
      dragSpan.colSpan, dragSpan.rowSpan,
      draggedId, positioned, gridCols,
    );
  }, [dropZone, draggedId, dragSpan, positioned, gridCols]);

  const inDropZone = (col: number, row: number) => {
    if (!dropZone || !dragSpan) return false;
    return col >= dropZone.col && col < dropZone.col + dragSpan.colSpan &&
           row >= dropZone.row && row < dropZone.row + dragSpan.rowSpan;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDragStart = (id: string) => {
    setDraggedId(id);
    setIsDragging(true);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setIsDragging(false);
    setHoverCell(null);
  };

  const categories = Array.from(new Set(WIDGET_REGISTRY.map(w => w.category))) as WidgetCategory[];
  const filteredRegistry = WIDGET_REGISTRY.filter(w => filterCat === 'all' || w.category === filterCat);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
    gridAutoRows: cellPx,
    gap: 4,
    padding: 4,
    alignContent: 'start',
    position: 'relative',
  };

  return (
    <div ref={panelRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 8, padding: '6px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        <button onClick={() => { setAddOpen(v => !v); setEditMode(false); }} style={toolbarBtn(addOpen)}>+ ADD</button>
        <button onClick={() => { setEditMode(v => !v); setAddOpen(false); handleDragEnd(); }} style={toolbarBtn(editMode)}>EDIT</button>
        {editMode && <button onClick={resetToDefault} style={toolbarBtn(false)}>RESET</button>}
      </div>

      {/* ── Add widget drawer ── */}
      {addOpen && (
        <div style={{
          position: 'absolute', top: 34, right: 0, left: 0, zIndex: 20,
          background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)',
          padding: '10px 12px', maxHeight: '55%', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(['all', ...categories] as const).map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)} style={{
                background: 'none',
                border: `1px solid ${filterCat === cat ? 'rgba(0,196,167,0.6)' : 'rgba(255,255,255,0.1)'}`,
                color: filterCat === cat ? '#00c4a7' : 'rgba(255,255,255,0.4)',
                fontFamily: "'VT323', monospace", fontSize: '0.75rem', letterSpacing: '1px',
                padding: '0 8px', cursor: 'pointer', lineHeight: '1.6rem',
              }}>
                {cat === 'all' ? 'ALL' : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredRegistry.map(def => (
              <div key={def.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: '1rem', color: 'rgba(255,255,255,0.75)', letterSpacing: '1px' }}>{def.label}</div>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.5px' }}>{def.description}</div>
                </div>
                <button onClick={() => { addWidget(def.id); setAddOpen(false); }} style={{
                  background: 'none', border: '1px solid rgba(0,196,167,0.4)', color: '#00c4a7',
                  fontFamily: "'VT323', monospace", fontSize: '0.85rem', letterSpacing: '1px',
                  padding: '0 10px', cursor: 'pointer', lineHeight: '1.6rem', flexShrink: 0,
                }}>ADD</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Grid ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 4 }}>
        <div style={gridStyle}>

          {/* Layer 1: Ghost cells — visible in edit mode, on top during drag */}
          {editMode && Array.from({ length: ghostRows * gridCols }, (_, i) => {
            const col = (i % gridCols) + 1;
            const row = Math.floor(i / gridCols) + 1;
            const lit   = inDropZone(col, row);
            const valid = dropValid;

            return (
              <div
                key={`ghost-${col}-${row}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHoverCell({ col, row });
                }}
                onDragLeave={() => setHoverCell(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dropZone && dropValid && draggedId) {
                    placeWidget(draggedId, dropZone.col, dropZone.row);
                  }
                  handleDragEnd();
                }}
                style={{
                  gridColumn: col,
                  gridRow: row,
                  border: `1px solid ${
                    lit
                      ? valid ? 'rgba(0,196,167,0.7)' : 'rgba(239,68,68,0.7)'
                      : 'rgba(255,255,255,0.06)'
                  }`,
                  background: lit
                    ? valid ? 'rgba(0,196,167,0.1)' : 'rgba(239,68,68,0.1)'
                    : 'transparent',
                  // During drag: ghost cells come to front so they receive events
                  zIndex: isDragging ? 3 : 0,
                  pointerEvents: isDragging ? 'auto' : 'none',
                  transition: 'background 0.07s, border-color 0.07s',
                }}
              />
            );
          })}

          {/* Layer 2: Widgets */}
          {positioned.map(inst => (
            <WidgetShell
              key={inst.instanceId}
              instance={inst}
              editMode={editMode}
              col={inst.col}
              row={inst.row}
              isDragging={isDragging && draggedId === inst.instanceId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}

          {instances.length === 0 && (
            <div style={{
              gridColumn: `span ${gridCols}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'VT323', monospace",
              color: 'rgba(255,255,255,0.1)', fontSize: '0.85rem', letterSpacing: '2px',
            }}>
              no widgets — click + ADD
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function toolbarBtn(active: boolean): React.CSSProperties {
  return {
    background: 'none',
    border:     `1px solid ${active ? 'rgba(0,196,167,0.5)' : 'rgba(255,255,255,0.1)'}`,
    color:      active ? '#00c4a7' : 'rgba(255,255,255,0.3)',
    fontFamily: "'VT323', monospace",
    fontSize:   '0.75rem', letterSpacing: '2px',
    padding:    '0 10px', cursor: 'pointer', lineHeight: '1.6rem',
  };
}
