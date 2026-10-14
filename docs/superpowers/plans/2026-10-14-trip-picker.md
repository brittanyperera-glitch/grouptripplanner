# Trip Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first web app where 5 friends rate Sri Lanka activities Beli-style, see their personal best route, then resolve a group plan through knockouts.

**Architecture:**
- Pure TypeScript libraries (ranking, planner, group) hold all the logic and are unit-tested.
- A `Store` interface has two implementations, `LocalStore` (localStorage) and `SupabaseStore`.
- React screens render state and call the libraries.
- The app ships no backend of its own; Supabase is the only server.

**Tech Stack:** Vite 5, React 18, TypeScript 5 strict, @supabase/supabase-js 2, Vitest 2, @testing-library/react, Playwright (system Chrome), Vercel.

**Spec:** `docs/superpowers/specs/2026-10-14-trip-picker-design.md`. Every executor reads the spec section named in their task.

## Global Constraints

- **People:** exactly `["Brittany","Alex","Antek","Lazza","Saulie"]`.
- **Tier scores:** must 10, keen 4, meh 1, skip -3, unrated 0. Within-tier bonus `0.9 * (1 - levelIndex/max(1, levelCount-1))`.
- **Tie cap:** at most 3 ids per level.
- **Trip length:** flexible counts as 14 days. Custom length is 5 to 21.
- **Pace:** usable hours per full day are pack 11, balanced 9, slow 7. Arrival and departure days are halves. The departure buffer is 3 h.
- **Drive hours:** only from `src/data/legs.json`, each edge carrying a `src`. Never typed from memory.
- **Copy rules:** no em dashes in any user-visible string. No AI-voice filler. Empty copy fields are hidden.
- **Admin:** approve/reject buttons for suggestions render only when the selected name is "Brittany". Do not build an admin route.
- **Both themes:** tokens on `:root`, dark under `prefers-color-scheme` guarded by `:not([data-theme=light])`, and again on `[data-theme=dark]`.
- **Green is earned.** A red existing test means the change is wrong. Report it; never edit the test to pass.

## Review Focus

1. **Someone rates nothing as Must and submits.** Their plan still renders (it is built from Keens), with no "fits" warning. The test lives in T2.
2. **Every person picks a different trip length** (9, 11, 14, flex). Group days = 9, and the extras list is non-empty. The test lives in T3.
3. **Two people edit at once** in two tabs. The last write wins per person row, and other rows are untouched. The test lives in T4.
4. **A knockout made stale by an earlier result.** The resolution recomputes, never shows a fork whose item is already chosen, and finishes within 2 rounds. The test lives in T3.
5. **A 390 px phone with a long name** ("Udawalawe elephants and Transit Home"). Nothing is clipped, the tier buttons stay tappable, and the toast never covers them. Checked by screenshot in T7.

---

## Workstreams and order

| Task | Tier (cheapskate) | Owns paths | Starts when |
|---|---|---|---|
| T0 Scaffold, types, data build | Opus (me): defines the interfaces everything consumes | `package.json`, configs, `src/types.ts`, `src/data/*`, `src/content/copy.json`, `public/img/*`, `scripts/*` | now |
| T1 Ranking | Sonnet, medium: clear spec, tested | `src/lib/ranking.ts`, `src/lib/ranking.test.ts` | after T0 |
| T2 Planner | Sonnet, high: subtle search and scheduling | `src/lib/paths.ts`, `src/lib/planner.ts`, `src/lib/planner.test.ts` | after T0, parallel with T1 and T4 |
| T4 Store | Sonnet, medium: routine | `src/store/*`, `supabase/schema.sql` | after T0, parallel |
| T3 Group | Sonnet, medium | `src/lib/group.ts`, `src/lib/group.test.ts` | after T1 and T2 |
| T5a Shell and rating screens | Sonnet, high: most UI judgement | `src/App.tsx`, `src/main.tsx`, `src/state.ts`, `src/styles.css`, `src/screens/{Name,Days,Pace,Rate,Rerank}.tsx`, `src/components/{Toast,PhotoCard,Compare}.tsx`, `src/App.test.tsx` | after T1 and T4 |
| T5b Results screens | Sonnet, medium | `src/screens/{Suggest,MyTrip,Waiting,Knockouts,Plan,Everyone,Extras}.tsx`, `src/components/Map.tsx`, `src/screens/results.test.tsx` | after T3 and T5a's `state.ts` |
| T6 Measure missing legs | Haiku, low: browser lookups | `research/maps_legs_extra.md` | done |
| T7 End-to-end and screenshots | Opus (me): inline commands | `e2e/*`, `playwright.config.ts` | after T5a and T5b |
| T8 Whole-branch review | Opus, high: review floor | read-only | after T7 |
| T9 Fixes from review | Sonnet, medium | named by the findings | after T8 |
| T10 Deploy prep | Haiku, low: template | `README.md`, `.env.example`, `vercel.json` | after T9 |
| B1-B6 | Brittany | see the end | at the end |

`package.json` and the configs belong to T0 alone. A task needing a new dependency asks the dispatcher instead of editing them.

---

### Task T0: Scaffold, shared types, data build (dispatcher)

**Files:** `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/types.ts`, `scripts/build-data.mjs`, `src/data/catalogue.json`, `src/data/legs.json`, `src/content/copy.json`, `public/img/*`

**Produces:** `src/types.ts`, exactly:

```ts
export type Tier = 'must' | 'keen' | 'meh' | 'skip';
export const TIERS: Tier[] = ['must', 'keen', 'meh', 'skip'];
export type Level = string[];
export type Ranking = Record<Tier, Level[]>;
export const emptyRanking = (): Ranking => ({ must: [], keen: [], meh: [], skip: [] });
export interface Pending { id: string; tier: Tier; lo: number; hi: number; steps: number }

export type Slot = 'sunrise' | 'morning' | 'afternoon' | 'sunset' | 'evening' | 'late' | 'any';
export type Area = 'Colombo' | 'Cultural Triangle' | 'Kandy and Knuckles' | 'Kitulgala' | 'Hill country' | 'Ella' | 'Wild south' | 'South coast';
export const AREAS: Area[] = ['Colombo', 'Cultural Triangle', 'Kandy and Knuckles', 'Kitulgala', 'Hill country', 'Ella', 'Wild south', 'South coast'];
export type Hub = 'AIR' | 'Colombo' | 'Sigiriya' | 'Kandy' | 'Kitulgala' | 'Nuwara Eliya' | 'Ella' | 'Tissa' | 'Udawalawe' | 'Weligama';
export interface Item {
  id: string; name: string; area: Area; about: string; hours: number; slot: Slot; fee: string;
  sideTrip: number; book?: string; warn?: string; photo?: string; hub?: Hub;
  google?: { rating: string; reviews: string; url: string }; suggestedBy?: Person;
}
export interface Leg { a: Hub; b: Hub; hours: number; src: string }
export type Pace = 0 | 1 | 2; // pack, balanced, slow
export const PACE_HOURS: Record<Pace, number> = { 0: 11, 1: 9, 2: 7 };
export interface PlanInput {
  items: Item[]; scores: Record<string, number>; days: number; pace: Pace; legs: Leg[];
  mustIds?: string[]; forceIn?: string[]; forceOut?: string[];
}
export interface DayEntry { kind: 'drive' | 'activity' | 'train' | 'free'; label: string; hours: number; itemId?: string; from?: Hub; to?: Hub }
export interface Day { n: number; area: Area | null; entries: DayEntry[]; spare: number; rainSlack: boolean }
export interface Plan {
  route: Hub[]; areas: Area[]; days: Day[]; chosen: string[]; dropped: string[];
  travelHours: number; fits: boolean; missingMusts: string[]; score: number;
}
export type Person = 'Brittany' | 'Alex' | 'Antek' | 'Lazza' | 'Saulie';
export const PEOPLE: Person[] = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
export interface Response {
  name: Person; days: number | null; flex: boolean; pace: Pace | null;
  ranking: Ranking; rated: string[]; submitted: boolean; updatedAt: string;
}
export interface Suggestion { id: string; name: Person; title: string; area: Area; note: string; status: 'pending' | 'live' | 'rejected'; createdAt: string }
export interface Vote { forkId: string; name: Person; choice: 'a' | 'b' }
export interface AppState { responses: Partial<Record<Person, Response>>; suggestions: Suggestion[]; votes: Vote[] }
export interface Store {
  load(): Promise<AppState>;
  saveResponse(name: Person, patch: Partial<Omit<Response, 'name'>>): Promise<void>;
  addSuggestion(s: { name: Person; title: string; area: Area; note: string }): Promise<void>;
  setSuggestionStatus(id: string, status: Suggestion['status']): Promise<void>;
  vote(v: Vote): Promise<void>;
  subscribe(cb: (s: AppState) => void): () => void;
}
export interface Knockout { forkId: string; a: string[]; b: string[] } // a = contested item, b = items it would displace
export interface GroupResult {
  open: boolean; days: number; pace: Pace; base: Plan | null; knockouts: Knockout[];
  resolved: Record<string, 'a' | 'b'>; final: Plan | null;
  extras: { id: string; who: { name: Person; tier: Tier }[] }[];
}
export const AREA_HUB: Record<Area, Hub> = {
  'Colombo': 'Colombo', 'Cultural Triangle': 'Sigiriya', 'Kandy and Knuckles': 'Kandy', 'Kitulgala': 'Kitulgala',
  'Hill country': 'Nuwara Eliya', 'Ella': 'Ella', 'Wild south': 'Udawalawe', 'South coast': 'Weligama',
};
```

- [ ] Step 1: Scaffold with Vite react-ts. Install `@supabase/supabase-js@2`, and as dev dependencies `vitest@2 jsdom @testing-library/react @testing-library/user-event @playwright/test`. Make TS strict. Add the scripts `test`, `build`, `data`.
- [ ] Step 2: Write `scripts/build-data.mjs`.
  - It reads `data/catalogue.json`, `docs/mockups/img/credits.json`, `research/google_listings.md` part A and `research/maps_legs_extra.md`.
  - It parses durations ("3 h 39", "3 hr 47 min", "46 min") into hours.
  - It emits `src/data/legs.json` as hub edges with `src`.
  - It emits `src/data/catalogue.json` with `sideTrip` set to round-trip hours. Each is twice the measured one-way leg unless stated otherwise:

    | Item | Measured leg |
    |---|---|
    | dambulla | Sigiriya to Dambulla 0:34 |
    | elephants | Sigiriya to Kaudulla 0:46 |
    | anuradhapura | Sigiriya to Anuradhapura 1:32 |
    | polonnaruwa | Sigiriya to Polonnaruwa 1:21 |
    | knuckles | Kandy to Riverston 2:32 |
    | horton | Nuwara Eliya to Horton Plains 1:12 |
    | train | Nuwara Eliya to Nanu Oya 0:12, one way |
    | diyaluma | Ella to Diyaluma 1:15 |
    | lipton | Ella to Lipton's Seat 1:15 |
    | yala | Tissa to Palatupana 0:37, plus `hub: 'Tissa'` |
    | whales | Weligama to Mirissa harbour 0:17 |
    | hiriketiya | Weligama to Hiriketiya 1:04 |
    | junglebeach | Weligama to Jungle Beach 0:44 |
    | galle | Weligama to Galle Fort 0:46 |
    | lavinia | Colombo to Mount Lavinia 0:41 |

    `pidurangala` is 0.3, a labelled estimate (same village road as Sigiriya). Everything else is 0.
  - It copies the photos to `public/img/`.
  - The script throws if a referenced leg is missing.
- [ ] Step 3: Write `src/content/copy.json` as an empty skeleton.
- [ ] Step 4: Run `npm run data`, then `npx tsc -b`, and read the exit codes. The script itself asserts:
  - 37 items
  - every item has `sideTrip` >= 0
  - every pair of hubs is connected after Floyd-Warshall
- [ ] Step 5: Commit.

### Task T1: Ranking (spec section 5)

**Files:** `src/lib/ranking.ts`, `src/lib/ranking.test.ts`

**Produces:**
- `startPlace(r, id, tier): Pending | null`
- `compareTarget(r, p): string`
- `answer(r, p, 'new' | 'old' | 'same'): Pending | null`
- `canTie(r, p): boolean`
- `move(r, id, dir: -1 | 1): void`
- `retier(r, id, tier): Pending | null`
- `removeId(r, id): void`
- `tierOf(r, id): Tier | null`
- `labels(r): Record<string, string>`
- `score(r, id): number`
- `scoresFor(r, ids): Record<string, number>`

All of these mutate `r` in place. Callers clone with `structuredClone`.

- [ ] Step 1: Write the failing tests:

```ts
import { describe, it, expect } from 'vitest';
import { emptyRanking } from '../types';
import { startPlace, answer, canTie, move, labels, score, retier, tierOf } from './ranking';

describe('ranking', () => {
  it('first item in a tier needs no comparison', () => {
    const r = emptyRanking();
    expect(startPlace(r, 'a', 'must')).toBeNull();
    expect(r.must).toEqual([['a']]);
  });
  it('binary insertion above and below', () => {
    const r = emptyRanking(); startPlace(r, 'a', 'must');
    let p = startPlace(r, 'b', 'must')!; expect(answer(r, p, 'new')).toBeNull();
    expect(r.must).toEqual([['b'], ['a']]);
    p = startPlace(r, 'c', 'must')!; // lo 0, hi 2, mid 1 -> compared with 'a'
    expect(answer(r, p, 'old')).toBeNull(); // lo becomes 2 == hi, so it is placed last
    expect(r.must).toEqual([['b'], ['a'], ['c']]);
    p = startPlace(r, 'd', 'must')!; // lo 0, hi 3, mid 1 -> 'a'; 'new' -> hi 1, mid 0 -> 'b'
    p = answer(r, p, 'new')!; expect(p).not.toBeNull();
    expect(answer(r, p, 'old')).toBeNull(); // lo 1 == hi 1
    expect(r.must).toEqual([['b'], ['d'], ['a'], ['c']]);
  });
  it('tie allowed up to 3, then refused', () => {
    const r = emptyRanking(); startPlace(r, 'a', 'keen');
    let p = startPlace(r, 'b', 'keen')!; answer(r, p, 'same');
    p = startPlace(r, 'c', 'keen')!; answer(r, p, 'same');
    expect(r.keen).toEqual([['a', 'b', 'c']]);
    p = startPlace(r, 'd', 'keen')!;
    expect(canTie(r, p)).toBe(false);
    expect(() => answer(r, p, 'same')).toThrow();
  });
  it('move splits a tie, merges into a neighbour, never crosses tiers', () => {
    const r = emptyRanking(); r.must = [['a', 'b'], ['c']]; r.keen = [['k']];
    move(r, 'b', -1); expect(r.must).toEqual([['b'], ['a'], ['c']]);
    move(r, 'c', -1); expect(r.must).toEqual([['b'], ['a', 'c']]);
    move(r, 'c', 1); move(r, 'c', 1); expect(tierOf(r, 'c')).toBe('must');
  });
  it('labels share numbers for ties', () => {
    const r = emptyRanking(); r.must = [['a'], ['b', 'c']]; r.keen = [['d']];
    expect(labels(r)).toEqual({ a: '1', b: '2=', c: '2=', d: '4' });
  });
  it('scores keep tiers apart', () => {
    const r = emptyRanking(); r.must = [['a'], ['b']]; r.keen = [['c'], ['d']]; r.skip = [['s']];
    expect(score(r, 'a')).toBeCloseTo(10.9); expect(score(r, 'b')).toBeCloseTo(10);
    expect(score(r, 'c')).toBeCloseTo(4.9); expect(score(r, 's')).toBeCloseTo(-2.1);
    expect(score(r, 'zzz')).toBe(0);
  });
  it('retier moves an item and starts placement', () => {
    const r = emptyRanking(); r.must = [['a']]; r.keen = [['b']];
    const p = retier(r, 'a', 'keen'); expect(p).not.toBeNull(); expect(r.must).toEqual([]);
  });
  it('fuzz: 500 random operations keep invariants', () => {
    const r = emptyRanking(); const ids = Array.from({ length: 20 }, (_, i) => 'i' + i);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const tiers = ['must', 'keen', 'meh', 'skip'] as const;
    for (let s = 0; s < 500; s++) {
      const id = ids[Math.floor(rnd() * ids.length)];
      if (tierOf(r, id) && rnd() < 0.5) { move(r, id, rnd() < 0.5 ? -1 : 1); continue; }
      let p = tierOf(r, id) ? retier(r, id, tiers[Math.floor(rnd() * 4)]) : startPlace(r, id, tiers[Math.floor(rnd() * 4)]);
      while (p) { const opts = canTie(r, p) ? ['new', 'old', 'same'] : ['new', 'old']; p = answer(r, p, opts[Math.floor(rnd() * opts.length)] as 'new'); }
      const all = tiers.flatMap(t => r[t].flat());
      expect(new Set(all).size).toBe(all.length);
      for (const t of tiers) for (const l of r[t]) { expect(l.length).toBeGreaterThan(0); expect(l.length).toBeLessThanOrEqual(3); }
    }
  });
});
```

- [ ] Step 2: Run `npx vitest run src/lib/ranking.test.ts > /tmp/out 2>&1; echo EXIT=$?`. Expected: non-zero exit (module missing). Paste the red output.
- [ ] Step 3: Implement per spec section 5. `answer('same')` throws `Error('tie full')` when the mid level has 3 items.
- [ ] Step 4: Re-run. Expected: EXIT=0.
- [ ] Step 5: Mutation. Change the cap to 4, confirm the tie test goes red, then revert.
- [ ] Step 6: Commit `feat: ranking with capped ties`.

### Task T2: Planner (spec section 6)

**Files:** `src/lib/paths.ts`, `src/lib/planner.ts`, `src/lib/planner.test.ts`

**Produces:**
- `shortest(legs): (a: Hub, b: Hub) => number` (memoised Floyd-Warshall; throws on an unknown hub)
- `plan(input: PlanInput): Plan`
- `mustFitDays(input: Omit<PlanInput, 'days'>): number | null` (the smallest days in 5 to 21 where `fits`)

**Algorithm.** Deterministic; ties are broken by sorted ids.

1. **Budget.**
   - `H = PACE_HOURS[pace]`.
   - `budget = H*(days-1) - 3`. That is the two half days counted as one full day, minus the check-in buffer.
2. **Hub of an area.**
   - `AREA_HUB[area]`.
   - Wild south uses `'Tissa'` when a chosen Wild south item has `hub === 'Tissa'`.
3. **Candidates.**
   - An area is eligible if it holds an item with score > 0 that is not in forceOut, or a forceIn item.
   - Areas holding forceIn items are mandatory.
   - Enumerate subsets of the eligible areas that include the mandatory ones.
   - Order is `forward` (AREAS order without Colombo) or `reverse`. Colombo, when included, is `first` or `last`.
   - When `train` is eligible, evaluate with it forced in and forced out.
   - When both Tissa and Udawalawe items are eligible, evaluate both hub variants.
4. **Travel.**
   - The sum of `shortest` over AIR, hubs..., AIR.
   - When train is selected and Hill country and Ella are adjacent in the order, that leg is 0.
   - Skip the candidate when travel exceeds the budget.
5. **Knapsack.**
   - Over the candidate's area items with score > 0, plus forceIn, minus forceOut.
   - Weight is `ceil((hours + sideTrip) * 4)`; capacity is `floor((budget - travel) * 4)`.
   - Value is the score, with forceIn worth 1e6.
   - Reconstruct the choice; prefer fewer items on equal value.
6. **Best.** Highest value, then lower travel, then the lexicographically smaller route string.
7. **Schedule.**
   - Day 1 starts with `left = H/2`.
   - For each hub transition (a drive entry), then that area's chosen items in slot order (sunrise, morning, afternoon, sunset, evening, late, any; ties by id):
     - An entry of h hours goes on the current day if `h <= left`, else it starts a new day with `left = H`.
     - Sunrise and morning items start a new day if more than 3 h of the current day is already used.
     - The train is a `train` entry.
   - The final drive to AIR goes on the last day.
   - If the day count exceeds `days`, remove the chosen item with the lowest score/weight (never forceIn; prefer a non-Must) and redo steps 5 to 7 for this candidate. Loop.
   - Pad up to `days` with free days in the last area before the airport (a `free` entry, `spare = H`).
   - `rainSlack = spare >= 3 && area in {Hill country, Ella}`.
8. **Output.**
   - `dropped` = ids with score > 0 that were not chosen.
   - `missingMusts` = `mustIds` that were not chosen.
   - `fits` is true when `missingMusts` is empty.

- [ ] Step 1: Write the failing tests:

```ts
import { describe, it, expect } from 'vitest';
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { plan, mustFitDays } from './planner';
import { shortest } from './paths';
import type { Item, Leg } from '../types';
const items = catalogue.items as Item[]; const L = legs as Leg[];
const sc = (ids: string[], v = 10) => Object.fromEntries(ids.map(i => [i, v]));

describe('paths', () => {
  it('connects every hub and is symmetric', () => {
    const d = shortest(L);
    expect(d('AIR', 'Sigiriya')).toBeGreaterThan(3); expect(d('Sigiriya', 'AIR')).toBe(d('AIR', 'Sigiriya'));
    expect(Number.isFinite(d('Colombo', 'Tissa'))).toBe(true);
  });
});
describe('plan', () => {
  it('fits a classic 9-day set of Musts', () => {
    const must = ['sigiriya', 'elephants', 'tooth', 'train', 'ellarock', 'yala', 'surf', 'galle'];
    const p = plan({ items, scores: sc(must), days: 9, pace: 1, legs: L, mustIds: must });
    expect(p.fits).toBe(true); expect(p.days.length).toBe(9);
    expect(p.route[0]).toBe('AIR'); expect(p.route.at(-1)).toBe('AIR');
  });
  it('drops items and reports missing musts when everything is a Must', () => {
    const all = items.map(i => i.id);
    const p = plan({ items, scores: sc(all), days: 9, pace: 1, legs: L, mustIds: all });
    expect(p.fits).toBe(false); expect(p.days.length).toBe(9); expect(p.missingMusts.length).toBeGreaterThan(0);
  });
  it('a plan with no Musts still renders from Keens', () => {
    const p = plan({ items, scores: sc(['sigiriya', 'galle'], 4), days: 9, pace: 1, legs: L, mustIds: [] });
    expect(p.fits).toBe(true); expect(p.chosen).toEqual(expect.arrayContaining(['sigiriya', 'galle']));
  });
  it('train replaces the Hill country to Ella drive', () => {
    const p = plan({ items, scores: sc(['train', 'horton', 'ellarock']), days: 9, pace: 1, legs: L });
    expect(p.chosen).toContain('train');
    const drives = p.days.flatMap(d => d.entries).filter(e => e.kind === 'drive');
    expect(drives.some(e => (e.from === 'Nuwara Eliya' && e.to === 'Ella') || (e.from === 'Ella' && e.to === 'Nuwara Eliya'))).toBe(false);
  });
  it('honours forceIn and forceOut', () => {
    const p = plan({ items, scores: sc(['sigiriya', 'galle']), days: 9, pace: 1, legs: L, forceIn: ['rafting'], forceOut: ['galle'] });
    expect(p.chosen).toContain('rafting'); expect(p.chosen).not.toContain('galle');
  });
  it('never exceeds the day count and stays deterministic', () => {
    const all = items.map(i => i.id); const s = Object.fromEntries(all.map((id, i) => [id, (i % 7) + 1]));
    const a = plan({ items, scores: s, days: 14, pace: 0, legs: L }); const b = plan({ items, scores: s, days: 14, pace: 0, legs: L });
    expect(a.days.length).toBe(14); expect(a).toEqual(b);
  });
  it('mustFitDays finds the smallest length', () => {
    const must = ['sigiriya', 'train', 'yala', 'galle', 'knuckles', 'rafting', 'polonnaruwa', 'hiriketiya'];
    const n = mustFitDays({ items, scores: sc(must), pace: 1, legs: L, mustIds: must });
    expect(n).not.toBeNull(); expect(n!).toBeGreaterThan(5);
    expect(plan({ items, scores: sc(must), days: n!, pace: 1, legs: L, mustIds: must }).fits).toBe(true);
    expect(plan({ items, scores: sc(must), days: n! - 1, pace: 1, legs: L, mustIds: must }).fits).toBe(false);
  });
  it('is fast enough on a phone', () => {
    const all = items.map(i => i.id); const s = Object.fromEntries(all.map(id => [id, 4]));
    const t = performance.now(); plan({ items, scores: s, days: 14, pace: 1, legs: L }); expect(performance.now() - t).toBeLessThan(1500);
  });
});
```

- [ ] Step 2: Run, expect red, paste it.
- [ ] Step 3: Implement.
- [ ] Step 4: Run, expect green. If the speed test fails, prune; never loosen the bound.
- [ ] Step 5: Mutations. Removing the train zero-leg rule turns the train test red. Removing the overflow loop turns the day-count test red. Revert both.
- [ ] Step 6: Commit `feat: route planner`.

### Task T3: Group (spec section 7)

**Files:** `src/lib/group.ts`, `src/lib/group.test.ts`

**Consumes:** `score` and `tierOf` (T1), `plan` and `mustFitDays` (T2).

**Produces:**
- `groupResult(state: AppState, items: Item[], legs: Leg[]): GroupResult`
- `personPlan(resp: Response, items: Item[], legs: Leg[]): Plan & { mustFit: number | null }`

**Rules:**
- `open` = all 5 `submitted`.
- Days = min over people of `flex ? 14 : days`.
- Pace = the median.
- Group scores = the sum of `score`.
- Contested items, knockouts and the fork id are as in spec section 7.
- A fork is resolved at 5 votes, by majority.
- Final = plan with winners forced in and losers forced out.
  - After applying the resolved forks, recompute the contested list.
  - Forks whose item is already chosen disappear.
  - At most 2 rounds.
  - `final` is null while any unresolved fork remains.
- Extras = the 14-day group plan minus the final (or base) plan, with who rated each Must or Keen.

- [ ] Step 1: Write the failing tests:

```ts
import { describe, it, expect } from 'vitest';
import catalogue from '../data/catalogue.json'; import legs from '../data/legs.json';
import { groupResult } from './group';
import { emptyRanking, PEOPLE, type AppState, type Item, type Leg, type Person, type Response } from '../types';
const items = catalogue.items as Item[]; const L = legs as Leg[];
const resp = (name: Person, days: number | null, flex: boolean, must: string[], keen: string[] = []): Response => {
  const r = emptyRanking(); r.must = must.map(m => [m]); r.keen = keen.map(k => [k]);
  return { name, days, flex, pace: 1, ranking: r, rated: [...must, ...keen], submitted: true, updatedAt: '' };
};
const base = (): AppState => ({ responses: {
  Brittany: resp('Brittany', 9, false, ['sigiriya', 'galle'], ['polonnaruwa']),
  Alex: resp('Alex', 14, false, ['yala'], ['polonnaruwa']),
  Antek: resp('Antek', null, true, ['rafting', 'knuckles', 'anuradhapura', 'diyaluma', 'hiriketiya']),
  Lazza: resp('Lazza', 11, false, ['train'], ['polonnaruwa']),
  Saulie: resp('Saulie', 9, false, ['surf', 'whales', 'horton', 'lipton']),
}, suggestions: [], votes: [] });

describe('group', () => {
  it('stays closed until all five submit', () => {
    const s = base(); s.responses.Saulie!.submitted = false; expect(groupResult(s, items, L).open).toBe(false);
  });
  it('uses the shortest committed length, flexible as 14', () => {
    expect(groupResult(base(), items, L).days).toBe(9);
  });
  it('deterministic knockouts and a non-empty extras list', () => {
    const g1 = groupResult(base(), items, L), g2 = groupResult(base(), items, L);
    expect(g1.knockouts.length).toBeGreaterThan(0); expect(g1.knockouts.map(k => k.forkId)).toEqual(g2.knockouts.map(k => k.forkId));
    expect(g1.extras.length).toBeGreaterThan(0);
  });
  it('resolves by majority, hides stale forks, and finishes', () => {
    const s = base(); let g = groupResult(s, items, L);
    for (let round = 0; round < 3 && !g.final; round++) {
      for (const k of g.knockouts) for (const name of PEOPLE) s.votes.push({ forkId: k.forkId, name, choice: name === 'Antek' ? 'b' : 'a' });
      g = groupResult(s, items, L);
    }
    expect(g.final).not.toBeNull(); expect(g.final!.days.length).toBe(9);
    for (const k of g.knockouts) expect(g.final!.chosen).not.toContain(k.a[0]);
  });
});
```

- [ ] Steps 2 to 6: red, then green. Mutation: a majority threshold of 2 turns the resolution test red. Commit `feat: group plan and knockouts`.

### Task T4: Store (spec section 8)

**Files:** `src/store/local.ts`, `src/store/supabase.ts`, `src/store/index.ts`, `src/store/local.test.ts`, `supabase/schema.sql`

**Produces:** `getStore(): Store`. It returns `SupabaseStore` when both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, else `LocalStore`.

- **LocalStore:**
  - Keys are `tp:resp:<name>`, `tp:sugg` and `tp:votes`.
  - `subscribe` listens to `storage` events plus an in-process emitter.
  - Every read and write is in try/catch. A corrupt key reads as empty.
- **SupabaseStore:**
  - Uses the spec section 8 tables.
  - Upserts on `name` and on `(fork_id, name)`.
  - Realtime `postgres_changes` reloads the state.
- **schema.sql:**
  - The tables plus a CHECK on the name.
  - RLS enabled with permissive anon policies.
  - Adds the tables to the `supabase_realtime` publication.
- **Tests (jsdom):**
  - Saving Alex leaves Brittany's row byte-identical.
  - A second vote by the same person on the same fork replaces the first.
  - A corrupt `tp:sugg` loads as `[]`.
  - Mutation: store all responses under one key, and the first test goes red.
- Commit `feat: stores`.

### Task T5a: Shell and rating screens (spec section 9, screens 1-6)

**Files:** as in the table.

**`state.ts` exports:**
- `useApp(): { state: AppState; me: Person | null; setMe(p: Person): void; store: Store; items: Item[]; legs: Leg[]; copy: Copy; error: string | null; retry(): void }`
- `type Copy`
- `liveItems(state: AppState): Item[]` (the catalogue plus live suggestions as items: hours 2, sideTrip 0, slot any)

`me` is kept in localStorage `tp:me`.

**Port from `docs/mockups/section1-flow.html`:**
- The tokens, the Archivo font link and both themes.
- The `.photo .info .tiers .t .vs2 .pick .same .level .item .mv .toast .choice .names .name` styles.
- The app is the phone layout, centred at max width 440. No side panels.
- The mockup's dashed `.slot` placeholder boxes stay out of the app. Empty copy is hidden.

**Flow:**
- Name, then Days, then Pace, then Rate.
- Rate shows the unrated live items in AREAS order, one card at a time:
  - Photo with its credit caption from `public/img/credits.json`.
  - Name, About, a facts line `area · hours · fee`, warn, a Google rating `★ 4.7 (24k)` linking to `google.url`.
  - `copy.items[id].review` and `.take` when non-empty.
  - The 4 tier buttons.
- A tier tap calls `startPlace`; when it returns a pending placement, Compare renders, with "tie" disabled when `!canTie`.
- After the last item, Rerank: labels, up/down (`move`), a tier change (`retier`, which may open Compare), then "Submit".
- Every change is saved through `store.saveResponse`. A quip from `copy.quips` shows only if it is non-empty.
- After submitting, tabs: My trip, Group, Everyone, Suggest.
- Ratings lock once the group stage is open.
- Errors (spec section 10):
  - A failed save shows an inline "Couldn't save. Tap to retry" (`error`, `retry`) and keeps local state.
  - A missing photo renders a solid block in the area's colour with the item name.

**Test** (`src/App.test.tsx`, jsdom, LocalStore, `liveItems` mocked to 3 items):
- Pick Alex, then 9 days, then balanced.
- Rate item 1 Must, item 2 Must, then "this one" (new).
- Rate item 3 Keen.
- Expect the Rerank labels to contain "1", "2" and "3".

Commit `feat: shell and rating flow`.

### Task T5b: Results screens (spec section 9, screens 7-13)

**Files:** as in the table.

**Consumes:** `useApp` and `liveItems`, `personPlan` and `groupResult`, `labels` and `tierOf`.

- **Map:** port `mapSVG` from the mockup, taking `route: Hub[]`. Hub lat/lon:
  - AIR 7.18,79.88; Colombo 6.93,79.85; Sigiriya 7.957,80.76; Kandy 7.29,80.63; Kitulgala 6.99,80.42
  - Nuwara Eliya 6.95,80.78; Ella 6.87,81.05; Tissa 6.28,81.29; Udawalawe 6.47,80.89; Weligama 5.97,80.43
- **MyTrip:**
  - "Your best N days", the map, and day rows. Drives read "drive about X h"; spare and rain-slack lines are included.
  - If it doesn't fit: "Your Musts fit in {mustFit} days, not {N}".
- **Waiting:** who is done.
- **Knockouts:**
  - Each fork shows both sides with photos.
  - Each person's tier chip is shown for the side's items.
  - A tap votes; the vote count is shown.
- **Plan:**
  - The final plan, else the base plan labelled "Provisional until the knockouts are done".
  - A book-ahead list (items with `book`) and a heads-up list (items with `warn`).
- **Everyone:** items by people, with the tier letter and rank label.
- **Extras:** each item with who liked it.
- **Suggest:**
  - Title, area and note.
  - Pending and live lists.
  - Approve and reject only when `me === 'Brittany'`.

**Tests** (`src/screens/results.test.tsx`):
- Knockouts with a fixture GroupResult: tapping side a calls `store.vote({forkId, name, choice: 'a'})`.
- MyTrip with a 9-day fixture plan renders 9 day rows.

Commit `feat: results screens`.

### Task T7: End to end and screenshots (dispatcher, inline)

- `playwright.config.ts`: `channel: 'chrome'`, webServer `npm run dev -- --port 5199` (check that the port is free first).
- `e2e/flow.spec.ts` runs one browser context, switching names to simulate five people (the shared localStorage stands in for the shared database):
  - Each rates every item and submits. Brittany gives 6 Musts; the others give 1 to 3.
  - The Group tab shows knockouts; all 5 vote; the plan shows min(days) day rows.
- Screenshots at 390x844 and 1280x900, light and dark, of Rate, Compare, Rerank, MyTrip, Knockouts and Plan. Viewed by me; clipping or overlap is fixed before T8.
- Commit `test: e2e flow`.

### Task T8: Whole-branch review (Opus, high)

A fresh reviewer gets only the spec and `git diff main...HEAD`, with these lenses:
- the libraries' correctness against the spec
- the Review Focus inputs
- 390 px UI defects
- the copy rules
- anything that would embarrass Brittany when friends open it

Findings are verified by me, then fixed in T9 (Sonnet).

### Task T10: Deploy prep (Haiku, low)

- `.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`.
- `vercel.json` with `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`.
- `README.md` runbook:
  - `npm i`, `npm run dev`, `npm test`.
  - Supabase: create a project, run `supabase/schema.sql` in the SQL editor, copy the URL and anon key.
  - Vercel: import the repo, add the 2 env vars, deploy.

### Brittany's items (end)

- B1: Review the spec and this plan.
- B2: Curate the catalogue (keep or cut).
- B3: The quick-fire interview gives Claude `copy.json`: welcome, quips, a take and a review line per place.
- B4: Photos for the zipline and Hiriketiya.
- B5: Create the private GitHub repo and push. Create the Supabase project and run the schema. Create the Vercel project with the 2 env vars.
- B6: Send the link to Alex, Antek, Lazza and Saulie.
