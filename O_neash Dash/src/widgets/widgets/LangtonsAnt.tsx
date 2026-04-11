import { useEffect, useRef, useState } from 'react';
import { Debug } from 'pixelarticons/react/Debug';
import type { WidgetProps } from '../types';

const GOLD = '#d4a52a';
const COLS = 55, ROWS = 55;
const STEPS_PER_TICK = 1; // ant moves per interval

// dir: 0=N 1=E 2=S 3=W
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

interface AntState { grid: Uint8Array; ax: number; ay: number; dir: number; }

function initAnt(): AntState {
  return {
    grid: new Uint8Array(COLS * ROWS), // all white (0)
    ax:   Math.floor(COLS / 2),
    ay:   Math.floor(ROWS / 2),
    dir:  0,
  };
}

function antTick(s: AntState): AntState {
  const grid = new Uint8Array(s.grid);
  let { ax, ay, dir } = s;
  for (let i = 0; i < STEPS_PER_TICK; i++) {
    const cell = grid[ay * COLS + ax];
    // white(0): turn right, flip to black; black(1): turn left, flip to white
    dir = cell === 0 ? (dir + 1) % 4 : (dir + 3) % 4;
    grid[ay * COLS + ax] = cell ? 0 : 1;
    ax = (ax + DX[dir] + COLS) % COLS;
    ay = (ay + DY[dir] + ROWS) % ROWS;
  }
  return { grid, ax, ay, dir };
}

function draw(canvas: HTMLCanvasElement, s: AntState) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cw = canvas.width / COLS, ch = canvas.height / ROWS;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < s.grid.length; i++) {
    if (!s.grid[i]) continue;
    ctx.fillRect(
      Math.floor((i % COLS) * cw), Math.floor(Math.floor(i / COLS) * ch),
      Math.ceil(cw), Math.ceil(ch),
    );
  }
  // Ant position
  ctx.fillStyle = GOLD;
  ctx.fillRect(Math.floor(s.ax * cw), Math.floor(s.ay * ch), Math.ceil(cw), Math.ceil(ch));
}

export function LangtonsAnt({ }: WidgetProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stateRef   = useRef<AntState>(initAnt());
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      draw(canvas, stateRef.current);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const id = setInterval(() => {
      stateRef.current = antTick(stateRef.current);
      draw(canvas, stateRef.current);
      setSteps(s => s + 1);
    }, 50);

    return () => { clearInterval(id); ro.disconnect(); };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 8, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 7, zIndex: 1, pointerEvents: 'none' }}>
        <Debug width={18} height={18} style={{ color: GOLD }} />
        <span style={{ flex: 1, fontSize: '1.05rem', letterSpacing: '2px', color: GOLD, lineHeight: 1, fontFamily: "'VT323', monospace" }}>
          LANGTON'S ANT
        </span>
        <span style={{ fontSize: '1rem', letterSpacing: '2px', color: 'rgba(255,255,255,0.45)', fontFamily: "'VT323', monospace" }}>
          {steps}
        </span>
      </div>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
