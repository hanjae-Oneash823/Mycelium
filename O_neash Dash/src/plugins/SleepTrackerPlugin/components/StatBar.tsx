import type { SleepTarget } from '../lib/sleepDb';
import { formatDuration } from '../lib/sleepDb';

const VT  = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#6366f1';

interface Props {
  avgDur:  number;
  avgBed:  string;
  target:  SleepTarget | null;
}

function Cell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      flex: 1,
      borderRight: last ? 'none' : `1px solid rgba(99,102,241,0.15)`,
      padding: '14px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
    }}>
      <div style={{
        fontFamily: VT, fontSize: '0.72rem', letterSpacing: 2.5,
        color: 'rgba(99,102,241,0.55)', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontFamily: VT, fontSize: '1.9rem', letterSpacing: 1,
        color: '#fff', lineHeight: 1,
      }}>{value}</div>
    </div>
  );
}

export default function StatBar({ avgDur, avgBed, target }: Props) {
  return (
    <div style={{
      display: 'flex',
      borderTop:    `1px solid rgba(99,102,241,0.18)`,
      borderBottom: `1px solid rgba(99,102,241,0.18)`,
      flexShrink: 0,
    }}>
      <Cell label="avg duration (7d)" value={avgDur > 0 ? formatDuration(avgDur) : '--h --m'} />
      <Cell label="avg bedtime (7d)"  value={avgBed} />
      <Cell label="target start"      value={target?.target_sleep_start ?? '--:--'} />
      <Cell label="target duration"   value={target ? formatDuration(target.target_duration) : '--h --m'} last />
    </div>
  );
}
