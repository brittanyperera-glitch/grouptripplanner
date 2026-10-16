import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import { PEOPLE, type AppState, type Item, type Leg, type Person, type Vote } from '../types';
import { groupResult } from './group';
import { finalListFrom, score } from './ranking';

// S6: the catalogue exactly as deployed, scuba (late: true) included.
const ALL = (catalogue as unknown as { items: Item[] }).items;
const PLAIN = ALL.filter(i => !i.late);
const L = legs as Leg[];
const THREE: Person[] = ['Brittany', 'Alex', 'Antek'];
const votes = (forkId: string, who: Person[], choice: 'a' | 'b'): Vote[] => who.map(name => ({ forkId, name, choice }));

// Votes every open question through (scuba as told, the rest by summed ratings), then saves `lists` Finalize lists.
function drive(items: Item[], scuba: 'a' | 'b', lists: number, s: AppState = seedState()) {
  let g = groupResult(s, items, L);
  for (let round = 0; round < 15 && g.knockouts.length; round++) {
    for (const k of g.knockouts) {
      const sum = (p: Person, ids: string[]) => ids.reduce((n, id) => n + score(s.responses[p]!.ranking, id), 0);
      const choice = k.forkId === 'ko:scuba' ? scuba : PEOPLE.filter(p => sum(p, k.a) >= sum(p, k.b)).length >= 3 ? 'a' : 'b';
      s.votes.push(...votes(k.forkId, THREE, choice));
    }
    g = groupResult(s, items, L);
  }
  for (const p of PEOPLE.slice(0, lists)) s.responses[p]!.final = finalListFrom(s.responses[p]!.ranking, g.knocked);
  return { s, g: groupResult(s, items, L) };
}

describe('the deployed catalogue, scuba included', () => {
  it('scuba is asked first with a fit line, and the ordinary questions are the same as without it', () => {
    const g = groupResult(seedState(), ALL, L);
    expect(g.knockouts[0].forkId).toBe('ko:scuba');
    expect(g.knockouts[0].fit).toBeDefined();
    expect(g.knockouts.slice(1)).toEqual(groupResult(seedState(), PLAIN, L).knockouts);
  });
  for (const side of ['a', 'b'] as const) {
    it(`B1: scuba settled '${side}' before the fifth list keeps that outcome once all five are saved`, () => {
      const { s, g: four } = drive(ALL, side, 4);
      expect(four.final!.chosen.includes('scuba')).toBe(side === 'a');
      s.responses[PEOPLE[4]]!.final = finalListFrom(s.responses[PEOPLE[4]]!.ranking, four.knocked);
      const five = groupResult(s, ALL, L);
      expect(five.locked).toBe(true);
      expect(five.knockouts).toEqual([]);
      expect(five.final!.chosen.includes('scuba')).toBe(side === 'a');
      expect(five.results.find(r => r.forkId === 'ko:scuba')?.winner).toBe(side);
    });
  }
  it('S1: a reopened plan holds the plan as locked until the vote settles', () => {
    const { s, g: locked } = drive(PLAIN, 'a', 5);
    expect(locked.locked).toBe(true);
    const open = groupResult(s, ALL, L);
    expect(open.knockouts.map(k => k.forkId)).toEqual(['ko:scuba']);
    expect(open.final).toBeNull();
    expect(open.held).toEqual(locked.final);
    const done = groupResult({ ...s, votes: [...s.votes, ...votes('ko:scuba', THREE, 'a')] }, ALL, L);
    expect(done.locked).toBe(true);
    expect(done.held).toBeUndefined();
    expect(done.final!.chosen).toContain('scuba');
  });
  it('S7: a late item that cannot fit gets a "nofit" result, never a silent drop, and never reopens a locked plan', () => {
    const huge: Item = { ...ALL.find(i => i.id === 'scuba')!, id: 's:huge', name: 'Huge', hours: 200 };
    const open = groupResult(seedState(), [...ALL, huge], L);
    expect(open.results).toContainEqual({ forkId: 'ko:s:huge:nofit', a: ['s:huge'], b: [], winner: 'nofit' });
    expect(open.knockouts.map(k => k.forkId)).not.toContain('ko:s:huge');
    const { s, g: locked } = drive(PLAIN, 'a', 5);
    const after = groupResult(s, [...PLAIN, huge], L);
    expect(after.locked).toBe(true);
    expect(after.final).toEqual(locked.final);
    expect(after.results.at(-1)).toEqual({ forkId: 'ko:s:huge:nofit', a: ['s:huge'], b: [], winner: 'nofit' });
  });
});
