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
2. GitHub: create a private repo and push this folder with `git remote add origin <url>` then `git push -u origin main`.
3. Vercel: choose Add New Project, import the repo, add the environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with the two values, and click Deploy.
4. Send the Vercel link to the group.

## Editing the words

Brittany's welcome message, quips and per-place lines live in src/content/copy.json. Empty fields are hidden.

## Where things come from

- Activities: data/catalogue.json, rebuilt into src/data by `npm run data`.
- Drive times: measured in Google Maps, see research/.
- Photos: Wikimedia Commons, with credits in docs/mockups/img/credits.json.
