/** @vitest-environment jsdom */
//
// When an ad is due, and — more important — when it is not.
//
// The frequency rules are the part of advertising that decides whether the
// game survives having ads in it, and they are the part that gets quietly
// loosened later. They are pure functions so they can be pinned here.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADS_CONFIG,
  FREE_PLAYS,
  MIN_GAP_MS,
  PLAYS_BETWEEN,
  dueForInterstitial,
  emptyState,
  isAdsConfigured,
  maybeShowInterstitial,
  readState,
  recordPlay,
} from '../src/platform/ads';

const GAME = 'g002-bomb-mp';
const OTHER = 'g006-towerout';

beforeEach(() => {
  localStorage.clear();
  ADS_CONFIG.client = '';
});

describe('whether an ad is due', () => {
  it('never before the first game — an ad on the way in loses the player', () => {
    expect(dueForInterstitial({ plays: 0, lastAdAt: 0 }, 1_000)).toBe(false);
  });

  it('is due before the second game', () => {
    expect(dueForInterstitial({ plays: FREE_PLAYS, lastAdAt: 0 }, 1_000)).toBe(true);
  });

  it('then every other game, not every game', () => {
    const at = (plays: number): boolean =>
      dueForInterstitial({ plays, lastAdAt: 0 }, 1_000);
    expect(at(FREE_PLAYS)).toBe(true);
    expect(at(FREE_PLAYS + 1)).toBe(false);
    expect(at(FREE_PLAYS + PLAYS_BETWEEN)).toBe(true);
    expect(at(FREE_PLAYS + PLAYS_BETWEEN + 1)).toBe(false);
  });

  // Dying in four seconds is normal here, so the play counter on its own would
  // put an ad in front of someone every fifteen seconds during a bad run.
  it('holds off when the last ad was recent, however many games were played', () => {
    const now = 10_000_000;
    const state = { plays: FREE_PLAYS + PLAYS_BETWEEN, lastAdAt: now - 1_000 };
    expect(dueForInterstitial(state, now)).toBe(false);
    expect(dueForInterstitial({ ...state, lastAdAt: now - MIN_GAP_MS - 1 }, now)).toBe(true);
  });

  it('does not treat "never shown" as "shown just now"', () => {
    // lastAdAt of 0 is the sentinel; read as a timestamp it is 1970 and would
    // work by accident, but only until someone changes the clock source.
    expect(dueForInterstitial({ plays: FREE_PLAYS, lastAdAt: 0 }, 0)).toBe(true);
  });
});

describe('the play counter', () => {
  it('starts empty and counts finished runs', () => {
    expect(readState(GAME)).toEqual(emptyState());
    recordPlay(GAME);
    recordPlay(GAME);
    expect(readState(GAME).plays).toBe(2);
  });

  it('counts each game separately', () => {
    // Six games of snake have not earned an ad in the tower game.
    recordPlay(OTHER);
    recordPlay(OTHER);
    expect(readState(GAME).plays).toBe(0);
    expect(readState(OTHER).plays).toBe(2);
  });

  it('survives junk in storage rather than taking the game down with it', () => {
    localStorage.setItem('ohero-ads-' + GAME, 'not json');
    expect(readState(GAME)).toEqual(emptyState());

    localStorage.setItem('ohero-ads-' + GAME, JSON.stringify({ plays: 'lots' }));
    expect(readState(GAME)).toEqual(emptyState());

    localStorage.setItem('ohero-ads-' + GAME, JSON.stringify({ plays: -5, lastAdAt: NaN }));
    expect(readState(GAME)).toEqual(emptyState());
  });
});

describe('showing one', () => {
  it('is switched off until a publisher id is filled in', async () => {
    expect(isAdsConfigured()).toBe(false);

    const adBreak = vi.fn();
    vi.stubGlobal('adBreak', adBreak);
    recordPlay(GAME); // due on the counter
    await maybeShowInterstitial(GAME);

    expect(adBreak).not.toHaveBeenCalled();
    // And nothing was recorded, so turning ads on later starts from a clean
    // count rather than one already "spent".
    expect(readState(GAME).lastAdAt).toBe(0);
    vi.unstubAllGlobals();
  });

  it('asks for a break when one is due', async () => {
    ADS_CONFIG.client = 'ca-pub-test';
    const adBreak = vi.fn((opts: { adBreakDone?: () => void }) => opts.adBreakDone?.());
    vi.stubGlobal('adBreak', adBreak);

    recordPlay(GAME);
    await maybeShowInterstitial(GAME, 1_000);

    expect(adBreak).toHaveBeenCalledTimes(1);
    expect(readState(GAME).lastAdAt).toBe(1_000);
    vi.unstubAllGlobals();
  });

  // Ad blockers are near-universal among people who play browser games.
  it('carries on when the ad script is missing entirely', async () => {
    ADS_CONFIG.client = 'ca-pub-test';
    recordPlay(GAME);
    await expect(maybeShowInterstitial(GAME, 1_000)).resolves.toBeUndefined();
  });

  it('carries on when the ad script throws', async () => {
    ADS_CONFIG.client = 'ca-pub-test';
    vi.stubGlobal('adBreak', () => {
      throw new Error('wedged');
    });
    recordPlay(GAME);
    await expect(maybeShowInterstitial(GAME, 1_000)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });

  // A present-but-wedged script is as bad as a missing one: the player is
  // sitting in front of a game that will not start.
  it('gives up on an ad that never calls back', async () => {
    vi.useFakeTimers();
    ADS_CONFIG.client = 'ca-pub-test';
    vi.stubGlobal('adBreak', () => undefined); // accepts the call, says nothing
    recordPlay(GAME);

    let done = false;
    const pending = maybeShowInterstitial(GAME, 1_000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(done).toBe(false); // still waiting, as it should be
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(done).toBe(true);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does nothing when no ad is due', async () => {
    ADS_CONFIG.client = 'ca-pub-test';
    const adBreak = vi.fn();
    vi.stubGlobal('adBreak', adBreak);
    await maybeShowInterstitial(GAME, 1_000); // zero plays so far
    expect(adBreak).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
