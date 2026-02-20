import { useState, useEffect } from 'react';
import './ClockPlugin.css';

/**
 * Clock Plugin Component
 * Displays current time and date with second animation
 */
function ClockPlugin({ onOpenFocusTimer }) {
  const [time, setTime] = useState(new Date());
  const biosStyle = true; // Toggle between original and BIOS style

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`plugin-clock ${biosStyle ? 'bios-style' : ''}`}>
      {biosStyle && <div className="clock-label">SYSTEM CLOCK</div>}
      <div className="clock-indicator"></div>
      <div className="clock-time">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </div>
      <div className="clock-date">
        {time.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

export default ClockPlugin;
