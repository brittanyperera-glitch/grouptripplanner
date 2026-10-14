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
