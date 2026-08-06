/** @vitest-environment jsdom */
//
// The platform layer: who is playing, and what their scores are.
//
// jsdom throughout, because all three modules under test are built on
// localStorage. That is not incidental — "the identity survives a reload" and
// "a corrupt row does not take the board down" are the properties worth
// testing, and neither exists without real storage semantics.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPlayer,
  onPlayerChange,
  reloadPlayer,
  renamePlayer,
  signIn,
  signOut,
} from '../src/platform/identity';
import {
  LocalScoreStore,
  recordScore,
  scoreStore,
  useScoreStore,
} from '../src/platform/scores';
import type { ScoreEntry, ScoreStore } from '../src/platform/scores';
import { BOARD_ROWS, Leaderboard } from '../src/ui/leaderboard';
import { setLocale } from '../src/i18n';

const GAME = 'g002-bomb-mp';
const OTHER = 'g006-towerout';

function freshIdentity(): void {
  localStorage.clear();
  reloadPlayer();
}

describe('identity', () => {
  beforeEach(freshIdentity);

  it('starts you off as a numbered guest', () => {
    const player = getPlayer();
    expect(player.kind).toBe('guest');
    // 來賓 plus exactly three digits: a label you can read out loud.
    expect(player.name).toMatch(/^來賓\d{3}$/);
    expect(player.id).not.toBe('');
  });

  it('keeps the same id across a reload', () => {
    const first = getPlayer().id;
    reloadPlayer();
    expect(getPlayer().id).toBe(first);
  });

  it('renames a guest, and remembers it across a reload', () => {
    renamePlayer('  阿海  ');
    expect(getPlayer().name).toBe('阿海');
    reloadPlayer();
    expect(getPlayer().name).toBe('阿海');
  });

  it('caps a name and ignores an empty one', () => {
    renamePlayer('x'.repeat(40));
    expect(getPlayer().name).toHaveLength(16);

    const before = getPlayer().name;
    renamePlayer('   ');
    expect(getPlayer().name).toBe(before);
  });

  it('announces a change to listeners, and stops when unsubscribed', () => {
    const seen: string[] = [];
    const off = onPlayerChange((p) => seen.push(p.name));
    renamePlayer('one');
    off();
    renamePlayer('two');
    expect(seen).toEqual(['one']);
  });

  it('will not rename a signed-in account', () => {
    signIn({ id: 'google-123', name: 'Alex' });
    expect(getPlayer().kind).toBe('google');
    renamePlayer('somebody else');
    // A signed-in name comes from the account; editing it locally would put
    // one person on a shared board twice.
    expect(getPlayer().name).toBe('Alex');
  });

  it('signing out gives a brand new guest, not the old one back', () => {
    const guest = getPlayer().id;
    signIn({ id: 'google-123', name: 'Alex' });
    const after = signOut();
    expect(after.kind).toBe('guest');
    expect(after.id).not.toBe(guest);
    expect(after.id).not.toBe('google-123');
  });

  it('mutating what getPlayer returns does not change the player', () => {
    const copy = getPlayer();
    copy.name = 'tampered';
    expect(getPlayer().name).not.toBe('tampered');
  });
});

function entry(over: Partial<ScoreEntry> = {}): Omit<ScoreEntry, 'id'> {
  return {
    game: GAME,
    playerId: 'p1',
    playerName: 'Me',
    playerKind: 'guest',
    score: 100,
    at: 1_000,
    ...over,
  };
}

describe('LocalScoreStore', () => {
  let store: LocalScoreStore;

  beforeEach(() => {
    localStorage.clear();
    store = new LocalScoreStore();
  });

  it('reports itself as a per-device board', () => {
    expect(store.kind).toBe('local');
  });

  it('returns nothing before anything is played', async () => {
    expect(await store.top(GAME, 10)).toEqual([]);
    expect(await store.recent(GAME, 10)).toEqual([]);
  });

  it('orders top by score and recent by time', async () => {
    await store.submit(entry({ score: 500, at: 1 }));
    await store.submit(entry({ score: 900, at: 2 }));
    await store.submit(entry({ score: 700, at: 3 }));

    expect((await store.top(GAME, 10)).map((e) => e.score)).toEqual([900, 700, 500]);
    expect((await store.recent(GAME, 10)).map((e) => e.at)).toEqual([3, 2, 1]);
  });

  it('breaks a score tie in favour of the newer run', async () => {
    await store.submit(entry({ score: 500, at: 10 }));
    await store.submit(entry({ score: 500, at: 20 }));
    expect((await store.top(GAME, 10)).map((e) => e.at)).toEqual([20, 10]);
  });

  it('honours the limit', async () => {
    for (let i = 0; i < 15; i++) await store.submit(entry({ score: i, at: i }));
    expect(await store.top(GAME, 10)).toHaveLength(10);
    expect(await store.recent(GAME, 4)).toHaveLength(4);
  });

  // The pending question from the browser check, asked exactly this time.
  // A board is per-game; one game's scores must never appear on another's.
  it('never shows another game’s scores', async () => {
    await store.submit(entry({ game: GAME, score: 100 }));
    await store.submit(entry({ game: OTHER, score: 999_999 }));
    await store.submit(entry({ game: OTHER, score: 5 }));

    const top = await store.top(GAME, 10);
    const recent = await store.recent(GAME, 10);

    expect(top).toHaveLength(1);
    expect(recent).toHaveLength(1);
    expect(top.every((e) => e.game === GAME)).toBe(true);
    expect(recent.every((e) => e.game === GAME)).toBe(true);
    // Stated as scores too, since a top board that let the other game in
    // would be led by that 999,999.
    expect(top[0].score).toBe(100);

    // And the other direction: the other game still has its own two.
    expect(await store.top(OTHER, 10)).toHaveLength(2);
  });

  it('adds a player up across games — the point of one id', async () => {
    await store.submit(entry({ game: GAME, score: 100 }));
    await store.submit(entry({ game: GAME, score: 400 }));
    await store.submit(entry({ game: OTHER, score: 50 }));
    await store.submit(entry({ playerId: 'someone-else', score: 9_999 }));

    const totals = await store.totalsFor('p1');
    expect(totals).toEqual([
      { game: GAME, best: 400, plays: 2 },
      { game: OTHER, best: 50, plays: 1 },
    ]);
  });

  it('drops the oldest rows rather than growing without bound', async () => {
    // 520 plays: past the 500 cap, so the first twenty must be gone.
    for (let i = 0; i < 520; i++) await store.submit(entry({ score: i, at: i }));
    const kept = JSON.parse(localStorage.getItem('ohero-scores') ?? '[]') as ScoreEntry[];
    expect(kept).toHaveLength(500);
    expect(kept[0].at).toBe(20);
    // The best score is the newest here, so the board still reads correctly.
    expect((await store.top(GAME, 1))[0].score).toBe(519);
  });

  it('survives junk in storage instead of taking the screen down', async () => {
    localStorage.setItem('ohero-scores', 'not json at all');
    expect(await store.top(GAME, 10)).toEqual([]);

    localStorage.setItem('ohero-scores', JSON.stringify({ nope: true }));
    expect(await store.top(GAME, 10)).toEqual([]);

    // One good row among the rubbish: keep the good one, drop the rest.
    localStorage.setItem(
      'ohero-scores',
      JSON.stringify([
        null,
        'string',
        { id: 'a', game: GAME },
        { ...entry({ score: 42 }), id: 'ok' },
        { ...entry({ score: Number.NaN }), id: 'nan' },
      ]),
    );
    const rows = await store.top(GAME, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(42);
  });

  it('gives every submission its own id', async () => {
    const a = await store.submit(entry());
    const b = await store.submit(entry());
    expect(a.id).not.toBe(b.id);
  });
});

describe('recordScore', () => {
  beforeEach(() => {
    localStorage.clear();
    useScoreStore(new LocalScoreStore());
    freshIdentity();
  });

  it('files the run under the current player', async () => {
    const player = getPlayer();
    const saved = await recordScore({
      game: GAME,
      player,
      score: 5_400,
      detail: '第 3 棟 · 中級',
    });
    expect(saved?.playerId).toBe(player.id);
    expect(saved?.playerName).toBe(player.name);
    expect(saved?.detail).toBe('第 3 棟 · 中級');
    expect(saved?.at).toBeGreaterThan(0);
  });

  // A lost score must never cost someone the game they just finished.
  it('returns null rather than throwing when the store fails', async () => {
    const broken: ScoreStore = {
      kind: 'cloud',
      submit: () => Promise.reject(new Error('offline')),
      top: async () => [],
      recent: async () => [],
      totalsFor: async () => [],
    };
    useScoreStore(broken);
    expect(scoreStore().kind).toBe('cloud');
    await expect(
      recordScore({ game: GAME, player: getPlayer(), score: 1 }),
    ).resolves.toBeNull();
    useScoreStore(new LocalScoreStore());
  });
});

describe('Leaderboard', () => {
  let host: HTMLElement;
  let store: LocalScoreStore;

  beforeEach(() => {
    setLocale('en');
    localStorage.clear();
    store = new LocalScoreStore();
    useScoreStore(store);
    freshIdentity();
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  const rows = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.board-row')];

  it('says so when there is nothing to show', async () => {
    const board = new Leaderboard(host, GAME);
    await board.refresh();
    expect(rows()).toHaveLength(0);
    expect(host.querySelector('.board-empty')?.textContent).toBeTruthy();
  });

  it('shows ten rows at most', async () => {
    for (let i = 0; i < 25; i++) {
      await store.submit(entry({ playerId: 'other', score: i, at: i }));
    }
    const board = new Leaderboard(host, GAME);
    await board.refresh();
    expect(rows()).toHaveLength(BOARD_ROWS);
  });

  it('marks your own rows and no one else’s', async () => {
    const me = getPlayer();
    await store.submit(entry({ playerId: me.id, playerName: me.name, score: 300 }));
    await store.submit(entry({ playerId: 'stranger', playerName: 'Someone', score: 900 }));

    const board = new Leaderboard(host, GAME);
    await board.refresh();

    const [first, second] = rows();
    expect(first.classList.contains('mine')).toBe(false);
    expect(second.classList.contains('mine')).toBe(true);
    // Marked by more than colour: the row carries a "· You" tag as well.
    expect(second.querySelector('.board-you')?.textContent).toContain('You');
    expect(first.querySelector('.board-you')).toBeNull();
  });

  it('shows who, what and when on every row', async () => {
    await store.submit(
      entry({ playerId: 'stranger', playerName: 'Alex', score: 9_200, at: Date.now() }),
    );
    const board = new Leaderboard(host, GAME);
    await board.refresh();

    const row = rows()[0];
    expect(row.querySelector('.board-rank')?.textContent).toBe('1');
    expect(row.querySelector('.board-who')?.textContent).toBe('Alex');
    expect(row.querySelector('.board-score')?.textContent).toBe('9,200');
    expect(row.querySelector('.board-when')?.textContent).toBeTruthy();
    // The exact time is one hover away even though the row reads "just now".
    expect(row.querySelector('.board-when')?.getAttribute('title')).toBeTruthy();
  });

  it('switches between best and recent', async () => {
    await store.submit(entry({ playerId: 'a', playerName: 'High', score: 900, at: 1 }));
    await store.submit(entry({ playerId: 'b', playerName: 'Late', score: 100, at: 2 }));

    const board = new Leaderboard(host, GAME);
    await board.refresh();
    expect(rows()[0].querySelector('.board-who')?.textContent).toBe('High');

    const recentTab = host.querySelector<HTMLButtonElement>('.board-tab[data-tab="recent"]');
    recentTab?.click();
    await board.refresh();
    expect(rows()[0].querySelector('.board-who')?.textContent).toBe('Late');
    expect(recentTab?.getAttribute('aria-pressed')).toBe('true');
  });

  // A name is untrusted input. On a shared board it arrives from someone else.
  it('treats a name as text, never as markup', async () => {
    await store.submit(
      entry({ playerId: 'x', playerName: '<img src=x onerror="alert(1)">' }),
    );
    const board = new Leaderboard(host, GAME);
    await board.refresh();

    expect(host.querySelector('img')).toBeNull();
    expect(rows()[0].querySelector('.board-who')?.textContent).toContain('<img');
  });

  it('does not pass another game’s scores through to the screen', async () => {
    await store.submit(entry({ game: OTHER, playerName: 'Wrong game', score: 999_999 }));
    await store.submit(entry({ game: GAME, playerName: 'Right game', score: 10 }));

    const board = new Leaderboard(host, GAME);
    await board.refresh();

    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('.board-who')?.textContent).toBe('Right game');
  });

  it('tells the player the board is local, not shared', async () => {
    const board = new Leaderboard(host, GAME);
    await board.refresh();
    const note = host.querySelector('.board-note')?.textContent ?? '';
    expect(note.toLowerCase()).toContain('device');

    useScoreStore({
      kind: 'cloud',
      submit: async (e) => ({ ...e, id: 'x' }),
      top: async () => [],
      recent: async () => [],
      totalsFor: async () => [],
    });
    await board.refresh();
    expect(host.querySelector('.board-note')?.textContent).not.toBe(note);
    useScoreStore(store);
  });

  it('reads a fresh time on every refresh', async () => {
    const now = Date.now();
    await store.submit(entry({ playerId: 'a', at: now }));
    const board = new Leaderboard(host, GAME);
    await board.refresh();
    expect(rows()[0].querySelector('.board-when')?.textContent).toBe('just now');

    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 45 * 60_000);
    await board.refresh();
    expect(rows()[0].querySelector('.board-when')?.textContent).toBe('45m ago');
    spy.mockRestore();
  });
});
