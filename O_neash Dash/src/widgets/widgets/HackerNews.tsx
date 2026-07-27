import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Megaphone, ChevronLeft, ChevronRight } from 'pixelarticons/react';
import type { WidgetProps } from '../types';
import { pickDailySample, todaySeed } from '../lib/dailySample';

/** HBIOS-SYS is the Korean-glyph fallback (VT323 has no Hangul coverage). */
const FONT = "var(--font-main), var(--font-kr), monospace";
const PAGE_SIZE = 4;
const ROW_HEIGHT = 22;
const POOL_SIZE_PER_SOURCE = 15;

type FeedSource = 'HN' | 'World' | 'Korea';

const SOURCE_LABEL: Record<FeedSource, string> = {
  HN: 'HN', World: 'WORLD', Korea: 'KOREA',
};
const SOURCE_COLOR: Record<FeedSource, string> = {
  HN: '#ff6600', World: '#38bdf8', Korea: '#f87171',
};

/** Black or white, whichever contrasts better against a given fill color (YIQ perceptual brightness). */
function textColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000' : '#fff';
}

interface FeedEntry {
  id: string;
  title: string;
  link: string;
  meta: string;
  source: FeedSource;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function fetchHN(): Promise<FeedEntry[]> {
  try {
    const res = await fetch(`https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${POOL_SIZE_PER_SOURCE}`);
    if (!res.ok) return [];
    const data: { hits: { objectID: string; title: string; url: string | null; points: number }[] } = await res.json();
    return (data.hits ?? []).map(hit => ({
      id: `hn-${hit.objectID}`,
      title: hit.title,
      link: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      meta: String(hit.points),
      source: 'HN' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchRss(url: string, source: 'World' | 'Korea'): Promise<FeedEntry[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return [];
    return Array.from(doc.getElementsByTagName('item'))
      .slice(0, POOL_SIZE_PER_SOURCE)
      .map(item => {
        const title   = (item.getElementsByTagName('title')[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const link    = item.getElementsByTagName('link')[0]?.textContent ?? '';
        const pubDate = item.getElementsByTagName('pubDate')[0]?.textContent ?? '';
        return { id: link, title, link, meta: formatDate(pubDate), source };
      })
      .filter(entry => entry.title && entry.link);
  } catch {
    return [];
  }
}

export function HackerNews({ instanceId }: WidgetProps) {
  const [pool, setPool]         = useState<FeedEntry[]>([]);
  const [page, setPage]         = useState(0);
  const [error, setError]       = useState(false);
  const [selected, setSelected] = useState<FeedSource | null>('World');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchHN(),
      fetchRss('https://feeds.bbci.co.uk/news/world/rss.xml', 'World'),
      fetchRss('https://www.yna.co.kr/rss/news.xml', 'Korea'),
    ]).then(([hn, world, korea]) => {
      if (cancelled) return;
      const merged = [...hn, ...world, ...korea];
      if (merged.length === 0) { setError(true); return; }
      setPool(pickDailySample(merged, merged.length, `news-${todaySeed()}`));
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

  const toggleSource = (src: FeedSource) => {
    setSelected(s => (s === src ? null : src));
    setPage(0);
  };

  const sourceLabelColor = (src: FeedSource) =>
    selected === null ? SOURCE_COLOR[src] : selected === src ? textColorFor(SOURCE_COLOR[src]) : `${SOURCE_COLOR[src]}44`;

  const openItem = (entry: FeedEntry) => openUrl(entry.link);

  const activeTabColor = selected ? SOURCE_COLOR[selected] : null;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: FONT, padding: '40px 14px 10px', boxSizing: 'border-box', gap: 4,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Megaphone width={18} height={18} style={{ color: activeTabColor ?? 'rgba(255,255,255,0.4)' }} />
        {(['HN', 'World', 'Korea'] as const).map((src, i) => (
          <span key={src} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>/</span>}
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
              <span style={{ position: 'relative', zIndex: 1 }}>{SOURCE_LABEL[src]}</span>
              {selected === src && (
                <motion.div
                  layoutId={`hn-tab-fill-${instanceId}`}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  style={{
                    position: 'absolute', inset: '3px 2px',
                    background: SOURCE_COLOR[src],
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
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: activeTabColor ?? 'rgba(255,255,255,0.5)' }}
          >
            <ChevronLeft width={18} height={18} />
          </button>
          <button
            onClick={() => setPage(p => (p + 1) % totalPages)}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: activeTabColor ?? 'rgba(255,255,255,0.5)' }}
          >
            <ChevronRight width={18} height={18} />
          </button>
        </div>
      )}

      <div style={{ minHeight: PAGE_SIZE * ROW_HEIGHT, display: 'flex', flexDirection: 'column' }}>
        {error ? (
          <div style={{ fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textAlign: 'center', paddingTop: 20 }}>
            couldn't reach news sources
          </div>
        ) : pool.length === 0 ? (
          <div style={{ fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textAlign: 'center', paddingTop: 20 }}>
            loading…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textAlign: 'center', paddingTop: 20 }}>
            no {selected ? SOURCE_LABEL[selected].toLowerCase() : ''} entries
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
                  onClick={() => openItem(entry)}
                  style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center',
                    height: ROW_HEIGHT, width: '100%', padding: '0 4px', boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '0.85rem', color: `${SOURCE_COLOR[entry.source]}99`, flexShrink: 0 }}>
                    {entry.meta}
                  </span>
                  <span style={{
                    fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    flex: 1, minWidth: 0,
                  }}>
                    {entry.title}
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
