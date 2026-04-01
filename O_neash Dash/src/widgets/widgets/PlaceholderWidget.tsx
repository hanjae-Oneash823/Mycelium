import type { WidgetProps } from '../types';

export function PlaceholderWidget({ }: WidgetProps) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'VT323', monospace",
      color: 'rgba(255,255,255,0.1)',
      fontSize: '0.85rem',
      letterSpacing: '2px',
    }}>
      coming soon
    </div>
  );
}
