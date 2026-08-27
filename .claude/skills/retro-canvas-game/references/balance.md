# Measuring balance instead of arguing about it

## The simulator

Every game carries `tools/sim.ts`: bots that play complete runs through the real
`game/` code and report aggregate statistics. Run it with
`npx vite-node tools/sim.ts` (or `npx tsx tools/sim.ts`).

It is only possible because `game/` is pure and instant. Guard that property — it is the
foundation of every number below.

## Bot policies, and the one metric that matters

Use at least three policies with genuinely different intent. In g008 they are:

- **mash** — act as fast as possible, no evaluation
- **patient** — wait for a board that scores above a threshold before acting
- **greedy** — evaluate harder and hold out for a better board

The headline output is the **skill gap**: how much better the choosing bots do than the
mashing one.

**If mash matches or beats the choosing bots, the player's only decision is decorative,
and no amount of polish will fix it.** This has happened twice in this project:

- Dealing seven item types made five presses in six do nothing, and playing well scored
  *no better* than mashing. Cutting the deck to four moved the sweep rate from 16% to
  45% and produced a real gap. That measurement is the reason the deck size is the single
  most important number in that game.
- Later, changing a rule so that one press resolved the entire board at once collapsed
  the gap to ~4%, with the patient bot scoring *below* mash — because when every press
  triggers the same full resolution, *when* you press stops mattering. That is a design
  consequence, not a bug, and it belongs in the roadmap as a known cost rather than being
  quietly accepted.

Report the gap whenever you change a rule that touches how a move resolves.

## Two traps that produced wrong conclusions

**Absolute thresholds in a bot's policy invert their own result.** A "wait until the
board is worth more than 200 points" policy is meaningless after the board shrinks and
typical values halve — the patient bot silently becomes the mashing bot. Express
thresholds as a **percentile of a rolling window** of recently observed values, so the
policy means the same thing on any board.

**Twelve seeds is noise.** A 12-seed run once reported mash < patient < greedy with a
~10% spread; the same configuration at 60 seeds showed the ordering essentially flat.
Use 40–60 seeds for anything you intend to quote, and say how many you used. When two
configurations differ by a few percent at 12 seeds, you have measured nothing.

## Write the derivation into the constant

A tuning number without its provenance is a number nobody can change safely. The
convention is that the comment carries the table:

```ts
/**
 * How many item types are dealt in one run.
 *
 * Measured over twelve runs per policy:
 *
 *   types |  presses that cleared  |  mean combo  |  mash score  |  best-play score
 *     7   |          16%           |     1.2      |     380      |      330
 *     5   |          28%           |     1.5      |     529      |      779
 *     4   |          45%           |     2.0      |    1724      |     2683
 *
 * At seven the game is a dud and playing well scores no better than mashing.
 */
export const PLAIN_PER_RUN = 3;
```

Also keep a short note where a constant was **deleted**, saying what it did and why it is
no longer needed. That is what stops the same idea being reintroduced a month later.

## Measure the thing the player is describing

Balance questions are rarely "is the score right". They are usually about frequency and
legibility, so measure those directly with a throwaway script over real runs:

- **How often does a press do nothing?** Broken down by difficulty tier. In g008: 70% of
  presses clear something with three item types, 48% with four, 28% with five. Overall,
  68% of presses clear nothing — which is very likely the real content of a "I can't see
  the clears" report, and no effect work addresses it.
- **Does the difficulty ladder actually get reached?** A top tier that 10% of runs see is
  a feature that did not ship. Moving one threshold from 8,000 to 6,800 — just above the
  median run — took it from 10% to 35%.
- **How long is the player locked out per action?** Distribution, not mean: median, p90,
  p99, max. A single 8.5-second cascade is worse than it sounds when a move's clock is 10
  seconds.
- **Does a resource ever actually run out?** A timed pickup that lapses 0.4 times a run
  is not a decision, it is a delivery. Note that a paused clock changes what its duration
  means: 8.5 seconds of *playable* time can be two dozen actions.

Report distributions and percentages. "It feels better" is not a finding; "p99 dropped
from 2934ms to 2466ms" is.

## Re-measure everything after a rule change

A rule change invalidates every number downstream of it. After changing how a move
resolves, re-run: the skill gap, the lockout distribution, the difficulty-tier reach, and
any resource economy. Then update the constants' comments — stale derivations are worse
than none, because they are trusted.
