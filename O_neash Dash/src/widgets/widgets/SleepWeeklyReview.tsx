import { useState, useEffect } from 'react';
import { CalendarRange } from 'pixelarticons/react';
import {
  getLast7MainSessions, getActiveTarget,
} from '../../plugins/SleepTrackerPlugin/lib/sleepDb';
import type { SleepEntry, SleepTarget } from '../../plugins/SleepTrackerPlugin/lib/sleepDb';
import SleepChart from '../../plugins/SleepTrackerPlugin/components/SleepChart';
import type { WidgetProps } from '../types';

const FONT   = "'VT323', monospace";
const YELLOW = '#f5c842';

export function SleepWeeklyReview({ }: WidgetProps) {
  const [sessions, setSessions] = useState<SleepEntry[]>([]);
  const [target,   setTarget]   = useState<SleepTarget | null>(null);

  useEffect(() => {
    Promise.all([getLast7MainSessions(), getActiveTarget()]).then(([s, t]) => {
      setSessions(s);
      setTarget(t);
    });
  }, []);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: FONT,
      padding: '32px 14px 6px',
      boxSizing: 'border-box',
      gap: 8,
    }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <CalendarRange width={18} height={18} style={{ color: YELLOW }} />
        <span style={{ fontSize: '1.05rem', letterSpacing: '2px', color: YELLOW, lineHeight: 1 }}>
          WEEKLY-SLEEP-REVIEW
        </span>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, paddingBottom: 10, paddingLeft: 16, paddingRight: 16 }}>
        <SleepChart sessions={sessions} target={target} hideTitle compact />
      </div>
    </div>
  );
}
