# Happiness and fairness audit (2026-10-15)

**Verdict.** Mostly yes: adding up everyone's scores already gets each person about 7 to 8 of every 10 of their Musts, and someone who marks lots of Musts does not crowd out someone who marks few, as long as their tastes overlap.
It falls short in one way: in 22 of 400 simulated groups someone ends up with none of their Musts at all (mostly a person whose few Musts are places nobody else wants), and one small extra step after the head to heads fixes 17 of those 22 groups while the group keeps over 99% of its points on average.

Scope: `src/lib/ranking.ts`, `group.ts`, `planner.ts` on the live catalogue (33 places) and `src/data/legs.json`. Read-only on product code. The throwaway simulation files (`src/lib/zz_happy*`) were deleted before this doc was committed.

## What "happy" means here

For each person, measured against what they submitted:

| Measure | What it counts |
|---|---|
| Musts in | share of their Musts that made the plan |
| Musts+Keens in | share of their Musts and Keens that made the plan |
| #1 place in | whether their top-ranked Must (their top Keen if they have no Musts) is in |
| Skipped places | how many places they rated Skip are in the plan |

For the group: the average person's Musts in, the **lowest** person's Musts in, how many people got **none** of their Musts, and the gap between the best-off and worst-off person.

## How it was tested

- **400 simulated groups**: 5 kinds of group, each at 9 and 14 days, 40 groups each. Each person's pace is random (pack it in, balanced or slow) and the group uses the median, as `groupResult` does. The shortest person sets the length; others said the same or longer, some "flexible".
- **The 5 kinds of group.** People rate all 33 places from a shared "how popular is this place" score plus their own taste, so tastes overlap the way friends' do.
  - **Typical**: everyone 5 to 10 Musts, 6 to 10 Keens, 3 to 7 Skips.
  - **Lopsided**: one person 15 to 18 Musts, one person 2 or 3 Musts whose favourites overlap with the group's.
  - **Niche** (added, the hard case behind D4): as lopsided, but the 2 or 3 Musts person likes what the rest of the group does not. This is the logic audit's F9 example.
  - **Polarised**: camps of 2 and 3, beach and south (South coast, Colombo, Wild south, Kitulgala) against culture and north (North, East coast, Cultural Triangle, Kandy).
  - **One hater**: one person with 2 to 4 Musts, 3 to 5 Keens and 15 to 20 Skips.
- **Methods compared.** Only the points fed to the existing planner change; the planner is untouched.
  - **A, today**: add up everyone's points (Must 10, Keen 4, Meh 1, Skip -3, plus up to 0.9 for in-tier order).
  - **B, equal weight**: scale each person's points so everyone's positive points add to the same total.
  - **C, proportional fairness**: the plan that maximises the sum, over people, of log(1 + their own points). In plain words it values lifting whoever is lowest more than adding to whoever is highest. Found by re-weighting each person by 1 / (1 + their points) for up to 4 rounds from A and B, keeping the best.
  - **D, everyone's #1 Must**: today's plan, then force in each person's top Must (worst-off person first) when the plan can hold it.
  - **D1, nobody at zero (before votes)**: as D, but only for people with none of their Musts in; they get their best-ranked Must that fits.
  - **E, Musts-first**: force in every place 3 or more people rated Must, then fill the rest by A or by B.
  - **Floor after votes (recommended)**: once every head to head is settled, anyone with none of their Musts in the plan gets one of them back: of their Musts that did not lose a head to head and are not in the region the group voted against, the one that costs the group least. A second version takes their top-ranked such Must instead.
- **Head to heads.** Each group is then voted through the real `groupResult` (for A) or an exact copy with the method's points swapped in (checked: the copy gives the same final plan as the real one in 400 of 400 groups). Everyone votes for the side their own submitted points favour. Finalize lists were not simulated (everyone counts as submitted).

## Headline: people left with none of their Musts, after the head to heads

| Kind of group | A today | B | C | D | E (then A) | **Floor after votes** |
|---|---|---|---|---|---|---|
| Typical | 0 | 0 | 0 | 0 | 0 | 0 |
| Lopsided | 0 | 0 | 0 | 0 | 0 | 0 |
| Niche | 13 | 14 | 8 | 1 | 19 | **2** |
| Polarised | 8 | 5 | 4 | 0 | 15 | **0** |
| One hater | 3 | 3 | 3 | 1 | 0 | **3** |
| Total cost vs A, average group (worst group) | 0 | 0 to 0.8% (20%) | 0 to 0.5% (20%) | 2 to 6.5% (48%) | 0.6 to 3.6% (35%) | **0 to 0.8% (17%)** |

The 5 people the floor cannot help (2 niche, 3 hater) each had every one of their Musts either lose a head to head or sit in the North when the final plan does not go there. The floor deliberately does not overrule a vote.

## Recommendation

Keep today's raw totals (her D4) and add the floor after the head to heads.

**Trade-off in one sentence:** in the roughly 1 group in 20 where someone would otherwise get none of their Musts, the group gives up a little (0.4% of its points on average in polarised groups, 0.8% in niche groups, 17% in the single worst group) so that person gets one.

Why not the others:

- **B (equal weight)** reverses D4 and barely helps: its gains before the votes (niche 13 people at zero down to 5) are undone by the head to heads (back to 14), because people vote with their own points, not the scaled ones. It also hands the hater's Skips extra weight (hater's Skips in the plan 6.3 down to 4.8), which moves toward the veto D7 ruled out.
- **C (proportional fairness)** is the best of the scoring changes (niche 13 to 8, polarised 8 to 4, at no total cost), but it is also per-person weighting, so it breaks D4, it still leaves people at zero, and it needs about 3 extra planner runs (plan before votes 30 to 53 ms against 11 to 14 ms for A).
- **D (everyone's #1 Must)** gets everyone's top place in but is expensive: 2 to 6.6% of the group's points on average and up to 51% in one lopsided group; in lopsided and niche groups the person with most Musts loses 0.6 to 0.8 of them.
- **E (Musts-first)** makes fairness worse: the majority's shared Musts are locked in first, so the minority camp's Musts in the plan drop from 56% to 48% and people at zero rise from 8 to 15 (polarised) and 13 to 19 (niche).

## Checked against her other decisions

| Decision | Does the floor keep it? |
|---|---|
| D4 raw totals | Yes. Scoring is unchanged; the floor only acts when someone is at zero. |
| D5 knocked down, not out | Yes. The floor never picks a Must that lost a head to head. A knocked item can still come back on its own, as today. |
| D6 region first | Yes. It runs only once every question is settled, and never picks a place in the region the group voted against. |
| D7 Skip is a minus, not a veto | Yes. Skipped places in plan move by 0.3 or less per plan. |
| Finalize lists | Needs one rule: run the floor again after the plan is rebuilt from the Finalize lists, using each person's saved list for their Musts. Not simulated here. |

## Cost of fairness and speed

- **Total points**: floor vs today after head to heads: typical, lopsided and hater 0.0%; polarised 0.4% average (worst group 16%); niche 0.8% average (worst group 17%). It fired in 17 of 400 groups (18 people).
- **The most enthusiastic person** (most Musts) loses 0.13 Musts on average in niche groups and nothing elsewhere.
- **The "top-ranked Must" version** of the floor lifts the same people but costs more (polarised worst group 26% against 16%) and gets no more #1 places in (3.9 of 5 either way), so the least-cost version is recommended.
- **Speed, live catalogue**: one full group step (`groupResult`, cold) takes 24 to 44 ms on average (95th percentile at most 71 ms) today and the same with the floor (24 to 41 ms), because it only runs when someone is at zero. The ~190 ms figure in the brief is the 46-place test fixture, which I did not re-time.

## Assumptions tested

1. **"The in-tier bonus is small relative to tier gaps."** True for one person: the bonus is 0 to 0.9 and the smallest tier gap is 3, so it never lifts one of your Keens above your Musts. Not small once five people are added up: it adds about 0.45 per rating to every place, which changes the chosen plan in 40 to 58 of every 80 groups and lets in 0.4 to 1.8 more Skipped places per plan (typical 5.4 with the bonus against 4.7 without; hater 10.0 against 8.1). Must shares are unaffected (within 1 point). Centring the bonus (+0.45 for your top item to -0.45 for your bottom one) removes most of the extra Skips (typical 4.8, hater 8.7). This is a separate follow-up, not part of the recommendation: it is a one-line change to `score()` in `src/lib/ranking.ts`, which other work is editing now, and it needs the "bare Keen" value for knocked-down Musts (`rating` in `group.ts`, D5) lowered to match, so it is Brittany's call.
2. **"The head to heads cannot leave a person with zero Musts while others get many."** False. Today, after the head to heads, 8 people in 6 of 80 polarised groups and 3 in 3 of 80 hater groups have none of their Musts (before the votes it was 6 and 0). Example: polarised, 9 days, group 11: Brittany 0 of 10 Musts while another person has 8 of 9; she had 1 before the votes, and five of her Musts lost head to heads. The floor lifts her (and 6 others in polarised groups).
3. **D4 ("more Musts means more pull") hurts the person with few Musts.** Only when their tastes are unusual. In lopsided groups the 2 or 3 Musts person gets 82% of their Musts and the 15+ Musts person 71%. In niche groups it is 49% against 70%, and the few-Musts person ends with none in 13 of 80 groups; the floor brings that to 2.

## What would change in code if approved

| File | Change |
|---|---|
| `src/lib/group.ts`, `groupResult` | After the place head to head loop, when no question is open: for each person with at least one Must and none in `P.chosen`, try each of their Musts not in `knocked` and not in `O` with `run(F + m, O)`; keep the plan that holds `m` and scores highest; add `m` to `F`. Two passes, so a later forced place cannot leave an earlier person at zero. Run it again after the Finalize rebuild (`P = run(F, O)`), reading Musts from `r.final` when saved. Record each `{ name, id }`. |
| `src/types.ts` | `GroupResult.floored: { name: Person; id: string }[]`. Blast radius: the 8 files that read `GroupResult` and the 6 screen tests that build one by hand (logic-audit "Blast radius"). |
| `src/lib/compromises.ts`, `compromises` | One card per floored place, e.g. "Saulie's pick: Dambulla", at that stop. |
| `src/lib/group.test.ts` | Red then green: a niche group where someone ends at zero gets one Must back; the floor never adds a knocked-down or losing-region place; no question asked twice; identical calls give identical results. |

No change to `ranking.ts` or `planner.ts`.

## Tables per kind of group

"Before votes" is the plan the method builds before any head to head; "after" is the final plan once the group has voted. Numbers are averages over the 80 groups. People with no Musts shows people (groups). Total score is the sum of everyone's points for the plan, then the average cost against A and the worst single group. Time is planner time for the method's plan before votes, and the first `groupResult` call (cold) after.

### Typical

| Stage | Method | Musts in (avg person) | Lowest person's Musts in | People with no Musts (groups) | Gap best to worst | Musts+Keens in | #1 place in (of 5) | Skipped places in plan | Total score (cost vs A, worst group) | Musts lost by the person with most Musts | Time ms mean (95th pct) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Before votes | A today | 80% | 66% | 0 (0) | 29% | 70% | 4.4 | 5.4 | 454 (0.0%, 0%) | 0.00 | 11 (19) |
| Before votes | B equal weight | 80% | 65% | 0 (0) | 29% | 70% | 4.4 | 5.5 | 454 (-0.1%, 4%) | 0.04 | 8 (18) |
| Before votes | C proportional fairness | 80% | 66% | 0 (0) | 28% | 71% | 4.4 | 5.6 | 456 (-0.4%, 0%) | 0.03 | 31 (74) |
| Before votes | D everyone's #1 Must | 79% | 65% | 0 (0) | 28% | 69% | 5.0 | 5.3 | 446 (2.2%, 25%) | -0.01 | 16 (44) |
| Before votes | D1 nobody at zero | 80% | 66% | 0 (0) | 29% | 70% | 4.4 | 5.4 | 454 (0.0%, 0%) | 0.00 | 11 (19) |
| Before votes | E Musts-first, then A | 81% | 67% | 0 (0) | 27% | 69% | 4.5 | 4.8 | 448 (1.4%, 16%) | -0.05 | 27 (48) |
| Before votes | E Musts-first, then B | 81% | 67% | 0 (0) | 27% | 69% | 4.5 | 4.9 | 448 (1.4%, 16%) | 0.01 | 21 (39) |
| After | A today | 78% | 64% | 0 (0) | 28% | 70% | 4.2 | 5.4 | 449 (0.0%, 0%) | 0.00 | 27 (54) |
| After | B equal weight | 79% | 64% | 0 (0) | 27% | 70% | 4.2 | 5.4 | 449 (-0.0%, 11%) | 0.06 | 25 (46) |
| After | C proportional fairness | 78% | 64% | 0 (0) | 27% | 70% | 4.2 | 5.5 | 449 (-0.0%, 11%) | 0.09 | 26 (46) |
| After | D everyone's #1 Must | 78% | 63% | 0 (0) | 29% | 69% | 4.6 | 5.3 | 442 (1.9%, 33%) | 0.04 | 32 (86) |
| After | E Musts-first, then A | 80% | 66% | 0 (0) | 28% | 68% | 4.4 | 4.7 | 443 (1.4%, 16%) | -0.07 | 48 (147) |
| After | Floor, top-ranked Must | 78% | 64% | 0 (0) | 28% | 70% | 4.2 | 5.4 | 449 (0.0%, 0%) | 0.00 | 27 (49) |
| After | **Floor, least-cost Must (recommended)** | 78% | 64% | 0 (0) | 28% | 70% | 4.2 | 5.4 | 449 (0.0%, 0%) | 0.00 | 27 (48) |

### Lopsided (last-but-one column: the 2 or 3 Musts person's Musts in, and how many times at zero)

| Stage | Method | Musts in (avg person) | Lowest person's Musts in | People with no Musts (groups) | Gap best to worst | Musts+Keens in | #1 place in (of 5) | Skipped places in plan | Total score (cost vs A, worst group) | Musts lost by the person with most Musts | Few-Musts person | Time ms mean (95th pct) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Before votes | A today | 78% | 62% | 0 (0) | 32% | 69% | 4.0 | 6.0 | 458 (0.0%, 0%) | 0.00 | 82% (0) | 12 (20) |
| Before votes | B equal weight | 78% | 62% | 0 (0) | 33% | 69% | 4.1 | 6.2 | 456 (0.2%, 5%) | 0.38 | 86% (0) | 9 (15) |
| Before votes | C proportional fairness | 79% | 63% | 0 (0) | 32% | 69% | 4.0 | 6.4 | 458 (-0.2%, 4%) | 0.25 | 86% (0) | 36 (56) |
| Before votes | D everyone's #1 Must | 77% | 60% | 0 (0) | 34% | 66% | 5.0 | 5.7 | 439 (4.7%, 51%) | 0.78 | 86% (0) | 24 (55) |
| Before votes | D1 nobody at zero | 78% | 62% | 0 (0) | 32% | 69% | 4.0 | 6.0 | 458 (0.0%, 0%) | 0.00 | 82% (0) | 12 (20) |
| Before votes | E Musts-first, then A | 79% | 62% | 0 (0) | 37% | 66% | 4.3 | 5.4 | 442 (3.7%, 46%) | 0.55 | 89% (0) | 29 (53) |
| Before votes | E Musts-first, then B | 79% | 61% | 0 (0) | 37% | 66% | 4.3 | 5.5 | 439 (4.4%, 46%) | 0.86 | 91% (0) | 25 (42) |
| After | A today | 77% | 61% | 0 (0) | 33% | 69% | 4.0 | 6.7 | 456 (0.0%, 0%) | 0.00 | 81% (0) | 32 (53) |
| After | B equal weight | 77% | 61% | 0 (0) | 34% | 69% | 4.0 | 6.7 | 454 (0.5%, 9%) | 0.14 | 80% (0) | 29 (50) |
| After | C proportional fairness | 77% | 62% | 0 (0) | 33% | 69% | 4.1 | 6.5 | 454 (0.4%, 7%) | 0.15 | 82% (0) | 30 (53) |
| After | D everyone's #1 Must | 75% | 58% | 0 (0) | 34% | 66% | 4.8 | 6.0 | 435 (5.3%, 45%) | 0.63 | 83% (0) | 39 (72) |
| After | E Musts-first, then A | 79% | 60% | 0 (0) | 38% | 66% | 4.3 | 5.6 | 440 (3.6%, 34%) | 0.46 | 89% (0) | 56 (150) |
| After | Floor, top-ranked Must | 77% | 61% | 0 (0) | 33% | 69% | 4.0 | 6.7 | 456 (0.0%, 0%) | 0.00 | 81% (0) | 33 (56) |
| After | **Floor, least-cost Must (recommended)** | 77% | 61% | 0 (0) | 33% | 69% | 4.0 | 6.7 | 456 (0.0%, 0%) | 0.00 | 81% (0) | 30 (53) |

### Niche (as lopsided, but the few-Musts person likes what the group does not)

| Stage | Method | Musts in (avg person) | Lowest person's Musts in | People with no Musts (groups) | Gap best to worst | Musts+Keens in | #1 place in (of 5) | Skipped places in plan | Total score (cost vs A, worst group) | Musts lost by the person with most Musts | Few-Musts person | Time ms mean (95th pct) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Before votes | A today | 72% | 43% | 13 (13) | 49% | 65% | 3.7 | 9.0 | 442 (0.0%, 0%) | 0.00 | 49% (13) | 13 (22) |
| Before votes | B equal weight | 73% | 50% | 5 (5) | 41% | 65% | 3.6 | 9.5 | 437 (1.2%, 14%) | 0.56 | 61% (5) | 11 (23) |
| Before votes | C proportional fairness | 74% | 53% | 4 (4) | 38% | 66% | 3.7 | 9.8 | 440 (0.2%, 9%) | 0.50 | 64% (4) | 53 (109) |
| Before votes | D everyone's #1 Must | 73% | 53% | 0 (0) | 38% | 61% | 5.0 | 9.5 | 416 (6.6%, 49%) | 0.75 | 68% (0) | 26 (59) |
| Before votes | D1 nobody at zero | 72% | 49% | 0 (0) | 41% | 65% | 3.8 | 9.1 | 438 (1.0%, 16%) | 0.11 | 56% (0) | 13 (22) |
| Before votes | E Musts-first, then A | 72% | 41% | 16 (16) | 52% | 62% | 3.9 | 8.6 | 430 (3.1%, 32%) | 0.41 | 46% (16) | 32 (56) |
| Before votes | E Musts-first, then B | 73% | 44% | 15 (15) | 48% | 63% | 3.9 | 8.8 | 427 (3.6%, 32%) | 0.82 | 55% (15) | 27 (44) |
| After | A today | 71% | 42% | 13 (13) | 48% | 65% | 3.7 | 8.8 | 437 (0.0%, 0%) | 0.00 | 51% (13) | 36 (64) |
| After | B equal weight | 71% | 43% | 14 (14) | 49% | 65% | 3.6 | 9.1 | 435 (0.3%, 19%) | 0.29 | 50% (14) | 35 (67) |
| After | C proportional fairness | 72% | 47% | 8 (8) | 44% | 65% | 3.6 | 9.5 | 436 (0.0%, 10%) | 0.06 | 58% (8) | 37 (76) |
| After | D everyone's #1 Must | 71% | 50% | 1 (1) | 39% | 61% | 4.8 | 9.5 | 412 (6.5%, 48%) | 0.78 | 67% (1) | 48 (115) |
| After | E Musts-first, then A | 70% | 38% | 19 (19) | 54% | 62% | 3.8 | 8.8 | 425 (3.2%, 28%) | 0.19 | 44% (19) | 55 (165) |
| After | Floor, top-ranked Must | 71% | 48% | 2 (2) | 41% | 64% | 3.7 | 9.1 | 433 (0.9%, 17%) | 0.13 | 57% (2) | 37 (69) |
| After | **Floor, least-cost Must (recommended)** | 71% | 48% | 2 (2) | 42% | 65% | 3.7 | 9.1 | 434 (0.8%, 17%) | 0.13 | 57% (2) | 34 (61) |

### Polarised (camps of 2 and 3)

| Stage | Method | Musts in (avg person) | Lowest person's Musts in | People with no Musts (groups) | Gap best to worst | Musts+Keens in | #1 place in (of 5) | Skipped places in plan | Total score (cost vs A, worst group) | Musts lost by the person with most Musts | Time ms mean (95th pct) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Before votes | A today | 71% | 47% | 6 (4) | 43% | 63% | 4.0 | 9.9 | 407 (0.0%, 0%) | 0.00 | 14 (22) |
| Before votes | B equal weight | 71% | 47% | 2 (2) | 43% | 64% | 4.0 | 10.0 | 406 (0.0%, 5%) | 0.03 | 12 (21) |
| Before votes | C proportional fairness | 72% | 52% | 2 (2) | 36% | 64% | 4.1 | 10.1 | 407 (0.1%, 7%) | -0.05 | 52 (95) |
| Before votes | D everyone's #1 Must | 70% | 52% | 0 (0) | 36% | 61% | 5.0 | 9.8 | 394 (3.8%, 35%) | 0.33 | 25 (53) |
| Before votes | D1 nobody at zero | 71% | 48% | 0 (0) | 42% | 63% | 4.0 | 9.9 | 406 (0.3%, 10%) | 0.00 | 14 (22) |
| Before votes | E Musts-first, then A | 71% | 46% | 8 (5) | 45% | 62% | 4.0 | 9.4 | 400 (1.9%, 28%) | -0.03 | 30 (52) |
| Before votes | E Musts-first, then B | 71% | 46% | 7 (4) | 45% | 62% | 4.1 | 9.4 | 399 (2.1%, 28%) | 0.10 | 26 (49) |
| After | A today | 68% | 41% | 8 (6) | 49% | 63% | 3.9 | 10.2 | 397 (0.0%, 0%) | 0.00 | 44 (71) |
| After | B equal weight | 69% | 43% | 5 (4) | 47% | 63% | 3.8 | 10.0 | 397 (-0.2%, 14%) | 0.15 | 38 (67) |
| After | C proportional fairness | 69% | 44% | 4 (3) | 44% | 63% | 4.0 | 10.0 | 399 (-0.5%, 8%) | 0.06 | 40 (69) |
| After | D everyone's #1 Must | 68% | 46% | 0 (0) | 42% | 60% | 4.5 | 9.8 | 386 (3.1%, 33%) | 0.29 | 46 (75) |
| After | E Musts-first, then A | 69% | 39% | 15 (10) | 53% | 61% | 3.9 | 9.3 | 389 (2.0%, 35%) | -0.01 | 47 (77) |
| After | Floor, top-ranked Must | 68% | 43% | 0 (0) | 46% | 63% | 3.9 | 10.3 | 395 (0.8%, 26%) | -0.05 | 43 (80) |
| After | **Floor, least-cost Must (recommended)** | 68% | 43% | 0 (0) | 46% | 63% | 3.9 | 10.3 | 396 (0.4%, 16%) | -0.01 | 41 (67) |

Minority camp (2 people) against majority camp (3 people), share of their Musts in: A before votes 63% and 76%, after 56% and 77%; C after 59% and 75%; E after 48% and 83%; floor after 57% and 76%. The head to heads are where the minority loses ground: every place question is 3 votes against 2.

### One hater

| Stage | Method | Musts in (avg person) | Lowest person's Musts in | People with no Musts (groups) | Gap best to worst | Musts+Keens in | #1 place in (of 5) | Skipped places in plan | Total score (cost vs A, worst group) | Musts lost by the person with most Musts | Hater: Musts in, their Skips in plan | Time ms mean (95th pct) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Before votes | A today | 80% | 61% | 0 (0) | 34% | 71% | 4.2 | 10.0 | 384 (0.0%, 0%) | 0.00 | 86%, 6.3 | 12 (17) |
| Before votes | B equal weight | 80% | 61% | 0 (0) | 36% | 70% | 4.2 | 8.1 | 380 (1.0%, 12%) | 0.23 | 92%, 4.8 | 6 (13) |
| Before votes | C proportional fairness | 80% | 62% | 0 (0) | 35% | 70% | 4.3 | 8.1 | 381 (0.6%, 8%) | 0.21 | 93%, 4.8 | 30 (55) |
| Before votes | D everyone's #1 Must | 79% | 62% | 0 (0) | 33% | 69% | 5.0 | 9.4 | 375 (2.7%, 31%) | 0.28 | 90%, 6.0 | 20 (44) |
| Before votes | D1 nobody at zero | 80% | 61% | 0 (0) | 34% | 71% | 4.2 | 10.0 | 384 (0.0%, 0%) | 0.00 | 86%, 6.3 | 12 (17) |
| Before votes | E Musts-first, then A | 80% | 61% | 1 (1) | 34% | 70% | 4.3 | 9.7 | 381 (0.8%, 22%) | -0.03 | 86%, 6.1 | 22 (38) |
| Before votes | E Musts-first, then B | 80% | 61% | 0 (0) | 34% | 69% | 4.4 | 7.7 | 376 (2.2%, 22%) | 0.20 | 90%, 4.6 | 14 (28) |
| After | A today | 78% | 58% | 3 (3) | 36% | 70% | 4.1 | 10.2 | 379 (0.0%, 0%) | 0.00 | 82%, 6.3 | 24 (53) |
| After | B equal weight | 78% | 58% | 3 (3) | 36% | 70% | 4.0 | 9.2 | 375 (0.8%, 20%) | 0.24 | 84%, 5.5 | 18 (42) |
| After | C proportional fairness | 78% | 58% | 3 (3) | 37% | 70% | 4.1 | 9.2 | 376 (0.5%, 20%) | 0.14 | 83%, 5.5 | 19 (40) |
| After | D everyone's #1 Must | 78% | 61% | 1 (1) | 33% | 69% | 4.7 | 9.9 | 373 (2.0%, 31%) | 0.16 | 85%, 6.1 | 32 (72) |
| After | E Musts-first, then A | 79% | 61% | 0 (0) | 34% | 69% | 4.3 | 9.4 | 376 (0.6%, 23%) | 0.01 | 85%, 5.8 | 36 (111) |
| After | Floor, top-ranked Must | 78% | 58% | 3 (3) | 36% | 70% | 4.1 | 10.2 | 379 (0.0%, 0%) | 0.00 | 82%, 6.3 | 27 (55) |
| After | **Floor, least-cost Must (recommended)** | 78% | 58% | 3 (3) | 36% | 70% | 4.1 | 10.2 | 379 (0.0%, 0%) | 0.00 | 82%, 6.3 | 24 (46) |

The 3 hater groups with someone at zero are all the hater: each of their 2 or 3 Musts either lost a head to head or is in the North, which the final plan does not visit.

## Limits of this test

- Simulated people, not the five friends. The scenarios bracket the cases; real ratings could sit outside them.
- Everyone votes for the side their own points favour. Real people may vote to be kind, which would shrink the minority losses.
- Finalize lists were not simulated; the code change above re-runs the floor after them.
- C's head to head run used the weights C found before the votes, fixed. Negative "cost" rows mean the method found a plan with more total points than A's: the planner's search is budgeted, so a different starting point sometimes finds a better plan.
- Speed was timed on a busy machine inside the test runner; read the numbers as relative.

## Self-check

The plan-before-votes numbers for lopsided (both lengths, 20 groups) and polarised (9 days, 40 groups) were recounted a second way: the real `groupResult` on the same 60 generated groups, Musts counted by separate hand-written code that shares nothing with the simulation's measuring helpers. Per-person Must counts match in 60 of 60 groups: lopsided 634 Musts in, 0 people at zero, lowest person 63.4% on both paths; polarised 915 Musts in, 6 people at zero, lowest person 35.8% on both paths.
