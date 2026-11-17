# Final-stage UX review, 17 Nov 2026

Fresh-context Opus reviewer over branch final-stage at 3bb6294 (line numbers at dec0591) and screenshots in `Notes & Promo Videos/final-stage-shots/` (preview harness, 390 px, seeded data). Status column: all OPEN at handover. Brittany's direction since: spy mission HUD with countdown for the new screens only, small snappy celebrations, min 2 accommodation options per area then a group vote (see the plan's Decisions table).

## A. Workflow and intuitiveness
| # | Sev | Finding | Fix | Status |
|---|---|---|---|---|
| A1 | blocker | No friend has one clear next task: `model.missing`/`model.draft` (useTripModel.ts:93-101) have no consumer; Flights and Organiser not linked in App.tsx | "Your next thing" card on My trip from `missing` (flights, your claimed bookings, unclaimed); link Flights and Organiser | OPEN (W3h + spy HUD) |
| A2 | high | Trip admin row shows owner avatar next to "Nobody yet"; owner (TripAdmin.tsx:106) and done-by (:128) both bare avatars | One labelled status per row: "Alex is booking" / "Booked by Alex" / "Nobody yet, I'll book this" | OPEN |
| A3 | high | Done row still offers "I'll book this" (claimUi TripAdmin.tsx:105 ignores done) | Hide claim when status is done | OPEN |
| A4 | high | Stays header "Waiting on the others to pick their top 2" while every area shows a stay; one replacing area makes `finished` false (Stays.tsx:59, stayflow.ts:187) | replacing branch: Brittany "Pin a Hill country replacement", friends "Brittany is sorting Hill country" | OPEN |
| A5 | high | "Fell through" one tap, no confirm, no undo, wipes the claim (StayBoard.tsx:36-39,57) | Confirm naming the cleared claim, then 6 s Undo | OPEN |
| A6 | high | Money shown despite "No money at all": "about £28 a night", LKR/USD fees (tripadmin.ts:27,37), price field (TripAdmin.tsx:133), print "Cost:" (TripDay.tsx:71) | Remove info, price field, Cost line | OPEN |
| A7 | high | Departure compared by date only; Lazza 03:15 on the last day not flagged (arrivals.ts:25); one group leave-by from the earliest flight (arrivals.ts:36-44) tells a 14:30 flyer to leave near midnight | Per-person leave-by; flag departures before about noon on the last day | OPEN |
| A8 | medium | Bookings in two places with different counts (Organiser "8 to look after", Trip admin "7 still to do"); Organiser dates blank while Trip admin shows "Book by 1 Dec" (Organiser.tsx:278 reads only overrides) | Remove Organiser Bookings; Reassign and Change dates inside Trip admin Details (organiser only), prefilled with dates in use | OPEN |
| A9 | medium | Overrides log misses reassignments and fall-throughs (claimBooking state.ts:550, saveStaysAdmin) | Log both | OPEN |
| A10 | medium | Stays still shows vote-era stepper, stale "YOU SCOUT" on decided areas, prominent Unlock buttons | After release: "5 areas, 4 set"; scout chip only on undecided; fold Unlock into organiser view | OPEN (now also reshaped by the min-2 voting decision) |
| A11 | medium | Plan D+ puts Trip view on both My trip and Group trip (redundancy) | Group trip holds Trip view; My trip holds next-thing card before the trip and Today during it | OPEN (plan change) |
| A12 | medium | Hill country (replacing) has no stay row in Trip admin | Placeholder row "Hill country: waiting on Brittany's pick" | OPEN |

## B. UI/UX quality
| # | Sev | Finding | Fix | Status |
|---|---|---|---|---|
| B1 | high | Organiser empty gaps: `.og-field{flex:1 1 120px}` and `.og-rowname{flex:1 1 160px}` (Organiser.css:13,30) inside column flex, basis becomes height | `flex:none` in column contexts or scope the basis to `.og-pair > .og-field` | OPEN |
| B2 | medium | Raw ISO dates shown (Organiser.tsx:329, Flights.tsx:36, arrivals.ts:24-25) | dateLabel plus hh:mm, "Lazza lands Wed 9 Dec 01:20, the night of day 1" | OPEN |
| B3 | medium | Doubled labels "ARRIVAL / ARRIVAL DATE" (Flights.tsx:70-71), "START DATE / START DATE" (Organiser.tsx:329+89) | Date/Time/Flight; drop inner label | OPEN |
| B4 | medium | Two booking-status vocabularies: chipText (TripAdmin.tsx:34) vs bookingParts (bookingText.ts); "Open" is jargon | One function; "Book now" / "Book by 1 Dec" | OPEN |
| B5 | medium | Save feedback far from control (Organiser.tsx:327); Trip admin ticks and claims ignore results (:89,105); mixed save models in one Organiser row | Inline status per control, one save model | OPEN |
| B6 | low | Trip admin header "shown only to you" vs Details "Not secret" (:18 vs :25) | "Only you see this here; not secret." | OPEN |
| B7 | low | Flights has no back button and no prefill | onBack; default dates to trip first and last day | OPEN |

No string over 40 words in the five new screens.

## C. Animations (0 animation/transition/@keyframes rules in the five new CSS files)
C1 high: offline and saving pill "Offline · as of 08:12" with idle TukTuk, dashed "Will send" stamp on queued taps. C2 medium: claim pops owner avatar with `rv-halt` plus stamp "ALEX'S". C3 medium: tick fills over `--dur-fast`, row settles into a Done group. C4 medium: Fell through slams a red stamp and desaturates the card. C5 low (plan): `useLegDrive` does not check `motion()`; Trip view gates it; fast chip swipes start from the tuk's current position; reduced motion crossfades only.

## D. Wow factor (ranked; to be re-cast in the spy HUD direction)
1. Countdown ("21 sleeps to Colombo") with idle tuk and crew avatars done or not, from `missing` (TukTuk idle, BigState crew, stamp-label). 2. Claim and booked stamps (C2). 3. Today boarding pass "DAY 4 · KANDY → ELLA" with tonight's stay and your own leave-by (dayView/TripDay). 4. "Plan sealed" moment when `missing` is empty (rv-crew/rv-cheer). 5. Trip-progress line on Today (RouteMap, legD). 6. Day 1 "who has landed" avatars on Colombo (Avatar, arrivals).

## Top 10 (reviewer order)
A1, A6, B1, A2+A3, A4, A5, A7, A8+B4, C1+B5, B2+B3.

## Also open from builder reviews
- INT3: "will retry when you're online" overpromises: no `online`/`visibilitychange` listener flushes the queue (only next write, Retry, or next launch), and the message stays after a later retry succeeds; string duplicated in Flights.tsx:22 and Organiser.tsx:31. Fix: flush the queue on `online` and on visibility, and clear the message when the job lands.
- W3f: saveIcs duplicates Poster.tsx shareOrDownload (TripAdmin.tsx:45-57); claim buttons lack item-specific accessible names; checklist vs model booking sources differ (tripadmin.ts adminChecklist vs chosenStays).
- W3afix: group print "Where you sleep" omitted when nightBlocks throws (could fall back to model.staysByArea).
