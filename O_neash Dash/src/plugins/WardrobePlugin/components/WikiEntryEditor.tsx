import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Typography } from '@tiptap/extension-typography';
import { Link } from '@tiptap/extension-link';
import type { WikiEntryRow, WikiCategory, BacklinkRow } from '../lib/wardrobeDb';
import { loadEntries, syncLinks, getBacklinks, updateEntry } from '../lib/wardrobeDb';
import { saveImageBlob, extFromMime, cleanupOrphanImages } from '../lib/wardrobeImageLib';
import { WikiImageExtension } from './WikiImageExtension';
import GalleryPanel from './GalleryPanel';
import { WikiLink, type WikiSuggestion } from '../../NotesPlugin/components/WikiLinkExtension';
import { WIKI_CATEGORIES, getCategoryMeta } from '../lib/wardrobeCategories';

const VT = "var(--font-main), var(--font-kr), monospace";
const PT = "'Tamzen', 'SUSE', 'KOTRAGothic', monospace";

interface WikiEntryEditorProps {
  entry: WikiEntryRow;
  onSave: (title: string, category: WikiCategory, contentJson: string) => void;
  onBack: () => void;
  onDelete: () => void;
  onNavigate: (entryId: string) => void;
}

function loadContent(json: string | null): any {
  if (!json) return '';
  try { return JSON.parse(json); } catch { return ''; }
}

export default function WikiEntryEditor({ entry, onSave, onBack, onDelete, onNavigate }: WikiEntryEditorProps) {
  const [title,        setTitle]        = useState(entry.title);
  const [category,     setCategory]     = useState<WikiCategory>(entry.category);
  const [backlinks,    setBacklinks]    = useState<BacklinkRow[]>([]);
  const [armedDelete,  setArmedDelete]  = useState(false);
  const [allEntries,   setAllEntries]   = useState<WikiEntryRow[]>([]);
  const [wikiSuggestion, setWikiSuggestion] = useState<WikiSuggestion | null>(null);
  const [wikiIdx,       setWikiIdx]       = useState(0);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const wikiCbRef = useRef({
    onSuggestion: (_: WikiSuggestion | null) => {},
    onKeyDown: (_: { event: KeyboardEvent }) => false as boolean,
  });

  const handleSetCover = useCallback((src: string) => {
    updateEntry(entry.id, { cover_image: src });
  }, [entry.id]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false }),
      Typography,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'web-link' } }),
      WikiImageExtension.configure({ onSetCover: handleSetCover }),
      WikiLink.configure({
        onSuggestion: (s: WikiSuggestion | null) => wikiCbRef.current.onSuggestion(s),
        onKeyDown:    (a: { event: KeyboardEvent }) => wikiCbRef.current.onKeyDown(a),
      }),
    ],
    content: loadContent(entry.content_json),
    editorProps: {
      handlePaste(view, event) {
        const cd = event.clipboardData;
        if (!cd) return false;
        const items = Array.from(cd.items ?? []);
        const imgItem = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
        let blob: File | Blob | null = imgItem?.getAsFile() ?? null;
        let mime = imgItem?.type ?? '';
        if (!blob) {
          const f = Array.from(cd.files ?? []).find(f => f.type.startsWith('image/'));
          if (f) { blob = f; mime = f.type; }
        }
        if (!blob || !mime) return false;
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
      onSave(title, category, json);
      syncLinks(entry.id, json).then(() => getBacklinks(entry.id).then(setBacklinks));
    },
  }, [entry.id]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(loadContent(entry.content_json), { emitUpdate: false });
    setTitle(entry.title);
    setCategory(entry.category);
    getBacklinks(entry.id).then(setBacklinks);
  }, [entry.id]);

  useEffect(() => {
    return () => { cleanupOrphanImages().catch(() => {}); };
  }, []);

  useEffect(() => { loadEntries().then(setAllEntries); }, [entry.id]);
  useEffect(() => { setWikiIdx(0); }, [wikiSuggestion?.query]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [title, entry.id]);

  const handleTitleBlur = useCallback(() => {
    if (!editor) return;
    onSave(title, category, JSON.stringify(editor.getJSON()));
  }, [title, category, editor, onSave]);

  const handleCategoryChange = useCallback((next: WikiCategory) => {
    setCategory(next);
    if (editor) onSave(title, next, JSON.stringify(editor.getJSON()));
  }, [title, editor, onSave]);

  // Click on wiki-link → navigate to target entry
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view?.dom;
    if (!dom) return;
    let active = true;
    const handleClick = async (event: MouseEvent) => {
      const el = (event.target as HTMLElement).closest('.wiki-link') as HTMLElement | null;
      if (!el) return;
      const wikiTitle = el.getAttribute('data-wiki-title');
      if (!wikiTitle) return;
      const entries = await loadEntries();
      if (!active) return;
      const target = entries.find(d => d.title.toLowerCase() === wikiTitle.toLowerCase());
      if (target) onNavigate(target.id);
    };
    dom.addEventListener('click', handleClick);
    return () => { active = false; dom.removeEventListener('click', handleClick); };
  }, [editor, onNavigate]);

  const filteredEntries = useMemo(() => {
    if (!wikiSuggestion) return [];
    const q = wikiSuggestion.query.toLowerCase();
    return allEntries
      .filter(d => d.id !== entry.id && d.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [wikiSuggestion?.query, allEntries, entry.id]);

  function insertWikiLink(target: WikiEntryRow) {
    if (!editor || !wikiSuggestion) return;
    editor.chain()
      .focus()
      .deleteRange({ from: wikiSuggestion.from, to: wikiSuggestion.to })
      .insertContentAt(wikiSuggestion.from, {
        type: 'wikiLink',
        attrs: { title: target.title, alias: null },
      })
      .run();
    setWikiSuggestion(null);
  }

  wikiCbRef.current.onSuggestion = (s) => { setWikiSuggestion(s); };
  wikiCbRef.current.onKeyDown = ({ event }) => {
    if (!wikiSuggestion) return false;
    if (event.key === 'ArrowDown') { setWikiIdx(i => Math.min(i + 1, filteredEntries.length - 1)); return true; }
    if (event.key === 'ArrowUp')   { setWikiIdx(i => Math.max(i - 1, 0)); return true; }
    if (event.key === 'Enter' && filteredEntries.length > 0) { insertWikiLink(filteredEntries[wikiIdx]); return true; }
    if (event.key === 'Escape')    { setWikiSuggestion(null); return true; }
    return false;
  };

  if (!editor) return null;

  return (
    <div className="wardrobe-wiki-editor" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>
      <style>{`
        .wardrobe-wiki-editor .tiptap { outline: none; }
        .wardrobe-wiki-editor .tiptap p { margin: 0.5em 0; }
        .wardrobe-wiki-editor .tiptap .wiki-link {
          color: #e879f9;
          border-bottom: 1px solid rgba(232,121,249,0.4);
          cursor: pointer;
          font-family: ${PT} !important;
          transition: color 0.1s, border-color 0.1s;
        }
        .wardrobe-wiki-editor .tiptap .wiki-link:hover {
          color: #f0a6fa;
          border-bottom-color: rgba(240,166,250,0.6);
        }
        .wardrobe-wiki-editor .tiptap a.web-link { color: #64c8ff; }
        .wardrobe-entry-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .wardrobe-entry-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Top chrome */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 0 10px', flexShrink: 0, gap: 14 }}>
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

        <button
          onClick={() => { if (armedDelete) { onDelete(); cleanupOrphanImages().catch(() => {}); } else { setArmedDelete(true); } }}
          onBlur={() => setArmedDelete(false)}
          style={{
            fontFamily: VT, fontSize: '0.9rem', letterSpacing: 1,
            background: armedDelete ? 'rgba(200,40,40,0.12)' : 'none',
            border: armedDelete ? '1px solid rgba(200,40,40,0.35)' : '1px solid transparent',
            color: armedDelete ? '#e05555' : 'rgba(255,255,255,0.18)',
            cursor: 'pointer', padding: '2px 10px', flexShrink: 0,
            transition: 'color 0.15s, background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={ev => { if (!armedDelete) ev.currentTarget.style.color = 'rgba(220,80,80,0.7)'; }}
          onMouseLeave={ev => { if (!armedDelete) ev.currentTarget.style.color = 'rgba(255,255,255,0.18)'; }}
        >
          {armedDelete ? 'confirm delete?' : '✕ delete'}
        </button>

        {/* Category selector — right */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {WIKI_CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => handleCategoryChange(c.key)}
              style={{
                fontFamily: VT, fontSize: '0.82rem', letterSpacing: 1,
                display: 'flex', alignItems: 'center', gap: 6,
                background: category === c.key ? `${c.color}18` : 'none',
                border: `1px solid ${category === c.key ? c.color + '55' : 'transparent'}`,
                color: category === c.key ? c.color : 'rgba(255,255,255,0.28)',
                cursor: 'pointer', padding: '3px 9px',
                transition: 'color 0.1s, background 0.1s, border-color 0.1s',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="wardrobe-entry-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, maxWidth: 1112, margin: '0 auto' }}>
      <div style={{ flex: '1 1 720px', minWidth: 0, maxWidth: 720 }}>
        <textarea
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="untitled"
          rows={1}
          style={{
            width: '100%', resize: 'none', overflow: 'hidden',
            background: 'none', border: 'none', outline: 'none',
            fontFamily: VT, fontSize: '2.4rem', letterSpacing: 2,
            color: '#fff', marginBottom: 20,
          }}
        />
        <EditorContent editor={editor} style={{ fontFamily: PT, fontSize: '1.05rem', lineHeight: 1.65, color: 'rgba(255,255,255,0.82)' }} />

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div style={{ marginTop: 50, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontFamily: VT, fontSize: '0.85rem', letterSpacing: 2, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 10 }}>
              linked from
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {backlinks.map(b => {
                const bMeta = getCategoryMeta(b.category);
                return (
                  <button
                    key={b.id}
                    onClick={() => onNavigate(b.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'none', border: 'none', textAlign: 'left',
                      cursor: 'pointer', padding: '4px 0',
                      fontFamily: PT, fontSize: '0.95rem', color: 'rgba(255,255,255,0.6)',
                    }}
                    onMouseEnter={ev => (ev.currentTarget.style.color = '#fff')}
                    onMouseLeave={ev => (ev.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: bMeta.color, flexShrink: 0 }} />
                    {b.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 432, flexShrink: 0 }}>
        <GalleryPanel entryId={entry.id} />
      </div>
      </div>
      </div>

      {/* Wiki-link autocomplete menu */}
      {createPortal(
        <AnimatePresence>
        {wikiSuggestion && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 99999 }}>
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
          <div style={{
            padding: '5px 10px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            fontFamily: VT, fontSize: '0.72rem', letterSpacing: 2,
            color: 'rgba(255,255,255,0.25)',
            textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ color: '#e879f9' }}>[[</span>
            <span>{wikiSuggestion.query || '…'}</span>
          </div>

          {filteredEntries.length === 0 ? (
            <div style={{ padding: '10px 12px', fontFamily: VT, fontSize: '0.9rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.2)' }}>
              no matches
            </div>
          ) : filteredEntries.map((d, i) => {
            const dMeta = getCategoryMeta(d.category);
            return (
              <div
                key={d.id}
                onMouseDown={e => { e.preventDefault(); insertWikiLink(d); }}
                onMouseEnter={() => setWikiIdx(i)}
                style={{
                  padding: '8px 12px 8px 10px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: i === wikiIdx ? 'rgba(232,121,249,0.1)' : 'transparent',
                  borderLeft: `2px solid ${i === wikiIdx ? '#e879f9' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'background 0.08s',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dMeta.color, flexShrink: 0 }} />
                <span style={{ fontFamily: PT, fontSize: '0.84rem', letterSpacing: 0.3, color: 'rgba(255,255,255,0.85)' }}>
                  {d.title}
                </span>
              </div>
            );
          })}
        </motion.div>
        </div>
        )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
