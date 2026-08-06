/** @vitest-environment jsdom */
//
// The view layer, exercised through the real DOM.
//
// The unit tests cover the rules; this covers what only a mounted view can get
// wrong — the selectors each screen looks up, routing between the start screen
// and the game, cleaning up its timer, and the end-of-game panel that carries
// the only route back to the score board.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameView } from '../src/ui/gameView';
import { StartScreen } from '../src/ui/startScreen';
import { setLocale } from '../src/i18n';

let root: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  setLocale('en');
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
  vi.useRealTimers();
});

const q = <T extends HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);

describe('start screen', () => {
  it('mounts with a name field, a board and a route to the hub', () => {
    const screen = new StartScreen(root, { onStart: () => undefined, onVersus: () => undefined });
    expect(q('.player-name')).not.toBeNull();
    expect(q('.board-host')).not.toBeNull();
    expect(q<HTMLAnchorElement>('.to-hub')?.getAttribute('href')).toBe('../');
    // Every visible string comes from t(), so none of them may be empty.
    for (const sel of ['.title', '.play-btn', '.versus', '.to-hub', '.difficulty-label']) {
      expect(q(sel)?.textContent?.trim(), sel).toBeTruthy();
    }
    screen.destroy();
  });

  it('starts the game on the difficulty you chose, and remembers it', () => {
    let started: string | null = null;
    const screen = new StartScreen(root, {
      onStart: (s) => {
        started = s.difficulty;
      },
      onVersus: () => undefined,
    });
    const select = q<HTMLSelectElement>('.difficulty') as HTMLSelectElement;
    select.value = 'expert';
    select.dispatchEvent(new Event('change'));
    q<HTMLButtonElement>('.play-btn')?.click();
    expect(started).toBe('expert');
    screen.destroy();

    const again = new StartScreen(root, { onStart: () => undefined, onVersus: () => undefined });
    expect(q<HTMLSelectElement>('.difficulty')?.value).toBe('expert');
    again.destroy();
  });
});

describe('the game view', () => {
  it('builds the grid for the difficulty it was handed', () => {
    const view = new GameView(root, { difficulty: 'beginner' }, () => undefined);
    expect(root.querySelectorAll('.cell')).toHaveLength(9 * 9);
    view.destroy();
  });

  it('leads back to the board from the status bar and from the panel', () => {
    let back = 0;
    const view = new GameView(root, { difficulty: 'beginner' }, () => {
      back += 1;
    });
    q<HTMLButtonElement>('.to-start')?.click();
    q<HTMLButtonElement>('.over-board')?.click();
    expect(back).toBe(2);
    view.destroy();
  });

  it('keeps the end-of-game panel hidden until the game is over', () => {
    const view = new GameView(root, { difficulty: 'beginner' }, () => undefined);
    expect(q('.overlay.gameover')?.classList.contains('hidden')).toBe(true);
    view.destroy();
  });

  // A view that keeps ticking after it is replaced is the bug this whole
  // one-view-at-a-time arrangement exists to prevent.
  it('stops its clock when it is torn down', () => {
    vi.useFakeTimers();
    const view = new GameView(root, { difficulty: 'beginner' }, () => undefined);
    // The first reveal starts the clock. (A first click never hits a mine.)
    q<HTMLElement>('.cell')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3_000);
    expect(q('.time-count')?.textContent).toBe('3');

    view.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces the start screen rather than stacking on top of it', () => {
    const screen = new StartScreen(root, { onStart: () => undefined, onVersus: () => undefined });
    expect(root.querySelectorAll('.app.start')).toHaveLength(1);
    screen.destroy();

    const view = new GameView(root, { difficulty: 'beginner' }, () => undefined);
    expect(root.querySelectorAll('.app')).toHaveLength(1);
    expect(root.querySelectorAll('.app.start')).toHaveLength(0);
    view.destroy();
  });
});
