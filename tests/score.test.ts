import { describe, expect, it } from 'vitest';
import { SCORE_PAR, winScore } from '../src/game/score';

describe('what a won game is worth', () => {
  it('pays more for a faster win', () => {
    expect(winScore('beginner', 10)).toBeGreaterThan(winScore('beginner', 60));
  });

  it('pays more for a bigger board at the same time', () => {
    expect(winScore('expert', 60)).toBeGreaterThan(winScore('intermediate', 60));
    expect(winScore('intermediate', 60)).toBeGreaterThan(winScore('beginner', 60));
  });

  it('is a recognisable number, not an arbitrary one', () => {
    // A minute on expert: 3 * (999 - 60).
    expect(winScore('expert', 60)).toBe(3 * (SCORE_PAR - 60));
  });

  it('never goes negative, however long the game took', () => {
    // Otherwise a very slow win would sort below every other entry, including
    // faster wins on easier boards, which is not what "slower" should mean.
    expect(winScore('beginner', 100000)).toBeGreaterThan(0);
    expect(winScore('expert', SCORE_PAR)).toBeGreaterThan(0);
  });

  it('ignores sub-second noise and negative clocks', () => {
    expect(winScore('beginner', 10.9)).toBe(winScore('beginner', 10));
    expect(winScore('beginner', -5)).toBe(winScore('beginner', 0));
  });
});
