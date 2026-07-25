// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { RaceGame } from '../src/ui/raceGame';
import type { Connection } from '../src/multiplayer/connection';
import type { Message, Role } from '../src/multiplayer/protocol';
import { Board } from '../src/game/board';
import { createRng } from '../src/game/rng';
import { DIFFICULTIES } from '../src/game/types';
import { t } from '../src/i18n';

/** In-memory stand-in for the PeerJS Connection linking two RaceGames. */
class FakeConnection {
  role: Role;
  other!: FakeConnection;
  private handlers: {
    onMessage?: (m: Message) => void;
    onDisconnected?: () => void;
    onError?: (e: Error) => void;
  } = {};

  constructor(role: Role) {
    this.role = role;
  }

  setHandlers(h: FakeConnection['handlers']): void {
    this.handlers = h;
  }

  send(msg: Message): void {
    // Deliver synchronously to the peer.
    this.other.handlers.onMessage?.(msg);
  }

  close(): void {}
}

function link(a: FakeConnection, b: FakeConnection): void {
  a.other = b;
  b.other = a;
}

function clickCell(root: HTMLElement, row: number, col: number, cols: number): void {
  // Scope to the main board — the opponent mini-mirror also renders .cell nodes.
  const grid = root.querySelector('.grid') as HTMLElement;
  const cells = grid.querySelectorAll<HTMLElement>('.cell');
  const el = cells[row * cols + col];
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

describe('Race mode (two wired clients)', () => {
  let hostRoot: HTMLElement;
  let guestRoot: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div><div id="guest"></div>';
    hostRoot = document.getElementById('host') as HTMLElement;
    guestRoot = document.getElementById('guest') as HTMLElement;
  });

  it('syncs win/lose and opponent progress when the host clears the board', () => {
    const seed = 'race-integration';
    const { rows, cols, mines } = DIFFICULTIES.beginner;
    const first = { row: 4, col: 4 };

    // Reference board (same seed + same first click) to know the mine layout.
    const ref = new Board(DIFFICULTIES.beginner, createRng(seed));
    ref.reveal(first);
    void mines;

    const hostConn = new FakeConnection('host');
    const guestConn = new FakeConnection('guest');
    link(hostConn, guestConn);

    const startAt = Date.now() - 1; // already started, no countdown wait
    const host = new RaceGame(hostRoot, {
      connection: hostConn as unknown as Connection,
      role: 'host',
      difficulty: 'beginner',
      seed,
      startAt,
      onExit: () => {},
    });
    const guest = new RaceGame(guestRoot, {
      connection: guestConn as unknown as Connection,
      role: 'guest',
      difficulty: 'beginner',
      seed,
      startAt,
      onExit: () => {},
    });

    // Host reveals the first (safe) cell, then every other safe cell -> win.
    clickCell(hostRoot, first.row, first.col, cols);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!ref.cells[row][col].isMine) clickCell(hostRoot, row, col, cols);
      }
    }

    const hostResult = hostRoot.querySelector('.result-text')?.textContent;
    const guestResult = guestRoot.querySelector('.result-text')?.textContent;
    expect(hostResult).toBe(t('raceWin'));
    expect(guestResult).toBe(t('raceLose'));

    // Guest should have seen the host reach 100% via progress messages.
    expect(guestRoot.querySelector('.opp-pct')?.textContent).toBe('100%');

    // The opponent mini-mirror should reflect the host's revealed cells.
    const miniRevealed = guestRoot
      .querySelector('.mini-grid')!
      .querySelectorAll('.cell.revealed').length;
    expect(miniRevealed).toBeGreaterThan(0);

    host.destroy();
    guest.destroy();
  });

  it('when the host hits a mine, host loses and guest wins', () => {
    const seed = 'race-mine';
    const { cols } = DIFFICULTIES.beginner;
    const first = { row: 4, col: 4 };

    const ref = new Board(DIFFICULTIES.beginner, createRng(seed));
    ref.reveal(first);
    const mine = (() => {
      for (let row = 0; row < ref.rows; row++) {
        for (let col = 0; col < ref.cols; col++) {
          if (ref.cells[row][col].isMine) return { row, col };
        }
      }
      throw new Error('no mine');
    })();

    const hostConn = new FakeConnection('host');
    const guestConn = new FakeConnection('guest');
    link(hostConn, guestConn);
    const startAt = Date.now() - 1;

    const host = new RaceGame(hostRoot, {
      connection: hostConn as unknown as Connection,
      role: 'host',
      difficulty: 'beginner',
      seed,
      startAt,
      onExit: () => {},
    });
    const guest = new RaceGame(guestRoot, {
      connection: guestConn as unknown as Connection,
      role: 'guest',
      difficulty: 'beginner',
      seed,
      startAt,
      onExit: () => {},
    });

    clickCell(hostRoot, first.row, first.col, cols); // places mines (safe)
    clickCell(hostRoot, mine.row, mine.col, cols); // boom

    expect(hostRoot.querySelector('.result-text')?.textContent).toBe(t('raceLose'));
    expect(guestRoot.querySelector('.result-text')?.textContent).toBe(t('raceWin'));

    host.destroy();
    guest.destroy();
  });
});
