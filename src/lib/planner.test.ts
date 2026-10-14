import { describe, it, expect } from 'vitest';
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { plan, mustFitDays } from './planner';
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
  // Scores nudged by 1e-7 so the plan() memo cannot answer from an earlier test.
  it('plans the everything-Keen 14-day trip in under 60 ms', () => {
    const s = Object.fromEntries(items.map(i => [i.id, 4 + 1e-7]));
    expect(cpuMs(() => plan({ items, scores: s, days: 14, pace: 1, legs: L }))).toBeLessThan(60);
  });
  it('finds mustFitDays in under 200 ms', () => {
    const must = ['jaffna', 'delft', 'trinco', 'sigiriya', 'yala', 'galle'];
    const scores = { ...sc(items.map(i => i.id), 1 + 1e-7), ...sc(must, 10) };
    expect(cpuMs(() => mustFitDays({ items, scores, pace: 1, legs: L, mustIds: must }))).toBeLessThan(200);
  });
  it('builds the 2-north / 3-south group result in under 400 ms', () => {
    const mk = (name: Person, must: string[]): Response => {
      const r = emptyRanking(); r.must = must.map(m => [m]); r.meh = items.filter(i => !must.includes(i.id)).map(i => [i.id]);
      return { name, days: 9, flex: false, pace: 1, ranking: r, rated: items.map(i => i.id), submitted: true, updatedAt: '' };
    };
    const N = ['jaffna', 'delft', 'trinco'], S = ['sigiriya', 'yala', 'galle'];
    const state: AppState = { responses: { Brittany: mk('Brittany', N), Alex: mk('Alex', N), Antek: mk('Antek', S), Lazza: mk('Lazza', S), Saulie: mk('Saulie', S) }, suggestions: [], votes: [] };
    expect(cpuMs(() => groupResult(state, items, L))).toBeLessThan(400);
  });
});
