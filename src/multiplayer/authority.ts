// Host-authoritative logic for the shared-board modes (co-op / claim).
// Only the host runs this: it owns the single real board, applies intents in
// arrival order, assigns cell ownership, and produces deltas + outcomes to
// broadcast. Pure with respect to the DOM and network, so it is unit-testable.

import type { BoardConfig, PlayerId } from '../game/types';
import type { RevealedCell } from './protocol';
import { createRng } from '../game/rng';
import { Board } from '../game/board';

export type SharedMode = 'coop' | 'claim';

export type Resolution =
  | { mode: 'coop'; win: boolean }
  | { mode: 'claim'; result: PlayerId | 'draw'; scores: Record<PlayerId, number> };

export interface RevealOutcome {
  cells: RevealedCell[];
  hitMine: boolean;
  resolution: Resolution | null;
}

const HOST: PlayerId = 'host';
const GUEST: PlayerId = 'guest';

export class Authority {
  readonly board: Board;

  constructor(
    config: BoardConfig,
    seed: string,
    private readonly mode: SharedMode,
  ) {
    this.board = new Board(config, createRng(seed));
  }

  /** Apply a reveal from `by`, returning the delta and any game resolution. */
  reveal(pos: { row: number; col: number }, by: PlayerId): RevealOutcome {
    const result = this.board.reveal(pos, by);
    if (result.revealed.length === 0 && !result.hitMine) {
      return { cells: [], hitMine: false, resolution: null };
    }

    const cells: RevealedCell[] = result.revealed.map((p) => {
      const cell = this.board.cells[p.row][p.col];
      return {
        pos: p,
        isMine: cell.isMine,
        adjacentMines: cell.adjacentMines,
        owner: cell.owner,
      };
    });

    return { cells, hitMine: result.hitMine, resolution: this.resolve(result.hitMine, by) };
  }

  /** Toggle a (shared) flag. */
  flag(pos: { row: number; col: number }): { pos: { row: number; col: number }; flagged: boolean } {
    this.board.toggleFlag(pos);
    return { pos, flagged: this.board.cells[pos.row][pos.col].isFlagged };
  }

  scores(): Record<PlayerId, number> {
    return { host: this.board.ownedCount(HOST), guest: this.board.ownedCount(GUEST) };
  }

  private resolve(hitMine: boolean, by: PlayerId): Resolution | null {
    if (hitMine) {
      if (this.mode === 'coop') return { mode: 'coop', win: false };
      // Claim: the player who hit the mine loses immediately; the other wins.
      const winner = by === HOST ? GUEST : HOST;
      return { mode: 'claim', result: winner, scores: this.scores() };
    }
    if (this.board.isWon()) {
      if (this.mode === 'coop') return { mode: 'coop', win: true };
      const s = this.scores();
      const result: PlayerId | 'draw' =
        s.host > s.guest ? HOST : s.guest > s.host ? GUEST : 'draw';
      return { mode: 'claim', result, scores: s };
    }
    return null;
  }
}
