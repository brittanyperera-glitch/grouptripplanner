# Planner and group logic audit (2026-10-15)

Scope: `src/lib/ranking.ts`, `planner.ts`, `paths.ts`, `group.ts`, the live catalogue (33 items) and `legs.json`. Every finding below was reproduced with a seeded input; the throwaway sweep files that produced the numbers were deleted before commit. "Sweep" means 40 seeded people (about 15% Must, 30% Keen, 30% Meh, 25% Skip) at 3 paces and 9 or 14 days, plus all-Keen plans: 249 personal plans on the live catalogue. "Battery" means 720 personal plans (both catalogues, 7, 9 and 14 days, 3 paces).

## Decisions for Brittany

| # | Question | My recommendation | Trade-off |
|---|---|---|---|
| D1 | Should the landing day ever hold a 7.5 hour drive (airport to Jaffna)? | No: if the drive from the airport is longer than the landing half day, sleep near the airport and drive the next morning. That is what the plan's own day 1 rule (half a day) already says. | Trips that go north first lose a day of activities. Since the route order fix (F2) the planner can put Jaffna first, because the long landing-day drive currently costs it nothing: 33 of 270 test plans now overfill the landing day, against 22 before the audit. |
| D2 | Should there be a limit on driving per day, by pace? | Yes for balanced and slow: no sunrise start the morning after a 6 hour drive day, and no two 4 hour drive days in a row. | Fewer things fit, mostly for trips that include the north. |
| D3 | Should every plan that visits the hill country keep a spare half day for rain? | Yes: keep one free half day in Ella or Nuwara Eliya, as the design notes say December needs. | About one activity fewer in 146 of the 226 hill country sweep plans, which have no slack today. |
| D4 | Should each person's say be capped, so marking lots of things Must cannot outweigh someone who marked few? | Yes: scale each person's ratings so everyone has the same total weight. | Someone who loves everything gets less pull per item; today one person with 12 Musts got 10 of them in, another with 2 got 1. |
| D5 | Should everyone be guaranteed at least one vote on one of their own Musts? | Yes: if none of a person's Musts is in the plan or in a question, their top one gets a question even past the cap of 5. | Sometimes a sixth question. Today 2 of 150 seeded people have Musts, none in the plan and no question about any of them. |
| D6 | Should the item questions wait until "North or South?" is settled? | Yes: ask "North or South?" alone first, then the item questions. | Two voting rounds instead of one. Today both appear together in every seeded group, and an item question's "you would lose" side can change once the region is decided. |
| D7 | Should a single Skip block an item? | No, keep Skip as a strong minus, but show who skipped it on the item. | A group trip means sometimes doing a thing one person skipped. |
| D8 | Can you look up the Weligama to Colombo drive time in Google Maps? | Yes please, one lookup. We have no measured leg, so the planner routes it through the airport (3 h 8 min); the expressway is likely about 2 h (Colombo to Galle is 1 h 23, research/research_transport.md line 17). | None; it only makes "Colombo at the end" routes fairer. |

## Findings

Most severe first. "Fixed" rows name the commit; the red line is the failing assertion seen before the fix.

| id | severity | lens | finding | evidence: input and output | fix | needs product decision? |
|---|---|---|---|---|---|---|
| F1 | High | timing | A drive could follow an afternoon activity, so the group drove after dark and an 18:30 evening item landed after a 3 h drive that started at dusk. Kaudulla and Hurulu close at 18:00 (research/google_listings.md lines 44 and 45). | Live catalogue, all Keen, 14 days, pace 0: day 5 = elephant safari (afternoon), drive Sigiriya to Kandy 2.97 h, Temple of the Tooth puja. 81 of 249 sweep plans had a drive after an afternoon item. | Fixed in 0b8f0e0: an afternoon activity ends the day's driving, like sunset. Red: `AssertionError: day 5: Drive from Sigiriya to Kandy: expected true to be false`. After: 0 of 249. | No |
| F2 | High | optimisation | Each set of areas was tried in its cheapest-travel order only (amendment B.10 assumed direction and Colombo's position change only travel). They also decide the half arrival day, the departure day and sunrise breaks. | Musts rekawa, pettah, surf, galleface, 5 days, balanced: planner put Colombo first and dropped Rekawa; Colombo last fits all four. Trying every order on 540 sweep plans: 204 score higher (mean +3.8), 31 fit one more Must. | Fixed in 4647630, kept within the speed test by 85bcc8b: other orders are tried for the best-scoring sets within a compute budget. Trying every order would fit one more Must in 5 more of 540 test plans and score higher in 101; the budget is what keeps the planner speed test's 60 ms. Red: `AssertionError: expected [ 'rekawa' ] to deeply equal []`. | No |
| F3 | High | optimisation | The scheduler packs an area's activities strictly in slot order, so a sunrise item right after the drive in closed the arrival day and its afternoon stayed empty while a safari or sunset spot waited for a later day. | All Keen, 14 days, pace 0: day 2 = drive Colombo to Sigiriya then 6.7 h spare, elephants on day 5; day 8 = the train then 8.3 h spare, Nine Arch Bridge two days later. | Fixed in d85aa50 and ba133dd: before a daytime activity closes the day, later any, afternoon and sunset activities of the same area that fit fill it. Red: `AssertionError: expected [ 'polonnaruwa' ] to deeply equal []` (beachday, kottu, coconut, pettah, polonnaruwa in 6 days). On the battery: 570 of 720 score higher (mean +4.0), 28 fit one more Must, 3 fit one fewer (search misses: the new planner can hold the old set), 18 score slightly lower. | No |
| F4 | Medium | choosing | The cap of 5 contested items was applied before the walk, so north items behind an open "North or South?" took places and were then skipped. | Seeded group 3: 14 contested items, 2 item questions. 6 of 150 seeded people had Musts with none in the plan. | Fixed in 9e76424: the cap counts questions asked. Red: `AssertionError: seed 3: expected 2 to be 5`. After: 2 of 150 people (see D5). | No |
| F5 | Medium | choosing | "With 14 days you'd also get" came from a fresh 14-day plan that could drop items the group plan already had, so the list was not true as a whole. | 5 of 30 seeded groups: the 14-day plan dropped Udawalawe, the train, Dambulla or Coconut Tree Hill from the group plan. | Fixed in 74032f2: the 14-day plan keeps the group plan's items. Red: `AssertionError: seed 1: expected true to be undefined`. | No |
| F6 | Medium | timing | Landing day can hold a drive longer than its half-day capacity (day 1 rule B.4): the first entry is never checked. | North Musts, 9 days, balanced: day 1 = drive from the airport to Jaffna 7.43 h. 33 of 270 test plans after the fixes (22 before the audit). | Not changed; see D1. | Yes (D1) |
| F7 | Medium | timing | No limit on driving per day. | Across 249 sweep plans: 157 days with 6 h or more of driving (mostly north trips: Colombo to Jaffna 7.8 h, Jaffna to Kandy 8 h), 41 pairs of 4 h drive days in a row, 19 sunrise starts after a 6 h drive day, and 3 pack-it-in days whose last drive ends about 18:45. | Not changed; see D2. | Yes (D2) |
| F8 | Medium | timing | Rain slack only comes from spare days, so a full plan has none, while the design notes say December hill country needs it. | 146 of 226 sweep plans that visit Nuwara Eliya or Ella have no free or rain-slack day there. | Not changed; see D3. | Yes (D3) |
| F9 | Medium | fairness | Group scores add everyone's ratings with no cap per person, so rating many things Must buys more pull. | Brittany 12 Musts and Skip on the rest, Alex 2 Musts, others all Meh: 10 of Brittany's 12 in the plan, 1 of Alex's 2. | Not changed; see D4. | Yes (D4) |
| F10 | Medium | fairness | A person whose Musts all sit below others' items in group score can get no question at all. | After F4: 2 of 150 seeded people (for example seed 20, Brittany, Must Diyaluma: 5 item questions on other things). | Not changed; see D5. | Yes (D5) |
| F11 | Low | choosing | Item questions are shown while "North or South?" is still open, and several open questions name the same item on their losing side. | Every one of 30 seeded groups. Seed 1: Galle Face on the losing side of the region question and three item questions at once. | Not changed; see D6. | Yes (D6) |
| F12 | Low | choosing | Skip is minus 3, never a veto. | 4 Keens and 1 Skip = +13, so the item goes in. | Not changed; see D7. | Yes (D7) |
| F13 | Low | data | No measured Weligama to Colombo leg, so "Colombo last" routes after the south coast go via the airport (2.33 + 0.8 h). | `legs.json` has Weligama to AIR and AIR to Colombo only. | Not changed: needs a measured Google Maps time (D8). | Data only (D8) |
| F14 | Low | robustness | A stored trip length under 2 days crashed the plan worker. | `personPlan` with days 1: `TypeError: Cannot read properties of null (reading 'chosen')`. | Fixed in 204a551: lengths are clamped to the 5 to 21 the Days screen offers. | No |
| F15 | Low | timing | An area with no chosen item can appear as an overnight stop (Tissa between Ella and Weligama), which splits a 3.25 h drive into 2.1 h and 1.9 h. | All Keen 14 days: day 10 labelled Wild south with no Wild south activity. | Not changed: it helps the next morning. The day screen may want to say "overnight stop". | No (UI wording) |
| F16 | Low | timing | One evening item longer than the 3 h evening budget is allowed (the budget only limits a second one). | Rekawa turtle watch with its round trip, 4.96 h, after a full beach day. | Not changed: a turtle watch is a whole evening by nature. | No |

## Snapshot changes (planner-snapshot.json)

Each fix that moved the reference plans, old score to new score. No case scores lower after F2 and F3; the F1 drops are the cost of not driving after dark (each of those 7 old plans had a drive after an afternoon item). The speed commit 85bcc8b then moved three cases: all keen 14d pace 0 and all keen 5d pace 1 keep their score on another route, and group forceIn jaffna forceOut galle 9d goes from 212.3 to 209.4.

| case | F1 (0b8f0e0) | F2 (4647630) | F3 (d85aa50) |
|---|---|---|---|
| everything must 9d | | 190.0 to 200.0 | 200.0 to 210.0 |
| all keen 5d pace 0 | | | 56 to 60 |
| all keen 9d pace 0 | | | 88 to 96 |
| all keen 14d pace 0 | 108 to 108 | 108 to 108 | 108 to 120 |
| all keen 21d pace 0 | 136 to 132 | 132 to 136 | 136 to 148 |
| all keen 5d pace 1 | | 44 to 48 | 48 to 48 |
| all keen 9d pace 1 | | 76 to 80 | 80 to 84 |
| all keen 14d pace 1 | 104 to 100 | 100 to 104 | 104 to 116 |
| all keen 21d pace 1 | 132 to 128 | 128 to 132 | 132 to 140 |
| all keen 5d / 9d / 14d / 21d pace 2 | | | 32 to 32, 64 to 68, 92 to 96, 116 to 124 |
| mixed scores 14d pace 0 | 123 to 120 | 120 to 123 | 123 to 132 |
| group 2 north 3 south 9d | | 212.6 to 226.3 | 226.3 to 245.8 |
| group 2 north 3 south 14d | 301.0 to 295.4 | 295.4 to 303.9 | 303.9 to 331.7 |
| group forceIn jaffna 9d | | 181.8 to 214.9 | 214.9 to 228.4 |
| group forceIn jaffna forceOut galle 9d | 182.2 to 180.9 | 180.9 to 202.7 | 202.7 to 212.3 |
| group forceOut galle 9d | | 198.2 to 209.1 | 209.1 to 227.3 |

All fixes together against the pre-audit planner, on 540 seeded test plans (both catalogues, 7, 9 and 14 days, 3 paces): 62 fit one more Must and none fit fewer, 405 score higher (mean +5.4), 16 score lower. mustFitDays is shorter for 29 of the 60 people checked and longer for none. The pre-audit plans include night drives that F1 removes, so the comparison flatters the old planner.

## What is fine

- Ranking: the in-tier bonus (0 to 0.9) never lifts a Keen above a Must for one person; five people's bonuses can add up to 4.5, which only reorders items within the same mix of tiers.
- Personal plans keep Musts first, and mustFitDays' binary search matches the linear scan on every tested set.
- Item choice is close to optimal for a given route: on 24 small cases checked against every subset, 21 match exactly and the worst gap is 1.3 points.
- The train never runs too late for the 14:30 departure, no sunset item ends after dusk, and every plan ends with check-in, across all 249 sweep plans.
- Empty or degenerate input (nobody rated, everyone Skips, one person rated, empty catalogue, 21 or 30 days) does not crash; the same input gives the same plan.
- Speed: measured the way the speed tests run (one warm-up, one timed call, CPU time, on a busy machine), the all-Keen 14-day plan takes 48 to 57 ms against 52 to 58 before the audit, mustFitDays 81 to 90 against 118 to 129, and the 2-north 3-south group about 200 ms in isolation, the same as before.

## Decisions implemented (Brittany 2026-10-15)

D1 to D4: no change, as decided. "Sweep" below means 120 seeded groups (live catalogue and the 46-item fixture, 9 and 14 days, seeds 1 to 30), each voted through to a final plan, every person voting for the side their own scores favour. The sweep files were deleted before commit.

### D5: knocked down, not out

- The losing side of an item head to head (the "Keep" items when "Add" wins, the added item when "Keep" wins) is no longer force-excluded. Each Must rating of it now counts as a bare Keen (4 points, no in-tier bonus), so it comes back only when a later result makes room, and never ahead of a plain Keen on that rating. Code: `knockDown` in `src/lib/group.ts`.
- "North or South?" stays decisive: the losing region's items are still forced out, as before.
- No loops: an item knocked down and still out when its own turn comes is listed as "dropped out after an earlier result", never asked about again. Each item gets at most one question per group, checked over 30 seeded groups voted to the end, with the same result on every call.
- A plan the group voted for stays unless a re-run beats it on score (`settle`). The planner's route search is budgeted, so without this a lowered score could reshuffle it into a worse plan: in seed 5 a later "Keep" vote dropped three of the items the group had just voted to add.
- Red before the change: `AssertionError: expected [ 'aukana', 'coconut', 'crab', …(12) ] to include 'pettah'` and `AssertionError: expected false to be true` (a knocked-down Must item in the final plan). Red with `settle` removed: `AssertionError: expected [ 'aukana', 'beachday', …(12) ] to include 'dambulla'`.
- Sweep: a knocked-down item came back in 22 of 120 groups (40 items). Questions per group 7.1 before and after (854 and 855 in all); "dropped out" lines 24 before, 15 after; no question asked twice and no result changed between two identical calls, before or after.
- No existing test changed; the planner snapshot does not move (the planner is unchanged).

### D6: "North or South?" first, alone

- While "North or South?" is open, `groupResult` builds no place head to heads; they are worked out from the plan that follows its result. The Group tab says "Head to heads on places come once North or South is settled." under the region card, and once it is settled the result ("South beat North") heads the place head to heads instead of sitting in the Decided list.
- One existing test encoded the rule this replaces: "asks item questions for the south while the region fork holds the north items back" expected place questions beside an open region question. It now asks the region question alone, then checks the same 5-question cap once South wins.
- Red before the change: `AssertionError: expected [ 'region:north', …(4) ] to deeply equal [ 'region:north' ]`; on the screen, `Unable to find an element with the text: /Head to heads on places come once North or South is settled/` and `AssertionError: expected +0 to be truthy` (region result after the place card).
- Sweep, before D5 and D6, then after both: questions on the first screen 585 then 120 (4.9 then 1 per group, every seeded group has a region question); questions per group in all 7.1 then 6.8; voting rounds per group 2.3 then 3.2; a knocked-down item came back in 21 of 120 groups (35 items).

### D7: who skipped

- Skip is unchanged (minus 3, no veto). Each activity in the group plan (Group tab, "The trip") now carries a muted line naming everyone who rated it Skip, for example "Skipped by Alex and Lazza". My trip does not show it, and the trailer is left as it is. Code: `skippedBy` on `DayRows` in `src/screens/MyTrip.tsx`, filled by `src/screens/Plan.tsx`.
- Red before the change: `Unable to find an element with the text: Skipped by Alex and Lazza`.

### D8: Weligama to Colombo, estimated

- New row 38 in `research/maps_legs_extra.md`: Weligama to Colombo, 2 h, with a note starting "Estimate" (Southern Expressway; Colombo to Galle is 1 h 23 by expressway per induwara.lk, research/research_transport.md line 17, which is a road calculator figure rather than a Google Maps reading, plus about half an hour from Weligama to the expressway). `scripts/build-data.mjs` keeps "(estimate)" in the leg's src for such rows, so `src/data/legs.json` says `"src": "maps_legs_extra.md: Weligama -> Colombo 2 hr (estimate)"`. Replace the row once it is measured.
- Red before the change: `AssertionError: expected undefined to be 2`. Weligama to Colombo was 3.13 h via the airport; it is now 2 h.
- The planner snapshot uses the live legs, so it moved (a designed reference, regenerated, nothing else changed). No case scores lower; mustFitDays cases are unchanged:

| case | old score | new score | travel h, old to new |
|---|---|---|---|
| everything must 9d | 210 | 220 | 12.56 to 16.40 |
| all keen 5d pace 0 | 60 | 60 | 13.58 to 12.53 |
| all keen 14d pace 0 | 120 | 120 | 18.31 to 17.24 |
| all keen 21d pace 0 | 148 | 148 | 29.15 to 22.07 |
| all keen 5d pace 1 | 48 | 52 | 11.66 to 11.63 |
| all keen 9d pace 1 | 84 | 88 | 12.56 to 16.40 |
| all keen 14d pace 1 | 116 | 116 | 22.47 to 21.34 |
| all keen 21d pace 1 | 140 | 144 | 27.99 to 22.24 |
| all keen 5d pace 2 | 32 | 36 | 6.26 to 5.13 |
| all keen 9d pace 2 | 68 | 68 | 12.39 to 11.08 |
| all keen 14d pace 2 | 96 | 100 | 17.41 to 16.23 |
| all keen 21d pace 2 | 124 | 128 | 16.63 to 20.44 |
| mixed scores 14d pace 0 | 132 | 133 | 22.35 to 21.34 |
| group 2 north 3 south 9d | 245.8 | 255.9 | 22.60 to 20.27 |
| group 2 north 3 south 14d | 331.7 | 333.8 | 29.70 to 28.57 |
| group forceIn jaffna 9d | 228.4 | 238.1 | 27.39 to 26.26 |
| group forceIn jaffna forceOut galle 9d | 209.4 | 222.6 | 27.39 to 27.85 |
| group forceOut galle 9d | 227.3 | 232.1 | 21.40 to 22.07 |

- The new leg also changed the seed 5 votes the D5 tests were written on, so those tests now check properties over seeds 1 to 20 instead of one fixed vote list: a lost Must comes back in at least one group (red before D5: `AssertionError: expected 0 to be greater than 0`), every final score counts knocked-down Musts as Keen, and seed 38 keeps Sigiriya after later Keep votes (red without `settle`: `AssertionError: expected [ Array(16) ] to include 'sigiriya'`; 270.9 with it against 268.1). Riders on an Add side are not promised: in seed 17 a re-run that scores higher (295.9 against 293.1) drops Pidurangala.
- Sweep after D5, D6 and D8: a knocked-down item came back in 15 of 120 groups (20 items); 6.6 questions per group (791 in all); 3.1 voting rounds per group; no question asked twice; identical calls give identical results.

### Swipe only before the head to heads (Brittany 2026-10-15, design notes)

- A swipe now only picks a tier. Every item of a tier sits in one unordered spot (`setTier` in `src/lib/ranking.ts`), so all of a person's Musts score the same, and any number of items can share a tier. The "Which do you want more?" comparison (`src/components/Compare.tsx`, `startPlace`, `answer`, `canTie`, `retier`) is gone.
- The step 3 "Your ranking" screen is gone from the pre-submit flow. After the last card, "Your picks" lists the tiers with no ranks and no up or down buttons; a tier can still be changed (no comparison), then "Done, submit". "Edit my ratings" opens the same screen until the group locks.
- `MAX_TIE` is now 5 and only matters on the Finalize screen.
- Tests that encoded the replaced rule: "rate with a compare, then rerank shows 1, 2 and 3", "disables tie when the level already holds three", "offers tie when the level has room", "moves an item down and saves", "changing tier into an occupied tier opens a compare", R4 "lock during a comparison" (now: lock while editing picks), R11 "Never mind drops the pending placement" (removed: there is no comparison to cancel), and the ranking tests of binary insertion, ties up to 3 and `retier`. The e2e specs drop the comparison step (`e2e/flow.spec.ts`, `e2e/rating.spec.ts`).
- Red before the change: `TypeError: setTier is not a function`, `AssertionError: expected undefined to be 5`, `Unable to find role="button" and name "Keen"` (a comparison opened after the second Must), `AssertionError: expected [ [ 'a', 'b', 'c' ] ] to deeply equal [ [ 'a', 'b', 'c', 'd' ] ]` and `AssertionError: expected [ [ 'a' ], [ 'b' ] ] to deeply equal [ [ 'a', 'b', 'c' ] ]`.
- Ratings already saved with an order keep it until that tier is changed, when it is flattened into one spot.
