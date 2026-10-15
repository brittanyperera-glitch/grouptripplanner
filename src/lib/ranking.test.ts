import { describe, it, expect } from 'vitest';
import { emptyRanking } from '../types';
import { canDraw, isDrawn, labels, MAX_TIE, placeId, score, setTier, tierOf, toggleDraw, withoutDraws } from './ranking';

describe('ranking', () => {
  // Brittany 2026-10-15: before submit the order inside a tier counts (dragged), but there are no draws.
  it('setTier adds the item to the end of its tier as its own spot, and the order feeds the score', () => {
    const r = emptyRanking();
    for (const id of ['a', 'b', 'c']) setTier(r, id, 'must');
    expect(r.must).toEqual([['a'], ['b'], ['c']]);
    expect(score(r, 'a')).toBeCloseTo(10.9); expect(score(r, 'b')).toBeCloseTo(10.45); expect(score(r, 'c')).toBeCloseTo(10);
  });
  it('setTier moves an item between tiers and splits an old shared spot', () => {
    const r = emptyRanking(); r.must = [['a', 'b'], ['x']]; r.keen = [['c'], ['d']];
    setTier(r, 'a', 'keen');
    expect(r.must).toEqual([['b'], ['x']]); expect(r.keen).toEqual([['c'], ['d'], ['a']]);
  });
  it('placeId puts an item at a position inside a tier, or in another tier, and the score follows', () => {
    const r = emptyRanking(); r.must = [['a'], ['b'], ['c']]; r.keen = [['k']];
    placeId(r, 'c', 'must', 0); expect(r.must).toEqual([['c'], ['a'], ['b']]);
    expect(score(r, 'c')).toBeCloseTo(10.9); expect(score(r, 'b')).toBeCloseTo(10);
    placeId(r, 'a', 'keen', 1); expect(r.must).toEqual([['c'], ['b']]); expect(r.keen).toEqual([['k'], ['a']]);
    placeId(r, 'k', 'skip', 5); expect(r.skip).toEqual([['k']]); expect(r.keen).toEqual([['a']]);
  });
  it('placeId inside a draw splits it in two around the item', () => {
    const r = emptyRanking(); r.must = [['a', 'b', 'c'], ['d']];
    placeId(r, 'd', 'must', 1); expect(r.must).toEqual([['a'], ['d'], ['b', 'c']]);
  });
  it('withoutDraws gives every item its own spot in the same order', () => {
    const r = emptyRanking(); r.must = [['a', 'b'], ['c']]; r.keen = [['d']];
    const out = withoutDraws(r);
    expect(out.must).toEqual([['a'], ['b'], ['c']]); expect(out.keen).toEqual([['d']]);
    expect(r.must).toEqual([['a', 'b'], ['c']]);
  });
  // Draws exist only on the Finalize screen, up to 5 to a spot.
  it('toggleDraw joins the spot above while it holds fewer than 5, and splits off again', () => {
    expect(MAX_TIE).toBe(5);
    const r = emptyRanking(); r.must = [['a', 'b', 'c', 'd'], ['e'], ['f']];
    toggleDraw(r, 'e'); expect(r.must).toEqual([['a', 'b', 'c', 'd', 'e'], ['f']]);
    expect(canDraw(r, 'f')).toBe(false);
    toggleDraw(r, 'f'); expect(r.must).toEqual([['a', 'b', 'c', 'd', 'e'], ['f']]);
    toggleDraw(r, 'c'); expect(r.must).toEqual([['a', 'b'], ['c', 'd', 'e'], ['f']]);
    expect(isDrawn(r, 'b')).toBe(true); expect(isDrawn(r, 'a')).toBe(false);
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
      const roll = rnd();
      if (roll < 0.3) setTier(r, id, tiers[Math.floor(rnd() * 4)]);
      else if (roll < 0.7) placeId(r, id, tiers[Math.floor(rnd() * 4)], Math.floor(rnd() * 8));
      else if (tierOf(r, id)) toggleDraw(r, id);
      else continue;
      const all = tiers.flatMap(t => r[t].flat());
      expect(new Set(all).size).toBe(all.length);
      for (const t of tiers) for (const l of r[t]) { expect(l.length).toBeGreaterThan(0); expect(l.length).toBeLessThanOrEqual(MAX_TIE); }
    }
  });
});
