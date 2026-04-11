import { useState, useEffect } from 'react';
import { Bed } from 'pixelarticons/react/Bed';
import {
  getEntries, getActiveTarget,
  durationHours, formatDuration,
} from '../../plugins/SleepTrackerPlugin/lib/sleepDb';
// target fetched for color grading only
import type { SleepEntry, SleepTarget } from '../../plugins/SleepTrackerPlugin/lib/sleepDb';
import type { WidgetProps } from '../types';

const FONT   = "'VT323', monospace";
const ACC    = '#6366f1';
const YELLOW = '#f5c842';

function qualityColor(hours: number, target: SleepTarget | null): string {
  if (!target) return '#60a5fa';
  const diffMin = (hours - target.target_duration) * 60;
  if (diffMin > 30)    return '#60a5fa';
  if (diffMin >= -30)  return '#4ade80';
  if (diffMin >= -120) return '#facc15';
  if (diffMin >= -240) return '#fb923c';
  return '#f87171';
}

function qualityLabel(hours: number, target: SleepTarget | null): string {
  if (!target) return 'child of a new world';
  const diffMin = (hours - target.target_duration) * 60;
  if (diffMin > 30)    return 'child of a new world';
  if (diffMin >= -30)  return 'perfect!';
  if (diffMin >= -120) return 'okay... i guess';
  if (diffMin >= -240) return 'sleep... more... please...';
  return 'you good...?';
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function fmtDelta(hours: number, target: SleepTarget | null): string {
  if (!target) return '';
  const diff = hours - target.target_duration;
  const sign = diff >= 0 ? '+' : '-';
  const h = Math.floor(Math.abs(diff));
  const m = Math.round((Math.abs(diff) - h) * 60);
  return `${sign}${h > 0 ? `${h}h ` : ''}${m.toString().padStart(2, '0')}m`;
}

export function SleepLastNight({ }: WidgetProps) {
  const [entry,  setEntry]  = useState<SleepEntry | null>(null);
  const [target, setTarget] = useState<SleepTarget | null>(null);

  useEffect(() => {
    Promise.all([getEntries(10), getActiveTarget()]).then(([entries, tgt]) => {
      const last = entries.find(e => !e.is_nap) ?? null;
      setEntry(last);
      setTarget(tgt);
    });
  }, []);

  if (!entry) return (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, fontSize: '1rem', letterSpacing: 2,
      color: 'rgba(255,255,255,0.15)',
    }}>
      no sleep logged yet
    </div>
  );

  const hours = durationHours(entry);
  const color = qualityColor(hours, target);
  const delta = fmtDelta(hours, target);
  const deltaColor = delta.startsWith('+') ? '#60a5fa' : delta.startsWith('-') ? '#f87171' : '#fff';

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT,
      padding: '32px 14px 6px',
      boxSizing: 'border-box',
      gap: 4,
    }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Bed width={18} height={18} style={{ color: YELLOW }} />
        <span style={{ fontSize: '1.05rem', letterSpacing: '2px', color: YELLOW, lineHeight: 1 }}>
          LAST NIGHT
        </span>
      </div>

      {/* Duration */}
      <span style={{ fontSize: '2.2rem', color: ACC, lineHeight: 1, letterSpacing: 1, whiteSpace: 'nowrap' }}>
        {formatDuration(hours)}
      </span>

      {/* Times */}
      <span style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {fmtTime(entry.sleep_start)} → {fmtTime(entry.wake_time)}
      </span>
    </div>
  );
}
