import type { Game } from '../game/gameState';

/**
 * Render the board grid into `grid` from the current game state.
 * Rebuilds the grid on every call — cheap enough for up to 16×30 cells and
 * keeps the DOM a pure function of state. On loss, all mines are revealed.
 */
export function renderBoard(grid: HTMLElement, game: Game): void {
  const { board } = game;
  const lost = game.status === 'lost';

  grid.style.setProperty('--cols', String(board.cols));
  grid.setAttribute('aria-disabled', String(game.status === 'won' || lost));

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
      } else if (cell.isFlagged) {
        el.classList.add('flagged');
        el.textContent = '🚩';
      }
      fragment.appendChild(el);
    }
  }

  grid.replaceChildren(fragment);
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
