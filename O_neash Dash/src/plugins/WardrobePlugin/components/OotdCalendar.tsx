import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'pixelarticons/react';
import type { WardrobeItemRow } from '../lib/wardrobeItemsDb';
import { getItemsByIds } from '../lib/wardrobeItemsDb';
import { loadLogsForMonth, parseItemIds, type OotdLogRow } from '../lib/wardrobeOotdDb';
import { toDisplaySrc } from '../lib/wardrobeImageLib';
import Modal from './Modal';
import OotdDayEditor from './OotdDayEditor';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#e879f9';
const TODAY = new Date().toISOString().slice(0, 10);
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function OotdCalendar() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [logs, setLogs]   = useState<OotdLogRow[]>([]);
  const [items, setItems] = useState<Map<string, WardrobeItemRow>>(new Map());
  const [openDate, setOpenDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    const monthLogs = await loadLogsForMonth(year, month);
    setLogs(monthLogs);
    const allIds = [...new Set(monthLogs.flatMap(parseItemIds))];
    const rows = await getItemsByIds(allIds);
    setItems(new Map(rows.map(r => [r.id, r])));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const logByDate = useMemo(() => new Map(logs.map(l => [l.date, l])), [logs]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month - 1, 1);
    const daysInMonth  = new Date(year, month, 0).getDate();
    const leading      = firstOfMonth.getDay();
    const out: (number | null)[] = Array(leading).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [year, month]);

  const goMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  const handleClosed = () => {
    setOpenDate(null);
    load();
  };

  return (
    <div style={{ padding: '1rem 2rem 2rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button onClick={() => goMonth(-1)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.4)' }}>
          <ChevronLeft size={22} />
        </button>
        <span style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: 2, color: '#fff' }}>
          {new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })} {year}
        </span>
        <button onClick={() => goMonth(1)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.4)' }}>
          <ChevronRight size={22} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ fontFamily: VT, fontSize: '0.85rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', letterSpacing: 1 }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const date = `${year}-${pad(month)}-${pad(d)}`;
          const log = logByDate.get(date);
          const thumbs = log ? parseItemIds(log).map(id => items.get(id)).filter((it): it is WardrobeItemRow => !!it) : [];
          const isToday = date === TODAY;
          const isFuture = date > TODAY;
          return (
            <button
              key={i}
              onClick={() => setOpenDate(date)}
              style={{
                all: 'unset', cursor: 'pointer', aspectRatio: '1',
                background: 'rgba(255,255,255,0.02)',
                border: isToday ? `1px solid ${ACC}` : '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              <div style={{ padding: '3px 5px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: VT, fontSize: '0.85rem', color: isToday ? ACC : 'rgba(255,255,255,0.4)' }}>{d}</span>
                {log && isFuture && (
                  <span style={{ fontFamily: VT, fontSize: '0.7rem', color: ACC }}>plan</span>
                )}
              </div>
              {thumbs.length > 0 && (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr', gap: 1, padding: '0 2px 2px' }}>
                  {thumbs.slice(0, 4).map(it => (
                    <div key={it.id} style={{ overflow: 'hidden', background: '#000' }}>
                      {it.image_path && (
                        <img src={toDisplaySrc(it.image_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {openDate && (
        <Modal onClose={handleClosed} maxWidth={480}>
          <OotdDayEditor date={openDate} onSaved={handleClosed} onCancel={handleClosed} />
        </Modal>
      )}
    </div>
  );
}
