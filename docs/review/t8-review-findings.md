# T8 whole-branch review findings (fresh Opus reviewer, 2026-10-14)

The reviewer read the code and ran the planner and group suites (33/33). The dispatcher spot-checked the cited lines before routing. Every finding is being fixed. They are routed to two batches by file ownership.

| # | Severity | Finding | Fix | Batch |
|---|---|---|---|---|
| R1 | High | `src/store/index.ts:7-8` returns LocalStore whenever a Supabase env var is unset, including in production, so the friends never see each other | When `import.meta.env.PROD` is true and the vars are missing, show a blocking "not connected" screen | B |
| R2 | High | `state.ts:51-62` queues only failed patches and replays them in `retry()` after newer saves. Saves run in parallel (`App.tsx:79`), and each read-merge-writes (`supabase.ts:51-65`) | One serial write queue per person. Every save sends the full current row. Failed saves coalesce into "latest row". Votes keep only the latest per fork | B |
| R3 | Med | The reviewer found the only route back to days is Pace's Back button (`App.tsx:139`), and the tabs footer (`App.tsx:155-160`) returns only to rating. One mis-tap on 9 days shortens the group trip | Add a "Change days or pace" control while not locked | B |
| R4 | Med | `App.tsx:130` checks `placing` before the lock at line 87, so a comparison in progress can commit after the group opens | When locked: clear placing, never commit | B |
| R5 | Med | When an earlier knockout resolves, fork ids that include b change (`group.ts:57-59`), and votes reset to "0 of 5" | Fork id = `ko:<c>`. A vote for a means "add c", which keeps its meaning as b shifts. Update the stale-id test, with this justification in the commit | C |
| R6 | Med | `group.ts:7` fixes extras at 14 days and `Extras.tsx:9` hardcodes "14". When the trip is already 14 days, the list is misleading | When `days >= 14`, hide the section. Otherwise compute at 14 and print the real number | C |
| R7 | Med | `schema.sql:33-35` grants `for all`, including DELETE, to anon. There are no checks on choice, status or lengths | Separate select, insert and update policies with no delete. CHECK on choice in ('a','b'), status in ('pending','live','rejected'), and length(title) <= 80, length(note) <= 300 | B |
| R8 | Med-low | Orange #FF7A1A text on white is about 2.6:1 (`styles.css` "Day N" :138, tags :90, Must cells :171) | A darker orange for text in light mode only, a separate token from the fill colour | C |
| R9 | Low | `createClient` throws on a malformed URL during render (`state.ts:66`), giving a blank page | Wrap it in try/catch and show the "Couldn't load" bar | B |
| R10 | Low | `copy.json` `quips.name` shape doesn't match the `Copy` type | Align `Copy` and `copy.json` to one shape and test that copy.json parses as Copy | B |
| R11 | Low | `onCancel` is passed only for re-rank (`App.tsx:131`), so a mis-tapped tier in first rating has to finish its comparisons | Pass a cancel that drops the pending placement and returns the card | B |
| R12 | Low | Realtime reloads are unsequenced (`supabase.ts:87`), so an older snapshot can win. `index.html` theme-color is fixed dark | A sequence counter plus a 200 ms debounce. A media-specific theme-color pair | B |
