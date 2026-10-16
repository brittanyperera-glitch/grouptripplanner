import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import { PEOPLE, type AppState, type Item, type Leg, type Person, type Vote } from '../types';
import { groupResult, VOTES_TO_RESOLVE } from './group';
import { finalListFrom, score } from './ranking';

// Real items only: the live catalogue now carries late items, which would add a fork to every state.
const ITEMS = (catalogue as unknown as { items: Item[] }).items.filter(i => !i.late);
const L = legs as Leg[];
const hiri = ITEMS.find(i => i.id === 'hiriketiya')!;
const LATE: Item = { ...hiri, id: 's:scuba', name: 'Scuba diving', about: '', suggestedBy: 'Lazza', late: true };
const THREE: Person[] = ['Brittany', 'Alex', 'Antek'];
const votes = (forkId: string, who: Person[], choice: 'a' | 'b'): Vote[] => who.map(name => ({ forkId, name, choice }));

// Every ordinary fork voted through, then all five Finalize lists saved: the plan is locked.
function lockedState(): AppState {
  const s = seedState();
  let g = groupResult(s, ITEMS, L);
  for (let round = 0; round < 12 && g.knockouts.length; round++) {
    for (const k of g.knockouts) {
      const sum = (p: Person, ids: string[]) => ids.reduce((n, id) => n + score(s.responses[p]!.ranking, id), 0);
      const choice = PEOPLE.filter(p => sum(p, k.a) >= sum(p, k.b)).length >= 3 ? 'a' : 'b';
      s.votes.push(...votes(k.forkId, THREE, choice));
    }
    g = groupResult(s, ITEMS, L);
  }
  for (const p of PEOPLE) s.responses[p]!.final = finalListFrom(s.responses[p]!.ranking, g.knocked);
  return s;
}

describe('a late item reopens a locked plan for one vote', () => {
  const s = lockedState();
  const before = groupResult(s, ITEMS, L);
  const withLate = [...ITEMS, LATE];
  const run = (extra: Vote[] = []) => groupResult({ ...s, votes: [...s.votes, ...extra] }, withLate, L);

  it('the fixture is locked with nothing open', () => {
    expect(before.locked).toBe(true);
    expect(before.knockouts).toEqual([]);
    expect(before.final).not.toBeNull();
  });
  it('an unresolved late item unlocks the plan and shows exactly that one fork', () => {
    const g = run();
    expect(g.locked).toBe(false);
    expect(g.knockouts.map(k => k.forkId)).toEqual(['ko:s:scuba']);
    expect(g.knockouts[0].fit).toBeDefined();
  });
  it('the fork is measured against the locked plan, not the earlier head to head plan', () => {
    const k = run().knockouts[0];
    expect(k.b.length).toBeGreaterThan(0);
    for (const id of k.b) expect(before.final!.chosen).toContain(id);
    expect(k.fit!.travelBefore).toBeCloseTo(before.final!.travelHours, 9);
  });
  it('three A votes lock it again with the place in and the dropped side knocked down', () => {
    const open = run().knockouts[0];
    const g = run(votes('ko:s:scuba', THREE, 'a'));
    expect(THREE).toHaveLength(VOTES_TO_RESOLVE);
    expect(g.locked).toBe(true);
    expect(g.knockouts).toEqual([]);
    expect(g.final!.chosen).toContain('s:scuba');
    for (const id of open.b) { expect(g.knocked).toContain(id); expect(g.final!.chosen).not.toContain(id); }
    const lost = before.final!.chosen.filter(id => !g.final!.chosen.includes(id));
    expect(lost.sort()).toEqual([...open.b].sort());
    for (const id of g.final!.chosen) expect([...before.final!.chosen, ...open.a]).toContain(id);
  });
  it('three B votes lock it again with the late place knocked down and the plan unchanged', () => {
    const g = run(votes('ko:s:scuba', THREE, 'b'));
    expect(g.locked).toBe(true);
    expect(g.knockouts).toEqual([]);
    expect(g.knocked).toContain('s:scuba');
    expect(g.final!.chosen).not.toContain('s:scuba');
    expect([...g.final!.chosen].sort()).toEqual([...before.final!.chosen].sort());
    expect(g.final!.score).toBeCloseTo(before.final!.score, 9);
  });
  it('nobody has to finalize again', () => {
    const g = run(votes('ko:s:scuba', THREE, 'a'));
    expect(g.finalized).toEqual([...PEOPLE]);
  });
});
