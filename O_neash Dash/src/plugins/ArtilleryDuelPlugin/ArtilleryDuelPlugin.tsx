import { useEffect, useRef, useState, useCallback } from 'react';
import {
  playHit, playWin, playGameOver,
  playLaunch, startMissileWhistle, stopMissileWhistle, playExplosion,
} from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const BALL_COLOR = '#ff3b3b';
const BEST_KEY = 'games-artillery-duel-best';

const W = 700;
const H = 420;

// Terrain — destructible height-map, same random-walk approach as Lunar Lander,
// with a finer secondary jitter layered on top for a rougher, more detailed silhouette
const NUM_SEGMENTS = 48;
const TERRAIN_TOP = H - 220;
const TERRAIN_BOTTOM = H - 40;
const CRATER_RADIUS = 40;
const CRATER_DEPTH = 50;

// Ballistics
const GRAVITY = 0.12;
const MAX_POWER_SPEED = 9;
const WIND_MAX = 4;
const ANGLE_MIN = 5;
const ANGLE_MAX = 90;
const POWER_MIN = 10;
const POWER_MAX = 100;
const ANGLE_ADJUST_SPEED = 1;
const POWER_ADJUST_SPEED = 1;

const TANK_HP_MAX = 100;
const BLAST_RADIUS = 36;
const MAX_DAMAGE = 55;
const ROUND_BONUS = 100;

interface TerrainPoint { x: number; y: number }
interface Tank { x: number; hp: number }
interface Projectile {
  x: number; y: number; vx: number; vy: number;
  trail: { x: number; y: number }[];
  firedBy: Turn;
}

type Turn = 'player' | 'cpu';
type Phase = 'aiming' | 'flying' | 'cpu-thinking';

interface GameState {
  terrain: TerrainPoint[];
  player: Tank;
  cpu: Tank;
  turn: Turn;
  phase: Phase;
  playerAngle: number;
  playerPower: number;
  cpuAngle: number;
  cpuPower: number;
  projectile: Projectile | null;
  wind: number;
  round: number;
  score: number;
  cpuThinkUntil: number;
}

function generateTerrain(): TerrainPoint[] {
  const points: TerrainPoint[] = [];
  const segW = W / NUM_SEGMENTS;
  let y = (TERRAIN_TOP + TERRAIN_BOTTOM) / 2;
  for (let i = 0; i <= NUM_SEGMENTS; i++) {
    if (i > 0) {
      y += (Math.random() - 0.5) * 26; // coarse rolling hills
      y = Math.max(TERRAIN_TOP, Math.min(TERRAIN_BOTTOM, y));
    }
    const detail = (Math.random() - 0.5) * 12; // fine surface roughness
    points.push({ x: i * segW, y: Math.max(TERRAIN_TOP, Math.min(TERRAIN_BOTTOM, y + detail)) });
  }
  return points;
}

function terrainHeightAt(terrain: TerrainPoint[], x: number): number {
  const clampedX = Math.max(0, Math.min(W, x));
  for (let i = 0; i < terrain.length - 1; i++) {
    if (clampedX >= terrain[i].x && clampedX <= terrain[i + 1].x) {
      const t = (clampedX - terrain[i].x) / (terrain[i + 1].x - terrain[i].x);
      return terrain[i].y + (terrain[i + 1].y - terrain[i].y) * t;
    }
  }
  return terrain[terrain.length - 1].y;
}

function carveCrater(terrain: TerrainPoint[], x: number): void {
  for (const p of terrain) {
    const dist = Math.abs(p.x - x);
    if (dist < CRATER_RADIUS) {
      const falloff = 1 - dist / CRATER_RADIUS;
      p.y = Math.min(TERRAIN_BOTTOM, p.y + CRATER_DEPTH * falloff);
    }
  }
}

function freshState(): GameState {
  const terrain = generateTerrain();
  return {
    terrain,
    player: { x: 70, hp: TANK_HP_MAX },
    cpu: { x: W - 70, hp: TANK_HP_MAX },
    turn: 'player',
    phase: 'aiming',
    playerAngle: 45,
    playerPower: 60,
    cpuAngle: 45,
    cpuPower: 60,
    projectile: null,
    wind: Math.round((Math.random() * 2 - 1) * WIND_MAX),
    round: 1,
    score: 0,
    cpuThinkUntil: 0,
  };
}

function fireProjectile(tank: Tank, angleDeg: number, power: number, dir: 1 | -1, firedBy: Turn): Projectile {
  const rad = (angleDeg * Math.PI) / 180;
  const speed = (power / 100) * MAX_POWER_SPEED;
  const originY = 0; // caller offsets by terrain height
  return {
    x: tank.x, y: originY,
    vx: Math.cos(rad) * speed * dir,
    vy: -Math.sin(rad) * speed,
    trail: [],
    firedBy,
  };
}

export default function ArtilleryDuelPlugin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(freshState());
  const rafRef = useRef<number | null>(null);
  const whistleOnRef = useRef(false);

  const [status, setStatus] = useState<'idle' | 'playing' | 'over'>('idle');
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
  const [, forceTick] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0));

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    // Terrain
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = `${ACCENT}66`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const p of s.terrain) ctx.lineTo(p.x, p.y);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s.terrain[0].x, s.terrain[0].y);
    for (const p of s.terrain) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // Tanks
    const drawTank = (tank: Tank, angle: number, color: string, dir: 1 | -1) => {
      const groundY = terrainHeightAt(s.terrain, tank.x);
      ctx.fillStyle = tank.hp > 0 ? color : 'rgba(255,255,255,0.1)';
      ctx.fillRect(tank.x - 12, groundY - 10, 24, 10);
      const rad = (angle * Math.PI) / 180;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tank.x, groundY - 8);
      ctx.lineTo(tank.x + Math.cos(rad) * 20 * dir, groundY - 8 - Math.sin(rad) * 20);
      ctx.stroke();
      // HP bar
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(tank.x - 16, groundY + 6, 32, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tank.x - 16, groundY + 6, 32 * Math.max(0, tank.hp) / TANK_HP_MAX, 4);
    };
    drawTank(s.player, s.playerAngle, ACCENT, 1);
    drawTank(s.cpu, s.cpuAngle, BALL_COLOR, -1);

    // Projectile + trail — colored by who fired it
    if (s.projectile) {
      const p = s.projectile;
      const shotColor = p.firedBy === 'player' ? ACCENT : BALL_COLOR;
      ctx.strokeStyle = `${shotColor}88`;
      ctx.beginPath();
      for (let i = 0; i < p.trail.length; i++) {
        const t = p.trail[i];
        if (i === 0) ctx.moveTo(t.x, t.y); else ctx.lineTo(t.x, t.y);
      }
      ctx.stroke();
      ctx.fillStyle = shotColor;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    // Live HUD for whichever side is currently aiming
    if (status === 'playing' && s.phase === 'aiming') {
      const angle = s.turn === 'player' ? s.playerAngle : s.cpuAngle;
      const power = s.turn === 'player' ? s.playerPower : s.cpuPower;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`ANGLE ${Math.round(angle)}°`, 10, 18);
      ctx.fillText(`POWER ${Math.round(power)}`, 10, 34);
      ctx.fillText(`WIND ${s.wind > 0 ? '+' : ''}${s.wind}`, 10, 50);
    }

    ctx.fillStyle = s.turn === 'player' ? ACCENT : BALL_COLOR;
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      s.phase === 'cpu-thinking' ? 'ENEMY AIMING...' : s.turn === 'player' ? 'YOUR TURN' : 'ENEMY TURN',
      W / 2, 20
    );
  }, [status]);

  const reset = useCallback(() => {
    stateRef.current = freshState();
    setStatus('playing');
    setWinner(null);
    forceTick(t => t + 1);
  }, []);

  const finishGame = useCallback((who: 'player' | 'cpu') => {
    const s = stateRef.current;
    setBest(b => {
      if (s.score > b) { localStorage.setItem(BEST_KEY, String(s.score)); return s.score; }
      return b;
    });
    if (who === 'cpu') playGameOver(); else playWin();
    setWinner(who);
    setStatus('over');
  }, []);

  const resolveImpact = useCallback((impactX: number, impactY: number) => {
    const s = stateRef.current;
    carveCrater(s.terrain, impactX);
    stopMissileWhistle();
    whistleOnRef.current = false;
    playExplosion();

    let anyHit = false;
    for (const tank of [s.player, s.cpu]) {
      if (tank.hp <= 0) continue;
      const groundY = terrainHeightAt(s.terrain, tank.x);
      const dist = Math.hypot(tank.x - impactX, groundY - impactY);
      if (dist < BLAST_RADIUS) {
        const dmg = Math.round(MAX_DAMAGE * (1 - dist / BLAST_RADIUS));
        tank.hp = Math.max(0, tank.hp - dmg);
        anyHit = true;
      }
    }
    if (anyHit) playHit();

    s.projectile = null;

    if (s.cpu.hp <= 0) {
      s.score += ROUND_BONUS * s.round;
      s.round++;
      s.player.hp = TANK_HP_MAX;
      s.cpu.hp = TANK_HP_MAX;
      s.terrain = generateTerrain();
      s.wind = Math.round((Math.random() * 2 - 1) * WIND_MAX);
      s.turn = 'player';
      s.phase = 'aiming';
      playWin();
      forceTick(t => t + 1);
      return;
    }
    if (s.player.hp <= 0) { finishGame('cpu'); return; }

    if (s.turn === 'player') {
      s.turn = 'cpu';
      s.phase = 'cpu-thinking';
      s.cpuThinkUntil = performance.now() + 500 + Math.random() * 500;
    } else {
      s.turn = 'player';
      s.phase = 'aiming';
    }
    forceTick(t => t + 1);
  }, [finishGame]);

  // Game loop — only physics-active while a shell is in flight or CPU is thinking
  useEffect(() => {
    if (status !== 'playing') { draw(); return; }

    const tick = () => {
      const s = stateRef.current;
      const now = performance.now();

      if (s.phase === 'cpu-thinking' && now >= s.cpuThinkUntil) {
        // Adaptive AI: aim roughly toward the player, jitter shrinks as rounds progress
        const distToPlayer = Math.abs(s.cpu.x - s.player.x);
        const jitter = Math.max(3, 20 - s.round * 1.5);
        s.cpuAngle = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, 30 + Math.random() * 25));
        s.cpuPower = Math.max(POWER_MIN, Math.min(POWER_MAX,
          Math.round(distToPlayer / 6) + (Math.random() - 0.5) * jitter));
        const proj = fireProjectile(s.cpu, s.cpuAngle, s.cpuPower, -1, 'cpu');
        proj.y = terrainHeightAt(s.terrain, s.cpu.x) - 10;
        s.projectile = proj;
        s.phase = 'flying';
        playLaunch();
        startMissileWhistle();
        whistleOnRef.current = true;
      }

      if (s.phase === 'flying' && s.projectile) {
        const p = s.projectile;
        p.vx += s.wind * 0.004;
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 40) p.trail.shift();

        const groundY = terrainHeightAt(s.terrain, p.x);
        if (p.y >= groundY || p.x < 0 || p.x > W) {
          resolveImpact(Math.max(0, Math.min(W, p.x)), Math.min(groundY, p.y));
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (whistleOnRef.current) { stopMissileWhistle(); whistleOnRef.current = false; }
    };
  }, [status, draw, resolveImpact]);

  // Player controls
  useEffect(() => {
    const keys = { up: false, down: false, left: false, right: false };
    let heldRaf: number | null = null;

    const applyHeld = () => {
      const s = stateRef.current;
      if (s.turn === 'player' && s.phase === 'aiming') {
        if (keys.up) s.playerAngle = Math.min(ANGLE_MAX, s.playerAngle + ANGLE_ADJUST_SPEED);
        if (keys.down) s.playerAngle = Math.max(ANGLE_MIN, s.playerAngle - ANGLE_ADJUST_SPEED);
        if (keys.right) s.playerPower = Math.min(POWER_MAX, s.playerPower + POWER_ADJUST_SPEED);
        if (keys.left) s.playerPower = Math.max(POWER_MIN, s.playerPower - POWER_ADJUST_SPEED);
      }
      heldRaf = requestAnimationFrame(applyHeld);
    };
    heldRaf = requestAnimationFrame(applyHeld);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (status !== 'playing') { reset(); return; }
        const s = stateRef.current;
        if (s.turn === 'player' && s.phase === 'aiming') {
          const proj = fireProjectile(s.player, s.playerAngle, s.playerPower, 1, 'player');
          proj.y = terrainHeightAt(s.terrain, s.player.x) - 10;
          s.projectile = proj;
          s.phase = 'flying';
          playLaunch();
          startMissileWhistle();
          whistleOnRef.current = true;
        }
        return;
      }
      if (status !== 'playing') return;
      if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); keys.up = true; }
      if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); keys.down = true; }
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); keys.left = true; }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); keys.right = true; }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
      if (e.key === 'ArrowDown' || e.key === 's') keys.down = false;
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (heldRaf) cancelAnimationFrame(heldRaf);
    };
  }, [status, reset]);

  useEffect(() => { draw(); }, [draw]);

  const s = stateRef.current;

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: FONT }}>
        <div style={{ display: 'flex', gap: 20, fontSize: '1.05rem', letterSpacing: 2, color: 'rgba(255,255,255,0.7)' }}>
          <span>SCORE <span style={{ color: ACCENT }}>{s.score}</span></span>
          <span>ROUND <span style={{ color: ACCENT }}>{s.round}</span></span>
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
                <div style={{ color: winner === 'player' ? ACCENT : BALL_COLOR, fontSize: '1.3rem' }}>
                  {winner === 'player' ? 'VICTORY' : 'TANK DESTROYED'}
                </div>
              )}
              <div style={{ color: ACCENT }}>PRESS SPACE TO {status === 'idle' ? 'START' : 'RETRY'}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', maxWidth: 340 }}>
                ↑/↓ or W/S for angle, ←/→ or A/D for power, SPACE to fire — mind the wind
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
