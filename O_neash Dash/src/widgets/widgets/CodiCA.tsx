import { useEffect, useRef, useState } from 'react';
import { Directions } from 'pixelarticons/react/Directions';
import type { WidgetProps } from '../types';

const GOLD = '#d4a52a';
const COLS = 55, ROWS = 55;
const STATES = 4;
const THRESHOLD = 3; // neighbours needed to advance state

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 2 ** 32; };
}
function todaySeed() {
  const d = new Date();
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) ^ 0x4C1F;
}

// ── 4-state cyclic CA ─────────────────────────────────────────────────────────
// State K → (K+1)%4 if ≥ THRESHOLD neighbours are in state (K+1)%4
const COLORS = [
  '#0d1a0a',                 // 0: dark background
  'rgba(255,255,255,0.88)',   // 1: white
  '#22c55e',                 // 2: green
  '#ef4444',                 // 3: red
];

function initGrid(): Uint8Array {
  const rng = makeRng(todaySeed());
  const g = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < g.length; i++) g[i] = Math.floor(rng() * STATES);
  return g;
}

function codiStep(g: Uint8Array): Uint8Array {
  const next = new Uint8Array(g.length);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const s = g[r * COLS + c];
      const ns = (s + 1) % STATES;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if ((dr || dc) && g[((r + dr + ROWS) % ROWS) * COLS + (c + dc + COLS) % COLS] === ns)
            count++;
      next[r * COLS + c] = count >= THRESHOLD ? ns : s;
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

export function CodiCA({ }: WidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef   = useRef<Uint8Array>(initGrid());
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      draw(canvas, gridRef.current);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const id = setInterval(() => {
      gridRef.current = codiStep(gridRef.current);
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
        <Directions width={18} height={18} style={{ color: GOLD }} />
        <span style={{ flex: 1, fontSize: '1.05rem', letterSpacing: '2px', color: GOLD, lineHeight: 1, fontFamily: "'VT323', monospace" }}>
          CoDI-CA
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
