import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Bulletlist } from 'pixelarticons/react';
import { AnimatePresence, motion } from 'framer-motion';
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
import { Link } from '@tiptap/extension-link';
import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { common, createLowlight } from 'lowlight';
import type { Editor } from '@tiptap/react';
import type { NoteRow } from '../lib/notesDb';
import { loadNotes, syncLinks, getBacklinks, type BacklinkRow } from '../lib/notesDb';
import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';
import { CommentMark } from './CommentExtension';
import CommentPanel from './CommentPanel';
import { useCommentsStore } from '../store/useCommentsStore';
import { WikiLink, type WikiSuggestion } from './WikiLinkExtension';
import { KatexExtension } from './LatexExtension';
import LinkTransition from './LinkTransition';
import { exportDocumentPdf } from '../lib/exportPdf';
import { WebLinkView } from './WebLinkView';
import { NotesImageExtension } from './NotesImageExtension';
import { saveImageBlob, extFromMime, cleanupOrphanImages } from '../lib/notesImageLib';
import 'katex/dist/katex.min.css';

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
const PT = "'SUSE', 'KOTRAGothic', monospace";

// ── Migrate legacy inlineMath/blockMath nodes → plain $...$ text ──────────────

function migrateMathNodes(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'inlineMath') {
    return { type: 'text', text: `$${node.attrs?.formula ?? ''}$` };
  }
  if (node.type === 'blockMath') {
    return { type: 'paragraph', content: [{ type: 'text', text: `$$${node.attrs?.formula ?? ''}$$` }] };
  }
  if (Array.isArray(node.content)) {
    return { ...node, content: node.content.map(migrateMathNodes) };
  }
  return node;
}

function loadContent(json: string | null) {
  if (!json) return '';
  try { return migrateMathNodes(JSON.parse(json)); } catch { return ''; }
}

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
          fontFamily: VT, fontSize: '1.25rem',
          background: active ? 'rgba(255,255,255,0.14)' : hov ? 'rgba(255,255,255,0.07)' : 'transparent',
          border: `1px solid ${active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
          color: active ? '#fff' : hov ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
          padding: '3px 10px', cursor: 'pointer', minWidth: 34,
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
  return <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px', flexShrink: 0 }} />;
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
          fontFamily: VT, fontSize: '1.25rem',
          background: open ? 'rgba(255,255,255,0.14)' : 'transparent',
          border: `1px solid ${open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
          color: open ? '#fff' : 'rgba(255,255,255,0.6)',
          padding: '3px 10px', cursor: 'pointer', lineHeight: 1.6,
          transition: 'all 0.1s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}
      >
        <span style={{ lineHeight: 1, fontSize: '1.1rem' }}>A</span>
        <span style={{
          display: 'block', width: 14, height: 3, borderRadius: 1,
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

// ── Link toolbar button ───────────────────────────────────────────────────────

function LinkToolbar({ editor }: { editor: Editor }) {
  const [open, setOpen]     = useState(false);
  const [url, setUrl]       = useState('');
  const inputRef            = useRef<HTMLInputElement>(null);
  const wrapRef             = useRef<HTMLDivElement>(null);
  const isActive            = editor.isActive('link');

  const openPopover = () => {
    const existing = editor.getAttributes('link').href ?? '';
    setUrl(existing);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const apply = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      editor.chain().focus().setLink({ href }).run();
    }
    setOpen(false);
  };

  const remove = () => {
    editor.chain().focus().unsetLink().run();
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const [hov, setHov] = useState(false);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onMouseDown={e => { e.preventDefault(); openPopover(); }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title="Web link"
        style={{
          fontFamily: VT, fontSize: '1.1rem',
          background: isActive ? 'rgba(255,255,255,0.14)' : hov ? 'rgba(255,255,255,0.07)' : 'transparent',
          border: `1px solid ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
          color: isActive ? '#4ade80' : hov ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
          padding: '3px 10px', cursor: 'pointer', minWidth: 34,
          textAlign: 'center' as const, lineHeight: 1.6,
          transition: 'all 0.1s',
        }}
      >⌁</button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: '#111', border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
          padding: '10px 12px', zIndex: 200, minWidth: 260,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <input
            ref={inputRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setOpen(false); }}
            placeholder="https://..."
            style={{
              fontFamily: VT, fontSize: '0.85rem', letterSpacing: 0.5,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', padding: '5px 10px', outline: 'none', width: '100%',
              boxSizing: 'border-box' as const,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onMouseDown={e => { e.preventDefault(); apply(); }}
              style={{
                flex: 1, fontFamily: VT, fontSize: '0.8rem', letterSpacing: 1,
                background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)',
                color: '#4ade80', padding: '4px 0', cursor: 'pointer',
              }}
            >set link</button>
            {isActive && (
              <button
                onMouseDown={e => { e.preventDefault(); remove(); }}
                style={{
                  fontFamily: VT, fontSize: '0.8rem', letterSpacing: 1,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171', padding: '4px 10px', cursor: 'pointer',
                }}
              >remove</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TypewriterEditor ──────────────────────────────────────────────────────────

interface Props {
  doc:         NoteRow;
  onSave:      (title: string, json: string) => void;
  onBack:      () => void;
  onDelete?:   () => void;
  onNavigate?: (docId: string) => void;
}

export default function TypewriterEditor({ doc, onSave, onBack, onDelete, onNavigate }: Props) {
  const [title,    setTitle]    = useState(doc.title ?? '');
  const [zoom,     setZoom]     = useState(1.3);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeHeadingIdx, setActiveHeadingIdx] = useState<number | null>(null);
  const titleRef         = useRef<HTMLTextAreaElement>(null);
  const imageInputRef    = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { arcs, projects } = usePlannerStore();
  const arc     = doc.arc_id     ? arcs.find(a => a.id === doc.arc_id)         : null;
  const project = doc.project_id ? projects.find(p => p.id === doc.project_id) : null;

  // ── Comments ──────────────────────────────────────────────────────────────
  const { comments, activeId, load: loadComments, add: addComment, remove: removeComment, update: updateComment, setActive } = useCommentsStore();
  const [hasSelection,   setHasSelection]   = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [backlinks,      setBacklinks]      = useState<BacklinkRow[]>([]);
  const [armedDelete,    setArmedDelete]    = useState(false);
  const [allDocs,        setAllDocs]        = useState<NoteRow[]>([]);
  const [linkTx,         setLinkTx]        = useState<{ toDocId: string } | null>(null);
  const [wikiSuggestion, setWikiSuggestion] = useState<WikiSuggestion | null>(null);
  const [wikiIdx,        setWikiIdx]        = useState(0);

  // Stable ref so ProseMirror plugin always calls current handler without stale closures
  const wikiCbRef = useRef({
    onSuggestion: (_: WikiSuggestion | null) => {},
    onKeyDown: (_: { event: KeyboardEvent }) => false as boolean,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, underline: false, link: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Highlight.configure({ multicolor: true }),
      TextStyle, Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline, Superscript, Subscript,
      TaskList, TaskItem.configure({ nested: true }),
      Typography, BlockCursorExtension,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'web-link' } }),
      CommentMark,
      KatexExtension,
      WebLinkView,
      NotesImageExtension,
      WikiLink.configure({
        onSuggestion: (s) => wikiCbRef.current.onSuggestion(s),
        onKeyDown:    (a) => wikiCbRef.current.onKeyDown(a),
      }),
    ],
    content: loadContent(doc.content_json),
    editorProps: {
      handlePaste(view, event) {
        const cd = event.clipboardData;
        if (!cd) return false;

        // Find image in clipboard items or files
        const items = Array.from(cd.items ?? []);
        const imgItem = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
        let blob: File | Blob | null = imgItem?.getAsFile() ?? null;
        let mime = imgItem?.type ?? '';

        if (!blob) {
          const f = Array.from(cd.files ?? []).find(f => f.type.startsWith('image/'));
          if (f) { blob = f; mime = f.type; }
        }

        if (!blob || !mime) return false;

        // Return true synchronously so ProseMirror doesn't process the event,
        // then do the async save + insert.
        saveImageBlob(blob, extFromMime(mime)).then(path => {
          view.dispatch(
            view.state.tr.replaceSelectionWith(
              view.state.schema.nodes.image.create({ src: path })
            )
          );
        });
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFile = files.find(f => f.type.startsWith('image/'));
        if (!imageFile) return false;
        event.preventDefault();
        const ext = extFromMime(imageFile.type);
        saveImageBlob(imageFile, ext).then(path => {
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const pos = coords?.pos ?? view.state.doc.content.size;
          view.dispatch(
            view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src: path }))
          );
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON());
      onSave(title, json);
      setHeadings(extractHeadings(editor.getJSON()));
      syncLinks(doc.id, json).then(() => getBacklinks(doc.id).then(setBacklinks));
    },
  }, [doc.id]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(loadContent(doc.content_json), false);
    setTitle(doc.title ?? '');
    setHeadings(extractHeadings(editor.getJSON()));
    loadComments(doc.id);
    getBacklinks(doc.id).then(setBacklinks);
  }, [doc.id]);

  useEffect(() => {
    if (editor) setHeadings(extractHeadings(editor.getJSON()));
  }, [editor]);

  // Orphan image cleanup — runs once when the editor unmounts (user navigates away)
  useEffect(() => {
    return () => { cleanupOrphanImages().catch(() => {}); };
  }, []);

  // Load all docs for wiki-link autocomplete
  useEffect(() => { loadNotes('document').then(setAllDocs); }, [doc.id]);

  // Reset selected index when query changes
  useEffect(() => { setWikiIdx(0); }, [wikiSuggestion?.query]);


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

  // 6e — scroll active comment mark into view
  useEffect(() => {
    if (!activeId) return;
    const comment = comments.find(c => c.id === activeId);
    if (!comment) return;
    const el = scrollContainerRef.current?.querySelector(`[data-comment-id="${comment.mark_id}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeId]);

  // Track whether editor has a non-empty selection
  useEffect(() => {
    if (!editor) return;
    const update = () => setHasSelection(!editor.state.selection.empty);
    editor.on('selectionUpdate', update);
    editor.on('blur', () => setHasSelection(false));
    return () => { editor.off('selectionUpdate', update); };
  }, [editor]);

  // Track active heading (whichever section the cursor is currently inside)
  useEffect(() => {
    if (!editor) return;
    const updateActiveHeading = () => {
      const { state } = editor;
      const from = state.selection.from;
      let lastIdx: number | null = null;
      let hIdx = 0;
      state.doc.forEach((node, offset) => {
        if (node.type.name === 'heading') {
          if (offset <= from) lastIdx = hIdx;
          hIdx++;
        }
      });
      setActiveHeadingIdx(lastIdx);
    };
    editor.on('selectionUpdate', updateActiveHeading);
    editor.on('transaction', updateActiveHeading);
    return () => {
      editor.off('selectionUpdate', updateActiveHeading);
      editor.off('transaction', updateActiveHeading);
    };
  }, [editor]);

  // Click on comment mark → set active
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view?.dom;
    if (!dom) return;
    const handleClick = (event: MouseEvent) => {
      const markEl = (event.target as HTMLElement).closest('[data-comment-id]') as HTMLElement | null;
      if (markEl) {
        const markId = markEl.getAttribute('data-comment-id');
        const c = useCommentsStore.getState().comments.find(x => x.mark_id === markId);
        if (c) useCommentsStore.getState().setActive(c.id);
      }
    };
    dom.addEventListener('click', handleClick);
    return () => { dom.removeEventListener('click', handleClick); };
  }, [editor]);

  // Click on wiki-link → navigate to target document
  useEffect(() => {
    if (!editor || !onNavigate) return;
    const dom = editor.view?.dom;
    if (!dom) return;
    let active = true;
    const handleClick = async (event: MouseEvent) => {
      const el = (event.target as HTMLElement).closest('.wiki-link') as HTMLElement | null;
      if (!el) return;
      const wikiTitle = el.getAttribute('data-wiki-title');
      if (!wikiTitle) return;
      const allDocs = await loadNotes('document');
      if (!active) return;
      const target = allDocs.find(d => (d.title ?? '').toLowerCase() === wikiTitle.toLowerCase());
      if (target) setLinkTx({ toDocId: target.id });
    };
    dom.addEventListener('click', handleClick);
    return () => { active = false; dom.removeEventListener('click', handleClick); };
  }, [editor, onNavigate]);

  // ── Wiki-link autocomplete ────────────────────────────────────────────────
  const filteredDocs = useMemo(() => {
    if (!wikiSuggestion) return [];
    const q = wikiSuggestion.query.toLowerCase();
    return allDocs
      .filter(d => d.id !== doc.id && (d.title ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [wikiSuggestion?.query, allDocs, doc.id]);

  function insertWikiLink(target: NoteRow) {
    if (!editor || !wikiSuggestion) return;
    editor.chain()
      .focus()
      .deleteRange({ from: wikiSuggestion.from, to: wikiSuggestion.to })
      .insertContentAt(wikiSuggestion.from, {
        type: 'wikiLink',
        attrs: { title: target.title ?? 'untitled', alias: null },
      })
      .run();
    setWikiSuggestion(null);
  }

  // Update ref callbacks every render so the ProseMirror plugin always calls current logic
  wikiCbRef.current.onSuggestion = (s) => { setWikiSuggestion(s); };
  wikiCbRef.current.onKeyDown = ({ event }) => {
    if (!wikiSuggestion) return false;
    if (event.key === 'ArrowDown') { setWikiIdx(i => Math.min(i + 1, filteredDocs.length - 1)); return true; }
    if (event.key === 'ArrowUp')   { setWikiIdx(i => Math.max(i - 1, 0)); return true; }
    if (event.key === 'Enter' && filteredDocs.length > 0) { insertWikiLink(filteredDocs[wikiIdx]); return true; }
    if (event.key === 'Escape')    { setWikiSuggestion(null); return true; }
    return false;
  };

  if (!editor) return null;
  const e = editor;

  const zoomIn  = () => setZoom(z => Math.min(ZOOM_MAX,  +(z + ZOOM_STEP).toFixed(1)));
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(1)));

  // Comment handlers
  function handleStartCompose() {
    if (!editor) return;
    const { selection } = editor.state;
    if (selection.empty) return;
    setSelectionRange({ from: selection.from, to: selection.to });
  }

  async function handleSubmitComment(body: string) {
    if (!editor || !selectionRange) return;
    const markId = Math.random().toString(36).slice(2, 18);
    const mark = editor.schema.marks.comment.create({ id: markId });
    const { tr } = editor.state;
    tr.addMark(selectionRange.from, selectionRange.to, mark);
    editor.view.dispatch(tr);
    await addComment(doc.id, markId, body);
    setSelectionRange(null);
    onSave(title, JSON.stringify(editor.getJSON()));
  }

  function handleCancelCompose() {
    setSelectionRange(null);
  }

  const scrollToHeading = (index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const els = container.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3');
    const target = els[index];
    if (!target) return;
    // Position the heading 220px from the top — below the 180px gradient fade
    const offsetInContainer = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: offsetInContainer - 220, behavior: 'smooth' });
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

        {/* Delete */}
        {onDelete && (
          <button
            onClick={() => { if (armedDelete) { onDelete(); cleanupOrphanImages().catch(() => {}); } else { setArmedDelete(true); } }}
            onBlur={() => setArmedDelete(false)}
            style={{
              fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1,
              background: armedDelete ? 'rgba(200,40,40,0.12)' : 'none',
              border: armedDelete ? '1px solid rgba(200,40,40,0.35)' : '1px solid transparent',
              color: armedDelete ? '#e05555' : 'rgba(255,255,255,0.18)',
              cursor: 'pointer', padding: '2px 10px', marginLeft: 14, flexShrink: 0,
              transition: 'color 0.15s, background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={ev => { if (!armedDelete) ev.currentTarget.style.color = 'rgba(220,80,80,0.7)'; }}
            onMouseLeave={ev => { if (!armedDelete) ev.currentTarget.style.color = 'rgba(255,255,255,0.18)'; }}
          >
            {armedDelete ? 'confirm delete?' : '✕ delete'}
          </button>
        )}

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

      {/* Content area — relative container; TOC, toolbar, scroll area, and comment panel all float inside */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>

        {/* Toolbar — floating, centred above the paper */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 3,
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.55)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          padding: '6px 14px',
        }}>
          <TB label="B"   active={e.isActive('bold')}        onClick={() => e.chain().focus().toggleBold().run()}        title="Bold" />
          <TB label="I"   active={e.isActive('italic')}      onClick={() => e.chain().focus().toggleItalic().run()}      title="Italic" />
          <TB label="U"   active={e.isActive('underline')}   onClick={() => e.chain().focus().toggleUnderline().run()}   title="Underline" />
          <TB label="S"   active={e.isActive('strike')}      onClick={() => e.chain().focus().toggleStrike().run()}      title="Strike" />
          <ColorTextPopover editor={e} />
          <Sep />
          <TB label="H1" title="Heading 1" active={e.isActive('heading', { level: 1 })} onClick={() => e.chain().focus().toggleHeading({ level: 1 }).run()} />
          <TB label="H2" title="Heading 2" active={e.isActive('heading', { level: 2 })} onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} />
          <TB label="H3" title="Heading 3" active={e.isActive('heading', { level: 3 })} onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} />
          <Sep />
          <TB label="❝"  title="Blockquote" active={e.isActive('blockquote')} onClick={() => e.chain().focus().toggleBlockquote().run()} />
          <TB label="{}" title="Code block"  active={e.isActive('codeBlock')}  onClick={() => e.chain().focus().toggleCodeBlock().run()}  />
          <Sep />
          <TB label="•"  title="Bullet list"  active={e.isActive('bulletList')}  onClick={() => e.chain().focus().toggleBulletList().run()}  />
          <TB label="1." title="Ordered list" active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()} />
          <TB label="☐"  title="Task list"    active={e.isActive('taskList')}    onClick={() => e.chain().focus().toggleTaskList().run()}    />
          <Sep />
          <TB label="x²" title="Superscript" active={e.isActive('superscript')} onClick={() => e.chain().focus().toggleSuperscript().run()} />
          <TB label="x₂" title="Subscript"   active={e.isActive('subscript')}   onClick={() => e.chain().focus().toggleSubscript().run()}   />
          <Sep />
          <LinkToolbar editor={e} />
          <TB
            label="🖼"
            title="Insert image"
            onClick={() => imageInputRef.current?.click()}
          />
          <Sep />
          <TB
            label="PDF"
            title="Export as PDF"
            onClick={() => {
              if (!editor) return;
              exportDocumentPdf({
                title,
                arc:       arc ?? null,
                project:   project ?? null,
                createdAt: doc.created_at,
                updatedAt: doc.updated_at,
                editorDom: editor.view.dom,
              });
            }}
          />
        </div>
        {/* Hidden file input for image picking */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async ev => {
            const file = ev.target.files?.[0];
            if (!file || !e) return;
            ev.target.value = '';
            const ext  = extFromMime(file.type);
            const path = await saveImageBlob(file, ext);
            e.chain().focus().setImage({ src: path }).run();
          }}
        />

        {/* Top fade — masks paper content as it scrolls under the toolbar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 240,
          height: 180,
          background: `linear-gradient(to bottom,
            #000 0%,
            rgba(0,0,0,0.97) 6%,
            rgba(0,0,0,0.92) 12%,
            rgba(0,0,0,0.83) 19%,
            rgba(0,0,0,0.7)  27%,
            rgba(0,0,0,0.55) 36%,
            rgba(0,0,0,0.39) 46%,
            rgba(0,0,0,0.25) 56%,
            rgba(0,0,0,0.13) 66%,
            rgba(0,0,0,0.05) 76%,
            rgba(0,0,0,0.01) 88%,
            transparent 100%
          )`,
          zIndex: 15,
          pointerEvents: 'none',
        }} />

        {/* Bottom fade */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 240,
          height: 120,
          background: `linear-gradient(to top,
            #000 0%,
            rgba(0,0,0,0.97) 6%,
            rgba(0,0,0,0.92) 12%,
            rgba(0,0,0,0.83) 19%,
            rgba(0,0,0,0.7)  27%,
            rgba(0,0,0,0.55) 36%,
            rgba(0,0,0,0.39) 46%,
            rgba(0,0,0,0.25) 56%,
            rgba(0,0,0,0.13) 66%,
            rgba(0,0,0,0.05) 76%,
            rgba(0,0,0,0.01) 88%,
            transparent 100%
          )`,
          zIndex: 15,
          pointerEvents: 'none',
        }} />

        {/* TOC outline — absolute, left side, vertically centred */}
        {headings.length > 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: 340, zIndex: 10,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '0 0 0 0',
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0 6px 24px' }}>
              <span style={{ color: '#f5c842', display: 'flex', alignItems: 'center' }}><Bulletlist size={22} /></span>
              <span style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: '4px', color: '#f5c842', textTransform: 'uppercase', lineHeight: 1 }}>[OUTLINE]</span>
            </div>
            <div className="toc-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 0, pointerEvents: 'auto', overflowY: 'auto', maxHeight: '60vh', scrollbarWidth: 'none' }}>
              {headings.map(h => {
                const isActive = h.index === activeHeadingIdx;
                const baseColor = isActive
                  ? '#00c4a7'
                  : h.level === 1
                  ? '#00c4a7'
                  : h.level === 2
                  ? 'rgba(255,255,255,0.88)'
                  : 'rgba(255,255,255,0.4)';
                return (
                  <button
                    key={h.index}
                    onClick={() => scrollToHeading(h.index)}
                    title={h.text}
                    style={{
                      all: 'unset',
                      display: 'block',
                      width: '100%',
                      boxSizing: 'border-box',
                      paddingLeft: 24 + (h.level - 1) * 16,
                      paddingRight: 16,
                      paddingTop: 2, paddingBottom: 2,
                      fontFamily: VT,
                      fontSize: h.level === 1 ? '1.25rem' : h.level === 2 ? '1.05rem' : '0.95rem',
                      letterSpacing: 0.5,
                      color: baseColor,
                      background: isActive ? 'rgba(0,196,167,0.08)' : 'transparent',
                      borderLeft: isActive ? '2px solid rgba(0,196,167,0.7)' : '2px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      lineHeight: 1.15,
                      transition: 'color 0.1s, background 0.1s',
                    }}
                    onMouseEnter={ev => (ev.currentTarget.style.color = 'rgba(0,196,167,0.9)')}
                    onMouseLeave={ev => (ev.currentTarget.style.color = baseColor)}
                  >
                    {h.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable page area — fills entire content area so paper centres in full width */}
        <div ref={scrollContainerRef} className="doc-scroll-area" style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '200px 40px 80px', scrollbarWidth: 'none' }}>

        {/* Paper */}
        <div style={{
          maxWidth: 700, margin: '0 auto',
          background: '#ffffff',
          boxShadow: '0 8px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
          padding: '36px 48px 48px',
          minHeight: 800,
          zoom,
        }}>
          {/* Metadata */}
          <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            {/* Left: arc / project / dates — wraps if needed */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {arc && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: arc.color_hex,
                  color: '#fff',
                  fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1.5,
                  padding: '2px 8px 2px 6px',
                  textTransform: 'uppercase',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', flexShrink: 0 }} />
                  {arc.name}
                </span>
              )}
              {project && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: '#1a1a1a',
                  color: '#fff',
                  fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1.5,
                  padding: '2px 8px',
                  textTransform: 'uppercase',
                }}>
                  {project.name}
                </span>
              )}
              {(arc || project) && <span style={{ color: 'rgba(0,0,0,0.15)', fontFamily: VT, fontSize: '0.72rem' }}>|</span>}
              <span style={{ fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1, lineHeight: 1 }}>
                <span style={{ color: '#888', textTransform: 'uppercase', marginRight: 5 }}>created</span>
                <span style={{ color: '#111' }}>{fmtDate(doc.created_at)}</span>
              </span>
              <span style={{ fontFamily: VT, fontSize: '0.72rem', letterSpacing: 1, lineHeight: 1 }}>
                <span style={{ color: '#888', textTransform: 'uppercase', marginRight: 5 }}>modified</span>
                <span style={{ color: '#111' }}>{fmtDate(doc.updated_at)}</span>
              </span>
            </div>

            {/* Mycelium badge — always top-right */}
            <img
              src="/icons/character/minibadge.png"
              alt="mycelium"
              style={{ height: 22, width: 'auto', flexShrink: 0, opacity: 0.65, userSelect: 'none' }}
              draggable={false}
            />
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

          {/* Backlinks panel */}
          {backlinks.length > 0 && (
            <div style={{ marginTop: 60, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontFamily: VT, fontSize: '0.7rem', letterSpacing: 2, color: '#aaa', textTransform: 'uppercase', marginBottom: 10 }}>
                linked from
              </div>
              {backlinks.map(bl => (
                <button
                  key={bl.id}
                  onMouseDown={() => { if (onNavigate) setLinkTx({ toDocId: bl.id }); }}
                  style={{
                    all: 'unset', display: 'block', width: '100%',
                    fontFamily: PT, fontSize: '0.82rem',
                    color: '#0078d7', cursor: 'pointer',
                    padding: '4px 0', transition: 'color 0.1s',
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.color = '#005ba1')}
                  onMouseLeave={ev => (ev.currentTarget.style.color = '#0078d7')}
                >
                  {bl.title ?? 'Untitled'}
                </button>
              ))}
            </div>
          )}
        </div>
        </div>{/* end scroll area */}

        {/* Comment panel — floating right */}
        <CommentPanel
          hasSelection={hasSelection}
          composing={selectionRange !== null}
          onStartCompose={handleStartCompose}
          onSubmitComment={handleSubmitComment}
          onCancelCompose={handleCancelCompose}
          comments={comments}
          activeId={activeId}
          onDelete={id => {
            const c = comments.find(x => x.id === id);
            if (c && editor) {
              const { tr, doc: pmDoc } = editor.state;
              pmDoc.descendants((node, pos) => {
                node.marks.forEach(mark => {
                  if (mark.type.name === 'comment' && mark.attrs.id === c.mark_id) {
                    tr.removeMark(pos, pos + node.nodeSize, mark.type);
                  }
                });
              });
              editor.view.dispatch(tr);
            }
            removeComment(id);
          }}
          onUpdate={updateComment}
          onSetActive={setActive}
        />

        {/* Wiki-link autocomplete menu */}
        {createPortal(
          <AnimatePresence>
          {wikiSuggestion && (
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 99999,
          }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1,    y: 0   }}
            exit={{    opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              minWidth: 220, maxWidth: 340,
              background: 'rgba(8,8,8,0.97)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              overflow: 'hidden',
            }}>
            {/* Search indicator */}
            <div style={{
              padding: '5px 10px 4px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              fontFamily: VT, fontSize: '0.72rem', letterSpacing: 2,
              color: 'rgba(255,255,255,0.25)',
              textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: '#00c4a7' }}>[[</span>
              <span>{wikiSuggestion.query || '…'}</span>
            </div>

            {filteredDocs.length === 0 ? (
              <div style={{
                padding: '10px 12px',
                fontFamily: VT, fontSize: '0.9rem', letterSpacing: 0.5,
                color: 'rgba(255,255,255,0.2)',
              }}>
                no matches
              </div>
            ) : filteredDocs.map((d, i) => (
              <div
                key={d.id}
                onMouseDown={e => { e.preventDefault(); insertWikiLink(d); }}
                onMouseEnter={() => setWikiIdx(i)}
                style={{
                  padding: '8px 12px 8px 10px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: i === wikiIdx ? 'rgba(0,196,167,0.1)' : 'transparent',
                  borderLeft: `2px solid ${i === wikiIdx ? '#00c4a7' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'background 0.08s',
                }}
              >
                <span style={{
                  fontFamily: PT, fontSize: '0.84rem', letterSpacing: 0.3,
                  color: i === wikiIdx ? '#fff' : 'rgba(255,255,255,0.65)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  flex: 1,
                }}>
                  {d.title ?? 'untitled'}
                </span>
                {i === wikiIdx && (
                  <span style={{ fontFamily: VT, fontSize: '0.65rem', color: 'rgba(0,196,167,0.6)', flexShrink: 0 }}>
                    ↵
                  </span>
                )}
              </div>
            ))}

            <div style={{
              padding: '4px 10px 5px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontFamily: VT, fontSize: '0.62rem', letterSpacing: 1.5,
              color: 'rgba(255,255,255,0.18)',
              display: 'flex', gap: 12,
            }}>
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc cancel</span>
            </div>
          </motion.div>
          </div>
          )}
          </AnimatePresence>,
          document.body
        )}
      {/* Link transition overlay */}
      {linkTx && onNavigate && (
        <LinkTransition
          fromDocId={doc.id}
          toDocId={linkTx.toDocId}
          onComplete={() => {
            const id = linkTx.toDocId;
            setLinkTx(null);
            onNavigate(id);
          }}
        />
      )}

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
        .typewriter .tiptap h1 { font-family: ${PT} !important; font-size: 1.4rem; font-weight: 700; margin: 1.2em 0 0.4em; color: #111; }
        .typewriter .ProseMirror h2,
        .typewriter .tiptap h2 { font-family: ${PT} !important; font-size: 1.15rem; font-weight: 700; margin: 1em 0 0.35em; color: #111; }
        .typewriter .ProseMirror h3,
        .typewriter .tiptap h3 { font-family: ${PT} !important; font-size: 1.0rem; font-weight: 700; margin: 0.8em 0 0.3em; color: #333; }
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
        .toc-scroll::-webkit-scrollbar { display: none; }
        .typewriter .ProseMirror { scrollbar-width: none; caret-color: transparent; }
        .typewriter ::selection { background: #1a4acc; color: #fff; }
        .typewriter ::-moz-selection { background: #1a4acc; color: #fff; }
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
        .comment-mark {
          border-bottom: 2px solid rgba(245,180,60,0.6);
          cursor: pointer;
        }
        .comment-mark.active {
          background: rgba(245,180,60,0.15);
        }
        .typewriter .tiptap .wiki-link {
          color: #0078d7;
          border-bottom: 1px solid rgba(0,120,215,0.4);
          cursor: pointer;
          font-family: ${PT} !important;
          transition: color 0.1s, border-color 0.1s;
        }
        .typewriter .tiptap .wiki-link:hover {
          color: #005ba1;
          border-bottom-color: rgba(0,91,161,0.6);
        }
        .typewriter .tiptap a.web-link { color: inherit; text-decoration: none; font-family: ${PT} !important; }
        .typewriter .web-link-raw-hidden { font-size: 0; color: transparent; }
        .typewriter .web-link-btn {
          display: inline-flex; align-items: center; gap: 3px;
          font-family: ${PT} !important; font-size: 0.78em;
          color: #15803d;
          background: rgba(22,163,74,0.08);
          border: 1px solid rgba(22,163,74,0.28);
          border-radius: 3px;
          padding: 0px 6px 1px 6px;
          margin: 0 1px;
          cursor: pointer;
          vertical-align: middle;
          position: relative; top: -0.06em;
          transition: background 0.1s, border-color 0.1s, color 0.1s;
          user-select: none;
          white-space: nowrap;
        }
        .typewriter .web-link-btn:hover {
          background: rgba(22,163,74,0.14);
          border-color: rgba(22,163,74,0.5);
          color: #166534;
        }
        .typewriter .web-link-btn-arrow {
          font-size: 0.8em; opacity: 0.6;
        }
        .typewriter .tiptap img { max-width: 100%; border-radius: 4px; display: block; margin: 0 auto; }
        .typewriter .katex { font-size: 1em; }
        .typewriter span[data-latex="inline"] { vertical-align: baseline; position: relative; top: 0.1em; cursor: text; }
        .typewriter span[data-latex="display"] { overflow-x: auto; cursor: text; }
        .typewriter span[data-latex="display"] .katex-display { margin: 0; }
        .typewriter .latex-raw-hidden { font-size: 0; color: transparent; }
      `}</style>
    </div>
  );
}
