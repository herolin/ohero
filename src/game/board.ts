import type { BoardConfig, Cell, Position, RevealResult, PlayerId } from './types';
import type { Rng } from './rng';

/**
 * The Minesweeper board and all pure game rules operating on it:
 * mine placement (first-click safe), adjacency counts, flood-fill reveal,
 * flagging and win detection. Has no dependency on the DOM or the network.
 */
export class Board {
  readonly rows: number;
  readonly cols: number;
  readonly mines: number;
  readonly cells: Cell[][];

  private readonly rng: Rng;
  private minesPlaced = false;

  constructor(config: BoardConfig, rng: Rng) {
    this.rows = config.rows;
    this.cols = config.cols;
    this.mines = config.mines;
    this.rng = rng;
    this.cells = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => this.emptyCell()),
    );
  }

  private emptyCell(): Cell {
    return {
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
      owner: null,
    };
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  /** The (up to 8) neighbours of a position. */
  neighbors(pos: Position): Position[] {
    const result: Position[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const row = pos.row + dr;
        const col = pos.col + dc;
        if (this.inBounds(row, col)) result.push({ row, col });
      }
    }
    return result;
  }

  private key(pos: Position): number {
    return pos.row * this.cols + pos.col;
  }

  /**
   * Place mines deterministically, keeping the first-clicked cell (and, when
   * there is room, its neighbours) mine-free so the opening click is safe.
   */
  private placeMines(safe: Position): void {
    const total = this.rows * this.cols;

    // Prefer excluding the whole 3x3 neighbourhood for a nicer opening; fall
    // back to only the clicked cell if the board is too dense.
    let forbidden = new Set<number>([this.key(safe)]);
    for (const n of this.neighbors(safe)) forbidden.add(this.key(n));
    if (total - forbidden.size < this.mines) {
      forbidden = new Set<number>([this.key(safe)]);
    }

    const candidates: Position[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (!forbidden.has(this.key({ row, col }))) candidates.push({ row, col });
      }
    }

    // Partial Fisher–Yates: pick the first `mines` positions.
    for (let i = 0; i < this.mines; i++) {
      const j = i + this.rng.int(candidates.length - i);
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
      const pick = candidates[i];
      this.cells[pick.row][pick.col].isMine = true;
    }

    this.computeAdjacency();
    this.minesPlaced = true;
  }

  private computeAdjacency(): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        if (cell.isMine) continue;
        let count = 0;
        for (const n of this.neighbors({ row, col })) {
          if (this.cells[n.row][n.col].isMine) count++;
        }
        cell.adjacentMines = count;
      }
    }
  }

  /**
   * Reveal a cell. On the very first reveal, mines are placed (excluding the
   * clicked cell) so the opening is always safe. Revealing an empty (0) cell
   * flood-fills its connected region. Returns every cell revealed plus whether
   * a mine was hit.
   */
  reveal(pos: Position, owner: PlayerId | null = null): RevealResult {
    if (!this.minesPlaced) this.placeMines(pos);

    const start = this.cells[pos.row][pos.col];
    if (start.isRevealed || start.isFlagged) {
      return { revealed: [], hitMine: false };
    }

    if (start.isMine) {
      start.isRevealed = true;
      if (start.owner === null) start.owner = owner;
      return { revealed: [pos], hitMine: true };
    }

    const revealed: Position[] = [];
    const stack: Position[] = [pos];
    const seen = new Set<number>();
    while (stack.length > 0) {
      const p = stack.pop() as Position;
      const cell = this.cells[p.row][p.col];
      if (cell.isRevealed || cell.isFlagged) continue;
      const k = this.key(p);
      if (seen.has(k)) continue;
      seen.add(k);

      cell.isRevealed = true;
      if (cell.owner === null) cell.owner = owner;
      revealed.push(p);

      // Expand only through empty cells; their neighbours are never mines.
      if (cell.adjacentMines === 0) {
        for (const n of this.neighbors(p)) {
          const nc = this.cells[n.row][n.col];
          if (!nc.isRevealed && !nc.isFlagged) stack.push(n);
        }
      }
    }
    return { revealed, hitMine: false };
  }

  /** Toggle a flag on an unrevealed cell. No-op on revealed cells. */
  toggleFlag(pos: Position): void {
    const cell = this.cells[pos.row][pos.col];
    if (cell.isRevealed) return;
    cell.isFlagged = !cell.isFlagged;
  }

  /** Number of flags currently placed. */
  flagCount(): number {
    let count = 0;
    for (const row of this.cells) {
      for (const cell of row) if (cell.isFlagged) count++;
    }
    return count;
  }

  /** Won when every non-mine cell has been revealed. */
  isWon(): boolean {
    for (const row of this.cells) {
      for (const cell of row) {
        if (!cell.isMine && !cell.isRevealed) return false;
      }
    }
    return true;
  }

  /** Number of safe (non-mine) cells that have been revealed. */
  revealedSafeCount(): number {
    let count = 0;
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.isRevealed && !cell.isMine) count++;
      }
    }
    return count;
  }

  /** Total number of safe (non-mine) cells on the board. */
  safeCount(): number {
    return this.rows * this.cols - this.mines;
  }

  /** Count of cells revealed by a given owner (claim mode scoring). */
  ownedCount(owner: PlayerId): number {
    let count = 0;
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.isRevealed && cell.owner === owner) count++;
      }
    }
    return count;
  }
}
