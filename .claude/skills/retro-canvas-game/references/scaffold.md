# Starting a new game

## Repo and naming

One repo per game — its own dependencies, CI and history. The repo may be named
`g00N`; the **published slug** is a separate, descriptive, all-lowercase name
(`g008` → `g008-snackmatch`). They do not have to match: the hub publishes by the folder
name under `games/`.

`GAME_SLUG` in `src/platform/game.ts` is the leaderboard partition key. **Once a build is
live, it cannot change** without orphaning every score filed under it.

Naming constraints that are not negotiable: repo names, published paths, hub folders and
menu links are **all lowercase**; and no public path, title, menu card or meta tag may
carry an original game's name or describe the game as a clone.

## package.json

```json
{
  "name": "g008-snackmatch",
  "version": "0.1.0",
  "description": "One line saying what the game is (Canvas + TypeScript)",
  "type": "module",
  "private": true,
  "license": "UNLICENSED",
  "author": "herolin",
  "homepage": "https://herolin.github.io/ohero/games/g008-snackmatch/",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "jsdom": "^29.1.1",
    "typescript": "^5.6.3",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

`private: true` + `UNLICENSED` on every game. `build` runs `tsc --noEmit` first so a type
error cannot reach a published bundle.

## vite.config.ts

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Build fingerprint compiled into the bundle: it is what tells a copy of this build
// apart from someone's own similar game. Date only, not a full timestamp, so rebuilding
// on the same day does not churn the published files.
const BUILD_ID = new Date().toISOString().slice(0, 10);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // Relative base so the static build works under any sub-path.
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

`base: './'` is the one setting that makes a build work under `/ohero/games/<slug>/`. A
wrong base fails **only** when served at the real sub-path — never on a dev server root —
so it is worth getting right at scaffold time.

## Directory layout

```
g00N/
├── index.html
├── src/
│   ├── game/                  pure logic — no DOM, no network, no timers
│   │   ├── types.ts           entities, cell state, and EVERY tuning number
│   │   ├── rng.ts             seeded PRNG
│   │   ├── board.ts           board, matching, gravity, refill
│   │   ├── resolve.ts         one action settled completely: steps, chains, scoring
│   │   └── run.ts             one run: budget, clock, thresholds, end conditions
│   ├── platform/              shared across games: identity, scores, ads, auth
│   ├── i18n/                  en / zh-TW / zh-CN
│   ├── ui/
│   │   ├── geometry.ts        which cell is where — drawing and hit-testing share it
│   │   ├── render.ts          tiles, badges, particles, effects
│   │   ├── animate.ts         the schedule over an already-settled result
│   │   ├── input.ts           press handling (press and release on the same target)
│   │   ├── gameView.ts        board + HUD + end panel + "the clock pauses" rule
│   │   ├── startScreen.ts     name / language / sound / rules / leaderboard
│   │   └── audio.ts           synthesised effects and music
│   ├── ownership.ts           attribution, build fingerprint, leave-site prompt
│   └── styles/main.css
├── tools/
│   └── sim.ts                 balance simulator — bots play complete runs
└── tests/
    ├── helpers.ts             picture-based board builder + controllable RNG
    ├── board / resolve / run  pure logic
    ├── animate / input        presentation
    ├── render.test.ts         palette separation, badge drawing
    ├── views.test.ts          real DOM mount of start screen and game view
    └── geometry / i18n / audio / platform / ads
```

**Layering:** `ui/` depends on `game/`; `game/` never depends back. `geometry.ts` is
shared by drawing and hit-testing deliberately — two copies of "which cell is where"
drift, and the drift is invisible until a press lands on the wrong cell.

## Things worth building on day one

- **A seeded PRNG, used everywhere in simulation.** Retrofitting this is miserable.
- **The picture-based board fixture helper.** Every board test depends on it.
- **The recording canvas stub** (see `testing.md`). Adding it later means the drawing
  bugs it catches have already shipped.
- **`tools/sim.ts` with at least two policies.** Even a crude version tells you within a
  day whether the core loop has a skill gap at all, which is the one question that can
  invalidate the whole design.
- **i18n from the first string.** Retrofitting hard-coded text across a finished UI is
  pure tax. Default `en`; add all three locales whenever you add a key.

## Platform layer

`src/platform/` is copied between games rather than packaged, and holds `identity.ts`,
`scores.ts`, `auth.ts`, `ads.ts` and `game.ts`. See `PLATFORM.md` in the hub for what it
does and what the local-only version cannot do. When you change it, sync the change into
the other games rather than letting copies diverge.

## Palette

Tiles are read by colour before they are read by glyph, so check separation numerically
rather than by eye. In g008 the nine tile colours are all at least **24.6 apart in CIE
Lab ΔE**; an earlier palette had two at 6.8, which is why the board read as slabs of one
colour. Put the check in `render.test.ts` so a new item cannot quietly land next to an
existing one.
