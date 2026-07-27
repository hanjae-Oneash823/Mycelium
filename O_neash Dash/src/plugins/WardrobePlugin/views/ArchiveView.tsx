import { useState } from 'react';
import { Shirt, Calendar } from 'pixelarticons/react';
import ClosetGrid from '../components/ClosetGrid';
import OotdCalendar from '../components/OotdCalendar';

const VT = "var(--font-main), var(--font-kr), monospace";
const ACC = '#e879f9';

type ArchiveSubView = 'closet' | 'calendar';

const SUB_VIEWS: { id: ArchiveSubView; label: string; icon: React.ReactNode }[] = [
  { id: 'closet',   label: 'closet',   icon: <Shirt    size={16} /> },
  { id: 'calendar', label: 'ootd',     icon: <Calendar size={16} /> },
];

export default function ArchiveView() {
  const [subView, setSubView] = useState<ArchiveSubView>('closet');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 18, padding: '0 2rem', flexShrink: 0 }}>
        {SUB_VIEWS.map(v => {
          const active = subView === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setSubView(v.id)}
              style={{
                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: VT, fontSize: '1.1rem', letterSpacing: 1.5,
                color: active ? ACC : 'rgba(255,255,255,0.3)',
                borderBottom: active ? `2px solid ${ACC}` : '2px solid transparent',
                padding: '4px 0',
              }}
            >
              {v.icon}
              {v.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {subView === 'closet' ? <ClosetGrid /> : <OotdCalendar />}
      </div>
    </div>
  );
}
