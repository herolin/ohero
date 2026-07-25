// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { SharedGame } from '../src/ui/sharedGame';
import type { Connection } from '../src/multiplayer/connection';
import type { Message, Role } from '../src/multiplayer/protocol';
import type { SharedMode } from '../src/multiplayer/authority';
import { Board } from '../src/game/board';
import { createRng } from '../src/game/rng';
import { DIFFICULTIES } from '../src/game/types';
import { t } from '../src/i18n';

class FakeConnection {
  role: Role;
  other!: FakeConnection;
  private handlers: { onMessage?: (m: Message) => void; onDisconnected?: () => void } = {};
  constructor(role: Role) {
    this.role = role;
  }
  setHandlers(h: FakeConnection['handlers']): void {
    this.handlers = h;
  }
  send(msg: Message): void {
    this.other.handlers.onMessage?.(msg);
  }
  close(): void {}
}

function link(a: FakeConnection, b: FakeConnection): void {
  a.other = b;
  b.other = a;
}

const cols = DIFFICULTIES.beginner.cols;
const first = { row: 4, col: 4 };

function clickCell(root: HTMLElement, row: number, col: number): void {
  const cells = root.querySelectorAll<HTMLElement>('.cell');
  cells[row * cols + col].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function mineSet(seed: string): Set<number> {
  const ref = new Board(DIFFICULTIES.beginner, createRng(seed));
  ref.reveal(first);
  const s = new Set<number>();
  for (let r = 0; r < ref.rows; r++) {
    for (let c = 0; c < ref.cols; c++) {
      if (ref.cells[r][c].isMine) s.add(r * cols + c);
    }
  }
  return s;
}

function makePair(mode: SharedMode, seed: string) {
  document.body.innerHTML = '<div id="h"></div><div id="g"></div>';
  const hostRoot = document.getElementById('h') as HTMLElement;
  const guestRoot = document.getElementById('g') as HTMLElement;
  const hc = new FakeConnection('host');
  const gc = new FakeConnection('guest');
  link(hc, gc);
  const common = { mode, difficulty: 'beginner' as const, seed, onExit: () => {} };
  const host = new SharedGame(hostRoot, { connection: hc as unknown as Connection, role: 'host', ...common });
  const guest = new SharedGame(guestRoot, { connection: gc as unknown as Connection, role: 'guest', ...common });
  return { hostRoot, guestRoot, host, guest };
}

describe('SharedGame — co-op (host authoritative)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('a guest click round-trips through the host and both boards update', () => {
    const { hostRoot, guestRoot } = makePair('coop', 'coop-seed');
    clickCell(guestRoot, first.row, first.col); // guest intent -> host -> broadcast
    const idx = first.row * cols + first.col;
    expect(hostRoot.querySelectorAll('.cell')[idx].classList.contains('revealed')).toBe(true);
    expect(guestRoot.querySelectorAll('.cell')[idx].classList.contains('revealed')).toBe(true);
  });

  it('clearing the board makes both players win', () => {
    const seed = 'coop-win-seed';
    const { hostRoot, guestRoot } = makePair('coop', seed);
    const mines = mineSet(seed);
    clickCell(hostRoot, first.row, first.col); // opening (places mines)
    for (let r = 0; r < DIFFICULTIES.beginner.rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mines.has(r * cols + c)) clickCell(hostRoot, r, c);
      }
    }
    expect(hostRoot.querySelector('.result-text')?.textContent).toBe(t('coopWin'));
    expect(guestRoot.querySelector('.result-text')?.textContent).toBe(t('coopWin'));
  });
});

describe('SharedGame — claim', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('colours cells by owner on both sides', () => {
    const { hostRoot, guestRoot } = makePair('claim', 'claim-own');
    clickCell(hostRoot, first.row, first.col);
    // Host revealed them -> self on host, other on guest.
    expect(hostRoot.querySelector('.cell.owned-self')).not.toBeNull();
    expect(guestRoot.querySelector('.cell.owned-other')).not.toBeNull();
  });

  it('hitting a mine loses for that player and wins for the opponent', () => {
    const seed = 'claim-mine';
    const { hostRoot, guestRoot } = makePair('claim', seed);
    clickCell(hostRoot, first.row, first.col); // places mines (safe)
    const k = [...mineSet(seed)][0];
    clickCell(hostRoot, Math.floor(k / cols), k % cols); // host boom
    expect(hostRoot.querySelector('.result-text')?.textContent).toBe(t('raceLose'));
    expect(guestRoot.querySelector('.result-text')?.textContent).toBe(t('raceWin'));
  });
});
