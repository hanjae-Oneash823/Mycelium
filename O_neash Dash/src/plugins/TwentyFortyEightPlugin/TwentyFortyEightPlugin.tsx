import { useEffect, useState, useCallback, useRef } from 'react';
import { playMerge, playWin, playGameOver } from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const SIZE = 4;
const CELL = 64;
const GAP = 4;
const PAD = 4;
const BOARD = SIZE * CELL + (SIZE - 1) * GAP + PAD * 2;
const SLIDE_MS = 120;
const BEST_KEY = 'games-2048-best';

type Dir = 'up' | 'down' | 'left' | 'right';

interface Tile {
  id: number;
  value: number;
  x: number;
  y: number;
  isNew?: boolean;
}

const TILE_COLORS: Record<number, string> = {
  2: '#0a0a0a', 4: '#1a2e1a', 8: '#1f4d1f', 16: '#256b25', 32: '#2b8a2b',
  64: '#31a831', 128: '#39ff14', 256: '#5aff44', 512: '#7fff70', 1024: '#a8ff9c', 2048: '#ffffff',
};

function emptyPositions(tiles: Tile[]): { x: number; y: number }[] {
  const occupied = new Set(tiles.map(t => `${t.x},${t.y}`));
  const empties: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!occupied.has(`${x},${y}`)) empties.push({ x, y });
    }
  }
  return empties;
}

function slideLine(line: Tile[]): { tiles: Tile[]; gained: number } {
  const out: Tile[] = [];
  let gained = 0;
  let i = 0;
  while (i < line.length) {
    const cur = line[i];
    const next = line[i + 1];
    if (next && next.value === cur.value) {
      const value = cur.value * 2;
      gained += value;
      out.push({ ...cur, value });
      i += 2;
    } else {
      out.push(cur);
      i += 1;
    }
  }
  return { tiles: out, gained };
}

function moveTiles(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; moved: boolean } {
  const horizontal = dir === 'left' || dir === 'right';
  const reversed = dir === 'right' || dir === 'down';
  let gained = 0;
  const outTiles: Tile[] = [];

  for (let line = 0; line < SIZE; line++) {
    const lineTiles = tiles
      .filter(t => (horizontal ? t.y === line : t.x === line))
      .sort((a, b) => {
        const av = horizontal ? a.x : a.y;
        const bv = horizontal ? b.x : b.y;
        return reversed ? bv - av : av - bv;
      });
    const { tiles: merged, gained: g } = slideLine(lineTiles);
    gained += g;
    merged.forEach((t, idx) => {
      const pos = reversed ? SIZE - 1 - idx : idx;
      outTiles.push({ ...t, x: horizontal ? pos : line, y: horizontal ? line : pos });
    });
  }

  const moved = tiles.length !== outTiles.length || outTiles.some(t => {
    const before = tiles.find(o => o.id === t.id);
    return !before || before.x !== t.x || before.y !== t.y || before.value !== t.value;
  });

  return { tiles: outTiles, gained, moved };
}

function hasMoves(tiles: Tile[]): boolean {
  return (['up', 'down', 'left', 'right'] as Dir[]).some(d => moveTiles(tiles, d).moved);
}

export default function TwentyFortyEightPlugin() {
  const nextId = useRef(0);
  const spawn = useCallback((tiles: Tile[]): Tile[] => {
    const empties = emptyPositions(tiles);
    if (empties.length === 0) return tiles;
    const { x, y } = empties[Math.floor(Math.random() * empties.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    return [...tiles, { id: nextId.current++, value, x, y, isNew: true }];
  }, []);

  const [tiles, setTiles] = useState<Tile[]>(() => spawn(spawn([])));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0));
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);

  const reset = useCallback(() => {
    nextId.current = 0;
    setTiles(spawn(spawn([])));
    setScore(0);
    setOver(false);
    setWon(false);
  }, [spawn]);

  useEffect(() => {
    const KEY_DIR: Record<string, Dir> = {
      ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
      ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (over) reset();
        else if (won) setWon(false);
        return;
      }
      if (over || won) return;
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      setTiles(prev => {
        const result = moveTiles(prev, dir);
        if (!result.moved) return prev;
        if (result.gained > 0) playMerge(result.gained);
        setScore(s => {
          const next = s + result.gained;
          setBest(b => {
            if (next > b) { localStorage.setItem(BEST_KEY, String(next)); return next; }
            return b;
          });
          return next;
        });
        const settled = result.tiles.map(t => ({ ...t, isNew: false }));
        const spawned = spawn(settled);
        if (!prev.some(t => t.value === 2048) && spawned.some(t => t.value === 2048)) { setWon(true); playWin(); }
        if (!hasMoves(spawned)) { setOver(true); playGameOver(); }
        return spawned;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [over, won, reset, spawn]);

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: FONT }}>
        <style>{`@keyframes tile-pop { from { transform: scale(0); } to { transform: scale(1); } }`}</style>
        <div style={{ display: 'flex', gap: 24, fontSize: '1.1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.7)' }}>
          <span>SCORE <span style={{ color: ACCENT }}>{score}</span></span>
          <span>BEST <span style={{ color: ACCENT }}>{best}</span></span>
        </div>
        <div style={{ position: 'relative', width: BOARD, height: BOARD, background: '#0a0a0a', border: `2px solid ${ACCENT}55` }}>
          {Array.from({ length: SIZE * SIZE }, (_, i) => {
            const x = i % SIZE, y = Math.floor(i / SIZE);
            return (
              <div key={`bg-${i}`} style={{
                position: 'absolute',
                left: PAD + x * (CELL + GAP), top: PAD + y * (CELL + GAP),
                width: CELL, height: CELL,
                background: 'rgba(255,255,255,0.03)',
              }} />
            );
          })}
          {tiles.map(t => (
            <div key={t.id} style={{
              position: 'absolute',
              left: PAD + t.x * (CELL + GAP), top: PAD + t.y * (CELL + GAP),
              width: CELL, height: CELL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: TILE_COLORS[t.value] ?? '#fff',
              color: t.value >= 128 ? '#000' : '#fff',
              fontSize: t.value >= 1000 ? '1rem' : '1.3rem',
              fontWeight: 'bold',
              transition: `left ${SLIDE_MS}ms ease-in-out, top ${SLIDE_MS}ms ease-in-out`,
              animation: t.isNew ? 'tile-pop 120ms ease-out' : undefined,
            }}>
              {t.value}
            </div>
          ))}
          {(over || won) && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '1rem', letterSpacing: 2,
              textAlign: 'center', padding: '0 16px', zIndex: 10,
            }}>
              <div style={{ color: won ? ACCENT : '#ff3b3b', fontSize: '1.3rem' }}>{won ? 'YOU WIN' : 'GAME OVER'}</div>
              <div style={{ color: ACCENT }}>PRESS SPACE TO {won ? 'CONTINUE' : 'RETRY'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
