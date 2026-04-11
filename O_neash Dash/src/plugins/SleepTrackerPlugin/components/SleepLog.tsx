import { useState } from 'react';
import type { SleepEntry, SleepTarget } from '../lib/sleepDb';
import { durationHours, formatDuration } from '../lib/sleepDb';

const VT  = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#6366f1';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmt(dt: string): string {
  const d = new Date(dt);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function isStartLate(entry: SleepEntry, target: SleepTarget): boolean {
  const d   = new Date(entry.sleep_start);
  const h   = d.getHours(), m = d.getMinutes();
  const [th, tm] = target.target_sleep_start.split(':').map(Number);
  // Normalize both to "minutes since 20:00"
  const norm = (hh: number, mm: number) =>
    hh >= 20 ? (hh - 20) * 60 + mm : 240 + hh * 60 + mm;
  return norm(h, m) - norm(th, tm) > 30;
}

interface Props {
  entries:  SleepEntry[];
  target:   SleepTarget | null;
  onDelete: (id: number) => void;
}

export default function SleepLog({ entries, target, onDelete }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!entries.length) {
    return (
      <div style={{ fontFamily: VT, color: 'rgba(255,255,255,0.22)', padding: '20px 24px', letterSpacing: 1, fontSize: '1rem' }}>
        no entries yet — log your first night
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map(e => {
        const dur     = durationHours(e);
        const isShort = target && dur < target.target_duration;
        const isLate  = target && isStartLate(e, target);
        const dObj    = new Date(`${e.date}T12:00:00`);
        const dayLbl  = DAYS[dObj.getDay()].toUpperCase();
        const isOpen  = expanded === e.id;

        return (
          <div
            key={e.id}
            onClick={() => setExpanded(isOpen ? null : e.id)}
            style={{
              padding:      '7px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              cursor:       'pointer',
              background:   isOpen ? 'rgba(99,102,241,0.06)' : 'transparent',
              transition:   'background 0.1s',
            }}
          >
            {/* Main row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              fontFamily: VT, fontSize: '1.05rem', letterSpacing: 0.5,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.35)', minWidth: 82, fontSize: '0.95rem' }}>{e.date}</span>
              <span style={{ color: 'rgba(255,255,255,0.28)', minWidth: 32, fontSize: '0.9rem' }}>{dayLbl}</span>
              <span style={{ color: '#fff' }}>{fmt(e.sleep_start)} → {fmt(e.wake_time)}</span>
              <span style={{ color: ACC, minWidth: 68 }}>[{formatDuration(dur)}]</span>
              {isShort && <span style={{ color: '#f87171', fontSize: '0.88rem' }}>↓ short</span>}
              {isLate  && <span style={{ color: '#fbbf24', fontSize: '0.88rem' }}>↑ late</span>}
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: 6, paddingLeft: 2 }}>
                {e.notes ? (
                  <span style={{ fontFamily: VT, fontSize: '0.88rem', color: 'rgba(255,255,255,0.38)', flex: 1 }}>
                    {e.notes}
                  </span>
                ) : (
                  <span style={{ fontFamily: VT, fontSize: '0.88rem', color: 'rgba(255,255,255,0.18)', flex: 1 }}>
                    no notes
                  </span>
                )}
                <button
                  onMouseDown={ev => { ev.stopPropagation(); onDelete(e.id); }}
                  style={{ all: 'unset', fontFamily: VT, fontSize: '0.85rem', letterSpacing: 1, color: 'rgba(248,113,113,0.65)', cursor: 'pointer' }}
                >✕ delete</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
