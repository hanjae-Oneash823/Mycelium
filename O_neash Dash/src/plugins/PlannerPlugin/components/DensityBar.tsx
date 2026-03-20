import { getDensityColor } from '../lib/densityCalc';

const SEGMENTS = 8;

interface DensityBarProps {
  ratio: number;
}

export default function DensityBar({ ratio }: DensityBarProps) {
  const color = getDensityColor(ratio);
  const filled = Math.min(Math.round(ratio * SEGMENTS), SEGMENTS);
  const overloaded = ratio > 1;

  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 5, alignItems: 'center' }}>
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const isFilled = i < filled;
        return (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              background: isFilled ? color : 'rgba(255,255,255,0.09)',
              boxShadow: isFilled && overloaded ? `0 0 4px ${color}` : 'none',
              transition: 'background 0.2s ease',
            }}
          />
        );
      })}
    </div>
  );
}
