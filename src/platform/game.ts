// Which game this build is.
//
// THE ONE LINE THAT DIFFERS BETWEEN GAMES. Everything else in `platform/` is
// copied between them unchanged. It has to match the published path exactly —
// `https://herolin.github.io/ohero/games/<slug>/` — because the slug is what
// separates one game's scores from another's on a shared board. Get it wrong
// and two games quietly share a leaderboard.
export const GAME_SLUG = 'g001-bomb';
