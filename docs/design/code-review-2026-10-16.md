# Code review: origin/homecoming...7ae7a58 (2026-10-16)

Reviewer: T9, fresh context. Range: `git diff origin/homecoming...7ae7a58`, 15 commits, 180 files, +8686 / -482.
Baseline at 7ae7a58: `npx tsc -b` EXIT=0; `npm test` EXIT=0, 108 files, 1074 tests passed. e2e was not run (T48 is editing those specs).

CONFIRMED means I traced it in the code and, for the group logic, reproduced it by calling `groupResult` from a scratch script (vite-node, outside the repo). PLAUSIBLE means reasoned from the code but not reproduced.

## Live-data safety verdict

**No saved row is rewritten, and no existing vote or rating changes meaning.** There is no schema change, `EPOCH` is still `2026-10-16` (src/store/fresh.ts:12, only `EPOCH_KEY` gained an `export`), fork id formats are unchanged (`ko:<id>`, `region:north`, `genre:<g>:<id>`), and `rated`, `submitted`, `final` and `choice_log` are read and written the same way. Two checks back this up:

- With no late items, `groupResult` at 7ae7a58 gives exactly what origin/homecoming gives. I ran origin/homecoming's own group.ts on the inputs in `src/lib/__fixtures__/group-baseline.json` and the output matched the fixture byte for byte.
- With scuba in the catalogue and voted down 3 to 0, 12 of 12 random vote histories (6 still open, 6 with all five lists saved) gave the same plan, open questions and lock state as origin/homecoming.

**What friends will see change after deploy:**

1. **Scuba adds a head-to-head to every group where all five have submitted.** It is `late: true` (src/data/catalogue.json, last item), so it is asked first and outside the five-question cap (src/lib/group.ts:76-81, 129, 145). While it is open, the Finalize step goes away (`finalized` empties, `final` is null, group.ts:246 and 285), same-type keep votes wait (group.ts:175), and a locked plan unlocks, which also hides the awards and the route reveal. Saved Finalize lists stay in the database and count again once scuba is settled. Reproduced: an open group with 2 lists saved went from `finalized 2, final 10 places` to `finalized 0, final null, open ko:scuba`; a locked group went to `locked false, open ko:scuba`.
2. **While that vote is open, Group trip shows the wrong plan** (S1 below).
3. **Every existing `live` suggestion is now a late item** (S2 below).
4. **If the group is not yet fully submitted,** scuba shows up as "1 new place to rate" for those who have submitted (S3 below).
5. **If scuba wins before everyone saves their list, it can quietly drop out of the locked plan** (B1 below).

Which of these apply today depends on the live data, which I could not read. Before deploying, run these in the Supabase SQL editor: `select count(*) from responses where submitted;`, `select count(*) from responses where final is not null;` and `select id, title, status from suggestions where status = 'live';`.

## Blocker

### B1. Saving the last Finalize list re-runs the head-to-heads on a different set of places, so late items can vanish and new questions can appear (CONFIRMED)

- **Where:** src/lib/group.ts:47-50 (`sealed` removes every late item from `items` for the whole first phase), with group.ts:266-267 (`if (Q.forceFailed) continue;` in the reopen loop).
- **Failure 1, a winning late item disappears:** the scuba head-to-head is won 3 to 0 before the seal and is in the plan. When the fifth list is saved, the first phase reruns without scuba, the reopen loop cannot force scuba into the new plan (`forceFailed`), and the `continue` skips it with no result and no question. The locked plan has no scuba. Reproduced in 3 of 16 random vote histories on the guest seed. In one of them the locked plan also lost crab, galleface, kottu, pettah and train and gained horton and tea compared with the plan everyone had just finalized against.
- **Failure 2, a brand new question opens at the seal:** I added a live suggestion rated Keen by three people. Before the seal everything was settled. After all five saved their lists, `ko:hiriketiya` opened (a place never asked about before) and the plan unlocked. The same state without the `late` flag locks cleanly.
- **Fix:** keep the first phase identical before and after the seal. Only late items with no settled vote should sit out of the rebuild. A late item that already has 3 votes should stay in `items` with its result, and the reopen loop must never silently `continue` past an item that has 3 "add" votes.

## Should fix

### S1. While a reopen vote is open, Group trip shows the plan from before any votes (CONFIRMED)
- **Where:** src/screens/Plan.tsx:13 (`group.final ?? group.base`) with src/lib/group.ts:288 (`final` is null whenever a question is open).
- **Scenario:** a locked 10-place plan reopens for scuba. Group trip now shows `base`, the plan built from raw ratings: 16 places, with diyaluma, horton and knuckles missing and 9 places the group voted out back in, labelled "Provisional until the knockouts are done". Brittany's rule (group.ts:258-259) is that "the rest stays".
- **Fix:** return the pre-reopen plan as a provisional plan, for example `provisional: P` on `GroupResult`, and show that instead of `base`.

### S2. Existing live suggestions change behaviour (CONFIRMED in code; impact depends on live rows)
- **Where:** src/state.ts:79 sets `late: true` on every `live` suggestion.
- **Scenario:** a suggestion approved last week and rated during the normal round is now always forced into a head-to-head, even if nobody rated it Must or Keen. It no longer uses one of the five question places, so a sixth ordinary question can appear for an open group (group.ts:129, 145). At the seal it is taken out and asked again (B1).
- **Fix:** only mark suggestions approved after all five submitted as late (a timestamp or a column), or confirm with the SQL above that there are no live rows today.

### S3. Late items are still put in front of people to rate (CONFIRMED)
- **Where:** src/App.tsx:303-305 (`unrated` is every item not in `rated`, late or not), src/lib/openItems.ts:39, the Picks badge, and the "N new to rate" button at App.tsx:379-380.
- **Scenario:** while not all five have submitted, everyone who has submitted gets "1 new place to rate" for scuba, and anyone still rating gets scuba in the deck. The type comment says late items are "never rated" (src/types.ts:16).
- **Fix:** filter `late` items out of `unrated` and out of the Rerank list.

### S4. The guest demo gets stuck on a same-type keep vote (CONFIRMED)
- **Where:** src/guest/MemoryStore.ts:42 (the example crew only copies the guest on `ko:` forks); src/lib/group.ts:180-182 and 113-114 count only the five trip members.
- **Scenario:** with the guest seed, once the place head-to-heads are done, `genre:trainviews` opens. The guest's ticks are stored but never counted, the crew never votes, and the hub says "Still to vote: Brittany, Alex, Antek, Lazza, Saulie" for good. A `region:north` question would get stuck the same way.
- **Fix:** have the crew copy the guest's vote on `genre:` and `region:` forks too, and add a test that drives the seed to a locked plan.

### S5. Guest mode shows the five real friends to anyone with the link (CONFIRMED; needs Brittany's call)
- **Where:** src/guest/seed.ts:12-16 (real first names), src/screens/GroupHub.tsx:91 (CrewStrip selfies), Everyone, knockout tallies, Avatars.
- **Scenario:** "Try it as a guest" on the landing page needs no password. A visitor sees Brittany, Alex, Antek, Lazza and Saulie, their character art and selfies, next to made-up picks. A banner says the picks are examples, and no real data or network call is involved: the guest uses MemoryStore, the password gate is skipped, and the database rejects any name outside the five (supabase/schema.sql:2, 14, 24).
- **Fix:** either fictional names and art for the example crew, or confirm the friends are happy to be shown.

### S6. The tests never run the catalogue as it is deployed (CONFIRMED)
- **Where:** src/lib/group.late.test.ts:12, src/lib/group.reopen.test.ts:10, src/lib/group.test.ts:199 and src/lib/genre.test.ts:10 all remove `scuba` with `.filter(i => !i.late)`. The comment in group.reopen.test.ts:9 says that scuba "would add a fork to every state". That is the live effect, and nothing tests it.
- **Scenario:** B1 and S1 pass the whole suite.
- **Fix:** add a seal-stability property test that uses the full catalogue. For random vote paths, the plan and open questions just after the fifth list is saved should equal the plan before it, plus the lock.

### S7. A late item that cannot fit is skipped without a word (CONFIRMED path; PLAUSIBLE in real data)
- **Where:** src/lib/group.ts:136 (`if (Q.forceFailed) continue;`), and group.ts:267 after the seal.
- **Scenario:** if the group goes north and the plan cannot reach Weligama, scuba is never asked and nothing says why. An approved suggestion can disappear the same way.
- **Fix:** record a "could not fit" result so Decided lists it.

## Nits

- **N1, duplicate helper:** the idea key is written twice, at src/lib/openItems.ts:28 and src/screens/Suggest.tsx:10-11. Export one.
- **N2, duplicate logic:** the late `fit` block is repeated at group.ts:155-156 and 279-280. The reopen loop (group.ts:263-283) re-implements the contested loop, and the "latest vote per person" map is now written five times in group.ts. A small `tallyFor(forkId)` helper would remove most of it.
- **N3, dead code:**
  - `.premiere-todo` in src/screens/Premiere.css:17 is unused now that the "Still to go" list is gone.
  - `selfieSrc` (src/screens/profileCard.ts:313) is only used by tests.
  - In src/guest/deviceState.ts:47, `k !== EPOCH_KEY` can never be false for a `tp:` key, because the key is `tp-epoch`. The new export of `EPOCH_KEY` exists only for that check.
- **N4, copy:**
  - "Accommodation battles / Loading. Coming soon." (GroupHub.tsx:87) reads like a stuck spinner.
  - "The TownCCTV" (copy.json) is missing a space.
  - "Mr and Mrs Keen" reads oddly with one winner.
  - ItemSheet dialogs are named "Add", "Keep" or "Extra", which is thin for a screen reader.
  - No em dashes, curly-quote delimiters or placeholder text in the added user-visible strings (swept with grep).
- **N5, merged ideas:** approving a merged idea marks the other people's rows `rejected` (Suggest.tsx). Their credit is lost, and they see their idea vanish. A pending idea with the same title as one already live is not merged, so it becomes a second head-to-head. PLAUSIBLE.
- **N6, two tabs:** if a friend has the trip open in one tab and runs a guest session in another on the same phone, `restoreTp` (deviceState.ts:14-18) wipes any `tp:` writes the trip tab made in the meantime, including unsent saves. PLAUSIBLE, low.
- **N7, fixture coupling:** the group tests use the guest demo seed (`seedState`) as their fixture, so editing the demo crew silently changes core group tests.
- **N8, performance:** `useGroupResult` is still called once, in Flow. A cold `groupResult` call with scuba is about 15% slower (8 calls took 113 ms against 97 ms) and runs in the worker. `groupAwards` (App.tsx:310) recomputes on every provider render while locked, because `items` is a new array each time. It is cheap. No action needed.

## Changed tests, judged

| Test | Change | Verdict |
|---|---|---|
| src/App.test.tsx | "Still to go" assertion removed; plan checked under My trip > Group trip | Fine: the list was removed from Reveal.tsx and the plan moved |
| src/screens/results.test.tsx | Must/Keen chip assertion inverted; Approve-after-open tests inverted | Fine: follows the decisions in the diff |
| src/screens/region.test.tsx | Finds options by the `.pick` class instead of role | Weaker but OK: the vote is still clicked by role |
| src/screens/GenreVote.test.tsx, fixes.test.tsx | Open "Decided N" first | Fine |
| src/screens/Profile.test.tsx, e2e/profile.spec.ts | Selfie layout and fallback tests replaced by full-body art tests, including a fallback test | Fine: the selfie left the card |
| src/lib/group.test.ts, genre.test.ts | Late items filtered out | Hides the deployed config (S6) |
| e2e/flow.spec.ts | Accepts either the knockouts block or Finalize | Softer: no longer pins which screen shows |
| e2e/drag-rank.spec.ts | Vote loop wrapped in `toPass` with 2 s click timeouts | Can mask flakiness |
| src/lib/__fixtures__/group-baseline.json | New "pre-change" fixture | Verified: equals origin/homecoming's output |

The new tests I read (group.late, group.reopen, MemoryStore, outstanding, openItems) assert concrete values and can fail. Test (f) in group.late was checked against the real base code.

## Not checked

- The real Supabase rows. Run the SQL in the verdict before deploying.
- e2e on 7ae7a58: not run, because T48 is editing the specs. Under the catalogue as deployed, scuba adds a fork to every e2e group flow.
- Anything visual in a browser: layout, the awards overlay, hostels, the profile card PNG.
- Licences for the 43 hostel photos and the new player art.
- Idle-reset behaviour on a real phone (backgrounded tabs, iOS timers).

No mid-task corrections or other messages arrived during this review.
