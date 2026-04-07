// Shared pixel-art frog icon — used in TodayView and TheFrog widget

const FROG_MAP = [
  [0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0], // r0: eye stalks
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], // r1: head
  [0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0], // r2: eyes
  [0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0], // r3: eyes
  [1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1], // r4: nostrils
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // r5: body
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // r6: gap
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], // r7: jaw
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0], // r8: feet
];

export function PixelFrog({
  px    = 3,
  color = '#4ade80',
  dim   = false,
}: {
  px?:    number;
  color?: string;
  dim?:   boolean;
}) {
  const col = dim ? 'rgba(74,222,128,0.2)' : color;
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: `repeat(11, ${px}px)`,
      gridTemplateRows:    `repeat(9, ${px}px)`,
      gap:                 0,
      flexShrink:          0,
    }}>
      {FROG_MAP.flat().map((on, i) => (
        <div key={i} style={{
          width:      px,
          height:     px,
          background: on ? col : 'transparent',
        }} />
      ))}
    </div>
  );
}
