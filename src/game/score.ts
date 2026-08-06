// What a won game is worth.
//
// MINESWEEPER HAS NO SCORE, IT HAS A CLOCK — and the shared board across the
// ohero games ranks highest-first (see PLATFORM.md). So a win is converted:
// faster is worth more. Nothing else goes into it.
//
// DIFFICULTY DELIBERATELY DOES NOT WEIGHT THE RANKING. An earlier version
// multiplied by board size, which meant the row at the top of the board was
// not the fastest time on it — and the board's first column IS the time. A
// column of seconds that does not sort by seconds is simply wrong. Difficulty
// is shown alongside instead, so a beginner's 8s and an expert's 90s are both
// legible for what they are.
//
// In `game/` rather than in the view because it is a rule, not a rendering
// decision, and rules here are unit-tested.

/**
 * Seconds a win is measured against.
 *
 * 999 is the classic Minesweeper clock ceiling, which makes the arithmetic
 * recognisable rather than arbitrary — and it guarantees a positive score for
 * any win inside that ceiling.
 */
export const SCORE_PAR = 999;

/**
 * @param seconds elapsed on the clock. Clamped, so a run that somehow passes
 *   the ceiling still scores something rather than going negative and sorting
 *   below every loss-free zero.
 */
export function winScore(seconds: number): number {
  return Math.max(1, SCORE_PAR - Math.max(0, Math.floor(seconds)));
}
