import type { Game } from '../game/gameState';
import type { Board } from '../game/board';
import type { PlayerId } from '../game/types';

export interface RenderOpts {
  /** Reveal all mines (loss state). */
  lost?: boolean;
  /** When set, revealed cells get owner colouring relative to this id. */
  myId?: PlayerId | null;
}

/**
 * Render a board's cells into `grid`. Rebuilds the grid on every call — cheap
 * enough for up to 16×30 cells and keeps the DOM a pure function of state.
 */
export function renderBoardCells(grid: HTMLElement, board: Board, opts: RenderOpts = {}): void {
  const lost = opts.lost ?? false;
  grid.style.setProperty('--cols', String(board.cols));

  const fragment = document.createDocumentFragment();
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const cell = board.cells[row][col];
      const el = document.createElement('button');
      el.className = 'cell';
      el.type = 'button';
      el.dataset.row = String(row);
      el.dataset.col = String(col);

      const showMine = cell.isMine && (cell.isRevealed || lost);
      if (cell.isRevealed || showMine) {
        el.classList.add('revealed');
        if (cell.isMine) {
          el.classList.add('mine');
          if (cell.isRevealed) el.classList.add('exploded');
          el.textContent = '💣';
        } else if (cell.adjacentMines > 0) {
          el.textContent = String(cell.adjacentMines);
          el.dataset.n = String(cell.adjacentMines);
        }
        if (opts.myId !== undefined && cell.owner) {
          el.classList.add(cell.owner === opts.myId ? 'owned-self' : 'owned-other');
        }
      } else if (cell.isFlagged) {
        el.classList.add('flagged');
        el.textContent = '🚩';
      }
      fragment.appendChild(el);
    }
  }

  grid.replaceChildren(fragment);
}

/** Render from a single-player/race Game (mines shown on loss). */
export function renderBoard(grid: HTMLElement, game: Game): void {
  grid.setAttribute('aria-disabled', String(game.status === 'won' || game.status === 'lost'));
  renderBoardCells(grid, game.board, { lost: game.status === 'lost' });
}

/** The reset-button face reflects the current game status. */
export function statusFace(game: Game): string {
  switch (game.status) {
    case 'won':
      return '😎';
    case 'lost':
      return '😵';
    default:
      return '🙂';
  }
}
