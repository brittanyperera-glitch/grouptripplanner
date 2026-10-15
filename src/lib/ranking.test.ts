import { describe, it, expect } from 'vitest';
import { emptyRanking } from '../types';
import { MAX_TIE, move, labels, score, setTier, tierOf } from './ranking';

describe('ranking', () => {
  // Before the head to heads a tier is one unordered spot (Brittany 2026-10-15): no comparisons.
  it('setTier puts every item of a tier in one spot, any number of them', () => {
    const r = emptyRanking();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) setTier(r, id, 'must');
    expect(r.must).toEqual([['a', 'b', 'c', 'd', 'e', 'f', 'g']]);
    expect(new Set(['a', 'g'].map(id => score(r, id))).size).toBe(1);
  });
  it('setTier moves an item between tiers and flattens an old ordered tier', () => {
    const r = emptyRanking(); r.must = [['a'], ['b']]; r.keen = [['c'], ['d']];
    setTier(r, 'a', 'keen');
    expect(r.must).toEqual([['b']]); expect(r.keen).toEqual([['c', 'd', 'a']]);
  });
  it('move splits a tie, merges into a neighbour, never crosses tiers', () => {
    const r = emptyRanking(); r.must = [['a', 'b'], ['c']]; r.keen = [['k']];
    move(r, 'b', -1); expect(r.must).toEqual([['b'], ['a'], ['c']]);
    move(r, 'c', -1); expect(r.must).toEqual([['b'], ['a', 'c']]);
    move(r, 'c', 1); move(r, 'c', 1); expect(tierOf(r, 'c')).toBe('must');
  });
  // Draws exist only on the Finalize screen, up to 5 to a spot.
  it('move joins a neighbouring spot only while it holds fewer than 5', () => {
    expect(MAX_TIE).toBe(5);
    const r = emptyRanking(); r.must = [['a', 'b', 'c', 'd'], ['e'], ['f']];
    move(r, 'e', -1); expect(r.must).toEqual([['a', 'b', 'c', 'd', 'e'], ['f']]);
    move(r, 'f', -1); expect(r.must).toEqual([['f'], ['a', 'b', 'c', 'd', 'e']]);
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
  it('fuzz: 500 random operations keep invariants', () => {
    const r = emptyRanking(); const ids = Array.from({ length: 20 }, (_, i) => 'i' + i);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const tiers = ['must', 'keen', 'meh', 'skip'] as const;
    for (let s = 0; s < 500; s++) {
      const id = ids[Math.floor(rnd() * ids.length)];
      if (tierOf(r, id) && rnd() < 0.5) { move(r, id, rnd() < 0.5 ? -1 : 1); continue; }
      setTier(r, id, tiers[Math.floor(rnd() * 4)]);
      const all = tiers.flatMap(t => r[t].flat());
      expect(new Set(all).size).toBe(all.length);
      for (const t of tiers) for (const l of r[t]) expect(l.length).toBeGreaterThan(0);
    }
  });
});
