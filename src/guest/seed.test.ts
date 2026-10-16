import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { groupResult } from '../lib/group';
import { GUESTS, PEOPLE, emptyRanking, type Item, type Leg, type Response } from '../types';
import { seedState } from './seed';

const items = (catalogue as unknown as { items: Item[] }).items;
const legs = legsData as unknown as Leg[];

describe('seedState', () => {
  it('has five submitted rows, one per person, with real item ids', () => {
    const s = seedState();
    expect(Object.keys(s.responses).sort()).toEqual([...PEOPLE].sort());
    const ids = new Set(items.map(i => i.id));
    for (const p of PEOPLE) {
      const r = s.responses[p]!;
      expect(r.submitted).toBe(true);
      for (const tier of Object.values(r.ranking)) for (const lvl of tier) for (const id of lvl) expect(ids.has(id)).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(seedState()).toEqual(seedState());
  });

  it('(a) group result does not throw and has a non-empty plan', () => {
    const g = groupResult(seedState(), items, legs);
    expect(g.open).toBe(true);
    expect(g.base).not.toBeNull();
    expect(g.final ?? g.base!).toBeTruthy();
    expect((g.final ?? g.base!).chosen.length).toBeGreaterThan(0);
    expect((g.final ?? g.base!).days.length).toBeGreaterThan(0);
  });

  it.each(GUESTS)('(b) an all-Must %s row changes nothing in the group result', (id) => {
    const setup = seedState();
    const r = emptyRanking();
    r.must = items.map(i => [i.id]);
    const guest: Response = { name: id, days: 14, flex: false, pace: 1, ranking: r, rated: items.map(i => i.id), submitted: true, updatedAt: '2026-01-01T00:00:00.000Z' };
    const withGuest = structuredClone(setup);
    withGuest.responses[id] = guest;
    expect(groupResult(withGuest, items, legs)).toEqual(groupResult(setup, items, legs));
  });
});
