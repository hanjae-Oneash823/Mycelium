import { useEffect, useRef, useState, useCallback } from 'react';
import { playWall, playScore, playWin, playGameOver, startEngineSound, stopEngineSound } from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const BALL_COLOR = '#ff3b3b';
const BEST_KEY = 'games-lunar-lander-best';

const W = 760;
const H = 560;
const START_LIVES = 3;

// Ship physics — true vacuum (no drag), gravity constantly pulls down
const SHIP_SIZE = 16;
const SHIP_RADIUS = 10;
const TURN_SPEED = 0.05;
const THRUST = 0.045;
const GRAVITY = 0.018;
const MAX_FUEL = 100;
const FUEL_BURN_RATE = 0.4;

// Safe-landing thresholds
const SAFE_VX_MAX = 0.7;
const SAFE_VY_MAX = 1.4;
const SAFE_ANGLE_MAX = 0.3;

// Terrain
const NUM_SEGMENTS = 18;
const TERRAIN_TOP = H - 160;
const TERRAIN_BOTTOM = H - 20;

interface Ship {
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  fuel: number;
}

interface TerrainPoint { x: number; y: number }

interface Terrain {
  points: TerrainPoint[];
  padXStart: number;
  padXEnd: number;
  padY: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  bornAt: number;
  life: number;
}

interface GameState {
  ship: Ship;
  terrain: Terrain;
  particles: Particle[];
  level: number;
  lives: number;
  score: number;
}

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function generateTerrain(level: number): Terrain {
  const points: TerrainPoint[] = [];
  const segW = W / NUM_SEGMENTS;
  let y = (TERRAIN_TOP + TERRAIN_BOTTOM) / 2;
  for (let i = 0; i <= NUM_SEGMENTS; i++) {
    if (i > 0) {
      y += (Math.random() - 0.5) * 60;
      y = Math.max(TERRAIN_TOP, Math.min(TERRAIN_BOTTOM, y));
    }
    points.push({ x: i * segW, y });
  }
  const padSpan = Math.max(1, 3 - Math.floor((level - 1) / 2));
  const padStart = 2 + Math.floor(Math.random() * (NUM_SEGMENTS - padSpan - 3));
  const padY = points[padStart].y;
  for (let i = padStart; i <= padStart + padSpan; i++) points[i].y = padY;
  return { points, padXStart: points[padStart].x, padXEnd: points[padStart + padSpan].x, padY };
}

function terrainHeightAt(terrain: Terrain, x: number): number {
  const pts = terrain.points;
  const clampedX = Math.max(0, Math.min(W, x));
  for (let i = 0; i < pts.length - 1; i++) {
    if (clampedX >= pts[i].x && clampedX <= pts[i + 1].x) {
      const t = (clampedX - pts[i].x) / (pts[i + 1].x - pts[i].x);
      return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
    }
  }
  return pts[pts.length - 1].y;
}

function respawnShip(ship: Ship): void {
  ship.x = W / 2;
  ship.y = 40;
  ship.vx = 0;
  ship.vy = 0;
  ship.angle = 0;
  ship.fuel = MAX_FUEL;
}

function freshState(): GameState {
  const ship: Ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, fuel: 0 };
  respawnShip(ship);
  return {
    ship,
    terrain: generateTerrain(1),
    particles: [],
    level: 1,
    lives: START_LIVES,
    score: 0,
  };
}

function spawnExplosion(particles: Particle[], x: number, y: number): void {
  const now = performance.now();
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      bornAt: now, life: 300 + Math.random() * 300,
    });
  }
}

// Classic side-view lunar module: tapered body, splayed struts, footpads.
// Local frame is unrotated (angle 0 == upright, legs pointing straight down)
// since that's what the safe-landing check treats as "upright".
function drawLander(ctx: CanvasRenderingContext2D, ship: Ship, thrusting: boolean): void {
  const s = SHIP_SIZE / 12; // scale factor relative to the original tuning size

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;

  // Body — tapered trapezoid capsule
  ctx.beginPath();
  ctx.moveTo(-6 * s, -9 * s);
  ctx.lineTo(6 * s, -9 * s);
  ctx.lineTo(9 * s, 3 * s);
  ctx.lineTo(-9 * s, 3 * s);
  ctx.closePath();
  ctx.stroke();

  // Porthole window
  ctx.beginPath();
  ctx.arc(0, -3 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.stroke();

  // Legs — diagonal struts with footpad ticks
  ctx.beginPath();
  ctx.moveTo(-9 * s, 3 * s);
  ctx.lineTo(-15 * s, 13 * s);
  ctx.moveTo(-17 * s, 13 * s);
  ctx.lineTo(-13 * s, 13 * s);
  ctx.moveTo(9 * s, 3 * s);
  ctx.lineTo(15 * s, 13 * s);
  ctx.moveTo(13 * s, 13 * s);
  ctx.lineTo(17 * s, 13 * s);
  ctx.stroke();

  if (thrusting) {
    ctx.strokeStyle = BALL_COLOR;
    ctx.beginPath();
    ctx.moveTo(-4 * s, 3 * s);
    ctx.lineTo(0, (11 + Math.random() * 5) * s);
    ctx.lineTo(4 * s, 3 * s);
    ctx.stroke();
  }
  ctx.restore();
}

export default function LunarLanderPlugin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(freshState());
  const keysRef = useRef<{ left: boolean; right: boolean; thrust: boolean }>({ left: false, right: false, thrust: false });
  const rafRef = useRef<number | null>(null);
  const engineSoundOnRef = useRef(false);

  const [status, setStatus] = useState<'idle' | 'playing' | 'over'>('idle');
  const [, forceTick] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0));

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;
    const now = performance.now();

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    // Terrain
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = `${ACCENT}66`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const p of s.terrain.points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s.terrain.points[0].x, s.terrain.points[0].y);
    for (const p of s.terrain.points) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // Landing pad + flags
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.terrain.padXStart, s.terrain.padY);
    ctx.lineTo(s.terrain.padXEnd, s.terrain.padY);
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(s.terrain.padXStart, s.terrain.padY - 14, 2, 14);
    ctx.fillRect(s.terrain.padXEnd - 2, s.terrain.padY - 14, 2, 14);

    // Particles (crash debris)
    for (const p of s.particles) {
      const lifeFrac = 1 - (now - p.bornAt) / p.life;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, lifeFrac * 0.8)})`;
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    drawLander(ctx, s.ship, keysRef.current.thrust && s.ship.fuel > 0);

    // Cockpit HUD — must stay live every frame, drawn directly on canvas
    const groundY = terrainHeightAt(s.terrain, s.ship.x);
    const altitude = Math.max(0, Math.round(groundY - s.ship.y));
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ALT ${altitude}`, 10, 18);
    ctx.fillText(`VSPD ${s.ship.vy.toFixed(2)}`, 10, 32);
    ctx.fillText(`HSPD ${s.ship.vx.toFixed(2)}`, 10, 46);
    ctx.fillStyle = s.ship.fuel < 20 ? BALL_COLOR : 'rgba(255,255,255,0.7)';
    ctx.fillText(`FUEL ${Math.round(s.ship.fuel)}`, 10, 60);
  }, []);

  const reset = useCallback(() => {
    stateRef.current = freshState();
    setStatus('playing');
    forceTick(t => t + 1);
  }, []);

  const finishGame = useCallback(() => {
    const s = stateRef.current;
    setBest(b => {
      if (s.score > b) { localStorage.setItem(BEST_KEY, String(s.score)); return s.score; }
      return b;
    });
    playGameOver();
    setStatus('over');
  }, []);

  // Game loop
  useEffect(() => {
    if (status !== 'playing') { draw(); return; }

    const tick = () => {
      const s = stateRef.current;
      const keys = keysRef.current;
      const now = performance.now();

      if (keys.left) s.ship.angle -= TURN_SPEED;
      if (keys.right) s.ship.angle += TURN_SPEED;

      const prevFuel = s.ship.fuel;
      const isThrusting = keys.thrust && prevFuel > 0;
      if (isThrusting) {
        s.ship.vx += Math.sin(s.ship.angle) * THRUST;
        s.ship.vy += -Math.cos(s.ship.angle) * THRUST;
        s.ship.fuel = Math.max(0, prevFuel - FUEL_BURN_RATE);
        if (s.ship.fuel <= 0) playScore(); // fuel-exhausted cue
      }
      if (isThrusting && !engineSoundOnRef.current) {
        startEngineSound();
        engineSoundOnRef.current = true;
      } else if (!isThrusting && engineSoundOnRef.current) {
        stopEngineSound();
        engineSoundOnRef.current = false;
      }
      s.ship.vy += GRAVITY;
      s.ship.x += s.ship.vx;
      s.ship.y += s.ship.vy;

      if (s.ship.x < SHIP_RADIUS) { s.ship.x = SHIP_RADIUS; s.ship.vx = 0; }
      if (s.ship.x > W - SHIP_RADIUS) { s.ship.x = W - SHIP_RADIUS; s.ship.vx = 0; }

      s.particles = s.particles.filter(p => now - p.bornAt < p.life);
      for (const p of s.particles) { p.x += p.vx; p.y += p.vy; }

      const groundY = terrainHeightAt(s.terrain, s.ship.x);
      if (s.ship.y + SHIP_RADIUS >= groundY) {
        const isPad = s.ship.x - SHIP_RADIUS >= s.terrain.padXStart && s.ship.x + SHIP_RADIUS <= s.terrain.padXEnd;
        const speedOk = Math.abs(s.ship.vx) <= SAFE_VX_MAX && Math.abs(s.ship.vy) <= SAFE_VY_MAX;
        const angleOk = Math.abs(normalizeAngle(s.ship.angle)) <= SAFE_ANGLE_MAX;

        if (isPad && speedOk && angleOk) {
          const speedPenalty = (Math.abs(s.ship.vx) + Math.abs(s.ship.vy)) * 30;
          s.score += Math.max(50, Math.round(200 + s.ship.fuel * 2 - speedPenalty));
          playWin();
          s.level++;
          s.terrain = generateTerrain(s.level);
          respawnShip(s.ship);
        } else {
          spawnExplosion(s.particles, s.ship.x, s.ship.y);
          s.lives--;
          if (s.lives <= 0) { finishGame(); return; }
          playWall();
          respawnShip(s.ship);
        }
        forceTick(t => t + 1);
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (engineSoundOnRef.current) { stopEngineSound(); engineSoundOnRef.current = false; }
    };
  }, [status, draw, finishGame]);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (status !== 'playing') reset();
        return;
      }
      if (status !== 'playing') return;
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); keysRef.current.left = true; }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); keysRef.current.right = true; }
      if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); keysRef.current.thrust = true; }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keysRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keysRef.current.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w') keysRef.current.thrust = false;
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
        <div style={{ display: 'flex', gap: 20, fontSize: '1.05rem', letterSpacing: 2, color: 'rgba(255,255,255,0.7)' }}>
          <span>SCORE <span style={{ color: ACCENT }}>{s.score}</span></span>
          <span>LIVES <span style={{ color: BALL_COLOR }}>{s.lives}</span></span>
          <span>LEVEL <span style={{ color: ACCENT }}>{s.level}</span></span>
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
              {status === 'over' && (
                <div style={{ color: BALL_COLOR, fontSize: '1.3rem' }}>OUT OF LANDERS</div>
              )}
              <div style={{ color: ACCENT }}>PRESS SPACE TO {status === 'idle' ? 'START' : 'RETRY'}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', maxWidth: 320 }}>
                ←/→ or A/D to rotate, ↑/W to thrust — land softly and upright on the flagged pad
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
