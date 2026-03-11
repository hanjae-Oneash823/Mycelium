import { useState, useEffect } from 'react';
import './ClockPlugin.css';

interface ClockPluginProps {
  onOpenFocusTimer?: () => void;
}

/**
 * Clock Plugin Component
 * Displays current time and date with second animation
 */
function ClockPlugin({ onOpenFocusTimer }: ClockPluginProps) {
  const [time, setTime] = useState<Date>(new Date());
  const biosStyle = true; // Toggle between original and BIOS style

  useEffect(() => {
    const timer: ReturnType<typeof setInterval> = setInterval(
      () => setTime(new Date()),
      1000
    );
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
