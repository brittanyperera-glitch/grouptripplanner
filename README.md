# Sri Lanka Trip Picker

A phone web app where Brittany, Alex, Antek, Lazza and Saulie rate activities and get a group plan for the December 2026 trip.

## Run it locally

```
npm install
npm run dev
npm test
npm run e2e
```

Without Supabase keys the app saves to this browser only, which is good for trying it out.

## Go live (about 15 minutes)

1. Supabase: create a free project at supabase.com and copy the Project URL and the anon public key (Project Settings, API). Do not run any SQL yet.
2. GitHub: the repo is `brittanyperera-glitch/grouptripplanner`; the live branch is `homecoming`, which Vercel deploys.
3. Vercel: choose Add New Project, import the repo, add three environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with the two Supabase values, and VITE_RAW_KEY with a secret word of your own. Click Deploy.
4. Database, after the app is deployed. In Supabase open SQL Editor and run these in order, one at a time:
   1. supabase/schema.sql, pasted whole. It creates the tables and the password tables, and is safe to run again.
   2. For a NEW database only: supabase/set-trip-password.sql, with the friends' password in place of the placeholder. It needs the tables from the step above, so it cannot run first. Until it runs, nobody can read or save anything.
   3. Immediately after: supabase/set-admin-password.sql, with your organiser password in place of the placeholder. Until then the database refuses organiser saves (stay pins, closed stays, nights, scouts, trip settings). The app sends the organiser password in an x-admin-key header.
   Both password scripts refuse a blank or unchanged placeholder. Close each query tab without saving it.
5. Send the Vercel link to the group.

The `choice_log` table in supabase/schema.sql is append-only and keeps every swipe, re-rank, head to head, days, pace and suggestion as made; only you read it, at `/#/raw-<VITE_RAW_KEY>` (default key `tp-raw-local`, so set your own in Vercel), with a Download CSV button.

## Editing the words

Brittany's welcome message, quips and per-place lines live in src/content/copy.json. Empty fields are hidden.

## Where things come from

- Activities: data/catalogue.json, rebuilt into src/data by `npm run data`.
- Drive times: measured in Google Maps, see research/.
- Photos: Wikimedia Commons, with credits in docs/mockups/img/credits.json.

## Offline service worker

`public/sw.js` precaches the built shell and every file in `dist/.vite/manifest.json` (including the plan worker chunk) and serves navigations network first with a 3 s fallback to the cached `index.html`. `vite build` stamps `__BUILD__` in `sw.js` with a hash of the manifest, so each release gets a new cache name and the old caches are deleted on activate. There is no VERSION to bump by hand. Google Fonts are cached in a separate `homecoming-fonts` cache that survives releases.

Kill switch: deploy `public/version.json` as `{"sw": false}`. The worker unregisters, deletes every cache and reloads open tabs, and `src/main.tsx` stops registering it. Only a successful response with `sw: false` trips it; a 404, a 5xx, a captive-portal page or being offline leaves the worker alone. Set it back to `{"sw": true}` to re-enable.
