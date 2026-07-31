import { useEffect, useRef, useState, useCallback } from 'react';
import { playHit, playWall, playScore, playWin, playGameOver } from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const BALL_COLOR = '#ff3b3b';

const W = 400;
const H = 260;
const PADDLE_W = 8;
const PADDLE_H = 50;
const BALL_SIZE = 8;
const PADDLE_SPEED = 4.5;
const AI_SPEED = 3.2;
const BALL_SPEED = 3.5;
const WIN_SCORE = 7;
const WINS_KEY = 'games-pong-wins';
const SERVE_PAUSE_MS = 900;

type Status = 'idle' | 'playing' | 'over';

interface GameState {
  playerY: number;
  aiY: number;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  playerScore: number;
  aiScore: number;
  serveAt: number | null;
  serveTowardPlayer: boolean;
}

function randomVelocity(towardPlayer: boolean): { vx: number; vy: number } {
  const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // -0.3π..0.3π
  const dir = towardPlayer ? -1 : 1;
  return {
    vx: Math.cos(angle) * BALL_SPEED * dir,
    vy: Math.sin(angle) * BALL_SPEED,
  };
}

function queueServe(s: GameState, towardPlayer: boolean): void {
  s.ballX = W / 2;
  s.ballY = H / 2;
  s.ballVX = 0;
  s.ballVY = 0;
  s.serveTowardPlayer = towardPlayer;
  s.serveAt = performance.now() + SERVE_PAUSE_MS;
}

function freshState(): GameState {
  const s: GameState = {
    playerY: H / 2 - PADDLE_H / 2,
    aiY: H / 2 - PADDLE_H / 2,
    ballX: W / 2, ballY: H / 2, ballVX: 0, ballVY: 0,
    playerScore: 0, aiScore: 0,
    serveAt: null, serveTowardPlayer: true,
  };
  queueServe(s, Math.random() < 0.5);
  return s;
}

export default function PongPlugin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(freshState());
  const keysRef = useRef<{ up: boolean; down: boolean }>({ up: false, down: false });
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [, forceTick] = useState(0);
  const [wins, setWins] = useState(() => Number(localStorage.getItem(WINS_KEY) ?? 0));

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = `${ACCENT}33`;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = ACCENT;
    ctx.fillRect(4, s.playerY, PADDLE_W, PADDLE_H);
    ctx.fillRect(W - 4 - PADDLE_W, s.aiY, PADDLE_W, PADDLE_H);

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

      if (keys.up) s.playerY = Math.max(0, s.playerY - PADDLE_SPEED);
      if (keys.down) s.playerY = Math.min(H - PADDLE_H, s.playerY + PADDLE_SPEED);

      const aiCenter = s.aiY + PADDLE_H / 2;
      if (aiCenter < s.ballY - 6) s.aiY = Math.min(H - PADDLE_H, s.aiY + AI_SPEED);
      else if (aiCenter > s.ballY + 6) s.aiY = Math.max(0, s.aiY - AI_SPEED);

      if (s.serveAt !== null) {
        if (performance.now() >= s.serveAt) {
          const v = randomVelocity(s.serveTowardPlayer);
          s.ballVX = v.vx;
          s.ballVY = v.vy;
          s.serveAt = null;
        }
        draw();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      s.ballX += s.ballVX;
      s.ballY += s.ballVY;

      if (s.ballY - BALL_SIZE / 2 < 0 || s.ballY + BALL_SIZE / 2 > H) {
        s.ballVY *= -1;
        s.ballY = Math.max(BALL_SIZE / 2, Math.min(H - BALL_SIZE / 2, s.ballY));
        playWall();
      }

      // Player paddle collision (left)
      if (s.ballVX < 0 && s.ballX - BALL_SIZE / 2 <= 4 + PADDLE_W && s.ballX - BALL_SIZE / 2 >= 4
        && s.ballY >= s.playerY && s.ballY <= s.playerY + PADDLE_H) {
        const hit = (s.ballY - (s.playerY + PADDLE_H / 2)) / (PADDLE_H / 2);
        s.ballVX = Math.abs(s.ballVX) * 1.03;
        s.ballVY = hit * BALL_SPEED;
        playHit();
      }

      // AI paddle collision (right)
      if (s.ballVX > 0 && s.ballX + BALL_SIZE / 2 >= W - 4 - PADDLE_W && s.ballX + BALL_SIZE / 2 <= W - 4
        && s.ballY >= s.aiY && s.ballY <= s.aiY + PADDLE_H) {
        const hit = (s.ballY - (s.aiY + PADDLE_H / 2)) / (PADDLE_H / 2);
        s.ballVX = -Math.abs(s.ballVX) * 1.03;
        s.ballVY = hit * BALL_SPEED;
        playHit();
      }

      if (s.ballX < 0) {
        s.aiScore++;
        playScore();
        queueServe(s, true);
        forceTick(t => t + 1);
      } else if (s.ballX > W) {
        s.playerScore++;
        playScore();
        queueServe(s, false);
        forceTick(t => t + 1);
      }

      if (s.playerScore >= WIN_SCORE || s.aiScore >= WIN_SCORE) {
        if (s.playerScore > s.aiScore) {
          setWins(w => {
            const next = w + 1;
            localStorage.setItem(WINS_KEY, String(next));
            return next;
          });
          playWin();
        } else {
          playGameOver();
        }
        setStatus('over');
        return;
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
        if (status !== 'playing') reset();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); keysRef.current.up = true; }
      if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); keysRef.current.down = true; }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w') keysRef.current.up = false;
      if (e.key === 'ArrowDown' || e.key === 's') keysRef.current.down = false;
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
          <span>YOU <span style={{ color: ACCENT }}>{s.playerScore}</span></span>
          <span>CPU <span style={{ color: BALL_COLOR }}>{s.aiScore}</span></span>
          <span>WINS <span style={{ color: ACCENT }}>{wins}</span></span>
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
              {status === 'over' && (
                <div style={{ color: s.playerScore > s.aiScore ? ACCENT : BALL_COLOR, fontSize: '1.3rem' }}>
                  {s.playerScore > s.aiScore ? 'YOU WIN' : 'YOU LOSE'}
                </div>
              )}
              <div style={{ color: ACCENT }}>PRESS SPACE TO {status === 'over' ? 'RETRY' : 'START'}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>↑/↓ or W/S to move</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
