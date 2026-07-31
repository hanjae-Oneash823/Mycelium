import { useEffect, useRef, useState, useCallback } from 'react';
import { playEat, playGameOver } from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const FOOD_COLOR = '#ff3b3b';

const COLS = 20;
const ROWS = 20;
const CELL = 18;
const TICK_MS = 110;
const HIGH_SCORE_KEY = 'games-snake-highscore';

type Dir = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };
type Status = 'idle' | 'playing' | 'over';

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

function randomFood(snake: Point[]): Point {
  while (true) {
    const p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    if (!snake.some(s => s.x === p.x && s.y === p.y)) return p;
  }
}

export default function SnakePlugin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
  const dirRef = useRef<Dir>('right');
  const nextDirRef = useRef<Dir>('right');
  const foodRef = useRef<Point>(randomFood(snakeRef.current));

  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0));

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    ctx.fillStyle = FOOD_COLOR;
    ctx.fillRect(foodRef.current.x * CELL + 1, foodRef.current.y * CELL + 1, CELL - 2, CELL - 2);

    snakeRef.current.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#fff' : ACCENT;
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }, []);

  const reset = useCallback(() => {
    snakeRef.current = [{ x: 10, y: 10 }];
    dirRef.current = 'right';
    nextDirRef.current = 'right';
    foodRef.current = randomFood(snakeRef.current);
    setScore(0);
    setStatus('playing');
  }, []);

  // Game loop
  useEffect(() => {
    if (status !== 'playing') { draw(); return; }
    const id = setInterval(() => {
      dirRef.current = nextDirRef.current;
      const head = snakeRef.current[0];
      const delta = DELTA[dirRef.current];
      const newHead = { x: head.x + delta.x, y: head.y + delta.y };

      const hitWall = newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS;
      const hitSelf = snakeRef.current.some(s => s.x === newHead.x && s.y === newHead.y);
      if (hitWall || hitSelf) {
        playGameOver();
        setStatus('over');
        setBest(b => {
          if (score > b) { localStorage.setItem(HIGH_SCORE_KEY, String(score)); return score; }
          return b;
        });
        return;
      }

      const ateFood = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
      const newSnake = [newHead, ...snakeRef.current];
      if (ateFood) {
        playEat();
        foodRef.current = randomFood(newSnake);
        setScore(s => s + 1);
      } else {
        newSnake.pop();
      }
      snakeRef.current = newSnake;
      draw();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [status, draw, score]);

  // Keyboard controls
  useEffect(() => {
    const KEY_DIR: Record<string, Dir> = {
      ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
      ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (status !== 'playing') reset();
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      if (dir !== OPPOSITE[dirRef.current]) nextDirRef.current = dir;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [status, reset]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: FONT }}>
        <div style={{ display: 'flex', gap: 24, fontSize: '1.1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.7)' }}>
          <span>SCORE <span style={{ color: ACCENT }}>{score}</span></span>
          <span>BEST <span style={{ color: ACCENT }}>{best}</span></span>
        </div>
        <div style={{ position: 'relative', border: `2px solid ${ACCENT}55` }}>
          <canvas
            ref={canvasRef}
            width={COLS * CELL}
            height={ROWS * CELL}
            style={{ display: 'block', imageRendering: 'pixelated' }}
          />
          {status !== 'playing' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '1rem', letterSpacing: 2,
              textAlign: 'center', padding: '0 16px',
            }}>
              {status === 'over' && <div style={{ color: FOOD_COLOR, fontSize: '1.3rem' }}>GAME OVER</div>}
              <div style={{ color: ACCENT }}>PRESS SPACE TO {status === 'over' ? 'RETRY' : 'START'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
