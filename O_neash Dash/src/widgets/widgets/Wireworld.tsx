import { useEffect, useRef, useState } from 'react';
import { CirclePile } from 'pixelarticons/react/CirclePile';
import type { WidgetProps } from '../types';

const GOLD = '#d4a52a';
const COLS = 55, ROWS = 55;

// States: 0=Empty, 1=Head, 2=Tail, 3=Conductor
const COLORS = [
  '#000000',    // 0: empty
  '#60a5fa',    // 1: electron head (bright blue)
  '#1e3a5f',    // 2: electron tail (dark blue)
  '#d4a52a',    // 3: conductor (gold)
];

// Build clockwise perimeter list for a rectangle
function buildLoop(r0: number, c0: number, r1: number, c1: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let c = c0; c <= c1; c++) pts.push([r0, c]);          // top L→R
  for (let r = r0 + 1; r <= r1; r++) pts.push([r, c1]);      // right T→B
  for (let c = c1 - 1; c >= c0; c--) pts.push([r1, c]);      // bottom R→L
  for (let r = r1 - 1; r > r0; r--) pts.push([r, c0]);       // left B→T
  return pts;
}

function initGrid(): Uint8Array {
  const g = new Uint8Array(COLS * ROWS);
  const set = (r: number, c: number, v: number) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r * COLS + c] = v;
  };

  const placeLoop = (r0: number, c0: number, r1: number, c1: number, numElectrons: number) => {
    const loop = buildLoop(r0, c0, r1, c1);
    const n = loop.length;
    for (const [r, c] of loop) set(r, c, 3);
    for (let i = 0; i < numElectrons; i++) {
      const hi = Math.floor((i * n) / numElectrons);
      const ti = (hi - 1 + n) % n;
      const [hr, hc] = loop[hi];
      const [tr, tc] = loop[ti];
      set(hr, hc, 1); // Head
      set(tr, tc, 2); // Tail
    }
  };

  // Five concentric rectangular loops, each with independently-phased electrons.
  // Different perimeters → different periods → complex beating patterns.
  //
  // Loop 1 (outermost): rows 1-53, cols 1-53 → perimeter 208 → 5 electrons
  // Loop 2:             rows 6-48, cols 6-48 → perimeter 168 → 4 electrons
  // Loop 3:             rows 11-43, cols 11-43→ perimeter 128 → 3 electrons
  // Loop 4:             rows 16-38, cols 16-38→ perimeter  88 → 2 electrons
  // Loop 5 (innermost): rows 21-33, cols 21-33→ perimeter  48 → 1 electron
  placeLoop(1,  1,  53, 53, 5);
  placeLoop(6,  6,  48, 48, 4);
  placeLoop(11, 11, 43, 43, 3);
  placeLoop(16, 16, 38, 38, 2);
  placeLoop(21, 21, 33, 33, 1);

  return g;
}

function wireStep(g: Uint8Array): Uint8Array {
  const next = new Uint8Array(g.length);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = g[r * COLS + c];
      if (v === 0) continue;
      if (v === 1) { next[r * COLS + c] = 2; continue; } // Head → Tail
      if (v === 2) { next[r * COLS + c] = 3; continue; } // Tail → Conductor
      // Conductor → Head if exactly 1 or 2 Head neighbours
      let heads = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if ((dr || dc) && g[((r + dr + ROWS) % ROWS) * COLS + (c + dc + COLS) % COLS] === 1)
            heads++;
      next[r * COLS + c] = (heads === 1 || heads === 2) ? 1 : 3;
    }
  }
  return next;
}

function draw(canvas: HTMLCanvasElement, g: Uint8Array) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cw = canvas.width / COLS, ch = canvas.height / ROWS;
  for (let i = 0; i < g.length; i++) {
    const v = g[i];
    if (v === 0) continue;
    ctx.fillStyle = COLORS[v];
    ctx.fillRect(
      Math.floor((i % COLS) * cw), Math.floor(Math.floor(i / COLS) * ch),
      Math.ceil(cw), Math.ceil(ch),
    );
  }
}

export function Wireworld({ }: WidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef   = useRef<Uint8Array>(initGrid());
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      draw(canvas, gridRef.current);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const id = setInterval(() => {
      gridRef.current = wireStep(gridRef.current);
      draw(canvas, gridRef.current);
      setSteps(s => s + 1);
    }, 150);
    return () => { clearInterval(id); ro.disconnect(); };
  }, []);

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      padding: '12px 14px', boxSizing: 'border-box', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <CirclePile width={18} height={18} style={{ color: GOLD }} />
        <span style={{ flex: 1, fontSize: '1.05rem', letterSpacing: '2px', color: GOLD, lineHeight: 1, fontFamily: "'VT323', monospace" }}>
          WIREWORLD
        </span>
        <span style={{ fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.45)', fontFamily: "'VT323', monospace" }}>
          {steps}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
