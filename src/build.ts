// Which of the two builds this is.
//
// ONE SOURCE TREE, TWO PUBLISHED GAMES:
//   /games/g001-bomb/     single-player only
//   /games/g002-bomb-mp/  the same game plus the versus modes
//
// This used to be two git branches, and the single-player one quietly fell
// years behind — it never got the score board, the player name or any of the
// rest, because nobody remembers to port work onto a branch they don't open.
// A build flag cannot drift: g001 now gets every fix g002 gets, on the same
// commit.
//
// Set at build time by `VITE_SINGLE_PLAYER=1` (see .github/workflows/pages.yml).
export const SINGLE_PLAYER_ONLY = import.meta.env.VITE_SINGLE_PLAYER === '1';
