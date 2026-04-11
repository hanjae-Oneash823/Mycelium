import { useState } from 'react';
import usePluginStore from '../../store/usePluginStore';
import type { WidgetProps } from '../types';

const FONT  = "'VT323', monospace";
const OD    = "'Odibee Sans', monospace";
const AMBER = '#f59e0b';

export function EnterESRA({ }: WidgetProps) {
  const [hov, setHov] = useState(false);
  const setActivePlugin = usePluginStore(s => s.setActivePlugin);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <button
        onClick={() => setActivePlugin('esra')}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 8,
          color: hov ? '#000' : AMBER,
          background: hov ? AMBER : 'transparent',
          border: `1px solid ${AMBER}`,
          padding: '8px 24px',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontFamily: FONT, fontSize: '1rem', letterSpacing: '3px', color: hov ? '#000' : AMBER }}>ENTER</span>
        <span style={{ fontFamily: OD,   fontSize: '1.4rem', letterSpacing: '1px' }}>L'ESRA</span>
      </button>
    </div>
  );
}
