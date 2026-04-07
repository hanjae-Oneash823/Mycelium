import { useEffect, useRef, useState } from 'react';
import { Directions } from 'pixelarticons/react/Directions';
import type { WidgetProps } from '../types';

const GOLD = '#d4a52a';
const COLS = 55, ROWS = 55;

// B368/S34678 — Day and Night
const BIRTH    = new Set([3, 6, 8]);
const SURVIVAL = new Set([3, 4, 6, 7, 8]);

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 2 ** 32; };
}
function todaySeed() {
  const d = new Date();
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) ^ 0xDA1F;
}

function makeGrid(seed: number): Uint8Array {
  const rng = makeRng(seed);
  const g = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < g.length; i++) g[i] = rng() < 0.35 ? 1 : 0;
  return g;
}

function dayNightStep(g: Uint8Array): Uint8Array {
  const next = new Uint8Array(g.length);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr || dc)
            n += g[((r + dr + ROWS) % ROWS) * COLS + (c + dc + COLS) % COLS];
      const alive = g[r * COLS + c];
      next[r * COLS + c] = alive ? (SURVIVAL.has(n) ? 1 : 0) : (BIRTH.has(n) ? 1 : 0);
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
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  for (let i = 0; i < g.length; i++) {
    if (!g[i]) continue;
    ctx.fillRect(
      Math.floor((i % COLS) * cw), Math.floor(Math.floor(i / COLS) * ch),
      Math.ceil(cw), Math.ceil(ch),
    );
  }
}

export function DayAndNight({ }: WidgetProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const gridRef    = useRef<Uint8Array>(makeGrid(todaySeed()));
  const [steps, setSteps] = useState(0);
  // Track recent population counts to detect period-1 or period-2 stagnation
  const popsRef    = useRef<number[]>([]);

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
      gridRef.current = dayNightStep(gridRef.current);
      draw(canvas, gridRef.current);
      setSteps(s => s + 1);

      // Stagnation detection: collect population counts
      const pop = gridRef.current.reduce((s, v) => s + v, 0);
      const pops = popsRef.current;
      pops.push(pop);
      if (pops.length > 40) pops.shift();

      if (pops.length === 40) {
        // Period-1: all counts within ±3
        const p1 = pops.every(p => Math.abs(p - pops[0]) <= 3);
        // Period-2: even-indexed and odd-indexed each within ±3 of their first
        const p2 = pops.every((p, i) => Math.abs(p - pops[i % 2 === 0 ? 0 : 1]) <= 3);
        if (p1 || p2) {
          gridRef.current = makeGrid(Date.now());
          popsRef.current = [];
        }
      }
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
          DAY-AND-NIGHT
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
