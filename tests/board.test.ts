import { describe, it, expect } from 'vitest';
import { Board } from '../src/game/board';
import { createRng } from '../src/game/rng';
import type { BoardConfig, Position } from '../src/game/types';

const SMALL: BoardConfig = { rows: 9, cols: 9, mines: 10 };

function newBoard(seed: string, config: BoardConfig = SMALL): Board {
  return new Board(config, createRng(seed));
}

function allMines(board: Board): Position[] {
  const result: Position[] = [];
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      if (board.cells[row][col].isMine) result.push({ row, col });
    }
  }
  return result;
}

describe('Board setup', () => {
  it('starts empty with the right dimensions and no mines', () => {
    const board = newBoard('setup');
    expect(board.cells.length).toBe(9);
    expect(board.cells[0].length).toBe(9);
    expect(allMines(board).length).toBe(0);
  });

  it('places exactly the configured number of mines after first reveal', () => {
    const board = newBoard('mines');
    board.reveal({ row: 0, col: 0 });
    expect(allMines(board).length).toBe(SMALL.mines);
  });
});

describe('First-click safety', () => {
  it('never puts a mine on the first-clicked cell or its neighbours', () => {
    for (let i = 0; i < 50; i++) {
      const board = newBoard(`safe-${i}`);
      const first: Position = { row: 4, col: 4 };
      board.reveal(first);
      const forbidden = [first, ...board.neighbors(first)];
      for (const p of forbidden) {
        expect(board.cells[p.row][p.col].isMine).toBe(false);
      }
    }
  });
});

describe('Adjacency counts', () => {
  it('matches the actual number of neighbouring mines', () => {
    const board = newBoard('adj');
    board.reveal({ row: 0, col: 0 });
    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        const cell = board.cells[row][col];
        if (cell.isMine) continue;
        const actual = board
          .neighbors({ row, col })
          .filter((n) => board.cells[n.row][n.col].isMine).length;
        expect(cell.adjacentMines).toBe(actual);
      }
    }
  });
});

describe('Determinism', () => {
  it('same seed + same first click => identical mine layout', () => {
    const a = newBoard('dsame');
    const b = newBoard('dsame');
    const first: Position = { row: 2, col: 3 };
    a.reveal(first);
    b.reveal(first);
    expect(allMines(a)).toEqual(allMines(b));
  });
});

describe('Flood fill reveal', () => {
  it('revealing an empty cell reveals a connected region', () => {
    const board = newBoard('flood');
    const result = board.reveal({ row: 4, col: 4 });
    // First click is guaranteed to sit in an empty (0) opening, so more than
    // one cell must be revealed.
    expect(result.hitMine).toBe(false);
    expect(result.revealed.length).toBeGreaterThan(1);
  });

  it('does not reveal flagged cells', () => {
    const board = newBoard('flagged');
    board.reveal({ row: 0, col: 0 });
    // Flag an unrevealed cell, then re-reveal from origin; it should stay hidden.
    let target: Position | null = null;
    for (let row = 0; row < board.rows && !target; row++) {
      for (let col = 0; col < board.cols; col++) {
        if (!board.cells[row][col].isRevealed && !board.cells[row][col].isMine) {
          target = { row, col };
          break;
        }
      }
    }
    if (target) {
      board.toggleFlag(target);
      board.reveal({ row: 0, col: 0 });
      expect(board.cells[target.row][target.col].isRevealed).toBe(false);
    }
  });
});

describe('Flagging', () => {
  it('toggles flags and counts them, ignoring revealed cells', () => {
    const board = newBoard('flag');
    board.reveal({ row: 0, col: 0 });
    const mine = allMines(board)[0];
    board.toggleFlag(mine);
    expect(board.flagCount()).toBe(1);
    board.toggleFlag(mine);
    expect(board.flagCount()).toBe(0);
    // Revealed cells cannot be flagged.
    board.toggleFlag({ row: 0, col: 0 });
    expect(board.flagCount()).toBe(0);
  });
});

describe('Win / lose', () => {
  it('reveals a mine => hitMine true', () => {
    const board = newBoard('lose');
    board.reveal({ row: 0, col: 0 });
    const mine = allMines(board)[0];
    const result = board.reveal(mine);
    expect(result.hitMine).toBe(true);
  });

  it('revealing every non-mine cell => won', () => {
    const board = newBoard('win');
    board.reveal({ row: 4, col: 4 });
    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        if (!board.cells[row][col].isMine) board.reveal({ row, col });
      }
    }
    expect(board.isWon()).toBe(true);
  });
});

describe('Claim-mode ownership', () => {
  it('assigns ownership to the revealing player', () => {
    const board = newBoard('own');
    const result = board.reveal({ row: 4, col: 4 }, 'p1');
    for (const p of result.revealed) {
      expect(board.cells[p.row][p.col].owner).toBe('p1');
    }
    expect(board.ownedCount('p1')).toBe(result.revealed.length);
  });
});
