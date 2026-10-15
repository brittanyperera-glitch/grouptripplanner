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

1. Supabase: create a free project at supabase.com, open SQL Editor, paste the contents of supabase/schema.sql, and run it. Then go to Project Settings, API, and copy the Project URL and the anon public key.
2. GitHub: create an empty private repo (no README). The app lives on the branch `worktree-trip-picker-build`, so bring main up to it first, from the main project folder: `git merge --ff-only worktree-trip-picker-build`, then `git remote add origin <url>` and `git push -u origin main`.
3. Vercel: choose Add New Project, import the repo, add three environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with the two Supabase values, and VITE_RAW_KEY with a secret word of your own. Click Deploy.
4. Send the Vercel link to the group.

The `choice_log` table in supabase/schema.sql is append-only and keeps every swipe, re-rank, head to head, days, pace and suggestion as made; only you read it, at `/#/raw-<VITE_RAW_KEY>` (default key `tp-raw-local`, so set your own in Vercel), with a Download CSV button.

## Editing the words

Brittany's welcome message, quips and per-place lines live in src/content/copy.json. Empty fields are hidden.

## Where things come from

- Activities: data/catalogue.json, rebuilt into src/data by `npm run data`.
- Drive times: measured in Google Maps, see research/.
- Photos: Wikimedia Commons, with credits in docs/mockups/img/credits.json.
