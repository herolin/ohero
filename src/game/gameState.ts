import type { BoardConfig, GameStatus, Position, PlayerId, RevealResult } from './types';
import { createRng } from './rng';
import { Board } from './board';

/**
 * Single-round game state machine. Wraps a Board and tracks status
 * (ready → playing → won/lost). UI and multiplayer layers drive it via
 * reveal()/toggleFlag(). Deterministic given the same seed.
 */
export class Game {
  readonly board: Board;
  readonly config: BoardConfig;
  status: GameStatus = 'ready';

  constructor(config: BoardConfig, seed: string | number) {
    this.config = config;
    this.board = new Board(config, createRng(seed));
  }

  private get isActive(): boolean {
    return this.status === 'ready' || this.status === 'playing';
  }

  /** Reveal a cell and update status. Ignored once the round is over. */
  reveal(pos: Position, owner: PlayerId | null = null): RevealResult {
    if (!this.isActive) return { revealed: [], hitMine: false };
    if (this.status === 'ready') this.status = 'playing';

    const result = this.board.reveal(pos, owner);
    if (result.hitMine) {
      this.status = 'lost';
    } else if (this.board.isWon()) {
      this.status = 'won';
    }
    return result;
  }

  /** Toggle a flag. Ignored once the round is over. */
  toggleFlag(pos: Position): void {
    if (!this.isActive) return;
    this.board.toggleFlag(pos);
  }

  /** Mines remaining = total mines − flags placed (may go negative). */
  minesRemaining(): number {
    return this.config.mines - this.board.flagCount();
  }
}
