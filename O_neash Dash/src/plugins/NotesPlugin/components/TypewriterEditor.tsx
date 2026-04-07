import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Typography } from '@tiptap/extension-typography';
import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { common, createLowlight } from 'lowlight';
import type { Editor } from '@tiptap/react';
import type { NoteRow } from '../lib/notesDb';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';

// ── Block cursor extension ────────────────────────────────────────────────────

const BlockCursorExtension = Extension.create({
  name: 'blockCursor',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockCursor'),
        props: {
          decorations(state) {
            const { selection } = state;
            if (!selection.empty) return DecorationSet.empty;
            const el = document.createElement('span');
            el.className = 'block-cursor';
            return DecorationSet.create(state.doc, [
              Decoration.widget(selection.from, el, { side: 1, key: 'block-cursor' }),
            ]);
          },
        },
      }),
    ];
  },
});

const lowlight = createLowlight(common);
const VT = "'VT323', 'HBIOS-SYS', monospace";
const PT = "'Inconsolata', 'IBM Plex Mono KR', 'Chiron GoRound TC', monospace";

// ── Table of contents ─────────────────────────────────────────────────────────

interface TocItem { level: number; text: string; index: number; }

function extractHeadings(json: { content?: any[] }): TocItem[] {
  const items: TocItem[] = [];
  let idx = 0;
  json.content?.forEach((node: any) => {
    if (node.type === 'heading' && node.attrs?.level) {
      const text = node.content?.map((c: any) => c.text ?? '').join('') ?? '';
      if (text.trim()) items.push({ level: node.attrs.level, text, index: idx++ });
    }
  });
  return items;
}

const ZOOM_MIN  = 0.5;

function fmtDate(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const ZOOM_MAX  = 1.8;
const ZOOM_STEP = 0.1;

// ── Toolbar button (dark bg) ───────────────────────────────────────────────────

function TB({ label, active, onClick, title }: { label: string; active?: boolean; onClick: () => void; title?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onMouseDown={e => { e.preventDefault(); onClick(); }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          fontFamily: VT, fontSize: '0.9rem',
          background: active ? 'rgba(255,255,255,0.14)' : hov ? 'rgba(255,255,255,0.07)' : 'transparent',
          border: `1px solid ${active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
          color: active ? '#fff' : hov ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
          padding: '1px 7px', cursor: 'pointer', minWidth: 26,
          textAlign: 'center' as const, lineHeight: 1.6, letterSpacing: 0.3,
          transition: 'all 0.1s',
        }}
      >
        {label}
      </button>
      {hov && title && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(18,18,18,0.97)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#f5c842',
          fontFamily: VT, fontSize: '0.82rem', letterSpacing: 0.5,
          padding: '2px 9px', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 1000,
        }}>
          {title}
        </div>
      )}
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', margin: '0 3px', flexShrink: 0 }} />;
}

// ── Color presets ─────────────────────────────────────────────────────────────

const TEXT_COLORS = [
  { label: 'Default',  value: null        },
  { label: 'Black',    value: '#000000'   },
  { label: 'Dark',     value: '#374151'   },
  { label: 'Grey',     value: '#6B7280'   },
  { label: 'Silver',   value: '#9CA3AF'   },
  { label: 'White',    value: '#FFFFFF'   },
  { label: 'Red',      value: '#EF4444'   },
  { label: 'Orange',   value: '#F97316'   },
  { label: 'Yellow',   value: '#EAB308'   },
  { label: 'Green',    value: '#22C55E'   },
  { label: 'Teal',     value: '#00c4a7'   },
  { label: 'Blue',     value: '#3B82F6'   },
  { label: 'Purple',   value: '#8B5CF6'   },
  { label: 'Pink',     value: '#EC4899'   },
];

const HIGHLIGHT_COLORS = [
  { label: 'None',     value: null        },
  { label: 'Yellow',   value: '#FEF08A'   },
  { label: 'Green',    value: '#BBF7D0'   },
  { label: 'Blue',     value: '#BFDBFE'   },
  { label: 'Pink',     value: '#FBCFE8'   },
  { label: 'Orange',   value: '#FED7AA'   },
  { label: 'Purple',   value: '#DDD6FE'   },
  { label: 'Red',      value: '#FECACA'   },
  { label: 'Teal',     value: '#99F6E4'   },
];

const RECENT_KEY = 'tw-recent-colors';
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}
function saveRecent(color: string) {
  const prev = loadRecent().filter(c => c !== color);
  localStorage.setItem(RECENT_KEY, JSON.stringify([color, ...prev].slice(0, 8)));
}

function ColorTextPopover({ editor }: { editor: Editor }) {
  const [open,   setOpen]   = useState(false);
  const [tab,    setTab]    = useState<'text' | 'highlight'>('text');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [pos,    setPos]    = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef      = useRef<HTMLButtonElement>(null);
  const popoverRef  = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const textColor      = editor.getAttributes('textStyle').color ?? null;
  const highlightColor = (() => { const r = editor.getAttributes('highlight').color; return typeof r === 'string' ? r : null; })();
  const activeColor    = tab === 'text' ? textColor : highlightColor;

  function toggleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    }
    setOpen(o => !o);
  }

  function applyColor(value: string | null) {
    if (tab === 'text') {
      if (value === null) editor.chain().focus().unsetColor().run();
      else { editor.chain().focus().setColor(value).run(); saveRecent(value); setRecent(loadRecent()); }
    } else {
      if (value === null) editor.chain().focus().unsetHighlight().run();
      else { editor.chain().focus().setHighlight({ color: value }).run(); saveRecent(value); setRecent(loadRecent()); }
    }
  }

  const swatchSz = 18;
  const presets  = tab === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS;

  return (
    <>
      {/* Toolbar trigger */}
      <button
        ref={btnRef}
        onMouseDown={ev => { ev.preventDefault(); toggleOpen(); }}
        title="Color"
        style={{
          fontFamily: VT, fontSize: '0.9rem',
          background: open ? 'rgba(255,255,255,0.14)' : 'transparent',
          border: `1px solid ${open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
          color: open ? '#fff' : 'rgba(255,255,255,0.6)',
          padding: '1px 7px', cursor: 'pointer', lineHeight: 1.6,
          transition: 'all 0.1s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}
      >
        <span style={{ lineHeight: 1, fontSize: '0.85rem' }}>A</span>
        <span style={{
          display: 'block', width: 12, height: 3, borderRadius: 1,
          background: tab === 'text'
            ? (textColor ?? 'rgba(255,255,255,0.3)')
            : (highlightColor ?? '#FEF08A'),
        }} />
      </button>

      {/* Popover — portalled into body so transformed ancestors don't affect fixed positioning */}
      {open && createPortal(
        <div ref={popoverRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)',
          zIndex: 9999, width: 212,
          background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          padding: '10px',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {(['text', 'highlight'] as const).map(t => (
              <button key={t} onMouseDown={ev => { ev.preventDefault(); setTab(t); }}
                style={{
                  all: 'unset', fontFamily: VT, fontSize: '0.78rem', letterSpacing: 1,
                  padding: '3px 10px 6px',
                  color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)',
                  borderBottom: tab === t ? '1px solid #00c4a7' : '1px solid transparent',
                  cursor: 'pointer', transition: 'color 0.1s',
                  textTransform: 'uppercase',
                }}>
                {t}
              </button>
            ))}
          </div>

          {/* Presets grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {presets.map(p => (
              <button key={p.label} title={p.label}
                onMouseDown={ev => { ev.preventDefault(); applyColor(p.value); }}
                style={{
                  width: swatchSz, height: swatchSz,
                  background: p.value ?? 'transparent',
                  border: p.value === activeColor
                    ? '2px solid #00c4a7'
                    : p.value === null
                    ? '1px dashed rgba(255,255,255,0.25)'
                    : '1px solid rgba(255,255,255,0.12)',
                  cursor: 'pointer', borderRadius: 2, flexShrink: 0,
                  position: 'relative',
                }}>
                {p.value === null && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 10, lineHeight: 1 }}>✕</span>
                )}
              </button>
            ))}
          </div>

          {/* Recent colors */}
          {recent.length > 0 && (
            <>
              <div style={{ fontFamily: VT, fontSize: '0.65rem', letterSpacing: 2, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 4 }}>recent</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {recent.map(c => (
                  <button key={c} title={c}
                    onMouseDown={ev => { ev.preventDefault(); applyColor(c); }}
                    style={{
                      width: swatchSz, height: swatchSz, background: c,
                      border: c === activeColor ? '2px solid #00c4a7' : '1px solid rgba(255,255,255,0.12)',
                      cursor: 'pointer', borderRadius: 2, flexShrink: 0,
                    }} />
                ))}
              </div>
            </>
          )}

          {/* Custom color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              key={tab}
              type="color"
              defaultValue={activeColor ?? (tab === 'text' ? '#000000' : '#FEF08A')}
              onInput={ev => applyColor((ev.target as HTMLInputElement).value)}
              style={{ width: 24, height: 24, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 2, background: 'none' }}
            />
            <span style={{ fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>custom</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── TypewriterEditor ──────────────────────────────────────────────────────────

interface Props {
  doc:    NoteRow;
  onSave: (title: string, json: string) => void;
  onBack: () => void;
}

export default function TypewriterEditor({ doc, onSave, onBack }: Props) {
  const [title,    setTitle]    = useState(doc.title ?? '');
  const [zoom,     setZoom]     = useState(1.3);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const titleRef         = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { arcs, projects } = usePlannerStore();
  const arc     = doc.arc_id     ? arcs.find(a => a.id === doc.arc_id)         : null;
  const project = doc.project_id ? projects.find(p => p.id === doc.project_id) : null;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Highlight.configure({ multicolor: true }),
      TextStyle, Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline, Superscript, Subscript,
      TaskList, TaskItem.configure({ nested: true }),
      Typography, BlockCursorExtension,
    ],
    content: doc.content_json ? JSON.parse(doc.content_json) : '',
    onUpdate: ({ editor }) => {
      onSave(title, JSON.stringify(editor.getJSON()));
      setHeadings(extractHeadings(editor.getJSON()));
    },
  }, [doc.id]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(doc.content_json ? JSON.parse(doc.content_json) : '', false);
    setTitle(doc.title ?? '');
    setHeadings(extractHeadings(editor.getJSON()));
  }, [doc.id]);

  useEffect(() => {
    if (editor) setHeadings(extractHeadings(editor.getJSON()));
  }, [editor]);

  // Auto-resize title textarea whenever title or doc changes
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [title, doc.id]);

  const handleTitleBlur = useCallback(() => {
    if (!editor) return;
    onSave(title, JSON.stringify(editor.getJSON()));
  }, [title, editor, onSave]);

  if (!editor) return null;
  const e = editor;

  const zoomIn  = () => setZoom(z => Math.min(ZOOM_MAX,  +(z + ZOOM_STEP).toFixed(1)));
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(1)));

  const scrollToHeading = (index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const els = container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3');
    const target = els[index];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>

      {/* Top chrome */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '10px 40px', flexShrink: 0 }}>

        {/* Back — left */}
        <button
          onClick={onBack}
          style={{
            fontFamily: VT, fontSize: '1rem', letterSpacing: 1,
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'color 0.1s',
          }}
          onMouseEnter={ev => (ev.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
          onMouseLeave={ev => (ev.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
        >
          ← back
        </button>

        {/* Toolbar — absolutely centered */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '4px 10px',
        }}>
          <TB label="B"   active={e.isActive('bold')}        onClick={() => e.chain().focus().toggleBold().run()}        title="Bold" />
          <TB label="I"   active={e.isActive('italic')}      onClick={() => e.chain().focus().toggleItalic().run()}      title="Italic" />
          <TB label="U"   active={e.isActive('underline')}   onClick={() => e.chain().focus().toggleUnderline().run()}   title="Underline" />
          <TB label="S"   active={e.isActive('strike')}      onClick={() => e.chain().focus().toggleStrike().run()}      title="Strike" />
          <ColorTextPopover editor={e} />
          <Sep />
          <TB label="H1" title="Heading 1 (Ctrl+Alt+1)" active={e.isActive('heading', { level: 1 })} onClick={() => e.chain().focus().toggleHeading({ level: 1 }).run()} />
          <TB label="H2" title="Heading 2 (Ctrl+Alt+2)" active={e.isActive('heading', { level: 2 })} onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} />
          <TB label="H3" title="Heading 3 (Ctrl+Alt+3)" active={e.isActive('heading', { level: 3 })} onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} />
          <Sep />
          <TB label="❝"  title="Blockquote (Ctrl+Shift+B)" active={e.isActive('blockquote')} onClick={() => e.chain().focus().toggleBlockquote().run()} />
          <TB label="{}" title="Code block (Ctrl+Alt+C)"    active={e.isActive('codeBlock')}  onClick={() => e.chain().focus().toggleCodeBlock().run()}  />
          <Sep />
          <TB label="•"  title="Bullet list (Ctrl+Shift+8)"  active={e.isActive('bulletList')}  onClick={() => e.chain().focus().toggleBulletList().run()}  />
          <TB label="1." title="Ordered list (Ctrl+Shift+7)" active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()} />
          <TB label="☐"  title="Task list (Ctrl+Shift+9)"    active={e.isActive('taskList')}    onClick={() => e.chain().focus().toggleTaskList().run()}    />
          <Sep />
          <TB label="x²" title="Superscript (Ctrl+.)" active={e.isActive('superscript')} onClick={() => e.chain().focus().toggleSuperscript().run()} />
          <TB label="x₂" title="Subscript (Ctrl+,)"   active={e.isActive('subscript')}   onClick={() => e.chain().focus().toggleSubscript().run()}   />
        </div>

        {/* Zoom — right */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onMouseDown={e2 => { e2.preventDefault(); zoomOut(); }}
            style={{ fontFamily: VT, fontSize: '1.1rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '0 4px', lineHeight: 1, transition: 'color 0.1s' }}
            onMouseEnter={ev => (ev.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={ev => (ev.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >−</button>
          <span style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.25)', minWidth: 36, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onMouseDown={e2 => { e2.preventDefault(); zoomIn(); }}
            style={{ fontFamily: VT, fontSize: '1.1rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '0 4px', lineHeight: 1, transition: 'color 0.1s' }}
            onMouseEnter={ev => (ev.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={ev => (ev.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >+</button>
        </div>
      </div>

      {/* Content area — relative so outline can float absolutely */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>

        {/* TOC outline — absolute, left side, vertically centred */}
        {headings.length > 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: 320, zIndex: 10,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '0 0 0 0',
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, pointerEvents: 'auto' }}>
              {headings.map(h => (
                <button
                  key={h.index}
                  onClick={() => scrollToHeading(h.index)}
                  title={h.text}
                  style={{
                    all: 'unset',
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box',
                    paddingLeft: 20 + (h.level - 1) * 12,
                    paddingRight: 12,
                    paddingTop: 3, paddingBottom: 3,
                    fontFamily: VT,
                    fontSize: h.level === 1 ? '0.95rem' : '0.82rem',
                    letterSpacing: 0.5,
                    color: h.level === 1
                      ? '#00c4a7'
                      : h.level === 2
                      ? 'rgba(255,255,255,0.88)'
                      : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: 1.15,
                    transition: 'color 0.1s',
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.color = 'rgba(0,196,167,0.9)')}
                  onMouseLeave={ev => (ev.currentTarget.style.color =
                    h.level === 1 ? '#00c4a7'
                    : h.level === 2 ? 'rgba(255,255,255,0.88)'
                    : 'rgba(255,255,255,0.4)'
                  )}
                >
                  {h.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable page area — full width so paper centres correctly */}
        <div ref={scrollContainerRef} className="doc-scroll-area" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 80px', scrollbarWidth: 'none' }}>

        {/* Paper */}
        <div style={{
          maxWidth: 700, margin: '0 auto',
          background: '#fafaf8',
          boxShadow: '0 8px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
          padding: '36px 48px 48px',
          minHeight: 800,
          zoom,
        }}>
          {/* Metadata */}
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(arc || project) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: PT, fontSize: '0.8rem', color: 'rgba(0,0,0,0.35)', letterSpacing: 0.3, lineHeight: 1 }}>
                {arc && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: arc.color_hex, display: 'inline-block', flexShrink: 0 }} />
                    {arc.name}
                  </span>
                )}
                {arc && project && <span style={{ color: 'rgba(0,0,0,0.2)' }}>/</span>}
                {project && <span>{project.name}</span>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 20, fontFamily: PT, fontSize: '0.78rem', color: 'rgba(0,0,0,0.28)', letterSpacing: 0.2, lineHeight: 1 }}>
              <span>created {fmtDate(doc.created_at)}</span>
              <span>modified {fmtDate(doc.updated_at)}</span>
            </div>
          </div>

          <textarea
            ref={titleRef}
            value={title}
            onChange={ev => {
              setTitle(ev.target.value);
              ev.target.style.height = 'auto';
              ev.target.style.height = ev.target.scrollHeight + 'px';
            }}
            onBlur={handleTitleBlur}
            rows={1}
            placeholder="Untitled"
            style={{
              fontFamily: PT, fontWeight: 700, fontSize: '1.6rem',
              color: '#111', background: 'transparent', border: 'none', outline: 'none',
              width: '100%', marginBottom: 24, letterSpacing: 0.2, lineHeight: 1.4,
              borderBottom: '1px solid rgba(0,0,0,0.08)', paddingBottom: 14,
              resize: 'none', overflow: 'hidden',
            }}
          ></textarea>
          <div className="typewriter">
            <EditorContent editor={editor} />
          </div>
        </div>
        </div>{/* end scroll area */}
      </div>{/* end content area */}

      <style>{`
        .typewriter .ProseMirror,
        .typewriter .tiptap {
          outline: none; font-family: ${PT} !important; font-size: 0.85rem;
          line-height: 1.55; color: #1a1a1a; min-height: 400px;
        }
        .typewriter .ProseMirror p,
        .typewriter .tiptap p  { font-family: ${PT} !important; margin: 0 0 0.9em; }
        .typewriter .ProseMirror h1,
        .typewriter .tiptap h1 { font-family: ${PT} !important; font-size: 1.6rem; font-weight: 700; margin: 1.2em 0 0.4em; color: #111; }
        .typewriter .ProseMirror h2,
        .typewriter .tiptap h2 { font-family: ${PT} !important; font-size: 1.25rem; font-weight: 700; margin: 1em 0 0.35em; color: #111; }
        .typewriter .ProseMirror h3,
        .typewriter .tiptap h3 { font-family: ${PT} !important; font-size: 1.05rem; font-weight: 700; margin: 0.8em 0 0.3em; color: #333; }
        .typewriter .ProseMirror li,
        .typewriter .tiptap li  { font-family: ${PT} !important; margin: 0; }
        .typewriter .tiptap li p { margin: 0 !important; }
        .typewriter .tiptap strong { color: #000; font-family: ${PT} !important; }
        .typewriter .tiptap span { font-family: ${PT} !important; }
        .typewriter .tiptap em { font-style: italic; font-family: ${PT} !important; }
        .typewriter .tiptap s  { color: #888; font-family: ${PT} !important; }
        .typewriter .tiptap u  { text-decoration-color: rgba(0,0,0,0.35); font-family: ${PT} !important; }
        .typewriter .tiptap blockquote { border-left: 3px solid rgba(0,0,0,0.18); margin: 0.8em 0; padding: 2px 0 2px 16px; color: #555; font-style: italic; }
        .typewriter .tiptap code { background: rgba(0,0,0,0.06); padding: 0 4px; font-family: monospace; font-size: 0.88em; }
        .typewriter .tiptap pre { background: #f3f3f0; border: 1px solid rgba(0,0,0,0.1); padding: 12px 16px; font-family: monospace; font-size: 0.88rem; overflow-x: auto; margin: 1em 0; }
        .typewriter .tiptap pre code { background: none; padding: 0; }
        .typewriter .tiptap hr { border: none; border-top: 1px solid rgba(0,0,0,0.12); margin: 1.4em 0; }
        .typewriter .tiptap ul, .typewriter .tiptap ol { padding-left: 1.5em; margin: 0.4em 0; }
        .typewriter .tiptap ul { list-style-type: disc; }
        .typewriter .tiptap ol { list-style-type: decimal; }
        .typewriter .tiptap ul[data-type="taskList"] { list-style: none; padding-left: 0.3em; }
        .typewriter .tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .typewriter .tiptap ul[data-type="taskList"] li > label input[type="checkbox"] { accent-color: #333; margin-top: 4px; cursor: pointer; }
        .typewriter .tiptap ul[data-type="taskList"] li[data-checked="true"] > div { color: #aaa; text-decoration: line-through; }
        .typewriter .tiptap mark { padding: 0 2px; border-radius: 2px; font-family: ${PT} !important; }
        .typewriter .tiptap p.is-empty::before { content: attr(data-placeholder); color: rgba(0,0,0,0.2); pointer-events: none; float: left; height: 0; }
        .typewriter .tiptap sup { font-size: 0.7em; vertical-align: super; }
        .typewriter .tiptap sub { font-size: 0.7em; vertical-align: sub; }
        .tiptap, .ProseMirror { outline: none; }
        .typewriter .ProseMirror { scrollbar-width: none; caret-color: transparent; }
        .block-cursor {
          display: inline-block;
          width: 0.58em;
          height: 1.1em;
          background: #ffffff;
          mix-blend-mode: difference;
          vertical-align: text-bottom;
          margin-right: -0.58em;
          pointer-events: none;
          position: relative;
          z-index: 1;
          animation: block-blink 1s step-end infinite;
        }
        @keyframes block-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .typewriter .ProseMirror::-webkit-scrollbar { display: none; }
        .doc-scroll-area { scrollbar-width: none; }
        .doc-scroll-area::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
