import { useState } from 'react';
import { WIDGET_REGISTRY } from '../../../widgets/registry';
import useWidgetStore from '../../../widgets/store/useWidgetStore';
import { CATEGORY_LABELS, SIZE_SPANS } from '../../../widgets/types';
import type { WidgetCategory, WidgetSize } from '../../../widgets/types';

const FONT = "'VT323', monospace";

export function WidgetStudio() {
  const [tab, setTab] = useState<'active' | 'browse'>('active');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Tabs ── */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['active', 'browse'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? '#00c4a7' : 'transparent'}`,
              color: tab === t ? '#00c4a7' : 'rgba(255,255,255,0.3)',
              fontFamily: FONT, fontSize: '1rem', letterSpacing: '2px',
              padding: '4px 16px 10px', cursor: 'pointer',
            }}>
              {t === 'active' ? 'ACTIVE' : 'BROWSE'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 0' }}>
        {tab === 'active' ? <ActiveWidgets /> : <BrowseWidgets />}
      </div>

    </div>
  );
}

// ── Active widgets list ────────────────────────────────────────────────────────

function ActiveWidgets() {
  const instances    = useWidgetStore(s => s.instances);
  const removeWidget = useWidgetStore(s => s.removeWidget);
  const resizeWidget = useWidgetStore(s => s.resizeWidget);
  const reorderWidget= useWidgetStore(s => s.reorderWidget);
  const resetToDefault = useWidgetStore(s => s.resetToDefault);

  const sorted = [...instances].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) {
    return (
      <div style={{ fontFamily: FONT, color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem', letterSpacing: '1px', marginTop: 20 }}>
        no widgets active — browse to add some
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={resetToDefault} style={ghostBtn()}>RESET TO DEFAULT</button>
      </div>

      {sorted.map((inst, idx) => {
        const def = WIDGET_REGISTRY.find(w => w.id === inst.widgetId);
        if (!def) return null;

        return (
          <div key={inst.instanceId} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            {/* Order controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                onClick={() => reorderWidget(inst.instanceId, 'up')}
                disabled={idx === 0}
                style={arrowBtn(idx === 0)}
              >▲</button>
              <button
                onClick={() => reorderWidget(inst.instanceId, 'down')}
                disabled={idx === sorted.length - 1}
                style={arrowBtn(idx === sorted.length - 1)}
              >▼</button>
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: '1.05rem', color: 'rgba(255,255,255,0.8)', letterSpacing: '1px' }}>
                {def.label}
              </div>
              <div style={{ fontFamily: FONT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.5px' }}>
                {CATEGORY_LABELS[def.category]}
              </div>
            </div>

            {/* Size picker */}
            <div style={{ display: 'flex', gap: 4 }}>
              {def.allowedSizes.map(sz => (
                <button
                  key={sz}
                  onClick={() => resizeWidget(inst.instanceId, sz)}
                  style={{
                    background: 'none',
                    border: `1px solid ${inst.size === sz ? '#00c4a7' : 'rgba(255,255,255,0.1)'}`,
                    color: inst.size === sz ? '#00c4a7' : 'rgba(255,255,255,0.3)',
                    fontFamily: FONT, fontSize: '0.75rem', letterSpacing: '1px',
                    padding: '0 7px', cursor: 'pointer', lineHeight: '1.6rem',
                  }}
                >
                  {sz}
                </button>
              ))}
            </div>

            {/* Remove */}
            <button onClick={() => removeWidget(inst.instanceId)} style={{
              background: 'none', border: '1px solid rgba(239,68,68,0.3)',
              color: 'rgba(239,68,68,0.6)', fontFamily: FONT,
              fontSize: '0.85rem', padding: '0 10px', cursor: 'pointer', lineHeight: '1.6rem',
            }}>
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Browse / add widgets ───────────────────────────────────────────────────────

function BrowseWidgets() {
  const [filterCat, setFilterCat] = useState<WidgetCategory | 'all'>('all');
  const addWidget  = useWidgetStore(s => s.addWidget);
  const instances  = useWidgetStore(s => s.instances);

  const categories = Array.from(new Set(WIDGET_REGISTRY.map(w => w.category))) as WidgetCategory[];

  const filtered = WIDGET_REGISTRY.filter(
    w => filterCat === 'all' || w.category === filterCat,
  );

  return (
    <div>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['all', ...categories] as const).map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={{
            background: 'none',
            border: `1px solid ${filterCat === cat ? 'rgba(0,196,167,0.6)' : 'rgba(255,255,255,0.1)'}`,
            color: filterCat === cat ? '#00c4a7' : 'rgba(255,255,255,0.35)',
            fontFamily: FONT, fontSize: '0.78rem', letterSpacing: '1px',
            padding: '0 10px', cursor: 'pointer', lineHeight: '1.8rem',
          }}>
            {cat === 'all' ? 'ALL' : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Widget cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {filtered.map(def => {
          const alreadyAdded = instances.some(i => i.widgetId === def.id);
          return (
            <div key={def.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: FONT, fontSize: '1.05rem', color: 'rgba(255,255,255,0.8)', letterSpacing: '1px' }}>
                    {def.label}
                  </span>
                  <span style={{
                    fontFamily: FONT, fontSize: '0.68rem', letterSpacing: '1px',
                    color: 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)', padding: '0 5px',
                  }}>
                    {def.defaultSize}
                  </span>
                </div>
                <div style={{ fontFamily: FONT, fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.5px' }}>
                  {def.description}
                </div>
              </div>

              <button
                onClick={() => addWidget(def.id)}
                style={{
                  background: 'none',
                  border: `1px solid ${alreadyAdded ? 'rgba(255,255,255,0.1)' : 'rgba(0,196,167,0.45)'}`,
                  color: alreadyAdded ? 'rgba(255,255,255,0.2)' : '#00c4a7',
                  fontFamily: FONT, fontSize: '0.85rem', letterSpacing: '1px',
                  padding: '0 12px', cursor: 'pointer', lineHeight: '1.6rem',
                  flexShrink: 0,
                }}
              >
                {alreadyAdded ? 'ADDED' : '+ ADD'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ghostBtn(): React.CSSProperties {
  return {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.3)',
    fontFamily: FONT, fontSize: '0.75rem', letterSpacing: '1.5px',
    padding: '0 10px', cursor: 'pointer', lineHeight: '1.6rem',
  };
}

function arrowBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'none', border: 'none',
    color: disabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)',
    fontFamily: FONT, fontSize: '0.7rem',
    padding: 0, cursor: disabled ? 'default' : 'pointer', lineHeight: 1,
  };
}
