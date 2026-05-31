import { useState, useEffect, useRef, useCallback } from 'react';
import { getAllEntries, getOrCreateEntry, updateEntry, deleteEntry, getStreak, type JournalEntry } from './lib/journalDb';
import { saveJournalImage, toDisplaySrc, extFromMime } from './lib/journalImageLib';

const VT = "'VT323', monospace";
const PT = "'Gowun Dodum', sans-serif";
const TEAL = '#00c4a7';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Date Strip ────────────────────────────────────────────────────────────────

function DateStrip({ loggedDates, onDayClick }: {
  loggedDates: Set<string>;
  onDayClick: (date: string) => void;
}) {
  const now = new Date();
  const [yr, setYr] = useState(now.getFullYear());
  const [mo, setMo] = useState(now.getMonth());
  const todayStr = toDateStr(now);
  const stripRef = useRef<HTMLDivElement>(null);

  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const label = new Date(yr, mo, 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    .toUpperCase();

  const prev = () => mo === 0 ? (setMo(11), setYr(y => y - 1)) : setMo(m => m - 1);
  const next = () => mo === 11 ? (setMo(0), setYr(y => y + 1)) : setMo(m => m + 1);

  // Keep today centred in the strip on mount / month change
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[data-today="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [mo, yr]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 40, userSelect: 'none' }}>
      {/* Month nav row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={prev} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontFamily: VT, fontSize: '1.8rem', padding: 0, lineHeight: 1, position: 'relative', top: -3 }}>‹</button>
        <span style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: 2.5, color: 'rgba(255,255,255,0.85)' }}>{label}</span>
        <button onClick={next} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontFamily: VT, fontSize: '1.8rem', padding: 0, lineHeight: 1, position: 'relative', top: -3 }}>›</button>
      </div>

      {/* Day dots */}
      <div
        ref={stripRef}
        style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', width: '100%', justifyContent: 'center' }}
      >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = ds === todayStr;
          const hasEntry = loggedDates.has(ds);
          const isFuture = ds > todayStr;
          const isPast = !isToday && !isFuture;
          const digitColor = isToday
            ? TEAL
            : isFuture
            ? 'rgba(255,255,255,0.45)'
            : hasEntry
            ? 'rgba(255,255,255,0.92)'
            : 'rgba(220,80,80,0.8)';
          const dotColor = isToday
            ? TEAL
            : isFuture
            ? 'rgba(255,255,255,0.2)'
            : hasEntry
            ? 'rgba(255,255,255,0.85)'
            : 'rgba(220,80,80,0.65)';
          return (
            <div
              key={day}
              data-today={isToday || undefined}
              onClick={() => !isFuture && onDayClick(ds)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '5px 5px 4px',
                cursor: !isFuture ? 'pointer' : 'default',
                flexShrink: 0,
                background: isToday ? '#fff' : 'transparent',
              }}
            >
              <span style={{
                fontFamily: VT, fontSize: '1rem', lineHeight: 1,
                color: isToday ? '#000' : digitColor,
              }}>{day}</span>
              <div style={{
                width: 3, height: 3, borderRadius: '50%',
                background: isToday ? '#000' : dotColor,
                opacity: !hasEntry && !isFuture && !isToday ? 0 : 1,
                animation: isToday ? 'dot-blink 1s step-start infinite' : 'none',
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Highlight helper ──────────────────────────────────────────────────────────

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} style={{ background: '#e9ff00', color: '#000', borderRadius: 0, fontFamily: "'Gowun Dodum', sans-serif" }}>{part}</mark>
          : part
      )}
    </>
  );
}

// ── Entry Card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, isToday, query, onSave, onAddImage, onRemoveImage, onBlurEmpty, entryRef }: {
  entry: JournalEntry;
  isToday: boolean;
  query: string;
  onSave: (id: string, content: string, images: string[]) => void;
  onAddImage: (id: string) => void;
  onRemoveImage: (id: string, path: string) => void;
  onBlurEmpty: (id: string) => void;
  entryRef: (el: HTMLDivElement | null) => void;
}) {
  const [content, setContent] = useState(entry.content);
  const [visible, setVisible] = useState(isToday);
  const [hov, setHov] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const imagesRef = useRef(entry.images);
  useEffect(() => { imagesRef.current = entry.images; }, [entry.images]);
  useEffect(() => { setContent(entry.content); }, [entry.id]);

  const [y, m, d] = entry.date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const mmdd = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
  const dayAbbr = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

  // Fade in on scroll
  useEffect(() => {
    if (visible) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [entry.id, content, visible]);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    entryRef(el);
  }, [entryRef]);

  const handleChange = (val: string) => {
    setContent(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(entry.id, val, imagesRef.current), 800);
  };

  return (
    <div
      ref={setRef}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        marginBottom: 52,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
      }}
    >
      {/* Hanging date — floats in left margin */}
      <div style={{
        position: 'absolute', left: -110, top: 2,
        textAlign: 'center', userSelect: 'none',
        opacity: 1,
      }}>
        {isToday ? (
          <div style={{ fontFamily: VT, fontSize: '1.8rem', lineHeight: 1, letterSpacing: 2, color: TEAL }}>today</div>
        ) : (
          <>
            <div style={{ fontFamily: VT, fontSize: '2rem', lineHeight: 1, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 }}>{mmdd}</div>
            <div style={{ fontFamily: VT, fontSize: '1.1rem', letterSpacing: 1.5, color: 'rgba(255,255,255,0.45)', marginTop: 0 }}>{dayAbbr}</div>
          </>
        )}
      </div>

      {/* Content */}
      <div>
        {query.trim() ? (
          <div style={{
            fontFamily: PT, fontSize: '1rem', lineHeight: 1.85,
            color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            <Highlighted text={content} query={query} />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => handleChange(e.target.value)}
            onBlur={() => { if (!content.trim() && !isToday) { clearTimeout(saveTimer.current); onBlurEmpty(entry.id); } }}
            placeholder={isToday ? 'write anything.' : ''}
            rows={1}
            style={{
              width: '100%', boxSizing: 'border-box' as const,
              background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', overflow: 'hidden',
              fontFamily: PT, fontSize: '1rem', lineHeight: 1.85,
              color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3,
              caretColor: TEAL,
            }}
          />
        )}

        {/* Images */}
        {entry.images.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {entry.images.map(path => (
              <div key={path} style={{ position: 'relative', flexShrink: 0 }}>
                <img src={toDisplaySrc(path)} style={{ width: 130, height: 96, objectFit: 'cover', display: 'block' }} />
                <button
                  onClick={() => onRemoveImage(entry.id, path)}
                  style={{
                    position: 'absolute', top: 3, right: 3,
                    background: 'rgba(0,0,0,0.72)', border: 'none',
                    color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                    fontFamily: VT, fontSize: '0.62rem', padding: '1px 5px', lineHeight: 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => onAddImage(entry.id)}
          style={{
            marginTop: 12, background: 'none', border: 'none',
            fontFamily: VT, fontSize: '0.68rem', letterSpacing: 1.5,
            color: 'rgba(255,255,255,0.13)', cursor: 'pointer', padding: 0,
            transition: 'color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = TEAL; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.13)'; }}
        >
          + image
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function JournalPlugin() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const entryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingEntryId = useRef<string | null>(null);
  const provisionalIds = useRef<Set<string>>(new Set());
  const todayStr = toDateStr(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    await getOrCreateEntry(todayStr);
    const [all, s] = await Promise.all([getAllEntries(), getStreak()]);
    setEntries(all);
    setLoggedDates(new Set(all.map(e => e.date)));
    setStreak(s);
    setLoading(false);
  }, [todayStr]);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!loading) setTimeout(() => scrollToDate(todayStr), 80);
  }, [loading]);

  const scrollToDate = (date: string) => {
    const el = entryRefs.current.get(date);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSave = useCallback(async (id: string, content: string, images: string[]) => {
    await updateEntry(id, content, images);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, content, images } : e));
  }, []);

  const handleBlurEmpty = useCallback(async (id: string) => {
    provisionalIds.current.delete(id);
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    await deleteEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
    setLoggedDates(prev => { const next = new Set(prev); next.delete(entry.date); return next; });
  }, [entries]);

  const handleAddImage = (entryId: string) => {
    pendingEntryId.current = entryId;
    fileInputRef.current?.click();
  };

  const handleImageFile = async (file: File) => {
    const id = pendingEntryId.current;
    if (!id) return;
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    const path = await saveJournalImage(file, extFromMime(file.type));
    await handleSave(id, entry.content, [...entry.images, path]);
  };

  const handleRemoveImage = async (entryId: string, path: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    await handleSave(entryId, entry.content, entry.images.filter(p => p !== path));
  };

  const displayed = query.trim()
    ? entries.filter(e =>
        e.content.toLowerCase().includes(query.toLowerCase()) || e.date.includes(query),
      )
    : entries;

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', fontFamily: VT, color: 'rgba(255,255,255,0.2)', fontSize: '1rem', letterSpacing: 2 }}>
      loading...
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>
      <style>{`@keyframes dot-blink { 0%,100%{opacity:1} 50%{opacity:0} } *::-webkit-scrollbar { display: none; }`}</style>

      {/* Header */}
      <div style={{ padding: '112px 160px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 32 }}>
          <span style={{ fontFamily: VT, fontSize: '2rem', letterSpacing: 5, color: TEAL, textTransform: 'uppercase', lineHeight: 1 }}>journal</span>
          <div style={{ flex: 1 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search..."
            style={{
              fontFamily: PT, fontSize: '0.88rem', letterSpacing: 1,
              background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)', outline: 'none', padding: '2px 4px', width: 280,
            }}
          />
        </div>

        {/* Date strip */}
        <DateStrip
          loggedDates={loggedDates}
          onDayClick={async date => {
            setQuery('');
            if (!loggedDates.has(date)) {
              const entry = await getOrCreateEntry(date);
              provisionalIds.current.add(entry.id);
              const all = await getAllEntries();
              setEntries(all);
              setLoggedDates(new Set(all.map(e => e.date)));
            }
            setTimeout(() => scrollToDate(date), 80);
          }}
        />
      </div>

      {/* Entry chain */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '8px 460px 80px', scrollbarWidth: 'none' as const }}
      >
        {displayed.length === 0 && (
          <div style={{ fontFamily: VT, fontSize: '0.88rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 1, paddingLeft: 80 }}>
            no entries found.
          </div>
        )}
        {displayed.map(entry => (
          <EntryCard
            key={entry.id}
            entry={entry}
            isToday={entry.date === todayStr}
            query={query}
            onSave={handleSave}
            onAddImage={handleAddImage}
            onRemoveImage={handleRemoveImage}
            onBlurEmpty={handleBlurEmpty}
            entryRef={el => {
              if (el) entryRefs.current.set(entry.date, el);
              else entryRefs.current.delete(entry.date);
            }}
          />
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) await handleImageFile(file);
        }}
      />
    </div>
  );
}
