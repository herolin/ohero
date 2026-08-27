# Turning a playtest report into a change

The owner playtests on a phone and reports in short, concrete sentences. Those reports
have been consistently accurate about **what they saw** and consistently not about
**why** — which is normal, and is the whole reason this loop exists.

## The loop

1. **Restate the report as a claim about something countable.** "I can't see the clear"
   is not actionable; "how long is a cleared line on screen before it is removed?" and
   "what fraction of presses clear anything?" both are.
2. **Measure it** with a throwaway script over real runs through `game/`. Keep these in
   the scratchpad, not the repo — except `tools/sim.ts`, which is permanent.
3. **Report the number before proposing a change.** If the measurement contradicts your
   first hypothesis, say so; that has happened repeatedly here and each time the second
   hypothesis was the real bug.
4. **Change one thing, then re-measure.** Quote before and after.
5. **Mutation-check the new guard** (see `testing.md`).
6. **Verify in a browser**, then publish.
7. **Write the round into the project's `CLAUDE.md`** — including the reasoning that was
   just superseded.

## If asked to evaluate before coding

A request like "explain what you think the current behaviour is, don't change code yet"
is entirely reasonable on a codebase where three consecutive fixes missed. Answer it
properly: describe the current rule step by step as the code actually implements it,
give the measurements, name the discrepancy, and stop. Do not slip a fix in.

## Report a non-bug as a non-bug

Some reports describe a rule working as designed. Say so — and then measure the *rate*,
because a rule that fires often enough becomes a legibility problem even when it is
correct.

The useful move is to split the rate by whether the player could have seen it coming:

> 31% of clears left part of a match standing. 24 points of that was an obstacle already
> on the board — visible, plannable, the rule working. 8 points was an obstacle the
> refill created *inside* the resolution of a move already committed to — not learnable,
> not avoidable. Only the second half is a defect.

That framing turned one report into one precise fix (refuse the creation) plus one
legibility fix (give the rule a visual), and left the mechanic intact. Without the split
the options look like "leave it broken" or "delete the mechanic".

## Distinguish what you verified from what you inferred

Report outcomes exactly. "The deploy workflow succeeded for commit X" and "I looked at
the published page" are different claims, and in this environment the second is often
impossible because the proxy denies `herolin.github.io`. Say which one you have.

The same applies to measurements: state the sample size, and do not compare a 12-seed
figure with a 60-seed one as though they were the same measurement.

## Keep the project's CLAUDE.md as a record of reasoning

Each game's `CLAUDE.md` is not a summary of the current code — that is what the code is
for. It records **why the current rule is the current rule**, including rules that were
reversed. Two conventions carry most of the value:

- **When a decision is overturned, keep the old reasoning** with a note on what
  measurement overturned it. One rule in g008 was reversed and then reversed back; the
  preserved notes are the only reason the second reversal was deliberate rather than an
  accident. Mark the superseded section rather than deleting it, and point at the section
  that replaced it.
- **Number the rounds and keep the measurements in them.** "5.19 — the effects were fine,
  the step was doing too much" with its table is reusable. "Fixed the clear effect" is
  not.

Also keep the roadmap's open-items list honest: re-measure the numbers in it when you
touch the area, and mark items that are **decisions for the owner** (difficulty dials)
separately from items that are work. When successive edits mangle that list — it happens —
rewrite it rather than patching around the damage, and say that you did.

## Watch for instructions that go stale

A rule change can falsify the game's own tutorial text. After changing a rule, grep the
i18n locale files for text describing it. One change here left the start screen teaching
the exact rule that had just been replaced, in all three languages — the one place a
player goes to find out how the game works, telling them the opposite of the truth.

The general habit: after changing a rule, search for every place that *describes* it —
locale strings, `CLAUDE.md`, constant comments, the hub's menu card — and bring them all
into step in the same commit.
