# Trip Picker: design spec

Status: written 2026-10-14 from the approved Section 1 design (`docs/design-notes.md`, mockup `docs/mockups/section1-flow.html`). Brittany delegated the build ("plan the app, do as much as you can, leave any items for me at the end"), so her spec review is one of the end items.

## 1. What it is

A phone-first web app for five friends (Brittany, Alex, Antek, Lazza, Saulie) to plan a December 2026 Sri Lanka trip. Each person rates activities one at a time, ranks them Beli-style, and sees their own best route. When all five are done, the app builds a group plan for the shortest committed trip length. Clashes go to head-to-head knockouts, and a "with 14 days" list shows the extras.

Success means all five submit within a few days of getting the link, and the final plan is one the group books from without re-arguing it in the chat.

## 2. Constraints carried from the interview

- No accounts. One shared link; you tap your name. No admin link. Approve buttons for suggestions show only when "Brittany" is the selected name.
- The group never splits. Contested items go to group knockouts.
- Everyone's ratings are visible to everyone once the group stage opens.
- Trip length per person: 9, 14, flexible (counts as 14) or a custom number from 5 to 21.
- Pace vote: pack it in, balanced or slow.
- Brittany's copy (welcome message, quips, a "take" per activity, a review line per activity) is hardcoded in `src/content/copy.json` before launch. The app renders empty slots gracefully until it is filled.
- Out of scope: accommodation, budgets, flights, the north and east of the island, Adam's Peak (its season opens 23 Dec 2026).

## 3. Stack

- Vite, React 18, TypeScript (strict), plain CSS with tokens ported from the mockup.
- Supabase for shared state: Postgres plus the JS client, using the anon key and permissive row-level security policies. This is the same trust level as pick-your-name; the trade-off is that anyone with the link can write.
- `LocalStore` (localStorage) implements the same interface. It is used when `VITE_SUPABASE_URL` is unset, for dev, tests and the demo before Brittany creates the project.
- Vercel static hosting. Vitest for unit tests. Playwright with the system Chrome (`channel: "chrome"`) for one end-to-end run.

## 4. Data (static, bundled)

`src/data/catalogue.json` is generated from `data/catalogue.json`. Each item has:
- `id`, `name`, `area`, `about`
- `hours`: time on site
- `slot`: one of sunrise | morning | afternoon | sunset | evening | late | any
- `fee`, `book?`, `warn?`, `photo?`
- `google?`: `{rating, reviews, url}`
- `sideTrip`: round-trip drive hours from the area hub; 0 when the item is at the hub.

Areas, hubs, and the default route order (forward direction):

| Area | Hub |
|---|---|
| Colombo | Colombo |
| Cultural Triangle | Sigiriya |
| Kandy and Knuckles | Kandy |
| Kitulgala | Kitulgala |
| Hill country | Nuwara Eliya |
| Ella | Ella |
| Wild south | Tissa if Yala is chosen, else Udawalawe |
| South coast | Weligama |

The trip starts and ends at the airport (AIR).

`src/data/legs.json` holds measured Google Maps driving hours between hubs: an undirected edge list with a source note per edge. The planner runs Floyd-Warshall over it, so skipping an area uses the shortest real path. Every value comes from `research/google_listings.md` or `research/maps_legs_extra.md`; none is typed from memory.

`src/content/copy.json` holds Brittany's text:

```json
{"welcome": "", "quips": {"name": "", "days": {}, "pace": {}, "tier": {}}, "items": {"<id>": {"take": "", "review": "", "reviewUrl": ""}}}
```

Photos: `public/img/<id>.jpg` (Wikimedia Commons), credits in `public/img/credits.json`, each shown as a caption on the card.

## 5. Ranking model (`src/lib/ranking.ts`, pure)

`Ranking = Record<Tier, Level[]>`, where `Tier = must | keen | meh | skip` and `Level = string[]` (ids, length 1 to 3). The tiers are ordered must > keen > meh > skip, and level 0 is the best.

- `startPlace(r, id, tier)`
  - If the tier is empty, it inserts `[[id]]` and returns `null`.
  - Otherwise it returns `Pending {id, tier, lo: 0, hi: levels.length, steps: 0}`.
- `compareTarget(r, p)` returns `levels[floor((lo+hi)/2)]`. The UI shows its first id.
- `answer(r, p, "new" | "old" | "same")`
  - `same`: adds the id to the mid level. Allowed only if that level has fewer than 3 items, otherwise it throws.
  - `new`: sets `hi = mid`.
  - `old`: sets `lo = mid + 1`.
  - When `lo == hi`, it inserts a new level `[id]` at `lo` and returns `null`. Otherwise it returns the updated pending.
- `move(r, id, -1 | +1)`
  - If the item shares a level, it splits out into its own level directly above or below.
  - If it is alone, it joins the neighbouring level if that level has fewer than 3 items. Otherwise it jumps past it as its own level.
  - It never crosses a tier boundary.
- `retier(r, id, tier)`: removes the id and starts placing it in the new tier.
- `labels(r)`: rank numbers across tiers, with ties written as "2=".
- `score(r, id)`: base must 10, keen 4, meh 1, skip -3, unrated 0. A within-tier bonus is added: `0.9 * (1 - levelIndex / max(1, levelCount - 1))`. So level 0 gets +0.9 and the last level gets +0, and Skip goes from -3 to -2.1. The bonus orders choices inside a tier but can never lift a Keen above any Must.

Invariants, tested: no level is empty; no level has more than 3 items; every rated id appears exactly once; `score` is monotonic in rank order.

## 6. Planner (`src/lib/planner.ts`, pure)

`plan({items, scores, days, pace, legs, forceIn?, forceOut?}) -> Plan`

**Day budget**
- Usable hours per full day: pack 11, balanced 9, slow 7.
- Day 1 (arrival) and day N (departure) each get half.
- The departure day also has to hold the final drive to the airport plus a 3 h check-in buffer.

**Candidate routes**
- Two directions: forward (Colombo, Cultural Triangle, ..., South coast) or reverse.
- Colombo can come first or last.
- An area is in the route when at least one chosen item is in it.

**Search**
1. Enumerate the area subsets that contain at least one positive-score item (at most 2^8), times the direction and Colombo variants.
2. For each candidate, the travel cost is AIR, the hubs in order, then AIR, using shortest-path hours.
3. Train special case: if `train` is chosen and the route goes from Hill country straight to Ella, that leg costs 0, because the 2.5 h train item is the transfer.
4. The remaining budget is the total day budget minus travel.
5. Run a 0/1 knapsack over the items in the route's areas that have score > 0 (or are forced in). Weight is `hours + sideTrip`, in 0.25 h units. Value is the score.
6. Keep the candidate with the highest total value. Ties go to the lower travel time.
7. `forceIn` items must be included or the candidate is infeasible. `forceOut` items are removed.

**Schedule**
- Walk the areas in route order and pack day by day, starting a new day whenever the budget would be exceeded.
- Items within an area are ordered by slot (sunrise, morning, afternoon, sunset, evening, late), with "any" filling gaps.
- At most one sunrise or "gate opening" item per day.
- Each day records its activities, its drives (with hours), and its spare hours.
- A day with 3 or more spare hours in Hill country or Ella is labelled "rain slack".

**Output**
- `{route, days: Day[], chosen: ids, dropped: ids with score > 0, travelHours, fits: boolean}`
- `fits` is false if any Must for the scoring person was dropped.
- `mustFitDays(scores, ...)` returns the smallest N from 5 to 21 at which every Must fits. It powers "fits in 14, not 9".

Performance target: under 150 ms for 37 items on a phone. Memoise shortest paths.

## 7. Group logic (`src/lib/group.ts`, pure)

- **Group days:** the minimum of the committed lengths. Flexible counts as 14.
- **Group pace:** the median of the pace votes.
- **Group score:** the sum over persons of `score(r_p, id)`.
- **Base plan:** `plan(groupScores, groupDays, groupPace)`.

**Contested items** are items not in the base plan that are a Must for at least one person, or a Keen for at least two. They are sorted by group score and capped at 5.

**Knockouts.** For each contested item c, re-plan with `forceIn: [c]` and diff against the base plan to get R, the items removed.
- If R is empty, c simply fits and is added.
- Otherwise the knockout is "c vs R". R is shown as one side, for example "Polonnaruwa vs Ella Rock and Lipton's Seat".
- The fork id is `ko:<c>:<sorted R ids>`, so it is deterministic and every client computes the same forks.

**Resolution**
- Once all 5 have voted on a fork, the majority wins.
- The final plan uses the winners as `forceIn` and the losers as `forceOut`.
- Any forks invalidated by an earlier result are recomputed, at most 2 rounds.

**Extras:** items in `plan(groupScores, 14)` that are not in the final plan, each with who rated it Must or Keen.

## 8. Storage (`src/store/`)

`interface Store` methods:
- `load()`
- `saveResponse(name, patch)`
- `submit(name)`
- `addSuggestion(...)`
- `setSuggestionStatus(id, status)`
- `vote(forkId, name, choice)`
- `subscribe(cb)`

Supabase tables (`supabase/schema.sql`):
- `responses(name text primary key, days int, pace int, ranking jsonb, rated text[], submitted boolean default false, updated_at timestamptz)`
- `suggestions(id uuid primary key default gen_random_uuid(), name text, title text, area text, note text, status text default 'pending', created_at timestamptz default now())`
- `knockout_votes(fork_id text, name text, choice text, primary key (fork_id, name))`

Realtime is subscribed on all three tables. Names are checked against the fixed list of five in a CHECK constraint.

Live suggestions become rateable items: default `hours: 2`, `sideTrip: 0`, slot "any", tagged "suggested by X".

## 9. Screens

Visual language, ported from the mockup:
- Archivo type, coconut-orange and tea-green tiers, a full-bleed photo card, both themes.
- The phone layout is the whole app; the desktop view centres it at max width 440.
- No side rails.

| # | Screen | Notes |
|---|---|---|
| 1 | Pick your name | Shows the welcome copy |
| 2 | Days | 9 / 14 / flexible / custom stepper |
| 3 | Pace | 3 options |
| 4 | Rate | One card at a time: photo, About, facts line, warn line, Google rating with link, review line, Brittany's take, 4 tier buttons. A quip toast after each answer. Progress "n of N" |
| 5 | Compare | Inline after a tier pick when needed; "tie" is disabled when the level holds 3 |
| 6 | Re-rank | Tier groups, up/down moves, "change tier" control, "Done, submit" |
| 7 | Suggest | Text, area select; pending and live lists; Brittany sees approve/reject |
| 8 | My trip | Map (schematic SVG from the mockup), day list, "fits in N" warning |
| 9 | Waiting | Who is done |
| 10 | Knockouts | Shows everyone's tiers on each side |
| 11 | Plan | Map, days, drives, book-ahead list (train seats open 30 days ahead, Ministry of Crab 2-3 weeks ahead, Yala jeep), heads-up list |
| 12 | Everyone's picks | A grid of the five people's tiers per item |
| 13 | With 14 days | |

Navigation is linear for a new person. After submitting, there are tabs: My trip, Group, Everyone. Ratings stay editable until the group stage opens, then lock.

## 10. Error handling

- A store failure shows an inline "couldn't save, tap to retry" and keeps local state.
- Missing photo: show a solid area-colour block with the name.
- Empty copy fields are hidden, never shown as blank boxes.
- If nothing fits (for example, all Musts in a 5-day trip), the plan shows what fits and the warning.

## 11. Testing

- **Unit, Vitest:**
  - ranking invariants, including a random-operation fuzz of 500 steps
  - planner on fixtures: the 9-day all-Musts case fits; 37 items Must at 9 days drops items and reports `fits: false`; the train transfer zeroes the Hill country to Ella leg; skipping an area uses the shortest path; forceIn and forceOut are honoured
  - group: contested detection, deterministic fork ids, majority resolution
- **End to end, Playwright:** five people rate with LocalStore, the group stage opens, one knockout is resolved, and the plan renders.
- **Screenshots:** 390 px and 1280 px, light and dark.

## 12. Brittany's end items

- Review this spec.
- Curate the catalogue.
- Fill `copy.json` through the chat interview.
- Photos for the zipline and Hiriketiya.
- Create the GitHub repo, the Supabase project (run `schema.sql`) and the Vercel project, and paste the 2 env vars.
- Send the link.
