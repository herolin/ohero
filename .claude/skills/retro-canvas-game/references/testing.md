# Testing: how a 293-test suite stayed green through three visible bugs

Vitest, with `environment: 'node'` for logic and jsdom for the view suites. Logic tests
are fast because `game/` is pure. That speed is what makes the mutation discipline below
affordable.

## Contents

- [Mutation-check every guard](#mutation-check-every-guard)
- [Four ways a test tests nothing](#four-ways-a-test-tests-nothing)
- [Fixtures as pictures](#fixtures-as-pictures)
- [Fixtures must not depend on a seed's luck](#fixtures-must-not-depend-on-a-seeds-luck)
- [The canvas stub must record what was drawn](#the-canvas-stub-must-record-what-was-drawn)
- [Testing the picture](#testing-the-picture)
- [Deterministic randomness in tests](#deterministic-randomness-in-tests)
- [Recording superseded tests](#recording-superseded-tests)

## Mutation-check every guard

After writing or changing a test that guards a rule, **break the rule and confirm that
test goes red.** Then restore. This is the single highest-value habit in this codebase,
because the suites here are large enough to feel like proof and were green through every
one of the bugs in `simulation-and-view.md`.

Work in both directions where the rule has two halves. "Ice is refused when the new cell
completes a match" needs a partner test — "ice is still dealt when it does not" —
otherwise *never freeze anything* also passes, and that silently deletes the mechanic.

Treat a survivor as information, not as reassurance: either the test is fake, or the
behaviour is not pinned anywhere. Both have turned up here. In one round, 34 mutations
found two fake tests.

## Four ways a test tests nothing

All four were found in this project. Recognise them by shape.

**1. It reads its expectation from the code under test.**

```ts
// Cannot fail. Setting MAX_CASCADES to 9999 keeps this green.
expect(out.waves.length).toBeLessThanOrEqual(MAX_CASCADES);
```

Fix with an exact behavioural assertion (a machine that cascades forever must stop *at*
the ceiling, not near it) plus a deliberate literal, so that whatever the constant
becomes, a single action cannot run the resolver dozens of times in a frame:

```ts
expect(out.waves).toHaveLength(MAX_CASCADES);
expect(out.waves.length).toBeLessThanOrEqual(64);   // deliberate literal
```

**2. The fixture satisfies it for free.** A test asserting that a step's cells come out
in descending row order is satisfied automatically by any single-row step. It survived a
rule change that made it meaningless. Assert the thing that distinguishes the rule — that
two separate matches go in the *same* step, or in *different* steps, whichever the rule
says.

**3. It asserts that *some* effect exists.** "A clear produces at least one flash" is
satisfied by strays from unrelated steps — the old buggy code passed it. Require **every**
element the rule covers, and match on a **discriminator** as well as position:

```ts
// Position alone let an unrelated clear-flash on the same cell stand in for the marker.
it0.flashes.some((fl) => fl.colour === ICE_COAT && near(fl.at, centre))
```

**4. The fixture cannot produce the shape any more.** Animation tests built two disjoint
runs inside one step; after a rule change the model could only ever produce connected
arms. The tests passed and described something impossible. When a rule changes, hunt for
fixtures that still compile but no longer correspond to reality.

## Fixtures as pictures

Every interesting situation in a board game is a **shape**, and a shape written as a list
of coordinates cannot be checked by reading. Build boards from ASCII art:

```ts
const board = boardOf([
  'B C P',
  'B B C',
]);
```

Two details that matter in the helper:

- Give the fixture board the **menu the picture shows**, not the full item set. Once
  scoring gained a deck-size multiplier, fixtures built with the default full deck scored
  at 3.6× what the same picture means in a real game, and two exact-score tests failed
  saying nothing about why.
- Support modifiers inline (`B*` starred, `B#` frozen) so the shape stays readable.

There should also be a reverse helper that renders a board back to the same picture, for
asserting what a move left behind.

## Fixtures must not depend on a seed's luck

`new Run({ moves: 1 }); run.bite(); expect(status).toBe('over')` depends on that seed
missing a payout that grants extra moves. It broke the moment a rule changed what the
seed collects. What was under test was the guard *after* the run ends, which does not
care how it got there:

```ts
for (let i = 0; i < 500 && run.status === 'playing'; i++) run.bite();
expect(run.status).toBe('over');
```

Same class of problem in view tests that plant a fixture on a random board: plant it in a
column the character is **not** under, or the action itself disturbs it. Gravity is
per-column, so a column the action does not touch is untouched. When a view test is
intermittent, this is usually why — run it three or four times before believing it.

## The canvas stub must record what was drawn

jsdom has no 2D context, so the view suites need a stub. **A stub that silently swallows
drawing calls is how a drawing bug passes a full suite** — which is exactly what happened
with the worst bug in this project. Make the stub record:

```ts
let drawn: { text: string; x: number; y: number }[] = [];

const ctx = new Proxy({} as Record<string, unknown>, {
  get: (target, prop: string) => {
    if (prop in target) return target[prop];
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => undefined });
    }
    if (prop === 'fillText') {
      return (text: string, x: number, y: number) => drawn.push({ text, x, y });
    }
    return () => undefined;
  },
  set: (target, prop: string, value) => { target[prop] = value; return true; },
});
```

Recording `fillText` is enough when items are drawn as glyphs: everything the player
reads off the board becomes a (glyph, position) pair the test can check.

## Testing the picture

Rules tests cannot catch a wrong picture, because the rules are right. Test the picture
directly, and pick the cells where a wrong answer is unambiguous: **cells that are not
being animated** — not moving, not spawning, not waiting to burst, therefore drawn at
their own centre with no offset.

```ts
// During the first step of an action that is going to cascade — the only place the
// per-step board and the end-of-move board disagree.
for (const cell of grid) {
  if (moving.has(key(cell))) continue;
  expect(drawnAt(centreOf(cell))).toBe(glyphOf(step.wave.settled.at(cell)));
}
```

Then mutate: point the view back at the live board and confirm it goes red. Without that
step you do not know whether you wrote a test or a decoration.

## Deterministic randomness in tests

Two helpers cover almost everything:

- `fixedRng(next, int)` — every draw returns the same value. Makes cascades a certainty
  so tests can be about rules rather than dice.
- `scriptedRng(nexts, ints)` — reads from a list, then repeats its last answer. For the
  few tests that need one specific draw to differ (a special item arriving, a cell
  arriving frozen) without pinning every draw after it.

Watch the **order of draws** when using these: if the code rolls for an item type and
then for a modifier, a single-value RNG may trigger a rare item you did not intend.
Script the sequence rather than fighting it.

## Recording superseded tests

When a rule change invalidates a test, do not delete its reasoning. Rewrite the test and
keep a short note of what the previous version guarded and why that was defensible at the
time. This project has tests that were reversed and then reversed back; the notes are the
only thing that stopped the second reversal from being an accident. It also makes an
honest signal available to the next reader: *this rule is contested, tread carefully.*
