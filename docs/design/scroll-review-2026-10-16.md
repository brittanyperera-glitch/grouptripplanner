# The Homecoming: what gets buried inside each tab (16 Oct 2026)

Read-only review (task T20). Nothing in the app was edited. The earlier structure review (`ia-review-2026-10-16.md`) covered which tab holds what. This one looks inside each tab: how long it is, and what sits too far down.

## How this was measured

- The running app at 390 x 844 (one phone screen), Chrome, light theme.
- Two runs:
  - **Member**: local-only database (no Supabase keys here), playing as Brittany with seeded rows for the other four. Driven through every stage: rating, waiting for others, group stage (5 votes owed), finalize, locked.
  - **Guest** (`#/guest`): played as Tuktuk, rated every place, submitted, voted. Guest reached the group stage but not finalize (see section 6).
- For every tab and sub-view: page height, and each top-level block with its distance from the top.
- **Units.** 1 screen = 844 px. "y 2.5" means you scroll two and a half phone screens to reach the top of that block. The sticky header and tab bar cover about 0.14 of a screen, so **the first screen shows content down to about y 0.9**.
- Other agents edited `App.tsx`, `MyTrip.tsx`, `group.ts`, `Knockouts.tsx` and more while I worked. The first run hit 52 live reloads in a few minutes. For the runs below I started the dev server with file watching off, so all numbers come from one snapshot of the working tree taken about 12:55 on 16 Oct (HEAD `4f70013` plus uncommitted edits). The vote banner, tab badges, Open items page and Awards takeover were all new in that snapshot.
- Screenshots: `$TMPDIR/t20/shots/` (temp folder, will not survive a reboot). Raw numbers: `$TMPDIR/t20/member-measures.json`, `guest-measures.json`.

---

## Length of every tab, in screens

Flags: **bold** = over 4 screens. "Buried" = something important below y 1.5.

| Tab / view | Rating | Waiting | Group stage (votes owed) | Finalize | Locked |
|---|---|---|---|---|---|
| Rate card | 1.39 | | | | |
| Your picks (before submit) | 3.72 | | | | |
| My trip > My trip | | 3.69 | 3.86 | 3.67 | 3.67 |
| My trip > Group trip | | not open | **5.46** | **4.93** | **4.80** |
| Picks | | 3.77 | 1.00 (lock block only) | 1.00 | 1.00 |
| Group (hub, or Waiting) | | 1.00 | 1.00 | 3.84 (Finalize screen) | 1.00 |
| Group > Group stats | | | 1.00 | 1.00 | 1.00 |
| Group > Knockouts | | | 3.47 (5 open) | | 1.00 (Decided only) |
| Group > Everyone's picks | | | 2.60 | 2.60 | 2.60 |
| Suggest | | 1.00 | 1.00 | 1.00 | 1.00 |
| Guide (Phrases / Food / Fruit / Desserts / Beaches) | | 2.48 / 2.52 / 2.29 / 1.76 / 1.11 | same | same | same |
| Profile (Card / Character) | | 1.00 / 1.09 | same | same | same |
| Menu > Open items | | | 1.00 | | |
| Awards takeover (own scroll) | | | | | 3.79 |

Guest run: same shapes. Group trip 5.24, My trip 3.70, Picks 3.77 (guests keep the editable list), Knockouts 3.52.

---

## 1. Tab by tab: every block, where it sits, and a verdict

Verdicts: **keep**, **move up**, **collapse** (behind a headline that carries the number), **move elsewhere**, **cut**.

Proposed headlines below use example numbers to show the shape. Measured values: "Travel twin Lazza 91%", "1 thing to book soon" at lock, "Mehs 26", 9 awards. The tip count, "Decided" count and "places 3 or more of you must" count are placeholders to be computed.

### My trip > My trip (group stage, member)

| Block | y | Height | Verdict |
|---|---|---|---|
| "Democracy needs you" banner, Vote now (5) | 0.07 | 0.18 | keep. Right thing first |
| My trip / Group trip switch | 0.26 | 0.07 | keep. Default to Group trip once it exists (structure review, Disagreement 4) |
| "My trip / Your best 9 days" title | 0.35 | 0.09 | keep |
| "3 things to book soon" (folded) | 0.45 | 0.06 | move elsewhere. The plan that will happen is the group one. One home only (section 4) |
| Map | 0.53 | 0.56 | keep |
| Play my route reveal | **1.10** | 0.06 | move up. The banner pushed it off the first screen. Put it on the map's corner or beside the title |
| Days 1 to 9 | 1.18 to 3.74 | 2.56 | collapse each day to one line ("Day 4 Hill country: tea estate, train"), tap to open. Cuts about 1.7 screens |

Waiting and locked are the same without the banner: reveal at 0.90 to 0.93, days end at 3.6.

### My trip > Group trip (the longest page in the app)

| Block | Group stage y | Finalize y | Locked y | Height | Verdict |
|---|---|---|---|---|---|
| Vote banner (group stage only) | 0.07 | | | 0.18 | keep |
| Switch | 0.26 | 0.06 | 0.06 | 0.07 | keep |
| "Group plan / The trip" + status line | 0.35 | 0.15 | 0.15 | 0.13 | keep. At lock the line reads "9 days, about 19.5 h driving" |
| "N things to book soon" (folded) | 0.49 | 0.29 | 0.29 | 0.06 | keep, but widen to "Before you go: 1 to book, 6 tips" |
| Map | 0.56 | 0.36 | 0.36 | 0.56 | keep |
| Days 1 to 9 | 1.14 | 0.94 | 0.94 | 2.2 to 2.6 | collapse each day to one line |
| **Good to know** | **3.72** | **3.22** | **3.14** | 0.5 to 1.0 | move elsewhere: each tip onto its own day row, the count into the Before you go headline. Delete the pooled list |
| **"With 14 days instead of 9 you'd also get"** | **4.75** | **4.04** | **3.67** | 0.4 to 0.8 | collapse to one row: "If we had 14 days: 5 more places" |
| **Premiere: Play route reveal** | **5.18** | **4.67** | **4.51** | 0.18 | Group stage and finalize: cut (it only says "drops once all five lock"). Locked: **move up** to right under the title. It is the payoff of the whole app and sits four and a half screens down |

Finding: at lock, the big red "Play route reveal" button is the last thing on a 4.8-screen page (`App.tsx` GroupTrip renders `Plan`, then `Extras`, then `Premiere`, lines 69-79). Nobody scrolls past nine days of itinerary to find it.

### Picks

| Block | y (waiting) | Height | Verdict |
|---|---|---|---|
| "My picks / Your picks" + help line | 0.08 | 0.15 | keep, help line to one short line |
| Musts (5) | 0.24 | 0.49 | keep open |
| Keens (3) | 0.75 | 0.31 | keep open |
| **Mehs (26)** | 1.07 | **2.33** | collapse behind "Mehs 26". Open by tap. The tier header stays a drop target |
| **Skips (0) drop zone** | **3.42** | 0.16 | follows from collapsing Mehs: moves up to about 1.2. Today, to skip something you drag it three screens |
| Change days or pace | 3.61 | 0.05 | cut. Already in Menu |

Group stage onwards (members): the tab is only the "Ratings are locked" block, 0.2 screens, with Vote now (5). My own list is gone (structure review P4). Within the tab: show my picks read-only under the block, Mehs collapsed, so it stays about 1.5 screens.

Same Mehs problem on **Your picks before submit** (Mehs 1.07 to 3.40, Skip at 3.42). The Done, submit button there is sticky (good).

### Group

**Hub** (group stage): fits one screen.

| Block | y | Height | Verdict |
|---|---|---|---|
| Group stats: "Who travels like who" | 0.06 | 0.12 | keep, but the headline must carry the number: "Travel twin: Lazza 91%" |
| Group knockouts: "You have 5 to vote on. Still to vote: Alex, Antek, Lazza, Saulie" | 0.19 | 0.14 | move up to first while votes are owed (structure review P3) |
| Everyone's picks: "Every place, every tier" | 0.35 | 0.10 | headline carries a number: "4 places 3 or more of you must" |
| Crew strip | 0.51 | 0.13 | keep |

Her complaint was that the stats are "so far down you miss it". They are no longer far down; they are now one tap away behind a headline that says nothing. The fix is the headline, not the position.

**Group stats**: 0.63 screens of content. Travel twin, Biggest clash, Most divisive, then 10 pair rows. Keep. Nothing buried.

**Knockouts** (5 open):

| Block | y | Height | Verdict |
|---|---|---|---|
| "Group knockouts / Vote on these / 3 of 5 votes settle each one" | 0.15 | 0.12 | keep |
| Card 1 (Scuba vs Ella Rock) | 0.29 | 0.67 | keep |
| Card 2 | 0.98 | 0.59 | keep |
| Card 3 | **1.59** | 0.57 | keep while unvoted |
| Card 4 | **2.18** | 0.59 | keep while unvoted |
| Card 5 (Diyaluma vs Yala and 3 more) | **2.79** | 0.59 | keep while unvoted |
| After I vote on all 5: "Waiting on votes (2 more needed)" + the same 5 full cards | 0.26 | 3.3 | **collapse**: a voted card shrinks to one line, "You picked Scuba. 1 more vote settles it". Unvoted cards first. Page drops from 3.5 to about 1 screen |
| Decided list (at lock) | 0.14 | 0.41 | keep, collapsed behind "Decided: 6" while votes are still open |

Each card is two tall photos. With five open, the last starts nearly three screens down, and they all stay full size after I have voted.

**Everyone's picks**: 2.6 screens. A 33-row table sorted by area (`Everyone.tsx:25`), so the rows that matter (places several people must) are scattered. Verdict: sort by group interest (most Musts first), collapse rows where nobody went above Meh behind "26 places nobody pushed for". Note: with 33 rows the table already crops place names ("Pettah market and Red...").

**Finalize your list** (replaces the hub until saved): 3.84 screens.

| Block | y | Height | Verdict |
|---|---|---|---|
| "Last step / Finalize your list" + 2-line help | 0.08 | 0.17 | keep, help to one line |
| Musts (2) | 0.26 | 0.22 | keep |
| Keens (6) | 0.51 | 0.58 | keep |
| Mehs (26) | 1.10 | 2.33 | collapse behind "Mehs 26" |
| Skips | 3.45 | 0.16 | follows |
| **Save my list** | **3.64** | 0.09 | **move up**: make it sticky, like Done, submit on Your picks. `Finalize.tsx:25` passes `sticky={false}`, so the one button this screen exists for is 3.6 screens down |

### Suggest

Fits one screen (content ends at 0.74). Form at 0.18 to 0.49, then "Waiting for Brittany" with Approve / Reject at 0.55. Verdict: for Brittany only, move the approval list above the form (it is her to-do; the form is rarely used). Nothing buried for others.

### Guide

| Section | Length | Notes |
|---|---|---|
| Phrases | 2.48 | 20 phrases, list or flash cards |
| Food | 2.52 | |
| Fruit | 2.29 | |
| Desserts | 1.76 | |
| Beaches | 1.11 | |

The chips at the top (y 0.16) switch sections, so each section stands alone. That works. Two changes: make the chip row sticky (it scrolls away after 0.2 screens), and add Before you go as the first chip at lock (structure review). Reference lists are allowed to be long; nothing urgent is in here.

### Profile

Card view 1.0 screen, Character view 1.09. Keep. Nothing buried.

### Awards takeover (locked, first open)

Full-screen overlay with its own scroll: 9 award cards, 3.79 screens. Each card is 0.35 to 0.55 screens (two 120 px faces). Only the first two fit on the first screen; Train spotter starts at 3.51. Verdict: keep the takeover, shrink cards to a face row plus one line (about 0.2 each) so 4 or 5 fit per screen, and put "9 awards" in the header. After Close the only way back is Menu > Awards (`App.tsx:204`); add an Awards block to the Group hub at lock.

### Menu > Open items

One screen: "Vote on 5 head-to-heads", "2 ideas waiting for approval". Fine.

---

## 2. The one thing each tab should show first

| Tab | Rating | Waiting | Group stage | Finalize | Locked |
|---|---|---|---|---|---|
| My trip | (no tabs yet) | My plan's title and map | Vote banner (built) | "Save your final list" banner, same style | Group trip with Play route reveal under the title |
| Picks | Musts | Musts, with "N new to rate" if any | Locked block + my picks read-only | same | My picks read-only |
| Group | | Who has submitted (4 of 5) | Unvoted knockouts | Finalize, with a sticky Save | Awards block, then stats |
| Suggest | | Form (Brittany: approvals) | same | same | same |
| Guide | | Phrases | Phrases | Phrases | Before you go |
| Profile | | Card | Card | Card | Card |

---

## 3. Reordered layout per tab

Collapsed blocks show the headline in quotes.

**My trip > Group trip (default sub-tab once all five have submitted)**
1. Vote banner, or Finalize banner, when owed
2. Switch: Group trip / My trip
3. Title + status line
4. Locked only: Play route reveal (from y 4.51 to about 0.25)
5. Collapsed: "Before you go: 1 to book, 6 tips"
6. Map
7. Days, each collapsed to one line; a day with a tip shows a small warning mark; tap opens the day with its tip inside
8. Collapsed: "If we had 14 days: 5 more places"
9. Cut at group stage and finalize: the Premiere placeholder

Estimated length at lock: about 2 screens (from 4.8).

**My trip > My trip**
1. Banner when owed
2. Switch
3. Title, with Play my route reveal beside it
4. Map
5. Days, one line each
6. No book-soon card here (one home: Group trip)

**Picks**
1. Group stage onwards: "Ratings are locked" + Vote now
2. "N new to rate" when there are any
3. Musts, Keens open
4. Collapsed: "Mehs 26"
5. Skips drop zone
6. Cut: Change days or pace (in Menu)

**Group hub**
1. Unvoted knockouts inline while any are owed (structure review change 4), else Knockouts block "All decided"
2. Locked: "Awards: 9" block
3. "Group stats: travel twin Lazza 91%"
4. "Everyone's picks: 4 places 3 or more of you must"
5. Crew strip

**Group > Knockouts**
1. Header with one count
2. Unvoted cards, full size
3. Voted cards, one line each: "You picked X. 1 more vote settles it"
4. Collapsed: "Decided: 6"

**Group > Finalize**
1. Title, one-line help
2. Musts, Keens
3. Collapsed: "Mehs 26"
4. Skips
5. Sticky footer: Save my list

**Group > Everyone's picks**
1. One-line key
2. Rows sorted by Musts then Keens across the five
3. Collapsed: "26 places nobody pushed for"

**Suggest**: Brittany sees "2 ideas to approve" first, then the form. Others unchanged.

**Guide**: sticky chips; Before you go chip first at lock.

---

## 4. The same thing in more than one place

| Content | Where it appears (group stage, measured) | One home |
|---|---|---|
| "Vote now" for the same 5 votes | My trip banner, Group trip banner (same banner above the switch), Picks locked block button, Group hub block, Group tab badge 5, Open items row, Menu dot | Banner on My trip + Group tab badge. Picks keeps a plain link, not a second big button. Open items stays as the list |
| Things to book soon | My trip (3), Group trip (4 at group stage, 2 at finalize, 1 at lock) | Group trip only, as part of Before you go |
| Good to know | Group trip only, pooled at the bottom | On each day row, counted in Before you go, full list in Guide at lock |
| Route reveal | "Play my route reveal" on My trip (y 0.9 to 1.1) and "Play route reveal" on Group trip (y 4.51) | Keep both (personal and group are different films), but the group one goes to the top at lock |
| Change days or pace | Picks footer (y 3.61) and Menu | Menu |
| Place tiers | My Picks list and the Everyone table (my column) | Picks with Mine / Everyone switch (structure review, Disagreement 3) |
| Group stats | Group hub block and Menu > Group stats | Keep both. The Menu item is a shortcut to the same screen, not a copy |

---

## 5. Five highest-value changes, in order

| # | Change | Moves | Files |
|---|---|---|---|
| 1 | At lock, put Play route reveal under the Group trip title. Before lock, cut the Premiere placeholder | Reveal from y 4.51 to about 0.25 | `src/App.tsx` (GroupTrip, about lines 69-79), `src/screens/Reveal.tsx` (Premiere) |
| 2 | Finalize: sticky Save my list. Collapse Mehs behind "Mehs 26" in Finalize, Picks and Your picks | Save from y 3.64 to always visible. Skip zone from 3.42 to about 1.2. Picks from 3.8 to about 1.5 screens | `src/screens/Finalize.tsx:25`, `src/screens/Rerank.tsx` |
| 3 | One "Before you go: N to book, M tips" card near the top of Group trip; each Good to know tip on its day row; delete the pooled list | Good to know from y 3.1 to 3.7 up to 0.3 (headline) and onto the day | `src/screens/Plan.tsx`, `src/screens/BookCard.tsx`, `src/screens/MyTrip.tsx` (DayRows) |
| 4 | Knockouts: voted cards collapse to one line, unvoted first, Decided collapsed | 5th card from y 2.79 to under 1.5; page from 3.5 to about 1 screen after voting | `src/screens/Knockouts.tsx`, `src/screens/GenreVote.tsx` |
| 5 | Hub headlines carry the number ("Travel twin: Lazza 91%", "4 places 3 or more of you must"); Everyone's table sorted by group interest; Awards block on the hub at lock | Stats and awards readable without a tap; best rows of the table on screen 1 | `src/screens/GroupHub.tsx`, `src/screens/Everyone.tsx`, `src/lib/friendship.ts` (headline values) |

Next after these: one-line day rows (cuts about 1.7 screens from both plans, `MyTrip.tsx` DayRows) and "With 14 days" folded to one row (`src/screens/Extras.tsx`).

Shared-file warning: 1 touches `App.tsx`, which other agents are editing now. 2 and 4 touch files that were being edited during this review (`Knockouts.tsx`).

Other things noticed (not about scroll, reported so they are not lost):
- Award lines read "1 wildlife picks", "1 hikes", "1 sea picks" (no singular form). Seen in the Awards overlay at lock.
- "Mountain goat" went to four of five people for 1 hike each. With seed data, ties make several awards feel random. Worth a tie rule.
- Guest Group hub says "Still to vote: Brittany, Alex, Antek, Lazza, Saulie" while the demo crew is meant to follow the guest's votes.

---

## 6. What I could not reach or check

| Not checked | Why |
|---|---|
| Guest finalize and locked stages | The guest run stopped at one "keep" vote (2 train views on the shortlist). My script tapped Save my picks without choosing, and the count stayed at 1. Probably my driver, not the app; not traced |
| Late-suggestion knockouts, region (North or South) vote | Not produced by the seeded picks |
| Real friendship stats and awards | Seed data. Stat values and award ties may read differently with real picks |
| Real phone (iPhone Safari), dark theme, other widths | Headless Chrome at 390 x 844, light theme only |
| Supabase-backed member view | No keys in this worktree; local store only |
| Final versions of in-flight work | Banner, badges, Open items and Awards were new in my snapshot and still being edited. Numbers may shift within the hour |
| Mid-task corrections | None arrived |
