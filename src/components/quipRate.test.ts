import { describe, expect, it } from 'vitest';
import { QuipGate } from './quipRate';

describe('quip rate (Brittany 2026-10-15: less frequent)', () => {
  it('fires on the first Must and the first Skip, then at most once every 5 cards', () => {
    const g = new QuipGate();
    const fired = ['must', 'must', 'skip', 'keen', 'must', 'meh', 'must', 'skip', 'must', 'must', 'must', 'skip']
      .map(t => g.next(t as 'must' | 'keen' | 'meh' | 'skip'));
    expect(fired).toEqual([true, false, true, false, false, false, false, true, false, false, false, false]);
  });

  it('never fires for Keen or Meh', () => {
    const g = new QuipGate();
    expect(['keen', 'meh', 'keen', 'meh', 'keen', 'meh', 'keen'].map(t => g.next(t as 'keen' | 'meh'))).toEqual(Array(7).fill(false));
  });
});
