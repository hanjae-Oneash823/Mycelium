import { useState, useRef, useEffect } from 'react';
import useWidgetStore from './store/useWidgetStore';
import { WIDGET_REGISTRY, getWidgetDef } from './registry';
import { WidgetShell } from './WidgetShell';
import { CATEGORY_LABELS } from './types';
import type { WidgetCategory } from './types';

// ── Dynamic grid algorithm ─────────────────────────────────────────────────────
// Cell sizes evaluated from 100–120px. Even column count enforced.
// Scored by efficiency (coverage) minus deviation-from-100 penalty.
function computeGrid(W: number, H: number): { cols: number; cellPx: number } {
  let bestS = 100;
  let bestU = -Infinity;
  for (let s = 100; s <= 120; s++) {
    const nRaw = Math.floor(W / s);
    const n = nRaw % 2 === 0 ? nRaw : nRaw - 1;
    const m = Math.floor(H / s);
    if (n === 0 || m === 0) continue;
    const E = (n * m * s * s) / (W * H);
    const D = s - 100;
    const U = E - D * 0.002;
    if (U > bestU || (U === bestU && s < bestS)) {
      bestU = U;
      bestS = s;
    }
  }
  const nRaw = Math.floor(W / bestS);
  const cols = nRaw % 2 === 0 ? nRaw : nRaw - 1;
  return { cols: Math.max(2, cols), cellPx: bestS };
}

export function WidgetPanel() {
  const [editMode, setEditMode]   = useState(false);
  const [addOpen,  setAddOpen]    = useState(false);
  const [filterCat, setFilterCat] = useState<WidgetCategory | 'all'>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const [gridCols, setGridCols]   = useState(4);
  const [cellPx,   setCellPx]     = useState(110);

  const instances     = useWidgetStore(s => s.instances);
  const addWidget     = useWidgetStore(s => s.addWidget);
  const resetToDefault = useWidgetStore(s => s.resetToDefault);

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

  const sorted = [...instances].sort((a, b) => a.order - b.order);

  const categories = Array.from(
    new Set(WIDGET_REGISTRY.map(w => w.category))
  ) as WidgetCategory[];

  const filteredRegistry = WIDGET_REGISTRY.filter(
    w => filterCat === 'all' || w.category === filterCat
  );

  return (
    <div ref={panelRef} style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 8, padding: '6px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => { setAddOpen(v => !v); setEditMode(false); }}
          style={toolbarBtn(addOpen)}
        >
          + ADD
        </button>
        <button
          onClick={() => { setEditMode(v => !v); setAddOpen(false); }}
          style={toolbarBtn(editMode)}
        >
          EDIT
        </button>
        {editMode && (
          <button onClick={resetToDefault} style={toolbarBtn(false)}>
            RESET
          </button>
        )}
      </div>

      {/* ── Add widget drawer ── */}
      {addOpen && (
        <div style={{
          position: 'absolute', top: 34, right: 0, left: 0, zIndex: 10,
          background: '#0d0d0d',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '10px 12px',
          maxHeight: '55%',
          overflowY: 'auto',
        }}>
          {/* Category filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(['all', ...categories] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                style={{
                  background: 'none',
                  border: `1px solid ${filterCat === cat ? 'rgba(0,196,167,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  color: filterCat === cat ? '#00c4a7' : 'rgba(255,255,255,0.4)',
                  fontFamily: "'VT323', monospace",
                  fontSize: '0.75rem', letterSpacing: '1px',
                  padding: '0 8px', cursor: 'pointer', lineHeight: '1.6rem',
                }}
              >
                {cat === 'all' ? 'ALL' : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Widget list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredRegistry.map(def => (
              <div key={def.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div>
                  <div style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '1rem', color: 'rgba(255,255,255,0.75)',
                    letterSpacing: '1px',
                  }}>
                    {def.label}
                  </div>
                  <div style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)',
                    letterSpacing: '0.5px',
                  }}>
                    {def.description}
                  </div>
                </div>
                <button
                  onClick={() => { addWidget(def.id); setAddOpen(false); }}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(0,196,167,0.4)',
                    color: '#00c4a7',
                    fontFamily: "'VT323', monospace",
                    fontSize: '0.85rem', letterSpacing: '1px',
                    padding: '0 10px', cursor: 'pointer', lineHeight: '1.6rem',
                    flexShrink: 0,
                  }}
                >
                  ADD
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Widget grid ── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridAutoRows: cellPx,
        gap: 4,
        padding: 4,
        alignContent: 'start',
        overflowY: 'auto',
      }}>
        {sorted.map(instance => {
          const def = getWidgetDef(instance.widgetId);
          if (!def) return null;
          return (
            <WidgetShell
              key={instance.instanceId}
              instance={instance}
              editMode={editMode}
            />
          );
        })}

        {sorted.length === 0 && (
          <div style={{
            gridColumn: `span ${gridCols}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'VT323', monospace",
            color: 'rgba(255,255,255,0.1)',
            fontSize: '0.85rem', letterSpacing: '2px',
          }}>
            no widgets — click + ADD
          </div>
        )}
      </div>
    </div>
  );
}

function toolbarBtn(active: boolean): React.CSSProperties {
  return {
    background:   'none',
    border:       `1px solid ${active ? 'rgba(0,196,167,0.5)' : 'rgba(255,255,255,0.1)'}`,
    color:        active ? '#00c4a7' : 'rgba(255,255,255,0.3)',
    fontFamily:   "'VT323', monospace",
    fontSize:     '0.75rem', letterSpacing: '2px',
    padding:      '0 10px', cursor: 'pointer', lineHeight: '1.6rem',
  };
}
