# ohero — game hosting

Public GitHub Pages host for games developed in the (private) `game1-bomb`
repository. GitHub Actions builds and publishes on every push to `main`.

## Live

| Version | URL |
|---------|-----|
| Minesweeper — single-player | https://herolin.github.io/ohero/games/g001-bomb/ |
| Minesweeper — single-player + versus | https://herolin.github.io/ohero/games/g002-bomb-mp/ |

## Branches

`main` is the source for both. The single-player build is the same commit with
`VITE_SINGLE_PLAYER=1` (see `src/build.ts`), not a separate branch — the branch
that used to serve it fell years behind, and a build flag cannot.

Each game/version lives under its own sub-path, so more can be added later
without clobbering the others.
