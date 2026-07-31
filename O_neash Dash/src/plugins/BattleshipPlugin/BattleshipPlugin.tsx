import { useEffect, useRef, useState, useCallback } from 'react';
import { playCannonFire, playExplosion, playSplash, playShipSunk, playWin, playGameOver } from '@/lib/gameSfx';

const FONT = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#39ff14';
const BALL_COLOR = '#ff3b3b';
const BEST_KEY = 'games-battleship-best';

const GRID_SIZE = 10;
const CELL = 28;
const BOARD_W = CELL * GRID_SIZE;
const ROW_LABEL_W = 16;
const LEFT_BOARD_X = 20 + ROW_LABEL_W;
const GAP = 50;
const RIGHT_BOARD_X = LEFT_BOARD_X + BOARD_W + GAP;
const HEADER_Y = 16;
const COL_LABEL_Y = 30;
const BOARD_Y = 44;
const W = RIGHT_BOARD_X + BOARD_W + 20;
const H = BOARD_Y + BOARD_W + 30;
const COL_LABELS = 'ABCDEFGHIJ';

// Standard fleet: carrier, battleship, cruiser, submarine, destroyer.
// Both fleets are auto-placed at game start — no manual placement UI, matching
// quick-play mode rather than adding a whole drag-and-drop placement phase.
const FLEET_SIZES = [5, 4, 3, 3, 2];

interface Cell { x: number; y: number }
interface Ship { cells: Cell[]; hitCount: number }
type CellState = 'empty' | 'miss' | 'hit';
interface FleetBoard { ships: Ship[]; grid: CellState[][] }

interface GameState {
  player: FleetBoard;
  cpu: FleetBoard;
  turn: 'player' | 'cpu';
  score: number;
  cpuTargetQueue: Cell[];
}

function isSunk(ship: Ship): boolean {
  return ship.hitCount >= ship.cells.length;
}

function allSunk(board: FleetBoard): boolean {
  return board.ships.every(isSunk);
}

function placeFleet(): Ship[] {
  const ships: Ship[] = [];
  const occupied = new Set<string>();
  for (const size of FLEET_SIZES) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() < 0.5;
      const x = Math.floor(Math.random() * (horizontal ? GRID_SIZE - size + 1 : GRID_SIZE));
      const y = Math.floor(Math.random() * (horizontal ? GRID_SIZE : GRID_SIZE - size + 1));
      const cells: Cell[] = Array.from({ length: size }, (_, i) => (horizontal ? { x: x + i, y } : { x, y: y + i }));
      const overlaps = cells.some(c => occupied.has(`${c.x},${c.y}`));
      if (!overlaps) {
        cells.forEach(c => occupied.add(`${c.x},${c.y}`));
        ships.push({ cells, hitCount: 0 });
        placed = true;
      }
    }
  }
  return ships;
}

function freshBoard(): FleetBoard {
  return {
    ships: placeFleet(),
    grid: Array.from({ length: GRID_SIZE }, () => Array<CellState>(GRID_SIZE).fill('empty')),
  };
}

function freshState(): GameState {
  return { player: freshBoard(), cpu: freshBoard(), turn: 'player', score: 0, cpuTargetQueue: [] };
}

function fireAt(board: FleetBoard, x: number, y: number): 'hit' | 'miss' | 'already' {
  if (board.grid[y][x] !== 'empty') return 'already';
  const ship = board.ships.find(s => s.cells.some(c => c.x === x && c.y === y));
  if (ship) {
    ship.hitCount++;
    board.grid[y][x] = 'hit';
    return 'hit';
  }
  board.grid[y][x] = 'miss';
  return 'miss';
}

function getCanvasPoint(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

export default function BattleshipPlugin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(freshState());

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

    ctx.fillStyle = ACCENT;
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('YOUR FLEET', LEFT_BOARD_X, HEADER_Y);
    ctx.fillText('ENEMY WATERS', RIGHT_BOARD_X, HEADER_Y);

    const drawLabels = (originX: number) => {
      ctx.fillStyle = `${ACCENT}99`;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      for (let col = 0; col < GRID_SIZE; col++) {
        ctx.fillText(COL_LABELS[col], originX + col * CELL + CELL / 2, COL_LABEL_Y);
      }
      ctx.textAlign = 'right';
      for (let row = 0; row < GRID_SIZE; row++) {
        ctx.fillText(String(row + 1), originX - 6, BOARD_Y + row * CELL + CELL / 2 + 4);
      }
    };
    drawLabels(LEFT_BOARD_X);
    drawLabels(RIGHT_BOARD_X);

    const drawBoard = (originX: number, board: FleetBoard, revealShips: boolean) => {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const x = originX + col * CELL;
          const y = BOARD_Y + row * CELL;
          const cell = board.grid[row][col];
          ctx.fillStyle = 'rgba(60,140,200,0.06)';
          ctx.fillRect(x, y, CELL - 2, CELL - 2);
          ctx.strokeStyle = `${ACCENT}22`;
          ctx.strokeRect(x, y, CELL - 2, CELL - 2);
          if (cell === 'miss') {
            ctx.strokeStyle = 'rgba(120,180,255,0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x + CELL / 2 - 1, y + CELL / 2 - 1, 4, 0, Math.PI * 2);
            ctx.stroke();
          } else if (cell === 'hit') {
            const cx = x + CELL / 2 - 1;
            const cy = y + CELL / 2 - 1;
            ctx.fillStyle = 'rgba(255,59,59,0.35)';
            ctx.beginPath();
            ctx.arc(cx, cy, CELL / 2 - 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = BALL_COLOR;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5);
            ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5);
            ctx.stroke();
          }
        }
      }
      if (revealShips) {
        for (const ship of board.ships) {
          const minX = Math.min(...ship.cells.map(c => c.x));
          const maxX = Math.max(...ship.cells.map(c => c.x));
          const minY = Math.min(...ship.cells.map(c => c.y));
          const maxY = Math.max(...ship.cells.map(c => c.y));
          const hx = originX + minX * CELL + 3;
          const hy = BOARD_Y + minY * CELL + 3;
          const hw = (maxX - minX + 1) * CELL - 8;
          const hh = (maxY - minY + 1) * CELL - 8;
          ctx.fillStyle = isSunk(ship) ? 'rgba(255,59,59,0.12)' : 'rgba(57,255,20,0.16)';
          ctx.fillRect(hx, hy, hw, hh);
          ctx.strokeStyle = isSunk(ship) ? `${BALL_COLOR}aa` : `${ACCENT}aa`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(hx, hy, hw, hh);
        }
      }
    };
    drawBoard(LEFT_BOARD_X, s.player, true);
    drawBoard(RIGHT_BOARD_X, s.cpu, false);

    if (status === 'playing') {
      ctx.fillStyle = s.turn === 'player' ? ACCENT : BALL_COLOR;
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.turn === 'player' ? 'YOUR TURN — CLICK ENEMY WATERS' : 'ENEMY FIRING...', W / 2, H - 10);
    }
  }, [status]);

  const reset = useCallback(() => {
    stateRef.current = freshState();
    setStatus('playing');
    setWinner(null);
    forceTick(t => t + 1);
    draw();
  }, [draw]);

  const finishGame = useCallback((who: 'player' | 'cpu') => {
    const s = stateRef.current;
    setBest(b => {
      if (s.score > b) { localStorage.setItem(BEST_KEY, String(s.score)); return s.score; }
      return b;
    });
    if (who === 'player') playWin(); else playGameOver();
    setWinner(who);
    setStatus('over');
  }, []);

  const cpuTurn = useCallback(() => {
    const s = stateRef.current;
    if (s.turn !== 'cpu') return; // stale timeout guard (e.g. game was reset mid-delay)

    let target: Cell | null = null;
    while (s.cpuTargetQueue.length > 0) {
      const candidate = s.cpuTargetQueue.shift()!;
      if (
        candidate.x >= 0 && candidate.x < GRID_SIZE &&
        candidate.y >= 0 && candidate.y < GRID_SIZE &&
        s.player.grid[candidate.y][candidate.x] === 'empty'
      ) { target = candidate; break; }
    }
    if (!target) {
      let x = 0, y = 0;
      do {
        x = Math.floor(Math.random() * GRID_SIZE);
        y = Math.floor(Math.random() * GRID_SIZE);
      } while (s.player.grid[y][x] !== 'empty');
      target = { x, y };
    }

    playCannonFire();
    const result = fireAt(s.player, target.x, target.y);
    let sunk = false;
    if (result === 'hit') {
      const ship = s.player.ships.find(sh => sh.cells.some(c => c.x === target!.x && c.y === target!.y));
      s.cpuTargetQueue.push(
        { x: target.x + 1, y: target.y }, { x: target.x - 1, y: target.y },
        { x: target.x, y: target.y + 1 }, { x: target.x, y: target.y - 1 },
      );
      sunk = Boolean(ship && isSunk(ship));
    }
    setTimeout(() => {
      if (result === 'hit') { sunk ? playShipSunk() : playExplosion(); } else playSplash();
    }, 150);

    if (allSunk(s.player)) { finishGame('cpu'); return; }
    s.turn = 'player';
    draw();
    forceTick(t => t + 1);
  }, [draw, finishGame]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (status !== 'playing') return;
    const s = stateRef.current;
    if (s.turn !== 'player') return;
    const { x, y } = getCanvasPoint(e);
    const col = Math.floor((x - RIGHT_BOARD_X) / CELL);
    const row = Math.floor((y - BOARD_Y) / CELL);
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return;

    const result = fireAt(s.cpu, col, row);
    if (result === 'already') return;

    playCannonFire();
    let sunk = false;
    if (result === 'hit') {
      s.score += 10;
      const ship = s.cpu.ships.find(sh => sh.cells.some(c => c.x === col && c.y === row));
      sunk = Boolean(ship && isSunk(ship));
      if (sunk) s.score += 50;
    }
    setTimeout(() => {
      if (result === 'hit') { sunk ? playShipSunk() : playExplosion(); } else playSplash();
    }, 150);

    if (allSunk(s.cpu)) { finishGame('player'); return; }

    s.turn = 'cpu';
    draw();
    forceTick(t => t + 1);
    setTimeout(cpuTurn, 500 + Math.random() * 400);
  }, [status, draw, finishGame, cpuTurn]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (status !== 'playing') reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [status, reset]);

  useEffect(() => { draw(); }, [draw]);

  const s = stateRef.current;
  const playerShipsLeft = s.player.ships.filter(sh => !isSunk(sh)).length;
  const cpuShipsLeft = s.cpu.ships.filter(sh => !isSunk(sh)).length;

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: FONT }}>
        <div style={{ display: 'flex', gap: 20, fontSize: '1.05rem', letterSpacing: 2, color: 'rgba(255,255,255,0.7)' }}>
          <span>SCORE <span style={{ color: ACCENT }}>{s.score}</span></span>
          <span>SHIPS <span style={{ color: ACCENT }}>{playerShipsLeft}</span>/5 vs <span style={{ color: BALL_COLOR }}>{cpuShipsLeft}</span>/5</span>
          <span>BEST <span style={{ color: ACCENT }}>{best}</span></span>
        </div>
        <div style={{ position: 'relative', border: `2px solid ${ACCENT}55` }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onClick={handleClick}
            style={{ display: 'block', imageRendering: 'pixelated', cursor: status === 'playing' && s.turn === 'player' ? 'crosshair' : 'default' }}
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
                  {winner === 'player' ? 'FLEET VICTORIOUS' : 'FLEET SUNK'}
                </div>
              )}
              <div style={{ color: ACCENT }}>PRESS SPACE TO {status === 'idle' ? 'START' : 'RETRY'}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', maxWidth: 340 }}>
                click enemy waters to fire — sink the whole fleet before yours goes down
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
