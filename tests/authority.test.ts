import { describe, it, expect } from 'vitest';
import { Authority } from '../src/multiplayer/authority';
import type { Resolution } from '../src/multiplayer/authority';
import { Board } from '../src/game/board';
import { createRng } from '../src/game/rng';
import type { BoardConfig, Position } from '../src/game/types';

const CONFIG: BoardConfig = { rows: 9, cols: 9, mines: 10 };
const SEED = 'authority-seed';
const FIRST: Position = { row: 4, col: 4 };

/** Mirror board to discover the mine layout for a seed + first click. */
function mineSet(): Set<number> {
  const ref = new Board(CONFIG, createRng(SEED));
  ref.reveal(FIRST);
  const mines = new Set<number>();
  for (let r = 0; r < ref.rows; r++) {
    for (let c = 0; c < ref.cols; c++) {
      if (ref.cells[r][c].isMine) mines.add(r * CONFIG.cols + c);
    }
  }
  return mines;
}

function firstMine(): Position {
  const mines = mineSet();
  const k = [...mines][0];
  return { row: Math.floor(k / CONFIG.cols), col: k % CONFIG.cols };
}

/** Reveal every safe cell (host), returning the final resolution.
 *  Reveals FIRST up front so the mine layout matches mineSet(). */
function clearAll(auth: Authority, by: 'host' | 'guest' = 'host'): Resolution | null {
  const mines = mineSet();
  let final: Resolution | null = auth.reveal(FIRST, by).resolution;
  for (let r = 0; r < CONFIG.rows; r++) {
    for (let c = 0; c < CONFIG.cols; c++) {
      if ((r === FIRST.row && c === FIRST.col) || mines.has(r * CONFIG.cols + c)) continue;
      const out = auth.reveal({ row: r, col: c }, by);
      if (out.resolution) final = out.resolution;
    }
  }
  return final;
}

describe('Authority — co-op', () => {
  it('both lose when a mine is revealed', () => {
    const auth = new Authority(CONFIG, SEED, 'coop');
    auth.reveal(FIRST, 'host'); // places mines (safe)
    const out = auth.reveal(firstMine(), 'guest');
    expect(out.hitMine).toBe(true);
    expect(out.resolution).toEqual({ mode: 'coop', win: false });
  });

  it('both win when the board is cleared', () => {
    const auth = new Authority(CONFIG, SEED, 'coop');
    expect(clearAll(auth)).toEqual({ mode: 'coop', win: true });
  });
});

describe('Authority — claim', () => {
  it('assigns ownership to the first revealer', () => {
    const auth = new Authority(CONFIG, SEED, 'claim');
    const out = auth.reveal(FIRST, 'host');
    expect(out.cells.length).toBeGreaterThan(0);
    expect(out.cells.every((c) => c.owner === 'host')).toBe(true);
    expect(auth.scores()).toMatchObject({ guest: 0 });
    expect(auth.scores().host).toBeGreaterThan(0);
  });

  it('hitting a mine makes that player lose and the opponent win immediately', () => {
    const auth = new Authority(CONFIG, SEED, 'claim');
    auth.reveal(FIRST, 'host');
    const out = auth.reveal(firstMine(), 'guest');
    expect(out.hitMine).toBe(true);
    expect(out.resolution).toMatchObject({ mode: 'claim', result: 'host' });
  });

  it('a full clear by one player awards them the win with the full count', () => {
    const auth = new Authority(CONFIG, SEED, 'claim');
    const res = clearAll(auth, 'host');
    expect(res).toMatchObject({ mode: 'claim', result: 'host' });
    if (res && res.mode === 'claim') {
      expect(res.scores.host).toBe(CONFIG.rows * CONFIG.cols - CONFIG.mines);
      expect(res.scores.guest).toBe(0);
    }
  });

  it('already-revealed / conflicting reveals are no-ops (first owner keeps the cell)', () => {
    const auth = new Authority(CONFIG, SEED, 'claim');
    auth.reveal(FIRST, 'host');
    const ownedByHost = auth.scores().host;
    // Guest tries to reveal a cell the host already owns → no change.
    const out = auth.reveal(FIRST, 'guest');
    expect(out.cells).toHaveLength(0);
    expect(auth.scores().host).toBe(ownedByHost);
    expect(auth.scores().guest).toBe(0);
  });
});
