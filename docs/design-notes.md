# Sri Lanka trip planner: design notes (draft, in review)

Working notes for the brainstorm. The approved version becomes the spec in `docs/superpowers/specs/`.

## Decisions so far (Brittany, 2026-10-14)

| Topic | Decision |
|---|---|
| Group | 5 friends, flying from the UK, Poland and the US. Flights not booked |
| Dates | Early-to-mid December 2026 |
| Trip length | Each friend answers 9 / 14 / flexible / custom. Combined logic (see Section 1) |
| Accommodation | Out of scope until the itinerary is decided |
| Options | Brittany curates (with Claude); friends can suggest more, and Brittany approves them |
| Fitness | "Bring it on" |
| Preference input | Must / Keen / Meh / Skip per activity |
| Conflicts | Nobody's picks are ignored. Each person gets an optimised plan; once everyone has voted, contested items go to head-to-head group votes |
| Ordering | Route order must respect real travel times |
| Splitting up | No. The group always stays together |
| Pace | Depends on each activity's real duration; also asked as a vote |
| Access | One shared link; tap your name; no signup |
| Feel | Playful voting game first, then a practical plan |
| Option pool | Classic circuit plus adventure stops. Updated 2026-10-14: Brittany asked to add northern suggestions ("people can decide as they decide"), so North (Jaffna) and East coast (Trincomalee) options are in, each carrying a December monsoon warning rather than being filtered out. Also added from her original list: the biggest Buddha statues (Wewurukannala, Buduruwagala, Aukana), turtles (Rekawa night watch, Hikkaduwa snorkel with a welfare note), and a better-rated tea estate |
| Adam's Peak | Dropped. Season opens on Unduvap Poya, Wed 23 Dec 2026, after the trip window |
| Build | Static web app on Vercel plus a Supabase database |
| Deadline | Voting open within about a week (~21 Oct). Train seats release 30 days ahead |
| Personal flair | Once the activity list is final, Brittany writes an opening message, a one-liner on each activity card, and quips shown after each answer. The app stores these as editable copy, not hardcoded strings |

| Friends | Brittany, Alex, Antek, Lazza, Saulie |
| Rating flow (2026-10-14) | Activities come up one at a time. You pick a tier, then compare against what is already in that tier, Beli-style, by halving. Up to 3 items can be tied at one spot; a 4th must go higher or lower. Once everything is rated, a re-rank screen lets you move items up or down |
| Knockouts | Beli-style head-to-head is for the group's contested items at the end only, not for first ratings ("they haven't been to any of them") |
| Activity cards | Real photo (credited), a brief Google description, one line from a Google review, Brittany's own description and comment. Brittany's descriptions come from Claude interviewing her once the list is final |
| Google text (2026-10-14) | The About line is written by Claude from the facts on each place's Google listing, not copied. Brittany picks each review line herself during her quick-fire interview, from the Google link on each card |
| Brittany's take | Quick-fire interview, one place at a time with 2-3 prompts; Claude tidies her answers and she approves them |
| Scope (2026-10-14) | Claude writes the spec and plan, builds the whole app and tests it locally, using cheapskate model tiering. Brittany's items (signups, keys, her copy, curation) are left to the end |
| Hosting | Private GitHub repo, Vercel, Supabase. Brittany signs up and pastes the keys at the end |
| Visibility | Once the group stage opens, everyone sees everyone's ratings |
| Admin | No admin link. Brittany's copy arrives through Claude in chat. The waiting screen shows who is still voting. The group stage opens automatically when all 5 submit. Suggestion-approve buttons appear only when "Brittany" is the selected name (same trust level as pick-your-name) |
| North vs South (2026-10-14) | Brittany: when north and south genuinely conflict after voting, settle it once in the tie-break stage. One "North or South?" knockout: north on the left with the list of liked northern items, south on the right with the southern items it would replace. It appears only when going north would drop someone's southern Must or vice versa. It resolves at 3 votes, before the item knockouts |
| Applying shortlist picks (2026-10-14) | Wait for Brittany's "done". Read `picks` from the shortlist page db (source of truth, her paste only confirms it). Removed places leave the app. Review lines are cleaned to the quote only (drop reviewer name, "Google Review" tag, "Local Guide" stats). Text she put in the message box on Elephant safari, Polonnaruwa and Anuradhapura is a review line. Approved with no keep/remove (Wewurukannala, Rekawa) stays undecided. Friends never see Google star ratings |
| Best of each kind (2026-10-14) | Brittany: at the end, sort by category. Where the group's plan holds several of one type (e.g. multiple temples), research the most-recommended options and let people stick or switch, so the plan has the best of each variety. Proposed shape: a step after the knockouts and before the final plan; a card per category with 2+ picks showing current picks next to the top-ranked alternatives (researched, sourced); stick or switch resolves at 3 votes like other forks. Her answers: pre-research the likely categories now (temples, hikes, safaris, viewpoints, beaches); show top 5 alternatives per card |
| Colombo | Added to the activity pool (2026-10-14); it sits at the start or end of the route, next to the airport |
| Section 1 | Approved by Brittany on 2026-10-14 ("happy with the design") |
| Mockup look | No side rails or notes panels around the phone; Brittany called those the AI giveaway. Placeholders for her copy are empty slots, not words written in her voice |

Clickable mockup of Section 1: `docs/mockups/section1-flow.html` (photos and credits in `docs/mockups/img/`).

## Facts that shape the route (sources in `research/`)

- The Kandy to Nanu Oya rail section has been closed since Cyclone Ditwah (Nov 2025); the official target for reopening is "end 2026 or early 2027". Nanu Oya to Ella is open (09:00 and 14:30, about 2.5 h). So the scenic train is the Nanu Oya to Ella section only, after a drive from Kandy.
- The Central Expressway gives no shortcut north. Airport to Sigiriya is about 2.8 h by free-flow routing; guides say 4 h or more.
- December is wet inland. Ella/Badulla averages about 17 rain days, so the plan needs weather slack.
- Elephant gatherings in December are at Kaudulla and Hurulu, not Minneriya.
- Yala is open in December (its annual closure ran 14 Sep to 15 Oct).
- No ethically poor animal attractions: no Pinnawala elephant orphanage, no turtle hatcheries. For whale watching, only operators with responsible-watching practice.

## Section 1: how it works (in review)

### Friend flow
1. **Pick your name**
2. **Your days**: 9 / 14 / flexible / custom N
3. **Pace vote**: pack it in / balanced / slow
4. **Tier the activities**: cards grouped by region, each card showing its real duration, cost and honest notes. A live day meter shows whether your Musts fit in your days.
5. **Suggestion box**: free text. Brittany approves an idea before it becomes a card.
6. **Your trip**: the optimiser builds your personal best route. Its route line draws across a map of Sri Lanka, and a day-by-day plan sits underneath.

### Group phase (opens when all 5 have submitted)
7. **Group plan** for the length everyone can do. Score = everyone's tiers combined (Must 10, Keen 4, Meh 1, Skip -3).
8. **Contested items**: where something is a Must or Keen for someone but cannot fit, the app builds head-to-head forks between real alternatives (e.g. "Yala leopards vs Kitulgala rafting"). All 5 vote, and 5 voters means no ties.
9. **Final reveal**: the route animates in. Then a practical agenda covering travel legs, times, booking deadlines, Poya and weather notes.
10. **"With 14 days you'd also get..."**: the extra items people liked, and the route that adds them.

### Days logic
- **Group length** = the shortest committed length (a "flexible" person counts as 14).
- If someone's Musts do not fit their own days, they get a warning straight away: "fits in 14, not 9".

### Optimiser
- The route follows a fixed geographic chain, tried in both directions:
  airport -> Cultural Triangle -> (Kitulgala) -> Kandy -> hill country -> Ella -> safari -> south coast -> airport
- Each region can be skipped and given 0 to 4 nights.
- Days are split into morning and afternoon slots. Drive legs use real per-leg times and consume slots.
- Activities carry time-of-day rules (sunrise, morning safari, 09:00 train).
- Small enough to brute-force in the browser: under about 10k combinations, scored, best kept.

## UI decisions, Brittany 2026-10-15
- Friendship stats: pair agreement, your travel twin, your biggest clash, and the most divisive place. Shown only after all five vote.
- Trailer: 15 s auto-play of the route day by day, tap to skip, ends on the poster.
- Poster: 9:16 movie poster with all five full-body avatars, title, route, dates and a "starring" credits line.
- "Best of each kind" step: dropped.
- Keep every raw choice: each swipe tier, re-rank, head-to-head and swap is saved as an append-only history (never overwritten), so Brittany can read everyone's starting opinions and edit the list from them. Today responses and knockout votes are upserts (src/store/supabase.ts:58, :76), so first opinions are lost on change.
- Raw choices: a hidden page only Brittany can open (secret link), one table per friend, with a Download CSV button; also logged in the database.
- Photo credit: hidden behind a small "i" button on the photo, nothing printed over the image.
- Swipe cards get a small category chip next to the area (e.g. COLOMBO · FOOD).
- Vibration only on swipe (bigger buzz on Must); no sound.
- Quip burst plays on Must and Skip only; Keen and Meh slide away quietly.
- First card plays a one-time animated demo of the four swipe directions.
- Waiting screen: avatars with who's done; no nudge button.

## Logic decisions, Brittany 2026-10-15 (from docs/review/logic-audit.md D1-D8)
- D1 Landing day: any drive allowed on day 1, including the 7.5 h airport to Jaffna (no change).
- D2 No daily driving limits. D3 No rain slack half day. D4 Raw totals: more Musts means more pull (no per-person scaling).
- D5 Her words: "the rejected musts shouldnt be completely knocked out, but knocked down". A Must that loses a head to head is demoted, not removed, so it can come back if room opens.
- D6 "North or South?" is voted first, alone; place head to heads come after it is settled.
- D7 Skip stays a strong minus (no veto); each planned item shows who skipped it.
- D8 Weligama to Colombo: use an estimate of about 2 h (Southern Expressway; Colombo to Galle measured 1 h 23, research/research_transport.md) until measured in Google Maps.
- Characters: Brittany's image-AI characters (lineup pose + selfie per person) replace the drawn avatars.
- D5 mechanism (Brittany chose 2026-10-15): a Must that loses a head to head is scored as if each Must rating of it were Keen, and is no longer force-excluded.
- Selfies (Brittany 2026-10-15): a Selfie button on the character page shows that person's emote; the Group results show the five selfies as the crew.
- Final ranking (Brittany 2026-10-15): after the head to heads, everyone gets a "Finalize your list" screen pre-filled with their ranking; they move items up and down, up to 5 may share a spot (draw cap 5 everywhere, was 3). The group plan is rebuilt from the final lists; head to head winners stay in and losers stay knocked down to Keen unless re-ranked.
- Clarified (Brittany 2026-10-15): draws exist ONLY on the final self-ranking screen. Before the head to heads people just swipe tiers (any number of Musts, Keens, Mehs, Skips) and submit: no in-tier "which do you prefer" comparisons and no step 3 ranking screen. The final screen is pre-ordered by tier for them to tweak, with up to 5 per draw.
- Route reveal (Brittany 2026-10-15): replaces the trailer. After the lock, the tuk-tuk drives the winning route on the map, stops appear in sequence, and short one-line compromise cards pop at the relevant stop (max 5, biggest first): North or South result with the vote, close head to heads, planned places someone skipped, knocked-down Musts that came back, Musts that did not fit. Ends on the poster.
- Guide (Brittany 2026-10-15): unlocked once you submit your votes (shown from the waiting screen and as its own tab after). Sections: Britt's food, fruit, desserts and beach picks (docs/guide/food.md, her original words from her notes, gaps drafted in her tone and tagged), packing list (draft) and Sinhala phrases with pronunciation (docs/guide/packing-and-phrases.md, for her to proofread).
- Name and opening (Brittany 2026-10-15): the app is called "The Homecoming". Opening screen sleek and professional, much less orange, in the style of photo-candidates/homecoming-reference.png (full-bleed photo, small SRI LANKA / DEC 2026 kicker, clean big title, cream pill button). Quips and reactions slower and gentler so they can be read.
