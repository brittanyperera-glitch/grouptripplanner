# T7 browser findings (2026-10-14)

From `e2e/flow.spec.ts`: Chrome at 390 px, with four friends pre-filled and Brittany rated through the real screens. Brittany marked 6 items Must and everything else Meh.

The test passes. It asserts that:
- zero open knockouts remain after voting;
- "Day 9" is shown and "Day 10" is not;
- `scrollWidth - clientWidth <= 0` on the Everyone tab.

I took the screenshots and viewed them myself.

| # | Where | What a friend sees | Fix |
|---|---|---|---|
| U1 | Knockouts, the b ("Keep") side | It lists every displaced item, up to 7 names comma-joined, mostly Meh-only items. | Show up to 2 items, those someone rated Must or Keen first by group score, then "and N more". Do the same in the "Decided" lines. |
| U2 | "Decided" list (Plan / Knockouts) | The heading is "Decided" and every line also starts "Decided:". The text is right-aligned. | Use the heading once. Lines read "Sigiriya Rock beat Tuk-tuk street food tour and 2 more", left-aligned. |
| U3 | Day rows (MyTrip, Plan) | "Knuckles day hike, 11.1 h". The entry hours include the side-trip drive. | Show on-site hours, with the round trip as a second muted line: "Knuckles day hike, 6 h" then "plus about 5.1 h there and back". The planner's entry should carry `hours` and `sideTrip` separately; the label is built in the UI. |
| U4 | Planner order within an area | Day 1 in Colombo: "Late-night kottu" comes before "Gangaramaya Temple" ("any" slot), so "any" items are scheduled after late ones. | Slot order: sunrise, morning, any, afternoon, sunset, evening, late. "Any" fills daytime. Test: no non-evening item follows an evening or late item on the same day. |
| U5 | Group plan, day 5 | "Drive to Ella, about 4.0 h", then "Drive to Tissa, about 2.1 h": 6.1 h of driving in one day with no flag. | Add a muted "Long driving day" note when a day's drives total 5 h or more. |
| U6 | Everyone table at 390 px | The 5th column (Saulie) is cut at the edge of its scroll box at first glance. | Narrow the item column (2-line clamp, smaller area line), tighten cell padding, so 5 people fit at 390 px. Keep the inner scroll as a fallback. |
