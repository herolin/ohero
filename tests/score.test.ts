import { describe, expect, it } from 'vitest';
import { SCORE_PAR, winScore } from '../src/game/score';

describe('what a won game is worth', () => {
  it('pays more for a faster win', () => {
    expect(winScore(10)).toBeGreaterThan(winScore(60));
  });

  // The board's first column is the clock, so the ranking has to agree with
  // it. Weighting by board size would put a slow expert win above a fast
  // beginner one and make the column read as unsorted.
  it('ranks purely on the clock, so the fastest time is always the top row', () => {
    const times = [8, 31, 60, 240];
    const scores = times.map(winScore);
    const bestFirst = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(bestFirst);
  });

  it('is a recognisable number, not an arbitrary one', () => {
    expect(winScore(60)).toBe(SCORE_PAR - 60);
  });

  it('never goes negative, however long the game took', () => {
    // Otherwise a very slow win would sort below every other entry, which is
    // not what "slower" should mean.
    expect(winScore(100000)).toBeGreaterThan(0);
    expect(winScore(SCORE_PAR)).toBeGreaterThan(0);
  });

  it('ignores sub-second noise and negative clocks', () => {
    expect(winScore(10.9)).toBe(winScore(10));
    expect(winScore(-5)).toBe(winScore(0));
  });
});
