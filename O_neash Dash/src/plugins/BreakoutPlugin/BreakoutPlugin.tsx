import { useEffect, useRef, useState, useCallback } from 'react';
import { playHit, playWall, playScore, playWin, playGameOver } from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const BALL_COLOR = '#ff3b3b';
const BEST_KEY = 'games-breakout-best';

const W = 400;
const H = 320;
const PADDLE_W = 64;
const PADDLE_H = 8;
const PADDLE_Y = H - 24;
const PADDLE_SPEED = 6;
const BALL_SIZE = 8;
const BALL_SPEED = 4;
const START_LIVES = 3;

const ROWS = 5;
const COLS = 8;
const BRICK_GAP = 4;
const BRICK_TOP = 32;
const BRICK_W = (W - BRICK_GAP * (COLS + 1)) / COLS;
const BRICK_H = 14;
const ROW_COLORS = ['#ff3b3b', '#ff9f1c', '#ffe066', '#39ff14', '#4cc9f0'];

type Status = 'idle' | 'playing' | 'over' | 'won';

interface Brick {
  x: number;
  y: number;
  alive: boolean;
  color: string;
  reward: number;
}

interface GameState {
  paddleX: number;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  attached: boolean;
  bricks: Brick[];
  lives: number;
  score: number;
}

function freshBricks(): Brick[] {
  const bricks: Brick[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bricks.push({
        x: BRICK_GAP + col * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
        alive: true,
        color: ROW_COLORS[row],
        reward: (ROWS - row) * 10,
      });
    }
  }
  return bricks;
}

function attachBall(s: GameState): void {
  s.attached = true;
  s.ballX = s.paddleX + PADDLE_W / 2;
  s.ballY = PADDLE_Y - BALL_SIZE;
  s.ballVX = 0;
  s.ballVY = 0;
}

function freshState(): GameState {
  const s: GameState = {
    paddleX: W / 2 - PADDLE_W / 2,
    ballX: 0, ballY: 0, ballVX: 0, ballVY: 0,
    attached: true,
    bricks: freshBricks(),
    lives: START_LIVES,
    score: 0,
  };
  attachBall(s);
  return s;
}

export default function BreakoutPlugin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(freshState());
  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [, forceTick] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0));

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    for (const b of s.bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
    }

    ctx.fillStyle = ACCENT;
    ctx.fillRect(s.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H);

    ctx.fillStyle = BALL_COLOR;
    ctx.fillRect(s.ballX - BALL_SIZE / 2, s.ballY - BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
  }, []);

  const reset = useCallback(() => {
    stateRef.current = freshState();
    setStatus('playing');
    forceTick(t => t + 1);
  }, []);

  // Game loop
  useEffect(() => {
    if (status !== 'playing') { draw(); return; }

    const tick = () => {
      const s = stateRef.current;
      const keys = keysRef.current;

      if (keys.left) s.paddleX = Math.max(0, s.paddleX - PADDLE_SPEED);
      if (keys.right) s.paddleX = Math.min(W - PADDLE_W, s.paddleX + PADDLE_SPEED);

      if (s.attached) {
        s.ballX = s.paddleX + PADDLE_W / 2;
        s.ballY = PADDLE_Y - BALL_SIZE;
        draw();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      s.ballX += s.ballVX;
      s.ballY += s.ballVY;

      if (s.ballX - BALL_SIZE / 2 < 0 || s.ballX + BALL_SIZE / 2 > W) {
        s.ballVX *= -1;
        s.ballX = Math.max(BALL_SIZE / 2, Math.min(W - BALL_SIZE / 2, s.ballX));
        playWall();
      }
      if (s.ballY - BALL_SIZE / 2 < 0) {
        s.ballVY *= -1;
        s.ballY = BALL_SIZE / 2;
        playWall();
      }

      // Paddle collision
      if (s.ballVY > 0
        && s.ballY + BALL_SIZE / 2 >= PADDLE_Y && s.ballY + BALL_SIZE / 2 <= PADDLE_Y + PADDLE_H
        && s.ballX >= s.paddleX && s.ballX <= s.paddleX + PADDLE_W) {
        const hit = (s.ballX - (s.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
        s.ballVX = hit * BALL_SPEED;
        s.ballVY = -Math.abs(s.ballVY);
        s.ballY = PADDLE_Y - BALL_SIZE / 2;
        playHit();
      }

      // Brick collisions — first alive brick the ball overlaps this frame
      for (const b of s.bricks) {
        if (!b.alive) continue;
        const overlapsX = s.ballX + BALL_SIZE / 2 > b.x && s.ballX - BALL_SIZE / 2 < b.x + BRICK_W;
        const overlapsY = s.ballY + BALL_SIZE / 2 > b.y && s.ballY - BALL_SIZE / 2 < b.y + BRICK_H;
        if (!overlapsX || !overlapsY) continue;

        b.alive = false;
        s.score += b.reward;
        playScore();

        const brickCenterX = b.x + BRICK_W / 2;
        const brickCenterY = b.y + BRICK_H / 2;
        const dx = (s.ballX - brickCenterX) / (BRICK_W / 2);
        const dy = (s.ballY - brickCenterY) / (BRICK_H / 2);
        if (Math.abs(dx) > Math.abs(dy)) s.ballVX *= -1;
        else s.ballVY *= -1;
        break;
      }

      if (s.bricks.every(b => !b.alive)) {
        setBest(b => {
          if (s.score > b) { localStorage.setItem(BEST_KEY, String(s.score)); return s.score; }
          return b;
        });
        playWin();
        setStatus('won');
        return;
      }

      if (s.ballY - BALL_SIZE / 2 > H) {
        s.lives--;
        if (s.lives <= 0) {
          setBest(b => {
            if (s.score > b) { localStorage.setItem(BEST_KEY, String(s.score)); return s.score; }
            return b;
          });
          playGameOver();
          setStatus('over');
          return;
        }
        attachBall(s);
        forceTick(t => t + 1);
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [status, draw]);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (status !== 'playing') { reset(); return; }
        const s = stateRef.current;
        if (s.attached) {
          s.attached = false;
          const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
          s.ballVX = Math.sin(angle) * BALL_SPEED;
          s.ballVY = -Math.abs(Math.cos(angle) * BALL_SPEED);
        }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); keysRef.current.left = true; }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); keysRef.current.right = true; }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keysRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keysRef.current.right = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [status, reset]);

  useEffect(() => { draw(); }, [draw]);

  const s = stateRef.current;

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: FONT }}>
        <div style={{ display: 'flex', gap: 24, fontSize: '1.1rem', letterSpacing: 2, color: 'rgba(255,255,255,0.7)' }}>
          <span>SCORE <span style={{ color: ACCENT }}>{s.score}</span></span>
          <span>LIVES <span style={{ color: BALL_COLOR }}>{s.lives}</span></span>
          <span>BEST <span style={{ color: ACCENT }}>{best}</span></span>
        </div>
        <div style={{ position: 'relative', border: `2px solid ${ACCENT}55` }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={{ display: 'block', imageRendering: 'pixelated' }}
          />
          {status !== 'playing' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '1rem', letterSpacing: 2,
              textAlign: 'center', padding: '0 16px',
            }}>
              {(status === 'over' || status === 'won') && (
                <div style={{ color: status === 'won' ? ACCENT : BALL_COLOR, fontSize: '1.3rem' }}>
                  {status === 'won' ? 'CLEARED!' : 'GAME OVER'}
                </div>
              )}
              <div style={{ color: ACCENT }}>PRESS SPACE TO {status === 'idle' ? 'START' : 'RETRY'}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>←/→ or A/D to move, SPACE to launch</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
