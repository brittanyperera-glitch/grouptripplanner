import { describe, it, expect } from 'vitest';
import catalogue from './__fixtures__/catalogue-46.json'; import legs from '../data/legs.json';
import { groupResult, personPlan } from './group';
import liveCatalogue from '../data/catalogue.json';
import { plan } from './planner';
import { BASE, score, tierOf } from './ranking';
import { PEOPLE, emptyRanking, type AppState, type Item, type Leg, type Person, type Response, type Tier } from '../types';
const items = catalogue.items as Item[]; const L = legs as Leg[];
// Five seeded people rating every item: about 15% Must, 30% Keen, 30% Meh, 25% Skip.
const seeded = (its: Item[], seed: number): AppState => {
  let x = seed * 7919;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const responses: AppState['responses'] = {};
  for (const name of PEOPLE) {
    const r = emptyRanking();
    for (const i of its) { const u = rand(); const t: Tier = u < 0.15 ? 'must' : u < 0.45 ? 'keen' : u < 0.75 ? 'meh' : 'skip'; r[t].push([i.id]); }
    responses[name] = { name, days: 9, flex: false, pace: 1, ranking: r, rated: its.map(i => i.id), submitted: true, updatedAt: '' };
  }
  return { responses, suggestions: [], votes: [] };
};
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
    const s = base(); s.responses.Saulie!.submitted = false;
    const g = groupResult(s, items, L);
    expect(g.open).toBe(false); expect(g.base).toBeNull(); expect(g.final).toBeNull();
    expect(g.knockouts).toEqual([]); expect(g.results).toEqual([]); expect(g.extras).toEqual([]);
  });
  it('uses the shortest committed length, flexible as 14', () => {
    expect(groupResult(base(), items, L).days).toBe(9);
  });
  it('deterministic knockouts and a non-empty extras list', () => {
    const g1 = groupResult(base(), items, L), g2 = groupResult(base(), items, L);
    expect(g1.knockouts.length).toBeGreaterThan(0); expect(g1.knockouts.map(k => k.forkId)).toEqual(g2.knockouts.map(k => k.forkId));
    expect(g1.extras.length).toBeGreaterThan(0);
  });
  it('resolves forks sequentially, never deadlocks, and every fork id is stable across calls', () => {
    const s = base(); let g = groupResult(s, items, L);
    const ids1 = g.knockouts.map(k => k.forkId);
    expect(groupResult(s, items, L).knockouts.map(k => k.forkId)).toEqual(ids1);
    for (let round = 0; round < 6 && !g.final; round++) {
      for (const k of g.knockouts) for (const name of ['Brittany', 'Alex', 'Lazza'] as const) s.votes.push({ forkId: k.forkId, name, choice: 'a' });
      g = groupResult(s, items, L);
    }
    expect(g.final).not.toBeNull();
    expect(g.final!.days.length).toBe(9);
    const winners = g.results.filter(r => r.winner === 'a').map(r => r.a[0]);
    for (const w of winners) expect(g.final!.chosen).toContain(w);
    expect(g.knockouts.length).toBe(0);
  });
  it('three votes resolve a fork even if two people never vote', () => {
    const s = base(); const g = groupResult(s, items, L); const k = g.knockouts[0];
    for (const name of ['Alex', 'Antek', 'Saulie'] as const) s.votes.push({ forkId: k.forkId, name, choice: 'b' });
    const g2 = groupResult(s, items, L);
    expect(g2.results.find(r => r.forkId === k.forkId)?.winner).toBe('b');
  });
  it('two votes alone leave the fork open', () => {
    const s = base(); const k = groupResult(s, items, L).knockouts[0];
    for (const name of ['Alex', 'Antek'] as const) s.votes.push({ forkId: k.forkId, name, choice: 'a' });
    const g2 = groupResult(s, items, L);
    expect(g2.results.find(r => r.forkId === k.forkId)).toBeUndefined();
    const open = g2.knockouts.find(x => x.forkId === k.forkId)!;
    expect(open.votes.a).toEqual(['Alex', 'Antek']); expect(open.votes.b).toEqual([]);
    expect(g2.final).toBeNull();
  });
  it('never asks the same question twice: open forks share no a-side item and have distinct a-sets', () => {
    const ko = groupResult(base(), items, L).knockouts;
    const seen = new Set<string>();
    for (const k of ko) for (const id of k.a) { expect(seen.has(id)).toBe(false); seen.add(id); }
    const keys = ko.map(k => [...k.a].sort().join(',') + '|' + [...k.b].sort().join(','));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('ignores votes on fork ids that are not in the current list', () => {
    const s = base(); s.votes.push({ forkId: 'ko:nope:', name: 'Alex', choice: 'a' });
    expect(groupResult(s, items, L).knockouts.map(k => k.forkId)).toEqual(groupResult(base(), items, L).knockouts.map(k => k.forkId));
  });
  it('fork ids are ko:<contested item> and votes survive an earlier fork resolving (R5)', () => {
    const s = base(); const g0 = groupResult(s, items, L);
    expect(g0.knockouts.length).toBeGreaterThan(1);
    for (const k of g0.knockouts) expect(k.forkId).toBe(`ko:${k.a[0]}`);
    const first = g0.knockouts[0], second = g0.knockouts[1];
    for (const name of ['Alex', 'Antek'] as const) s.votes.push({ forkId: second.forkId, name, choice: 'a' });
    for (const name of ['Brittany', 'Alex', 'Lazza'] as const) s.votes.push({ forkId: first.forkId, name, choice: 'a' });
    const g1 = groupResult(s, items, L);
    expect(g1.results.find(r => r.forkId === first.forkId)?.winner).toBe('a');
    const kept = g1.knockouts.find(k => k.forkId === second.forkId);
    expect(kept).toBeDefined(); expect(kept!.votes.a).toEqual(['Alex', 'Antek']);
  });
  it('R6: no extras when the group already has 14 days; otherwise extras are computed at 14', () => {
    const s = base(); s.responses.Brittany!.days = 14; s.responses.Saulie!.days = 14; s.responses.Lazza!.days = 14;
    const g14 = groupResult(s, items, L);
    expect(g14.days).toBe(14); expect(g14.extras).toEqual([]);
    const g9 = groupResult(base(), items, L);
    expect(g9.days).toBe(9); expect(g9.extras.length).toBeGreaterThan(0);
  });
  // The 5-question cap counts questions asked. Two people Must all five north items, so those top
  // the contested list; behind the open "North or South?" fork they used to fill the 5 places and
  // then be skipped, leaving no question for the south Musts that did not fit.
  it('asks item questions for the south while the region fork holds the north items back', () => {
    const N5 = ['jaffna', 'delft', 'nainativu', 'trinco', 'pigeon'];
    const mk = (name: Person, must: string[]): Response => {
      const r = emptyRanking(); r.must = must.map(m => [m]); r.meh = items.filter(i => !must.includes(i.id)).map(i => [i.id]);
      return { name, days: 9, flex: false, pace: 1, ranking: r, rated: items.map(i => i.id), submitted: true, updatedAt: '' };
    };
    const g = groupResult({ responses: {
      Brittany: mk('Brittany', N5), Alex: mk('Alex', N5),
      Antek: mk('Antek', ['sigiriya', 'yala', 'galle', 'knuckles']),
      Lazza: mk('Lazza', ['ellarock', 'horton', 'polonnaruwa', 'hiriketiya']),
      Saulie: mk('Saulie', ['anuradhapura', 'diyaluma', 'rafting', 'train']),
    }, suggestions: [], votes: [] }, items, L);
    const asked = g.knockouts.filter(k => k.forkId.startsWith('ko:'));
    expect(g.knockouts[0].forkId).toBe('region:north');
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.length).toBeLessThanOrEqual(5);
    expect(asked.every(k => !N5.includes(k.forkId.slice(3)))).toBe(true);
  });
  // "With 14 days you'd also get..." means the plan plus every extra, in one 14-day trip.
  it('extras all fit alongside the plan in 14 days', () => {
    const live = liveCatalogue.items as Item[];
    for (let seed = 1; seed <= 12; seed++) {
      const s = seeded(live, seed);
      const g = groupResult(s, live, L);
      const kept = (g.final ?? g.base)!.chosen;
      const scores = Object.fromEntries(live.map(i => [i.id, Object.values(s.responses).reduce((n, r) => n + score(r!.ranking, i.id), 0)]));
      const q = plan({ items: live, scores, days: 14, pace: g.pace, legs: L, forceIn: [...kept, ...g.extras.map(e => e.id)] });
      expect(q.forceFailed, `seed ${seed}`).toBeUndefined();
    }
  });
  it('group plan never claims it does not fit', () => {
    const g = groupResult(base(), items, L);
    expect(g.base!.missingMusts).toEqual([]);
  });
});

describe('personPlan', () => {
  it('a classic Musts-only plan fits and reports no fit-days', () => {
    const p = personPlan(base().responses.Brittany!, items, L);
    expect(p.fits).toBe(true); expect(p.mustFit).toBeNull(); expect(p.days.length).toBe(9);
  });
  it('too many heavy Musts do not fit and report the days needed', () => {
    const r = base().responses.Antek!; r.flex = false; r.days = 5;
    const p = personPlan(r, items, L);
    expect(p.fits).toBe(false); expect(p.mustFit).toBeGreaterThan(5);
  });
  it('defaults to 9 days and balanced pace', () => {
    const r = base().responses.Lazza!; r.days = null; r.pace = null;
    expect(personPlan(r, items, L).days.length).toBe(9);
  });
  // The Days screen offers 5 to 21; a stored value outside that (an old row, a hand edit) must not
  // crash the plan worker.
  it('treats a stored trip length outside 5 to 21 as the nearest end of that range', () => {
    const r = base().responses.Lazza!;
    r.days = 1; expect(personPlan(r, items, L).days.length).toBe(5);
    r.days = 40; expect(personPlan(r, items, L).days.length).toBe(21);
    const s = base(); s.responses.Alex!.days = 0;
    expect(groupResult(s, items, L).days).toBe(5);
  });
});

describe('group performance', () => {
  it('group logic is fast enough', () => {
    const t = performance.now(); groupResult(base(), items, L); expect(performance.now() - t).toBeLessThan(4000);
  });
});

// D5 (Brittany 2026-10-15): the losing side of an item head to head is knocked down, not out.
// Seed 5 on the live catalogue, 9 days. These votes are what the five would vote by their own scores.
const SEED5_VOTES: [string, 'a' | 'b'][] = [['region:north', 'b'], ['ko:knuckles', 'b'], ['ko:rafting', 'a'], ['ko:pettah', 'b'], ['ko:crab', 'a'], ['ko:diyaluma', 'b']];
const seed5 = (votes: [string, 'a' | 'b'][]) => {
  const s = seeded(liveCatalogue.items as Item[], 5);
  for (const [forkId, choice] of votes) for (const name of ['Brittany', 'Alex', 'Antek'] as const) s.votes.push({ forkId, name, choice });
  return s;
};
// Votes for every open question by each person's own scores, until nothing is open.
const voteThrough = (s: AppState, its: Item[]) => {
  let g = groupResult(s, its, L);
  for (let round = 0; round < 12 && g.knockouts.length; round++) {
    for (const k of g.knockouts) {
      const sum = (p: Person, ids: string[]) => ids.reduce((n, id) => n + score(s.responses[p]!.ranking, id), 0);
      const choice = PEOPLE.filter(p => sum(p, k.a) >= sum(p, k.b)).length >= 3 ? 'a' : 'b';
      for (const name of PEOPLE.slice(0, 3)) s.votes.push({ forkId: k.forkId, name, choice });
    }
    g = groupResult(s, its, L);
  }
  return g;
};

describe('knocked down, not out (D5)', () => {
  it('items that lost a head to head come back when a later result reroutes the trip past them', () => {
    const g = groupResult(seed5(SEED5_VOTES), liveCatalogue.items as Item[], L);
    expect(g.knockouts).toEqual([]);
    const lost = g.results.flatMap(r => !r.forkId.startsWith('ko:') ? [] : r.winner === 'a' ? r.b : r.winner === 'b' ? [r.a[0]] : []);
    expect(lost).toEqual(expect.arrayContaining(['pettah', 'beachday', 'rekawa']));
    for (const id of ['pettah', 'beachday', 'rekawa']) expect(g.final!.chosen).toContain(id);
  });
  it('a knocked-down item counts each Must rating of it as a bare Keen', () => {
    const s = seed5(SEED5_VOTES); const live = liveCatalogue.items as Item[];
    const g = groupResult(s, live, L);
    const lost = new Set(g.results.flatMap(r => !r.forkId.startsWith('ko:') ? [] : r.winner === 'a' ? r.b : r.winner === 'b' ? [r.a[0]] : []));
    const rs = Object.values(s.responses);
    const demoted = (id: string) => rs.reduce((n, r) => n + (tierOf(r!.ranking, id) === 'must' ? BASE.keen : score(r!.ranking, id)), 0);
    const raw = (id: string) => rs.reduce((n, r) => n + score(r!.ranking, id), 0);
    const back = g.final!.chosen.filter(id => lost.has(id));
    expect(back.some(id => rs.some(r => tierOf(r!.ranking, id) === 'must'))).toBe(true);
    expect(g.final!.score).toBeCloseTo(g.final!.chosen.reduce((n, id) => n + (lost.has(id) ? demoted(id) : raw(id)), 0), 6);
  });
  it('later Keep votes leave the side the group voted to add in the plan', () => {
    const votes = SEED5_VOTES.map(([f, c]): [string, 'a' | 'b'] => [f, f === 'ko:crab' ? 'b' : c]);
    const g = groupResult(seed5(votes), liveCatalogue.items as Item[], L);
    expect(g.knockouts).toEqual([]);
    const add = g.results.find(r => r.forkId === 'ko:rafting')!;
    expect(add.winner).toBe('a');
    for (const id of add.a) expect(g.final!.chosen).toContain(id);
  });
  it('never asks about an item twice, finishes, and gives the same result every time', () => {
    for (const [its, days] of [[liveCatalogue.items as Item[], 9], [items, 9], [liveCatalogue.items as Item[], 14]] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        const s = seeded(its, seed); for (const r of Object.values(s.responses)) r!.days = days;
        const g = voteThrough(s, its);
        expect(g.final, `seed ${seed}`).not.toBeNull();
        const ids = [...g.results.map(r => r.forkId), ...g.knockouts.map(k => k.forkId)];
        const items1 = ids.filter(f => f.startsWith('ko:')).map(f => f.split(':')[1]);
        expect(new Set(items1).size, `seed ${seed}`).toBe(items1.length);
        expect(JSON.stringify(groupResult(s, its, L))).toBe(JSON.stringify(g));
      }
    }
  });
});

// Two people want the north, three want the south, everyone else is Meh, 9 days, balanced pace.
const NORTH_AREAS = ['North', 'East coast'];
const northIds = items.filter(i => NORTH_AREAS.includes(i.area)).map(i => i.id);
const splitState = (northMust: string[], southMust: string[]): AppState => {
  const mk = (name: Person, must: string[]): Response => {
    const r = emptyRanking(); r.must = must.map(m => [m]); r.meh = items.filter(i => !must.includes(i.id)).map(i => [i.id]);
    return { name, days: 9, flex: false, pace: 1, ranking: r, rated: items.map(i => i.id), submitted: true, updatedAt: '' };
  };
  return { responses: {
    Brittany: mk('Brittany', northMust), Alex: mk('Alex', northMust),
    Antek: mk('Antek', southMust), Lazza: mk('Lazza', southMust), Saulie: mk('Saulie', southMust),
  }, suggestions: [], votes: [] };
};
const NORTH_MUST = ['jaffna', 'delft', 'trinco'], SOUTH_MUST = ['sigiriya', 'yala', 'galle'];

describe('North or South region knockout', () => {
  it('2 north vs 3 south yields one region fork first and no item forks for north items while open', () => {
    const g = groupResult(splitState(NORTH_MUST, SOUTH_MUST), items, L);
    expect(g.knockouts.filter(k => k.forkId.startsWith('region:')).map(k => k.forkId)).toEqual(['region:north']);
    expect(g.knockouts[0].forkId).toBe('region:north');
    for (const id of ['jaffna', 'trinco', 'delft']) expect(g.knockouts.map(k => k.forkId)).not.toContain(`ko:${id}`);
    const k = g.knockouts[0];
    expect(k.a.length).toBeGreaterThan(0); expect(k.a.every(id => northIds.includes(id))).toBe(true);
    expect(k.b.length).toBeGreaterThan(0); expect(k.b.every(id => !northIds.includes(id))).toBe(true);
    expect(g.final).toBeNull();
  });
  it('no region fork when nobody rates a north item Must or Keen', () => {
    const g = groupResult(splitState([], SOUTH_MUST), items, L);
    expect(g.knockouts.some(k => k.forkId.startsWith('region:'))).toBe(false);
    expect(g.results.some(r => r.forkId.startsWith('region:'))).toBe(false);
  });
  it('3 votes for South force every north item out; 3 votes for North put the north items in', () => {
    const vote = (s: AppState, choice: 'a' | 'b') => { for (const name of ['Brittany', 'Alex', 'Lazza'] as const) s.votes.push({ forkId: 'region:north', name, choice }); };
    const sB = splitState(NORTH_MUST, SOUTH_MUST); vote(sB, 'b');
    const gB = groupResult(sB, items, L);
    expect(gB.results[0]).toMatchObject({ forkId: 'region:north', winner: 'b' });
    expect(gB.knockouts.some(k => k.a.some(id => northIds.includes(id)) || k.forkId.startsWith('region:'))).toBe(false);
    expect(gB.results.some(r => r.winner === 'displaced' && northIds.includes(r.a[0]))).toBe(false);
    const planB = gB.final ?? gB.base!;
    expect(planB.chosen.some(id => northIds.includes(id))).toBe(false);
    expect(planB.areas.some(a => NORTH_AREAS.includes(a))).toBe(false);

    const fork = groupResult(splitState(NORTH_MUST, SOUTH_MUST), items, L).knockouts[0];
    const sA = splitState(NORTH_MUST, SOUTH_MUST); vote(sA, 'a');
    const gA = groupResult(sA, items, L);
    expect(gA.results[0]).toMatchObject({ forkId: 'region:north', winner: 'a' });
    for (const id of NORTH_MUST) expect(fork.a).toContain(id);
    expect(gA.knockouts.filter(k => k.forkId.startsWith('ko:') && (northIds.includes(k.forkId.slice(3)) || k.a.some(id => northIds.includes(id))))).toEqual([]);
    expect(gA.results.some(r => r.forkId !== 'region:north' && (r.a.concat(r.b)).some(id => northIds.includes(id)))).toBe(false);
    const planA = gA.final ?? gA.base!;
    expect(gA.final).not.toBeNull();
    expect(planA.chosen.filter(id => northIds.includes(id)).sort()).toEqual([...fork.a].sort());
    for (const id of fork.a) expect(planA.chosen).toContain(id);
    expect(planA.areas.some(a => NORTH_AREAS.includes(a))).toBe(true);
  });
});
