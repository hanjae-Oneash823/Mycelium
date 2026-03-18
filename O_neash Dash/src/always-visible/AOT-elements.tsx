import { useState, useRef, useEffect } from 'react';
import SingleBloomNav from './SingleBloomNavigator/SingleBloomNav';
import usePluginStore from '../store/usePluginStore';
import { usePlannerStore } from '../plugins/PlannerPlugin/store/usePlannerStore';
import './AOT-elements.css';

function AlwaysOnTop() {
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  const activePlugin = usePluginStore((state) => state.activePlugin);
  const wipePlannerData = usePlannerStore((state) => state.wipePlannerData);
  const [wiping, setWiping] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  const handleWipe = async () => {
    if (!confirm) {
      setConfirm(true);
      confirmTimer.current = setTimeout(() => setConfirm(false), 3000);
      return;
    }
    if (confirmTimer.current) { clearTimeout(confirmTimer.current); confirmTimer.current = null; }
    setWiping(true);
    setConfirm(false);
    try {
      await wipePlannerData();
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="always-on-top">
      {activePlugin !== null && (
        <div style={{ position: 'absolute', top: 18, left: 18, zIndex: 1000, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="always-on-top-home-btn"
            onClick={() => setActivePlugin(null)}
            aria-label="Home"
          >
            go home...
          </button>
          {activePlugin === 'planner' && (
            <button
              style={{
                background: 'transparent',
                border: `1px solid ${confirm ? '#ff3b3b' : 'rgba(255,59,59,0.4)'}`,
                color: confirm ? '#ff3b3b' : 'rgba(255,59,59,0.6)',
                padding: '0.2rem 0.6rem',
                fontSize: '0.8rem',
                fontFamily: "'VT323', monospace",
                letterSpacing: '1px',
                cursor: 'pointer',
              }}
              onClick={handleWipe}
              disabled={wiping}
            >
              {wiping ? 'wiping...' : confirm ? 'confirm wipe?' : 'wipe data'}
            </button>
          )}
        </div>
      )}
      <SingleBloomNav />
    </div>
  );
}

export default AlwaysOnTop;
