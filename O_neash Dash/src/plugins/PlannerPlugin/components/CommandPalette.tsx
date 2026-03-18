import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePlannerStore } from '../store/usePlannerStore';
import { useViewStore } from '../store/useViewStore';
import type { PlannerViewType, PlannerNode } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

type PaletteMode = 'search' | 'create' | 'view';

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  action: () => void;
}

// ── View shortcuts ───────────────────────────────────────────────────────────

const VIEW_SHORTCUTS: Array<{ prefix: string; view: PlannerViewType; label: string }> = [
  { prefix: '/today', view: 'today', label: 'Today' },
  { prefix: '/cal', view: 'calendar', label: 'Calendar' },
  { prefix: '/eis', view: 'eisenhower', label: 'Eisenhower' },
  { prefix: '/focus', view: 'focus', label: 'Focus' },
  { prefix: '/arc', view: 'arc', label: 'Arc' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    ti = t.indexOf(q[qi], ti);
    if (ti === -1) return false;
    ti++;
  }
  return true;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const { nodes, createNode } = usePlannerStore();
  const { closeCommandPalette, setActiveView, openTaskForm } = useViewStore();

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Determine mode
  const mode: PaletteMode = query.startsWith('+')
    ? 'create'
    : query.startsWith('/')
    ? 'view'
    : 'search';

  // Build items
  const items: PaletteItem[] = (() => {
    if (mode === 'create') {
      const title = query.slice(1).trim();
      if (!title) return [];
      return [{
        id: '__create__',
        label: `Create task: "${title}"`,
        sublabel: 'press enter to create',
        action: async () => {
          await createNode({ title });
          closeCommandPalette();
        },
      }];
    }

    if (mode === 'view') {
      const q = query.toLowerCase();
      return VIEW_SHORTCUTS
        .filter(s => s.prefix.startsWith(q) || s.label.toLowerCase().startsWith(q.slice(1)))
        .map(s => ({
          id: s.view,
          label: `→ ${s.label}`,
          sublabel: s.prefix,
          action: () => { setActiveView(s.view); closeCommandPalette(); },
        }));
    }

    // Bare text: fuzzy search nodes
    if (!query.trim()) {
      // Show quick actions when empty
      return [
        {
          id: '__hint_create__',
          label: '+ type to create a task',
          sublabel: 'prefix with +',
          action: () => { setQuery('+'); },
        },
        {
          id: '__hint_view__',
          label: '/ switch view',
          sublabel: '/today · /cal · /eis · /focus · /arc',
          action: () => { setQuery('/'); },
        },
        {
          id: '__hint_new__',
          label: 'new task (form)',
          sublabel: 'open task form',
          action: () => { closeCommandPalette(); openTaskForm(); },
        },
      ];
    }

    // Fuzzy search
    const matched = (nodes as PlannerNode[])
      .filter(n => fuzzyMatch(n.title, query))
      .slice(0, 8);

    return matched.map(n => ({
      id: n.id,
      label: n.title,
      sublabel: [
        n.is_overdue ? 'overdue' : null,
        n.due_at ? `due ${n.due_at.slice(0, 10)}` : null,
        n.groups?.filter(g => !g.is_ungrouped).map(g => `#${g.name}`).join(' ') || null,
      ].filter(Boolean).join(' · '),
      action: () => { closeCommandPalette(); },
    }));
  })();

  // Reset active index when items change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { closeCommandPalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, items.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (items[activeIdx]) items[activeIdx].action();
    }
  }, [items, activeIdx, closeCommandPalette]);

  const overlay = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
      onClick={closeCommandPalette}
    >
      <div
        style={{
          width: 560, maxWidth: '90vw',
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'VT323', monospace",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 16px' }}>
          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)', marginRight: 10, letterSpacing: '1px' }}>
            {mode === 'create' ? '+' : mode === 'view' ? '/' : '⌘'}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="search tasks, + create, / view…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: '1.1rem', letterSpacing: '1px',
              padding: '14px 0',
              fontFamily: "'VT323', monospace",
            }}
          />
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '1px' }}>ESC</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto' }}>
          {items.length === 0 && query.trim() ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.9rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '2px' }}>
              no results
            </div>
          ) : items.map((item, idx) => (
            <button
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setActiveIdx(idx)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '10px 16px',
                background: idx === activeIdx ? 'rgba(0,196,167,0.08)' : 'transparent',
                borderLeft: idx === activeIdx ? '2px solid #00c4a7' : '2px solid transparent',
                display: 'flex', flexDirection: 'column', gap: 2,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '1rem', letterSpacing: '0.5px', color: idx === activeIdx ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                {item.label}
              </span>
              {item.sublabel && (
                <span style={{ fontSize: '0.72rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)' }}>
                  {item.sublabel}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '6px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 16 }}>
          {[
            ['↑↓', 'navigate'],
            ['↵', 'select'],
            ['esc', 'close'],
          ].map(([key, label]) => (
            <span key={key} style={{ fontSize: '0.65rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.2)' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>{key}</span> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
