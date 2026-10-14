import { describe, it, expect } from 'vitest';
import catalogue from '../data/catalogue.json'; import legs from '../data/legs.json';
import { groupResult, personPlan } from './group';
import { emptyRanking, type AppState, type Item, type Leg, type Person, type Response } from '../types';
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
});

describe('group performance', () => {
  it('group logic is fast enough', () => {
    const t = performance.now(); groupResult(base(), items, L); expect(performance.now() - t).toBeLessThan(4000);
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
