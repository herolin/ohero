// Which game this build is.
//
// THE ONE LINE THAT DIFFERS BETWEEN GAMES. Everything else in `platform/` is
// copied between them unchanged. It has to match the published path exactly —
// `https://herolin.github.io/ohero/games/<slug>/` — because the slug is what
// separates one game's scores from another's on a shared board. Get it wrong
// and two games quietly share a leaderboard.
//
// This tree is the exception in the set: it publishes TWO paths from one
// source (see `src/build.ts`), so the slug follows the build flag rather than
// being a literal. Two boards, as it should be — a single-player time and a
// versus time are not the same achievement.
import { SINGLE_PLAYER_ONLY } from '../build';

export const GAME_SLUG = SINGLE_PLAYER_ONLY ? 'g001-bomb' : 'g002-bomb-mp';
