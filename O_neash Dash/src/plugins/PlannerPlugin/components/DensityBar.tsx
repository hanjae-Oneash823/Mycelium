import { getDensityColor } from '../lib/densityCalc';

interface DensityBarProps {
  ratio: number;
}

export default function DensityBar({ ratio }: DensityBarProps) {
  const fill  = Math.min(ratio, 1);
  const color = getDensityColor(ratio);
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', width: '100%', marginTop: 3 }}>
      <div style={{ height: '100%', width: `${fill * 100}%`, background: color, transition: 'width 0.3s ease' }} />
    </div>
  );
}
