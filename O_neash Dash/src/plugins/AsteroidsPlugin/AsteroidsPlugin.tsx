import { useEffect, useRef, useState, useCallback } from 'react';
import { playEat, playHit, playWall, playScore, playGameOver } from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const BALL_COLOR = '#ff3b3b';
const BEST_KEY = 'games-asteroids-best';

const W = 640;
const H = 640;
const START_LIVES = 3;

// Ship physics — momentum-based with mild drag so it stays controllable
const SHIP_SIZE = 14;
const SHIP_RADIUS = 8;
const SHIP_TURN_SPEED = 0.06;
const SHIP_THRUST = 0.08;
const SHIP_DRAG = 0.99;
const SHIP_MAX_SPEED = 4;
const INVULNERABLE_MS = 2000;
const RESPAWN_BLINK_MS = 150;
const HYPERSPACE_COOLDOWN_MS = 5000;

// Bullets
const BULLET_SPEED = 6;
const BULLET_RADIUS = 2;
const BULLET_LIFE_MS = 900;
const MAX_BULLETS = 4;
const FIRE_COOLDOWN_MS = 250;

// Asteroids
type AsteroidSize = 'large' | 'medium' | 'small';
const ASTEROID_RADIUS: Record<AsteroidSize, number> = { large: 32, medium: 18, small: 10 };
const ASTEROID_SCORE: Record<AsteroidSize, number> = { large: 20, medium: 50, small: 100 };
const ASTEROID_SHAPE_POINTS = 10;

interface Vec2 { x: number; y: number }

interface Ship {
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  invulnerableUntil: number;
}

interface Bullet extends Vec2 {
  vx: number; vy: number;
  bornAt: number;
}

interface Asteroid extends Vec2 {
  vx: number; vy: number;
  size: AsteroidSize;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  shape: number[];
}

interface Particle extends Vec2 {
  vx: number; vy: number;
  bornAt: number;
  life: number;
}

interface GameState {
  ship: Ship;
  bullets: Bullet[];
  asteroids: Asteroid[];
  particles: Particle[];
  lives: number;
  score: number;
  wave: number;
  lastFireAt: number;
  lastHyperspaceAt: number;
}

function wrap(v: number, max: number): number {
  if (v < 0) return v + max;
  if (v >= max) return v - max;
  return v;
}

function makeAsteroidShape(): number[] {
  return Array.from({ length: ASTEROID_SHAPE_POINTS }, () => 0.75 + Math.random() * 0.5);
}

function spawnAsteroidAtEdge(size: AsteroidSize): Asteroid {
  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (edge === 0) { x = 0; y = Math.random() * H; }
  else if (edge === 1) { x = W; y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = 0; }
  else { x = Math.random() * W; y = H; }
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.4 + Math.random() * 0.8;
  return {
    x, y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    size, radius: ASTEROID_RADIUS[size],
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.04,
    shape: makeAsteroidShape(),
  };
}

function splitAsteroid(parent: Asteroid, size: AsteroidSize): Asteroid {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.6 + Math.random() * 1.6;
  return {
    x: parent.x, y: parent.y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    size, radius: ASTEROID_RADIUS[size],
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.04,
    shape: makeAsteroidShape(),
  };
}

function spawnWave(wave: number): Asteroid[] {
  const count = Math.min(3 + wave, 9);
  return Array.from({ length: count }, () => spawnAsteroidAtEdge('large'));
}

function spawnExplosion(particles: Particle[], x: number, y: number, count: number): void {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      bornAt: now, life: 300 + Math.random() * 300,
    });
  }
}

function respawnShip(ship: Ship): void {
  ship.x = W / 2;
  ship.y = H / 2;
  ship.vx = 0;
  ship.vy = 0;
  ship.angle = 0;
  ship.invulnerableUntil = performance.now() + INVULNERABLE_MS;
}

function freshState(): GameState {
  const ship: Ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, invulnerableUntil: 0 };
  respawnShip(ship);
  return {
    ship,
    bullets: [],
    asteroids: spawnWave(1),
    particles: [],
    lives: START_LIVES,
    score: 0,
    wave: 1,
    lastFireAt: 0,
    lastHyperspaceAt: 0,
  };
}

function drawAsteroid(ctx: CanvasRenderingContext2D, a: Asteroid): void {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.rotation);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < a.shape.length; i++) {
    const angle = (i / a.shape.length) * Math.PI * 2;
    const r = a.radius * a.shape[i];
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, thrusting: boolean): void {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -SHIP_SIZE);
  ctx.lineTo(-SHIP_SIZE * 0.6, SHIP_SIZE * 0.7);
  ctx.lineTo(0, SHIP_SIZE * 0.3);
  ctx.lineTo(SHIP_SIZE * 0.6, SHIP_SIZE * 0.7);
  ctx.closePath();
  ctx.stroke();
  if (thrusting) {
    ctx.strokeStyle = BALL_COLOR;
    ctx.beginPath();
    ctx.moveTo(-SHIP_SIZE * 0.3, SHIP_SIZE * 0.65);
    ctx.lineTo(0, SHIP_SIZE * 1.3 + Math.random() * 5);
    ctx.lineTo(SHIP_SIZE * 0.3, SHIP_SIZE * 0.65);
    ctx.stroke();
  }
  ctx.restore();
}

export default function AsteroidsPlugin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(freshState());
  const keysRef = useRef<{ left: boolean; right: boolean; thrust: boolean }>({ left: false, right: false, thrust: false });
  const rafRef = useRef<number | null>(null);

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

    for (const p of s.particles) {
      const lifeFrac = 1 - (now - p.bornAt) / p.life;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, lifeFrac * 0.8)})`;
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    ctx.fillStyle = ACCENT;
    for (const b of s.bullets) {
      ctx.fillRect(b.x - BULLET_RADIUS, b.y - BULLET_RADIUS, BULLET_RADIUS * 2, BULLET_RADIUS * 2);
    }

    for (const a of s.asteroids) drawAsteroid(ctx, a);

    const blinkOff = now < s.ship.invulnerableUntil && Math.floor(now / RESPAWN_BLINK_MS) % 2 === 0;
    if (!blinkOff) drawShip(ctx, s.ship, keysRef.current.thrust);
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

      // Ship physics
      if (keys.left) s.ship.angle -= SHIP_TURN_SPEED;
      if (keys.right) s.ship.angle += SHIP_TURN_SPEED;
      if (keys.thrust) {
        s.ship.vx += Math.sin(s.ship.angle) * SHIP_THRUST;
        s.ship.vy += -Math.cos(s.ship.angle) * SHIP_THRUST;
      }
      s.ship.vx *= SHIP_DRAG;
      s.ship.vy *= SHIP_DRAG;
      const shipSpeed = Math.hypot(s.ship.vx, s.ship.vy);
      if (shipSpeed > SHIP_MAX_SPEED) {
        s.ship.vx = (s.ship.vx / shipSpeed) * SHIP_MAX_SPEED;
        s.ship.vy = (s.ship.vy / shipSpeed) * SHIP_MAX_SPEED;
      }
      s.ship.x = wrap(s.ship.x + s.ship.vx, W);
      s.ship.y = wrap(s.ship.y + s.ship.vy, H);

      // Bullets — move, wrap, expire
      s.bullets = s.bullets.filter(b => now - b.bornAt < BULLET_LIFE_MS);
      for (const b of s.bullets) {
        b.x = wrap(b.x + b.vx, W);
        b.y = wrap(b.y + b.vy, H);
      }

      // Asteroids — move, wrap, spin
      for (const a of s.asteroids) {
        a.x = wrap(a.x + a.vx, W);
        a.y = wrap(a.y + a.vy, H);
        a.rotation += a.rotationSpeed;
      }

      // Particles — move, fade out
      s.particles = s.particles.filter(p => now - p.bornAt < p.life);
      for (const p of s.particles) {
        p.x += p.vx;
        p.y += p.vy;
      }

      // Bullet vs asteroid collisions (with splitting)
      const survivingBullets = [...s.bullets];
      const survivingAsteroids: Asteroid[] = [];
      for (const a of s.asteroids) {
        let destroyed = false;
        for (let i = 0; i < survivingBullets.length; i++) {
          const b = survivingBullets[i];
          if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius) {
            destroyed = true;
            survivingBullets.splice(i, 1);
            s.score += ASTEROID_SCORE[a.size];
            playHit();
            spawnExplosion(s.particles, a.x, a.y, 8);
            if (a.size !== 'small') {
              const nextSize: AsteroidSize = a.size === 'large' ? 'medium' : 'small';
              survivingAsteroids.push(splitAsteroid(a, nextSize));
              survivingAsteroids.push(splitAsteroid(a, nextSize));
            }
            break;
          }
        }
        if (!destroyed) survivingAsteroids.push(a);
      }
      s.asteroids = survivingAsteroids;
      s.bullets = survivingBullets;

      // Ship vs asteroid collision
      if (now >= s.ship.invulnerableUntil) {
        const hitIdx = s.asteroids.findIndex(a =>
          Math.hypot(a.x - s.ship.x, a.y - s.ship.y) < a.radius + SHIP_RADIUS
        );
        if (hitIdx !== -1) {
          spawnExplosion(s.particles, s.ship.x, s.ship.y, 14);
          s.lives--;
          if (s.lives <= 0) { finishGame(); return; }
          playWall();
          respawnShip(s.ship);
          forceTick(t => t + 1);
        }
      }

      // Wave clear
      if (s.asteroids.length === 0) {
        s.wave++;
        s.asteroids = spawnWave(s.wave);
        playScore();
        forceTick(t => t + 1);
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [status, draw, finishGame]);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (status !== 'playing') { reset(); return; }
        const s = stateRef.current;
        const now = performance.now();
        if (now - s.lastFireAt < FIRE_COOLDOWN_MS || s.bullets.length >= MAX_BULLETS) return;
        s.lastFireAt = now;
        const dirX = Math.sin(s.ship.angle);
        const dirY = -Math.cos(s.ship.angle);
        s.bullets.push({
          x: s.ship.x + dirX * SHIP_SIZE,
          y: s.ship.y + dirY * SHIP_SIZE,
          vx: s.ship.vx + dirX * BULLET_SPEED,
          vy: s.ship.vy + dirY * BULLET_SPEED,
          bornAt: now,
        });
        return;
      }
      if (status !== 'playing') return;
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); keysRef.current.left = true; }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); keysRef.current.right = true; }
      if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); keysRef.current.thrust = true; }
      if (e.key === 'ArrowDown' || e.key === 's') {
        e.preventDefault();
        const s = stateRef.current;
        const now = performance.now();
        if (now - s.lastHyperspaceAt < HYPERSPACE_COOLDOWN_MS) return;
        s.lastHyperspaceAt = now;
        s.ship.x = Math.random() * W;
        s.ship.y = Math.random() * H;
        s.ship.vx = 0;
        s.ship.vy = 0;
        playEat();
      }
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
          <span>WAVE <span style={{ color: ACCENT }}>{s.wave}</span></span>
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
                <div style={{ color: BALL_COLOR, fontSize: '1.3rem' }}>GAME OVER</div>
              )}
              <div style={{ color: ACCENT }}>PRESS SPACE TO {status === 'idle' ? 'START' : 'RETRY'}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', maxWidth: 300 }}>
                ←/→ or A/D to turn, ↑/W to thrust, SPACE to fire, ↓/S to hyperspace
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
