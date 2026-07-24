import type { Position } from '../game/types';

export interface BoardHandlers {
  /** Left click / tap. */
  onReveal(pos: Position): void;
  /** Right click / long press. */
  onFlag(pos: Position): void;
}

const LONG_PRESS_MS = 450;

function posFromEvent(e: Event): Position | null {
  const target = e.target as HTMLElement | null;
  const cell = target?.closest<HTMLElement>('.cell');
  if (!cell || cell.dataset.row === undefined || cell.dataset.col === undefined) {
    return null;
  }
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
}

/**
 * Bind mouse and touch input on the board via event delegation:
 * - left click / tap  → reveal
 * - right click / long press → flag
 *
 * Long-press flagging on touch suppresses the synthetic click that follows,
 * and the touch-originated contextmenu is ignored to avoid double-toggling.
 */
export function bindBoardInput(grid: HTMLElement, handlers: BoardHandlers): void {
  let longPressTimer: number | null = null;
  let suppressClick = false;
  let lastPointerType = 'mouse';

  grid.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType || 'mouse';
  });

  grid.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (lastPointerType === 'touch') return; // handled by long-press timer
    const pos = posFromEvent(e);
    if (pos) handlers.onFlag(pos);
  });

  grid.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const pos = posFromEvent(e);
    if (pos) handlers.onReveal(pos);
  });

  const clearTimer = (): void => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  grid.addEventListener(
    'touchstart',
    (e) => {
      const pos = posFromEvent(e);
      if (!pos) return;
      clearTimer();
      longPressTimer = window.setTimeout(() => {
        suppressClick = true;
        handlers.onFlag(pos);
        longPressTimer = null;
      }, LONG_PRESS_MS);
    },
    { passive: true },
  );

  grid.addEventListener('touchend', clearTimer);
  grid.addEventListener('touchmove', clearTimer, { passive: true });
  grid.addEventListener('touchcancel', clearTimer);
}
