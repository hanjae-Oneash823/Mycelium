import { useState } from 'react';
import type { SleepTarget } from '../lib/sleepDb';
import { formatDuration } from '../lib/sleepDb';

const VT  = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#6366f1';

interface Props {
  current: SleepTarget | null;
  onSave:  (start: string, duration: number) => void;
  onClose: () => void;
}

export default function TargetModal({ current, onSave, onClose }: Props) {
  const [startTime, setStartTime] = useState(current?.target_sleep_start ?? '23:30');
  const [durStr,    setDurStr]    = useState(String(current?.target_duration ?? 7.5));

  const dur    = parseFloat(durStr);
  const valid  = startTime.length === 5 && !isNaN(dur) && dur > 0 && dur <= 14;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#06060f',
        border:     `1px solid rgba(99,102,241,0.35)`,
        padding:    '28px 32px',
        minWidth:   340,
        display:    'flex',
        flexDirection: 'column',
        gap:        18,
      }}>
        <div style={{ fontFamily: VT, fontSize: '1.45rem', letterSpacing: 3, color: ACC, textTransform: 'uppercase' }}>
          set target
        </div>

        <Row label="TARGET BEDTIME">
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            style={inp}
          />
        </Row>

        <Row label="TARGET DURATION">
          <input
            type="number"
            value={durStr}
            onChange={e => setDurStr(e.target.value)}
            step="0.5"
            min="1"
            max="14"
            style={{ ...inp, width: 70 }}
          />
          <span style={{ fontFamily: VT, fontSize: '0.9rem', color: 'rgba(255,255,255,0.35)', marginLeft: 10 }}>
            {valid ? formatDuration(dur) : ''}
          </span>
        </Row>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.28)', cursor: 'pointer' }}
          >CANCEL</button>
          <button
            onClick={() => valid && onSave(startTime, dur)}
            style={{ all: 'unset', fontFamily: VT, fontSize: '1rem', letterSpacing: 2, color: valid ? ACC : 'rgba(99,102,241,0.28)', cursor: valid ? 'pointer' : 'default' }}
          >SAVE</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{
        fontFamily: VT, fontSize: '0.8rem', letterSpacing: 2.5,
        color: 'rgba(99,102,241,0.65)', minWidth: 140, textTransform: 'uppercase',
      }}>{label}</span>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = {
  background:  'rgba(99,102,241,0.07)',
  border:      '1px solid rgba(99,102,241,0.28)',
  color:       '#fff',
  fontFamily:  VT,
  fontSize:    '1rem',
  letterSpacing: 1,
  padding:     '4px 10px',
  outline:     'none',
  colorScheme: 'dark',
};
