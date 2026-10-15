import { describe, it, expect } from 'vitest';
import catalogue from './__fixtures__/catalogue-46.json';
import legs from '../data/legs.json';
import liveCatalogue from '../data/catalogue.json';
import { plan, mustFitDays, planner } from './planner';
import { groupResult } from './group';
import { shortest } from './paths';
import { emptyRanking, type AppState, type Item, type Leg, type Pace, type Person, type PlanInput, type Response } from '../types';
import snapshot from './__fixtures__/planner-snapshot.json';
const items = catalogue.items as Item[]; const L = legs as Leg[];
const sc = (ids: string[], v = 10) => Object.fromEntries(ids.map(i => [i, v]));
const byId = new Map(items.map(i => [i.id, i]));

describe('paths', () => {
  it('connects every hub and is symmetric', () => {
    const d = shortest(L);
    expect(d('AIR', 'Sigiriya')).toBeGreaterThan(3); expect(d('Sigiriya', 'AIR')).toBe(d('AIR', 'Sigiriya'));
    expect(Number.isFinite(d('Colombo', 'Tissa'))).toBe(true);
  });
  // D8 (Brittany 2026-10-15): about 2 h on the Southern Expressway until it is measured in Google Maps.
  it('has the Weligama to Colombo leg as a marked estimate, not routed via the airport', () => {
    const leg = L.find(l => [l.a, l.b].sort().join() === 'Colombo,Weligama');
    expect(leg?.hours).toBe(2);
    expect(leg?.src).toMatch(/estimate/);
    expect(shortest(L)('Weligama', 'Colombo')).toBe(2);
  });
  it('throws on an unknown hub', () => {
    expect(() => shortest(L)('AIR', 'Nowhere' as never)).toThrow();
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

describe('plan, amendment B rules', () => {
  it('skipping an area uses the shortest path', () => {
    const must = ['sigiriya', 'galle'];
    const p = plan({ items, scores: sc(must), days: 9, pace: 1, legs: L, mustIds: must });
    const d = shortest(L);
    expect(p.chosen).toEqual(expect.arrayContaining(must));
    expect(p.travelHours).toBe(d('AIR', 'Sigiriya') + d('Sigiriya', 'Weligama') + d('Weligama', 'AIR'));
  });
  it('holds at most one sunrise item per day in the everything-Keen 14-day plan', () => {
    const s = Object.fromEntries(items.map(i => [i.id, 4]));
    const p = plan({ items, scores: s, days: 14, pace: 1, legs: L });
    expect(p.days.length).toBe(14);
    for (const day of p.days) {
      const sunrises = day.entries.filter(e => e.itemId && byId.get(e.itemId)?.slot === 'sunrise');
      expect(sunrises.length, `day ${day.n}`).toBeLessThanOrEqual(1);
    }
  });
  it.each([0, 1] as Pace[])('places the knuckles item alone on its day at pace %i', pace => {
    const p = plan({ items, scores: sc(['knuckles']), days: 5, pace, legs: L, mustIds: ['knuckles'] });
    expect(p.chosen).toContain('knuckles'); expect(p.fits).toBe(true); expect(p.days.length).toBe(5);
    const day = p.days.find(d => d.entries.some(e => e.itemId === 'knuckles'))!;
    expect(day.entries.length).toBe(1); expect(day.spare).toBe(0);
  });
  it('charges udawalawe the round trip from the Tissa hub', () => {
    const must = ['yala', 'udawalawe'];
    const p = plan({ items, scores: sc(must), days: 5, pace: 1, legs: L, mustIds: must });
    const d = shortest(L);
    expect(p.days.length).toBe(5);
    expect(p.missingMusts.length === 0 || p.missingMusts.length === 1).toBe(true);
    const ws = p.route.find(h => h === 'Tissa' || h === 'Udawalawe')!;
    const entries = p.days.flatMap(x => x.entries);
    const uda = entries.find(e => e.itemId === 'udawalawe'); const yala = entries.find(e => e.itemId === 'yala');
    if (uda) expect(uda.hours).toBeCloseTo(4 + 2 * d(ws, 'Udawalawe'), 6);
    if (yala) expect(yala.hours).toBeCloseTo(4.5 + 1.24 + 2 * d(ws, 'Tissa'), 6);
    // Whichever hub wins, the item away from it pays the round trip.
    const offHub = ws === 'Tissa' ? uda : yala;
    if (offHub) expect(offHub.hours).toBeGreaterThan((offHub === uda ? 4 : 5.74) + 2);
  });
  it('never returns more days than asked unless overflow', () => {
    const s = Object.fromEntries(items.map(i => [i.id, 4]));
    for (const pace of [0, 1, 2] as Pace[]) for (const days of [5, 9, 14, 21]) {
      const p = plan({ items, scores: s, days, pace, legs: L });
      expect(p.overflow ? p.days.length >= days : p.days.length === days, `pace ${pace} days ${days}`).toBe(true);
    }
  });
  it('never drives after a sunset, evening or late activity on the same day', () => {
    const must = ['sigiriya', 'elephants', 'tooth', 'train', 'ellarock', 'yala', 'surf', 'galle'];
    const keen = Object.fromEntries(items.map(i => [i.id, 4]));
    const plans = [
      plan({ items, scores: sc(must), days: 9, pace: 1, legs: L, mustIds: must }),
      plan({ items, scores: keen, days: 14, pace: 1, legs: L }),
    ];
    const night = new Set(['sunset', 'evening', 'late']);
    for (const p of plans) for (const day of p.days) {
      let dark = false;
      for (const e of day.entries) {
        if (e.kind === 'drive') expect(dark, `day ${day.n}: ${e.label}`).toBe(false);
        if (e.kind === 'activity' && night.has(byId.get(e.itemId!)!.slot)) dark = true;
      }
    }
  });
  it('ignores an infeasible forceIn and says so', () => {
    const all = items.map(i => i.id);
    const p = plan({ items, scores: sc(['sigiriya']), days: 5, pace: 1, legs: L, forceIn: all });
    expect(p.forceFailed).toBe(true); expect(p.days.length).toBe(5);
  });
  it('moves the final drive to the day before when the departure day cannot hold it', () => {
    const must = ['galle'];
    const p = plan({ items, scores: sc(must), days: 5, pace: 1, legs: L, mustIds: must });
    const last = p.days.at(-1)!;
    expect(last.entries.every(e => e.kind !== 'drive')).toBe(true);
    expect(p.days.at(-2)!.entries.some(e => e.kind === 'drive' && e.to === 'AIR')).toBe(true);
  });
});

describe('plan, day order (T7 U4)', () => {
  it('no daytime activity follows a sunset, evening or late one on the same day', () => {
    const night = new Set(['sunset', 'evening', 'late']);
    const slotOf = Object.fromEntries(items.map(i => [i.id, i.slot]));
    const all = items.map(i => i.id);
    const plans = [
      plan({ items, scores: Object.fromEntries(all.map(id => [id, 1])), days: 9, pace: 1, legs: L }),
      plan({ items, scores: Object.fromEntries(all.map(id => [id, 4])), days: 14, pace: 0, legs: L }),
    ];
    for (const p of plans) for (const d of p.days) {
      let seenNight = false;
      for (const e of d.entries) {
        if (e.kind !== 'activity' || !e.itemId) continue;
        const isNight = night.has(slotOf[e.itemId]);
        expect(seenNight && !isNight, `day ${d.n}: ${e.label} after an evening item`).toBe(false);
        if (isNight) seenNight = true;
      }
    }
  });
});

describe('activity entries split on-site from round-trip time', () => {
  it('carries onSite = item.hours and roundTrip = hours - item.hours, leaving hours as the total', () => {
    const must = ['sigiriya', 'elephants', 'tooth', 'train', 'ellarock', 'yala', 'surf', 'galle'];
    const p = plan({ items, scores: sc(must), days: 9, pace: 1, legs: L, mustIds: must });
    const acts = p.days.flatMap(d => d.entries).filter(e => e.kind === 'activity');
    expect(acts.length).toBeGreaterThan(0);
    for (const e of acts) {
      const it = byId.get(e.itemId!)!;
      expect(e.onSite).toBe(it.hours);
      expect(e.roundTrip).toBeCloseTo(e.hours - it.hours, 9);
      expect(e.roundTrip!).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(acts.some(e => e.roundTrip! > 0)).toBe(true);
  });
});

// Regenerated once for the batch overflow drop, after every behavioural test passed and no case lost
// score. Never regenerate it to make a change pass.
describe('plan output matches the reference snapshot', () => {
  it.each(snapshot.plans.map(c => [c.name, c] as const))('%s', (_, c) => {
    expect(plan({ items, legs: L, ...(c.input as unknown as Omit<PlanInput, 'items' | 'legs'>) })).toEqual(c.plan);
  });
  it.each(snapshot.mustFitDays.map(c => [c.name, c] as const))('mustFitDays %s', (_, c) => {
    expect(mustFitDays({ items, legs: L, ...(c.input as unknown as Omit<PlanInput, 'items' | 'legs' | 'days'>) })).toBe(c.days);
  });
});

// Evening and late activities have their own budget after the day's sightseeing, so a market in
// the morning and a crab dinner fall on the same day. Checked on the frozen and the live catalogue.
describe.each([['frozen', items], ['live', liveCatalogue.items as Item[]]] as const)('evening budget (%s catalogue)', (_, its) => {
  const slotOf = new Map(its.map(i => [i.id, i.slot]));
  const dayOf = (p: ReturnType<typeof plan>, id: string) => p.days.find(d => d.entries.some(e => e.itemId === id));
  it('puts pettah and the crab dinner on one day of a 5-day trip', () => {
    const must = ['pettah', 'crab'];
    const p = plan({ items: its, scores: sc(must), days: 5, pace: 1, legs: L, mustIds: must });
    expect(p.fits).toBe(true);
    expect(dayOf(p, 'pettah')).toBe(dayOf(p, 'crab'));
  });
  it('lets a sunset and an evening activity share a day', () => {
    const must = ['galleface', 'crab'];
    const p = plan({ items: its, scores: sc(must), days: 5, pace: 1, legs: L, mustIds: must });
    expect(dayOf(p, 'galleface')).toBe(dayOf(p, 'crab'));
  });
  it('combines daytime and evening activities on at least two days of the all-Keen 9-day plan', () => {
    const p = plan({ items: its, scores: sc(its.map(i => i.id), 4), days: 9, pace: 1, legs: L });
    const night = new Set(['evening', 'late']);
    const both = p.days.filter(d => {
      const slots = d.entries.filter(e => e.kind === 'activity').map(e => slotOf.get(e.itemId!)!);
      return slots.some(sl => night.has(sl)) && slots.some(sl => !night.has(sl));
    });
    expect(both.length).toBeGreaterThanOrEqual(2);
  });
});

// Afternoon activities (park safaris, a sunset beach) run until the parks close at 18:00
// (research/google_listings.md: Kaudulla and Hurulu "Closes 6 PM"), so nothing drives after them.
describe.each([['frozen', items], ['live', liveCatalogue.items as Item[]]] as const)('afternoon activities end at dusk (%s catalogue)', (_, its) => {
  const slotOf = new Map(its.map(i => [i.id, i.slot]));
  const all = its.map(i => i.id);
  const plans = [
    ...([0, 1] as Pace[]).flatMap(pace => [9, 14].map(days => [`all Keen ${days}d pace ${pace}`, plan({ items: its, scores: sc(all, 4), days, pace, legs: L })] as const)),
    ['elephants, tooth, sigiriya 9d', plan({ items: its, scores: sc(['elephants', 'tooth', 'sigiriya', 'train']), days: 9, pace: 0, legs: L, mustIds: ['elephants', 'tooth', 'sigiriya', 'train'] })] as const,
  ];
  it.each(plans)('%s: no drive or train after an afternoon activity on the same day', (_, p) => {
    for (const day of p.days) {
      let after = false;
      for (const e of day.entries) {
        if (e.kind === 'drive' || e.kind === 'train') expect(after, `day ${day.n}: ${e.label}`).toBe(false);
        if (e.kind === 'activity' && slotOf.get(e.itemId!) === 'afternoon') after = true;
      }
    }
  });
});

// Direction and Colombo's position change more than travel: they decide which day is the half
// arrival day, what shares the departure day, and where sunrise breaks fall. Each Must set below
// fits only in an order that is not the cheapest-travel one (found by trying every order).
describe('route order is chosen by the plan it gives, not by travel alone', () => {
  const cases: [string[], number, Pace][] = [
    [['rekawa', 'pettah', 'surf', 'galleface'], 5, 1],
    [['horton', 'dambulla', 'train'], 5, 0],
    [['horton', 'crab', 'beachday', 'udawalawe', 'tea'], 6, 0],
  ];
  it.each(cases)('%j fit in %i days at pace %i', (must, days, pace) => {
    const p = plan({ items: liveCatalogue.items as Item[], scores: sc(must), days, pace, legs: L, mustIds: must });
    expect(p.missingMusts).toEqual([]);
    expect(p.days.length).toBe(days);
  });
});

// Before a day closes (say the next item is a sunrise), later activities of the same area that can
// happen any time, in the afternoon or at sunset fill what is left of it, such as the afternoon
// after a drive in. These sets each fit only that way.
describe('a day is filled before it closes', () => {
  const cases: [string[], number, Pace][] = [
    [['beachday', 'kottu', 'coconut', 'pettah', 'polonnaruwa'], 6, 1],
    [['junglebeach', 'sigiriya', 'train', 'coconut'], 6, 2],
    [['diyaluma', 'sigiriya', 'galle', 'surf', 'elephants'], 7, 1],
    [['coconut', 'pettah', 'horton', 'galleface'], 6, 2],
  ];
  it.each(cases)('%j fit in %i days at pace %i', (must, days, pace) => {
    const p = plan({ items: liveCatalogue.items as Item[], scores: sc(must), days, pace, legs: L, mustIds: must });
    expect(p.missingMusts).toEqual([]);
    expect(p.days.length).toBe(days);
  });
});

describe('fixed-time slots', () => {
  const all = items.map(i => i.id);
  const plans = [
    ...([0, 1] as Pace[]).flatMap(pace => [9, 14].map(days => [`all Keen ${days}d pace ${pace}`, plan({ items, scores: sc(all, 4), days, pace, legs: L })] as const)),
    ['all Must 9d', plan({ items, scores: sc(all), days: 9, pace: 1, legs: L, mustIds: all })] as const,
  ];
  it.each(plans)('%s: one sunrise, sunset, evening and late activity per day; two short mornings or afternoons at most', (_, p) => {
    for (const day of p.days) {
      const acts = day.entries.filter(e => e.kind === 'activity').map(e => byId.get(e.itemId!)!);
      const of = (slot: string) => acts.filter(i => i.slot === slot);
      for (const slot of ['sunrise', 'sunset', 'evening', 'late']) expect(of(slot).length, `day ${day.n} ${slot}`).toBeLessThanOrEqual(1);
      for (const [slot, window] of [['morning', 4.5], ['afternoon', 5]] as const) {
        const xs = of(slot);
        expect(xs.length, `day ${day.n} ${slot}`).toBeLessThanOrEqual(2);
        // A single long item may fill its part of the day; a second one must fit the window with it.
        if (xs.length === 2) expect(xs[0].hours + xs[1].hours, `day ${day.n} ${slot} hours`).toBeLessThanOrEqual(window);
      }
    }
  });
  // Colombo is always the arrival day, capped at half a day, so pettah (3 h) + crab (2 h) never
  // fit there; bawa (1 h) + crab is the same morning-plus-dinner shape within the hours.
  it('a morning and an evening activity share a day when the hours allow', () => {
    const p = plan({ items, scores: sc(['sigiriya', 'bawa', 'crab']), days: 9, pace: 1, legs: L });
    const day = p.days.find(d => d.entries.some(e => e.itemId === 'bawa'))!;
    expect(day.entries.some(e => e.itemId === 'crab')).toBe(true);
  });
});

// Seeded Must sets: 15% of items are Musts (10), the rest score 0, 1 or 4.
const mustSets = (its: Item[], count: number, seed = 7) => {
  const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ids = its.map(i => i.id);
  return Array.from({ length: count }, () => {
    const mustIds = ids.filter(() => rand() < 0.15);
    const scores = Object.fromEntries(ids.map(id => [id, mustIds.includes(id) ? 10 : [0, 1, 4][Math.floor(rand() * 3)]]));
    return { scores, mustIds };
  });
};

describe('personal plans keep their Musts', () => {
  // Frozen catalogue, seeded set 4: its Musts fitted at 14-18 days, then lost one at 19 to Keens.
  it('a Must that fits a shorter trip is never traded for Keens on a longer one', () => {
    const { scores, mustIds } = mustSets(items, 4)[3];
    for (let days = 14; days <= 21; days++) {
      const p = plan({ items, scores, mustIds, days, pace: 2, legs: L });
      expect(p.missingMusts, `${days} days`).toEqual([]);
    }
  });
});

describe.each([['frozen', items], ['live', liveCatalogue.items as Item[]]] as const)('mustFitDays binary search equals the linear scan (%s catalogue)', (_, its) => {
  const ids = new Set(its.map(i => i.id));
  const battery = [...snapshot.plans, ...snapshot.mustFitDays]
    .map(c => c.input as { scores: Record<string, number>; mustIds?: string[] })
    .filter(inp => inp.mustIds?.length)
    .map(inp => ({ scores: inp.scores, mustIds: inp.mustIds!.filter(id => ids.has(id)) }));
  const cases = [...battery, ...mustSets(its, 30)].flatMap((set, n) => ([0, 1, 2] as Pace[]).map(pace => [`set ${n + 1} pace ${pace}`, { ...set, pace }] as const));
  it.each(cases)('%s', (_, input) => {
    try {
      planner.linearMustFit = true;
      const linear = mustFitDays({ items: its, legs: L, ...input });
      planner.linearMustFit = false;
      expect(mustFitDays({ items: its, legs: L, ...input })).toBe(linear);
    } finally { planner.linearMustFit = false; }
  });
});

describe('planner caches', () => {
  it('plans the same when the items arrive as a fresh copy, as from a worker', () => {
    const scores = sc(['sigiriya', 'galle', 'yala', 'jaffna', 'trinco']);
    const p = plan({ items, scores, days: 9, pace: 1, legs: L });
    // mustIds: [] misses the plan memo while the cached candidates still match on content.
    const q = plan({ items: structuredClone(items), scores, days: 9, pace: 1, legs: structuredClone(L), mustIds: [] });
    expect(q).toEqual(p);
  });
  it('reuses the shortest-path table for a copy of the legs', () => {
    expect(shortest(structuredClone(L))).toBe(shortest(L));
  });
});

describe('planner speed at 10 areas', () => {
  // CPU time of this test file's process (vitest runs each file in its own fork): the full suite
  // runs files in parallel, so wall time there measures contention as much as the planner.
  const cpuMs = (fn: () => unknown) => { const t = process.cpuUsage(); fn(); const u = process.cpuUsage(t); return (u.user + u.system) / 1000; };
  // Each test warms up on the same inputs first: the app's worker is warm after its first plan, so
  // cold JIT time is not what these bound. The warm-up scores differ by 1e-7 so neither the plan()
  // memo nor its candidate cache can answer the timed call.
  const nudged = (scores: Record<string, number>, by: number) => Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v + by]));
  it('plans the everything-Keen 14-day trip in under 60 ms', () => {
    const s = sc(items.map(i => i.id), 4);
    plan({ items, scores: nudged(s, 1e-7), days: 14, pace: 1, legs: L });
    expect(cpuMs(() => plan({ items, scores: nudged(s, 2e-7), days: 14, pace: 1, legs: L }))).toBeLessThan(60);
  });
  it('finds mustFitDays in under 200 ms', () => {
    const must = ['jaffna', 'delft', 'trinco', 'sigiriya', 'yala', 'galle'];
    const scores = { ...sc(items.map(i => i.id), 1), ...sc(must, 10) };
    mustFitDays({ items, scores: nudged(scores, 1e-7), pace: 1, legs: L, mustIds: must });
    expect(cpuMs(() => mustFitDays({ items, scores: nudged(scores, 2e-7), pace: 1, legs: L, mustIds: must }))).toBeLessThan(200);
  });
  it('builds the 2-north / 3-south group result in under 400 ms', () => {
    const mk = (name: Person, must: string[], meh: string[]): Response => {
      const r = emptyRanking(); r.must = must.map(m => [m]); r.meh = meh.filter(id => !must.includes(id)).map(id => [id]);
      return { name, days: 9, flex: false, pace: 1, ranking: r, rated: items.map(i => i.id), submitted: true, updatedAt: '' };
    };
    const N = ['jaffna', 'delft', 'trinco'], S = ['sigiriya', 'yala', 'galle'];
    const state = (meh: string[]): AppState => ({ responses: { Brittany: mk('Brittany', N, meh), Alex: mk('Alex', N, meh), Antek: mk('Antek', S, meh), Lazza: mk('Lazza', S, meh), Saulie: mk('Saulie', S, meh) }, suggestions: [], votes: [] });
    const ids = items.map(i => i.id);
    // Warm-up with the Meh order reversed: same shape of work, different scores, so no cache hits.
    groupResult(state([...ids].reverse()), items, L);
    expect(cpuMs(() => groupResult(state(ids), items, L))).toBeLessThan(400);
  });
});
