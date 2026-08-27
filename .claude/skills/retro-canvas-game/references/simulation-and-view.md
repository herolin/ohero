# The settled-model pattern, and the four bugs it invites

## Contents

- [The pattern](#the-pattern)
- [Why it is worth the trouble](#why-it-is-worth-the-trouble)
- [The failure mode it creates](#the-failure-mode-it-creates)
- [Bug 1 — one snapshot for the whole move](#bug-1--one-snapshot-for-the-whole-move)
- [Bug 2 — drawing the end of the move](#bug-2--drawing-the-end-of-the-move)
- [Bug 3 — asking the view which step it is on](#bug-3--asking-the-view-which-step-it-is-on)
- [Bug 4 — effects tuned by feel](#bug-4--effects-tuned-by-feel)
- [The rule that covers all four](#the-rule-that-covers-all-four)
- [Designing an effect that reads](#designing-an-effect-that-reads)
- [Never manufacture an obstacle mid-resolution](#never-manufacture-an-obstacle-mid-resolution)

## The pattern

A player action is resolved **completely, synchronously, before a single frame is
drawn**. One call settles everything: the action, the cascade it sets off, gravity, the
refill, the scoring. It returns a description of what happened as an ordered list of
steps (in g008 these are called *waves*).

The animation layer is then a **schedule laid over a result that is already final**. It
holds no game state and makes no decisions. Its job, frame by frame, is to answer "what
should the player be able to see by now". While it runs, input is refused and the move
clock is paused — the player must not be charged for time they cannot act in, and gating
one without the other is its own bug.

## Why it is worth the trouble

Because the whole run is pure and instant, a bot can play thousands of complete games in
seconds. Every balance number in this project exists because of that. The alternative —
logic that advances a bit per frame — makes measurement essentially impossible and makes
tests depend on timers.

It also means an animation can never be "the game running slowly". If the picture is
wrong, the picture is wrong; the rules are a separate, independently testable thing.

## The failure mode it creates

The model has moved on before anything is drawn. So the live board is the board from the
**end** of the move, and every intermediate state the player is supposed to watch exists
only in the returned description. Anything that draws must therefore be told *which
moment it belongs to*, and any time it instead infers "now" from shared mutable state, it
draws a truthful picture of the wrong instant.

That single mistake produced four separate bug reports here, over three rounds of
debugging, all of which sounded like broken effects and none of which were.

## Bug 1 — one snapshot for the whole move

**Symptom reported:** "The three matching items just vanish, there's no clearing
effect."

**Cause:** the view kept one copy of the board from *before* the whole move and looked up
every removed cell in it. That is correct for the player's own action, and wrong for
everything the cascade removes, because those cells only hold what they hold *because*
the board fell.

**Measured:** 49.6% of cleared cells were drawn as the wrong item. On screen, the three
matching items the player had just watched land were replaced by unrelated ones a moment
before popping — which reads exactly as "they vanished with no effect".

**Fix:** each step carries **what it took**, as position *and* cell contents, not just
positions. The view then has nothing to look up and nothing to go stale.

```ts
interface Taken { at: Vec; cell: Cell }
interface Wave { taken: Taken[]; /* eaten is derived from taken, so they cannot disagree */ }
```

## Bug 2 — drawing the end of the move

**Symptom reported:** "I only ate one item — why does the whole board scramble? And if
something cleared there should be an effect, and there isn't."

**Cause:** the view drew the live board. The resolver had already advanced it to the end
of the cascade.

**Measured:** on a press that cascaded (26% of presses), 37% of the board on average —
median 12 cells of 35, sometimes all 35 — was already showing its end-of-move contents
while the first step was still playing. Both halves of the report were literally true:
the board *did* scramble on the press, and the match a later step was about to clear was
**never on screen at all**, so its effects landed on cells holding whatever the refill
dealt at the end.

**Fix:** each step carries the board as it stood once **that step** had settled. The view
draws the step being played. The existing drop-interpolation then runs that same board
*backwards* through the fall, so the burst phase shows the pre-fall board without needing
a second snapshot.

```ts
interface Wave { settled: Board /* board.clone() after gravity + refill for THIS wave */ }
```

Note this is not bug 1's snapshot in another costume, and the distinction matters: bug
1's fix gave the *effects* the right contents; the board underneath them was still from
the future. One snapshot for the whole move is wrong for every step after the first by
construction. One per step, taken by the model that knows when each step ended, is right
— that is the only place the information exists.

## Bug 3 — asking the view which step it is on

**Symptom reported:** "The first clear's effect is on the wrong cell — one above the line
— but the result of the clear is right."

"Result right, effect misplaced" is nearly always the view and the model disagreeing
about *when*.

**Cause:** the schedule's step function returns the *next* state, and the view assigned
it at the end of the frame. So while the view processed a tick, its own pointer still
referred to the previous step — and a step's first effect group is emitted on exactly the
frame the schedule crosses into it.

**Measured**, on one six-step press:

| group emitted for | view attributed it to | cells found in that step's `taken` |
|---|---|---|
| step 1 | step 0 | 0 of 7 |
| step 2 | step 1 | 2 of 13 |
| step 3 | step 2 | 2 of 6 |
| step 4 | step 3 | 0 of 6 |
| step 5 | step 4 | 1 of 3 |

So the **first clear of every press was read as the player's own action and drew nothing
at all**, and later clears drew on 0–2 of their cells, picking coordinates and colours
out of the wrong step.

**Fix:** the tick returns groups that each carry their own step, so the view never has to
guess.

```ts
interface Group { wave: Wave; cells: Vec[] }
interface ShowTick { burst: Group[]; light: Group[]; /* ... */ }
```

Audit for siblings when you fix this: the same stale read was also feeding the sound
effect's pitch, which made a cascade's first clear sound like the action before it.

## Bug 4 — effects tuned by feel

**Symptom reported:** the same "I can't see the clear", after two rounds of effect work
that all fired correctly.

**Cause:** nobody had measured how long anything was on screen. A cascade accelerates
each successive step, and that acceleration was tuned when a step was a large, rare
event. Once steps became small and frequent, the same acceleration crushed them.

**Measured**, per step, by combo depth, off the real schedule:

| combo | lead (lit) | burst | drop | gap | total |
|---|---|---|---|---|---|
| 2 | 178ms | 319 | 221 | 126 | 844ms |
| 3 | 115ms | 216 | 144 | 82 | 557ms |
| 4 | **62ms** | 112 | 78 | 44 | **306ms** |
| 5+ | **62ms** | 112 | 78 | 44 | 296ms |

62ms is four frames. The deep cascade — the moment the player is watching hardest — was
the least legible part of the game.

**Fix:** a floor on the lead, independent of the acceleration. The acceleration may
shorten the burst, the fall and the gap; it may not shorten the thing that makes the
clear readable. There is no point buying a visible effect at combo 2 and discarding it at
combo 4.

**Generalisation:** an effect's duration is a measurable quantity. Measure it in
milliseconds on screen, per depth, and assert the floor in a test against the measured
number rather than against the constant (see `testing.md` on tests that read their
expectation from the code).

## The rule that covers all four

> The view must never infer "now" from shared mutable state. Every drawable — a cell, a
> group, an effect, a caption, a sound — is told which moment it belongs to by the model
> that knows.

Practically, when adding anything that draws during a resolution, ask: *if this press
cascades five times, which step's data am I holding?* If the answer comes from a field
that the schedule also advances, it is wrong on at least one frame — and that frame is
usually the first one, which is the one the player judges the game by.

## Designing an effect that reads

A second lesson, independent of the bugs. Two rounds were spent on an effect that drew a
beam along each cleared line, on the sound reasoning that a vertical run and a horizontal
run must look different. It never worked, and the reason was not timing:

**A beam asks the player to trace a shape, and tracing is a slow read.** With an
accelerating cascade there is no time for it.

Replacing it with a **per-cell** effect — every doomed cell flashes on its own, then they
all burst — worked, because there is nothing to follow. The unit of an effect should
match the unit of the player's attention, and under time pressure that unit is the cell,
not the shape.

Corollary: an event with no visual has no existence. A rule that fires on a quarter of
all clears (an obstacle absorbing a hit instead of clearing) was reported as a bug purely
because it made only a *sound*. Giving it a distinct visual in its own colour turned it
back into a rule. When you add such a marker, put it where the *sound* is emitted, once
per step — not inside the burst loop, because a step whose entire outcome is "the
obstacle absorbed the hit" removes nothing and therefore has no bursts at all. That is
precisely the step that most needs to draw something.

## Never manufacture an obstacle mid-resolution

Distinct from the view bugs, and worth its own rule because it also arrived as "this is
broken".

An obstacle the player can **see before committing** is a rule: they can plan around it,
and losing to it is their own doing. The same obstacle **created by the refill inside the
resolution of a move already made** is not learnable and cannot be avoided. Measured
split of one such report: 24 points of the 31% were the visible kind, 8 points were
manufactured mid-resolution. Only the 8 was a defect.

Fix that shape of bug by refusing the creation, not by removing the rule — here, a
refilled cell may not arrive already frozen *inside a match*. Two implementation notes
that generalise:

- Decide in a **second pass**, after all holes are filled. A cell dealt at the top of a
  column can be completed by one dealt below it a moment later, so deciding at fill time
  misses exactly the case that matters.
- Check that the modifier cannot change the match itself (freezing does not change which
  item a cell holds), which is what makes deciding afterwards safe.
