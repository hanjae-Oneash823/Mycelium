import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ClipboardNote, ChevronLeft, ChevronRight } from 'pixelarticons/react';
import type { WidgetProps } from '../types';
import { pickDailySample, todaySeed } from '../lib/dailySample';

const FONT   = "var(--font-main), var(--font-kr), monospace";
const PURPLE = '#a78bfa';
const PAGE_SIZE = 4;
const ROW_HEIGHT = 22;

/** Black or white, whichever contrasts better against a given fill color (YIQ perceptual brightness). */
function textColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000' : '#fff';
}

type JournalSource = 'Nature' | 'Cell';

interface JournalEntry {
  id: string;
  title: string;
  link: string;
  date: string;
  source: JournalSource;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CELL_RESEARCH_SECTIONS = new Set(['Article', 'Short article', 'Resource']);

const ALLOWED_TITLE_TAGS: Record<string, 'sub' | 'sup' | 'i' | 'b'> = {
  sub: 'sub', sup: 'sup', i: 'i', em: 'i', b: 'b', strong: 'b',
};

function titleNodeToReact(node: ChildNode, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  const children = Array.from(el.childNodes).map((child, i) => titleNodeToReact(child, i));
  const tag = ALLOWED_TITLE_TAGS[el.tagName.toLowerCase()];
  if (!tag) return children;

  if (tag === 'sub') return <sub key={key}>{children}</sub>;
  if (tag === 'sup') return <sup key={key}>{children}</sup>;
  if (tag === 'i') return <i key={key}>{children}</i>;
  return <b key={key}>{children}</b>;
}

/** Journal RSS titles embed raw HTML (e.g. `SrTiO<sub>3</sub>`); render the allowed subset instead of showing the tags as literal text. */
function formatTitle(title: string): ReactNode {
  const doc = new DOMParser().parseFromString(`<span>${title}</span>`, 'text/html');
  const root = doc.body.firstChild;
  if (!root) return title;
  return Array.from(root.childNodes).map((child, i) => titleNodeToReact(child, i));
}

/** Nature's primary (peer-reviewed) DOI series is s41586-*; d41586-* is News/Comment/Editorial. */
function isNatureResearchPaper(link: string, title: string): boolean {
  if (!/\/articles\/s\d+-/.test(link)) return false;
  return !/^(author|publisher) correction/i.test(title);
}

function parseRss(xml: string, source: JournalSource): JournalEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return [];
  const items = Array.from(doc.getElementsByTagName('item'));
  return items
    .map(item => {
      const title   = (item.getElementsByTagName('title')[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const link    = item.getElementsByTagName('link')[0]?.textContent ?? '';
      const date    = item.getElementsByTagName('dc:date')[0]?.textContent ?? '';
      const section = item.getElementsByTagName('prism:section')[0]?.textContent ?? '';
      return { id: link, title, link, date, source, section };
    })
    .filter(entry => source === 'Nature'
      ? isNatureResearchPaper(entry.link, entry.title)
      : CELL_RESEARCH_SECTIONS.has(entry.section))
    .map(({ section: _section, ...entry }) => entry);
}

async function fetchJournal(url: string, source: JournalSource): Promise<JournalEntry[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return parseRss(await res.text(), source);
  } catch {
    return [];
  }
}

export function ResearchFeed({ instanceId }: WidgetProps) {
  const [pool, setPool]         = useState<JournalEntry[]>([]);
  const [page, setPage]         = useState(0);
  const [error, setError]       = useState(false);
  const [selected, setSelected] = useState<JournalSource | null>('Nature');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJournal('https://www.nature.com/nature.rss', 'Nature'),
      fetchJournal('https://www.cell.com/cell/current.rss', 'Cell'),
    ]).then(([nature, cell]) => {
      if (cancelled) return;
      const merged = [...nature, ...cell];
      if (merged.length === 0) { setError(true); return; }
      setPool(pickDailySample(merged, merged.length, `journals-${todaySeed()}`));
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => (selected ? pool.filter(e => e.source === selected) : pool),
    [pool, selected],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    if (totalPages <= 1) return;
    const id = setInterval(() => setPage(p => (p + 1) % totalPages), 5000);
    return () => clearInterval(id);
  }, [totalPages, page]);

  const toggleSource = (src: JournalSource) => {
    setSelected(s => (s === src ? null : src));
    setPage(0);
  };

  const sourceLabelColor = (src: JournalSource) =>
    selected === null ? PURPLE : selected === src ? textColorFor(PURPLE) : `${PURPLE}44`;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: FONT, padding: '40px 14px 10px', boxSizing: 'border-box', gap: 4,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ClipboardNote width={18} height={18} style={{ color: PURPLE }} />
        {(['Nature', 'Cell'] as const).map((src, i) => (
          <span key={src} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ fontSize: '1.05rem', color: `${PURPLE}55`, lineHeight: 1 }}>/</span>}
            <button
              onClick={() => toggleSource(src)}
              style={{
                all: 'unset', cursor: 'pointer', fontFamily: FONT,
                fontSize: '1.05rem', letterSpacing: '2px', lineHeight: 1,
                color: sourceLabelColor(src),
                position: 'relative', padding: '3px 7px',
                display: 'inline-flex', alignItems: 'center',
                transition: 'color 0.15s ease',
              }}
            >
              <span style={{ position: 'relative', zIndex: 1 }}>{src === 'Nature' ? 'NATURE' : 'CELL'}</span>
              {selected === src && (
                <motion.div
                  layoutId={`rf-tab-fill-${instanceId}`}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  style={{
                    position: 'absolute', inset: '3px 2px',
                    background: PURPLE,
                    borderRadius: 0,
                    zIndex: 0,
                  }}
                />
              )}
            </button>
          </span>
        ))}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div style={{ position: 'absolute', top: 6, right: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setPage(p => (p - 1 + totalPages) % totalPages)}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: `${PURPLE}99` }}
          >
            <ChevronLeft width={18} height={18} />
          </button>
          <button
            onClick={() => setPage(p => (p + 1) % totalPages)}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: `${PURPLE}99` }}
          >
            <ChevronRight width={18} height={18} />
          </button>
        </div>
      )}

      <div style={{ minHeight: PAGE_SIZE * ROW_HEIGHT, display: 'flex', flexDirection: 'column' }}>
        {error ? (
          <div style={{ fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textAlign: 'center', paddingTop: 20 }}>
            couldn't reach nature/cell
          </div>
        ) : pool.length === 0 ? (
          <div style={{ fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textAlign: 'center', paddingTop: 20 }}>
            loading…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textAlign: 'center', paddingTop: 20 }}>
            no {selected?.toLowerCase()} entries
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((entry, i) => (
                <motion.button
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: 'easeOut', delay: i * 0.025 }}
                  onClick={() => openUrl(entry.link)}
                  style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center',
                    height: ROW_HEIGHT, width: '100%', padding: '0 4px', boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '0.85rem', color: `${PURPLE}99`, flexShrink: 0 }}>{formatDate(entry.date)}</span>
                  <span style={{
                    fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                    flex: 1,
                  }}>
                    {formatTitle(entry.title)}
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
