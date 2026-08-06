// What a won game is worth.
//
// MINESWEEPER HAS NO SCORE, IT HAS A CLOCK — and the shared board across the
// ohero games ranks highest-first (see PLATFORM.md). So a win is converted:
// faster is worth more, and a bigger board is worth more again. The raw time
// still goes on the board's detail line, because seconds are what one
// minesweeper player actually says to another.
//
// In `game/` rather than in the view because it is a rule, not a rendering
// decision, and rules here are unit-tested.

import type { Difficulty } from './types';

/**
 * Seconds a win is measured against.
 *
 * 999 is the classic Minesweeper clock ceiling, which makes the arithmetic
 * recognisable rather than arbitrary — and it guarantees a positive score for
 * any win inside that ceiling.
 */
export const SCORE_PAR = 999;

/** How much more a bigger board is worth. */
const WEIGHT: Record<Difficulty, number> = {
  beginner: 1,
  intermediate: 2,
  expert: 3,
};

/**
 * @param seconds elapsed on the clock. Clamped, so a run that somehow passes
 *   the ceiling still scores something rather than going negative and sorting
 *   below every loss-free zero.
 */
export function winScore(difficulty: Difficulty, seconds: number): number {
  return WEIGHT[difficulty] * Math.max(1, SCORE_PAR - Math.max(0, Math.floor(seconds)));
}
