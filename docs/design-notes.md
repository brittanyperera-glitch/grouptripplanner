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
| Option pool | Classic circuit plus adventure stops. No north or east (monsoon, long drives) |
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
