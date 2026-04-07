import { useEffect, useRef, useState } from 'react';
import { CirclePile } from 'pixelarticons/react/CirclePile';
import type { WidgetProps } from '../types';

const GOLD = '#d4a52a';
const COLS = 55, ROWS = 55;

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 2 ** 32; };
}
function todaySeed() {
  const d = new Date();
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) ^ 0xBEEF;
}

// ── Brian's Brain logic ───────────────────────────────────────────────────────
// States: 0=OFF, 1=ON, 2=DYING

function initGrid(): Uint8Array {
  const rng = makeRng(todaySeed());
  const g = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < g.length; i++) {
    const r = rng();
    g[i] = r < 0.2 ? 1 : r < 0.32 ? 2 : 0;
  }
  return g;
}

function brainStep(g: Uint8Array): Uint8Array {
  const next = new Uint8Array(g.length);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = g[r * COLS + c];
      if (v === 1) { next[r * COLS + c] = 2; continue; } // ON → DYING
      if (v === 2) { next[r * COLS + c] = 0; continue; } // DYING → OFF
      // OFF → ON if exactly 2 ON neighbours
      let on = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if ((dr || dc) && g[((r + dr + ROWS) % ROWS) * COLS + (c + dc + COLS) % COLS] === 1)
            on++;
      next[r * COLS + c] = on === 2 ? 1 : 0;
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
    if (!v) continue;
    ctx.fillStyle = v === 1 ? 'rgba(255,255,255,0.9)' : '#ef4444';
    ctx.fillRect(
      Math.floor((i % COLS) * cw), Math.floor(Math.floor(i / COLS) * ch),
      Math.ceil(cw), Math.ceil(ch),
    );
  }
}

export function BriansBrain({ }: WidgetProps) {
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
      gridRef.current = brainStep(gridRef.current);
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
          BRIAN'S BRAIN
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
