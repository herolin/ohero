---
name: retro-canvas-game
description: Build, balance, debug and publish the retro-inspired Canvas + TypeScript games in this project set (g001-g008 and onward), published as static builds to the herolin/ohero hub at /ohero/games/<slug>/. Use this whenever the work touches one of these game repos or the hub — starting a new game, changing rules or tuning numbers, chasing a "the effect doesn't show" or "the board scrambles" report, writing tests for game logic, measuring balance with the bot simulator, or syncing a build to ohero. Also use it when a playtest report arrives in any form ("it feels wrong", "I can't see the clear", "it's too easy"), because the first move is always to turn the report into a measurement rather than to change code. Applies even when the request sounds like a small visual tweak — in this codebase the visual layer is where the expensive bugs live.
---

# Retro Canvas Game

A house style for small, seeded, deterministic Canvas games. Eight of them exist
(g001–g008). They share an architecture, a testing discipline, a way of arguing about
balance, and one publishing pipeline. This skill is the accumulated cost of getting
those wrong the first time.

## The shape of these games

TypeScript strict + Vite (`base: './'`), Canvas 2D, no framework, no runtime
dependencies. A fixed simulation tick decoupled from rendering. A seeded PRNG, so a run
is reproducible and a whole game can be played out in milliseconds inside a test. Pure
game logic under `src/game/`, presentation under `src/ui/`, shared cross-game services
under `src/platform/`. All UI text through i18n (en / zh-TW / zh-CN). Every tuning
number in one file with a comment saying where it came from.

Read `references/scaffold.md` when starting a new game or when you need the exact
configs and directory layout.

## Four rules that are not style preferences

Each of these was learned by shipping the opposite and getting a bug report that took
several rounds to diagnose. They are cheap to honour and expensive to rediscover.

**1. `game/` never imports DOM, network or timers.** Not for purity's sake — because
`tools/sim.ts` plays thousands of complete runs in seconds, and that is the only reason
any balance claim in this project is a number rather than an opinion. The moment logic
reaches for `document` or `setTimeout`, measurement stops being possible.

**2. Randomness in simulation goes through `rng.ts`.** Purely decorative randomness
(particle jitter, idle animation) may use `Math.random()`. If a random draw can change
the outcome of a run, it must be seeded, or no measurement reproduces and no test is
stable.

**3. Every tuning number lives in `types.ts` with its derivation in the comment.**
Balance is then one diff rather than a hunt. Write down the table you measured, not just
the value — future-you will want to change it and will need to know what it was traded
against. Keep a short note for numbers you *deleted* too, saying why they are no longer
needed; that is what stops the same idea being reintroduced.

**4. When the model settles a whole move up front, every visual must be told which
moment it belongs to.** This is the big one and it has its own file:
`references/simulation-and-view.md`. Read it before touching anything that draws.

## When a playtest report arrives

The instinct is to change the code. In this project that instinct has been wrong more
often than right, because the reports that sound like broken effects have usually been
correct effects drawn against the wrong board state, and the reports that sound like
bugs have sometimes been rules working as designed at a rate nobody could read.

So: **measure first, and say what you measured.** Write a throwaway script that plays
hundreds of runs through the real `game/` code and counts the thing the player is
describing. Report the number before proposing a change. Concretely, from this project's
history:

- "The clear has no effect" → measured 49.6% of cleared cells were being *drawn as the
  wrong food*. No amount of effect work would have fixed that.
- "The whole board scrambles when I only ate one" → measured 37% of the board was
  already showing its end-of-move contents on the first frame. It really did scramble.
- "The first clear's effect is on the wrong cell" → measured every clear's effect was
  attributed to the *previous* wave; the first clear of every press got none at all.
- "Only two of the three clear" → measured 31% of clears left part of a run standing,
  and split it: 24 points were a visible rule the player could plan around, 8 points
  were an obstacle manufactured *inside* the resolution of a move already committed to.
  Only the second half was a defect.

If the user asks you to explain your understanding before changing code, that is a
reasonable request on a codebase with this history — answer it fully with numbers, and
wait.

Read `references/playtest-loop.md` for how to run this loop, including how to report a
finding that turns out not to be a bug.

## Balance is measured, not felt

`tools/sim.ts` plays complete runs with several bot policies and reports the spread. The
headline metric is the **skill gap**: how much better a bot that chooses well does than
one that mashes. If they are level, the player's only decision is decorative and the
game has a problem no amount of polish will fix.

Two traps that cost real time here: absolute value thresholds in a bot's policy invert
their own conclusion when the board size changes (use percentiles of a rolling window),
and twelve seeds is noise — a 12-seed run once reported a skill ordering that reversed
at 60 seeds.

Read `references/balance.md` before quoting any balance number.

## Testing discipline

The suites here are large (g008 has ~293 tests) and were still green through three
separate user-visible bugs. That is the fact worth internalising: **a green suite is
evidence of nothing unless the guards have been broken on purpose.**

After writing or changing a guard, break the rule it guards and confirm that test goes
red. Survivors are information: either the test is fake, or the behaviour is not
actually pinned anywhere. Both were found in this project — including tests that read
their expected value from the same constant as the code (so relaxing the constant kept
them green), and an assertion that merely required *some* effect to exist, which strays
satisfied.

Read `references/testing.md` for the fixture and stub patterns, including the canvas
stub that records `fillText` — without it, drawing bugs are invisible to the suite,
which is exactly how the worst bug here survived.

## Publishing

Each game is its own repo; the hub `herolin/ohero` holds only compiled output under
`games/<slug>/`, and its Pages workflow copies without building. `base: './'` is what
makes a build work under a sub-path. The repo name and the published slug need not
match, but `GAME_SLUG` is the leaderboard partition key and cannot change once live.

Non-negotiable content rules: `UNLICENSED` + `private: true`; no original game assets of
any kind (draw and synthesise everything); and public paths, titles, menu cards and meta
must not carry an original game's name or describe the game as a clone.

Read `references/publishing.md` for the sync procedure and the browser verification that
should accompany it.

## Reference files

| File | Read it when |
|---|---|
| `references/scaffold.md` | Starting a new game, or you need exact configs and layout |
| `references/simulation-and-view.md` | Touching anything that draws, animates or reads game state from the view |
| `references/balance.md` | Changing tuning numbers, or about to quote a balance figure |
| `references/testing.md` | Writing tests, or a suite stayed green through a real bug |
| `references/publishing.md` | Building, syncing to the hub, or verifying a live build |
| `references/playtest-loop.md` | A playtest report arrived, in any form |

`中文導讀.md` is a Chinese-language summary for the project owner. It is not instructions
for you, and it does not need to be read to use this skill — but keep it in step when
the skill changes materially.
