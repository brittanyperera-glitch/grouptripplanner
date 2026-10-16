import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import genres from '../data/genres.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { AppState, Genre, Item, Leg, Person, Vote } from '../types';
import baseline from './__fixtures__/group-baseline.json';
import { groupResult, VOTES_TO_RESOLVE } from './group';
import { plan } from './planner';
import { score } from './ranking';

const ITEMS = (catalogue as unknown as { items: Item[] }).items.filter(i => !i.late); // the real late entry would add a second late fork
const L = legs as Leg[];
const G = genres as unknown as Genre[];
const hiri = ITEMS.find(i => i.id === 'hiriketiya')!;
const LATE: Item = { ...hiri, id: 's:scuba', name: 'Scuba diving', about: '', suggestedBy: 'Lazza', late: true };
const withLate = [...ITEMS, LATE];
const votes = (forkId: string, who: Person[], choice: 'a' | 'b'): Vote[] => who.map(name => ({ forkId, name, choice }));
const FIVE: Person[] = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];
const run = (state: AppState = seedState(), items: Item[] = withLate) => groupResult(state, items, L, G);

describe('late items go straight to the head to head', () => {
  it('(a) a late South-coast 6h item with no ratings gets a ko: fork', () => {
    const g = run();
    expect(g.knockouts.map(k => k.forkId)).toContain('ko:s:scuba');
  });
  it('(a2) a second late item sharing places with the first still gets its fork, minus the shared places', () => {
    const second: Item = { ...LATE, id: 's:snorkel', name: 'Snorkelling' };
    const g = run(seedState(), [...withLate, second]);
    const ids = g.knockouts.map(k => k.forkId);
    expect(ids.slice(0, 2)).toEqual(['ko:s:scuba', 'ko:s:snorkel']);
    const [one, two] = g.knockouts;
    expect(one.a).toContain('beachday');
    expect(two.a).not.toContain('beachday');
    expect(two.a[0]).toBe('s:snorkel');
  });
  it('(b) the late fork is first in knockouts', () => {
    expect(run().knockouts[0].forkId).toBe('ko:s:scuba');
  });
  it('(c) four ordinary forks are unchanged and the cap is not consumed', () => {
    const plain = groupResult(seedState(), ITEMS, L, G).knockouts;
    const ordinary = plain.filter(k => k.forkId.startsWith('ko:'));
    expect(ordinary).toHaveLength(4);
    const g = run();
    expect(g.knockouts.map(k => k.forkId)).toEqual(['ko:s:scuba', ...ordinary.map(k => k.forkId)]);
    expect(g.knockouts.slice(1)).toEqual(plain);
  });
  it('(c2) late forks do not use up the five ordinary places', () => {
    const extra = ['s:snorkel', 's:kayak', 's:dive2'].map(id => ({ ...LATE, id, name: id }));
    const plain = groupResult(seedState(), ITEMS, L, G).knockouts.map(k => k.forkId);
    const ids = run(seedState(), [...withLate, ...extra]).knockouts.map(k => k.forkId);
    expect(ids.filter(f => f.startsWith('ko:s:'))).toHaveLength(4);
    expect(ids.filter(f => !f.startsWith('ko:s:'))).toEqual(plain);
  });
  it('(d) fit names the day of the forced plan and the travel difference', () => {
    const state = seedState();
    const rs = FIVE.map(p => state.responses[p]!);
    const scores = Object.fromEntries(withLate.map(i => [i.id, rs.reduce((n, r) => n + score(r.ranking, i.id), 0)]));
    const mk = (forceIn: string[]) => plan({ items: withLate, scores, days: 9, pace: 1, legs: L, forceIn, forceOut: [] });
    const before = mk([]), forced = mk(['s:scuba']);
    const fit = run().knockouts[0].fit!;
    const idx = forced.days.findIndex(d => d.entries.some(e => e.itemId === 's:scuba'));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(fit.day).toBe(idx + 1);
    expect(fit.hub).toBe(forced.days[idx].area);
    expect(fit.travelBefore).toBeCloseTo(before.travelHours, 9);
    expect(fit.travelAfter).toBeCloseTo(forced.travelHours, 9);
    expect(fit.travelAfter - fit.travelBefore).toBeCloseTo(forced.travelHours - before.travelHours, 9);
  });
  it('(e) three A votes from people resolve it into the plan and knock down b; three B knock it down', () => {
    const three: Person[] = ['Brittany', 'Alex', 'Antek'];
    const k = run().knockouts[0];
    const a = run({ ...seedState(), votes: votes('ko:s:scuba', three, 'a') });
    expect(three).toHaveLength(VOTES_TO_RESOLVE);
    expect(a.results.find(r => r.forkId === 'ko:s:scuba')?.winner).toBe('a');
    expect(a.knockouts.map(x => x.forkId)).not.toContain('ko:s:scuba');
    for (const id of k.b) expect(a.knocked).toContain(id);
    const b = run({ ...seedState(), votes: votes('ko:s:scuba', three, 'b') });
    expect(b.results.find(r => r.forkId === 'ko:s:scuba')?.winner).toBe('b');
    expect(b.knocked).toContain('s:scuba');
  });
  it('(f) with no late items the result equals the pre-change baseline', () => {
    const s0 = seedState();
    const forks = baseline.forks;
    const v = (c: 'a' | 'b'): Vote[] => votes(forks[0], ['Brittany', 'Alex', 'Antek'], c);
    const cur = {
      forks,
      r0: groupResult(s0, ITEMS, L, G),
      r1: groupResult({ ...s0, votes: v('a') }, ITEMS, L, G),
      r2: groupResult({ ...s0, votes: v('b') }, ITEMS, L, G),
      r3: groupResult(s0, ITEMS, L),
    };
    expect(JSON.parse(JSON.stringify(cur))).toEqual(baseline);
  });
  it('(g) a non-late item rated by nobody never becomes contested', () => {
    const plain: Item = { ...LATE, late: undefined };
    const g = run(seedState(), [...ITEMS, plain]);
    expect(g.knockouts.map(k => k.forkId)).not.toContain('ko:s:scuba');
    expect(FIVE).toHaveLength(5);
  });
});
