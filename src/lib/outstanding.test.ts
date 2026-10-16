import { describe, expect, it } from 'vitest';
import type { GroupResult, Knockout, Person, Vote } from '../types';
import { outstanding } from './outstanding';

const ko = (forkId: string, a: Person[] = [], b: Person[] = [], genre?: Knockout['genre']): Knockout => ({ forkId, a: ['x'], b: ['y'], votes: { a, b }, genre });
const group = (...knockouts: Knockout[]): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, knockouts, results: [], final: null, extras: [], knocked: [], finalized: [], locked: false,
});

describe('outstanding', () => {
  it('counts open knockouts and the ones I have not voted on', () => {
    const g = group(ko('ko:1', ['Alex'], ['Lazza']), ko('ko:2', [], ['Alex']));
    expect(outstanding(g, [], 'Alex').open).toBe(2);
    expect(outstanding(g, [], 'Brittany').mine).toBe(2);
    expect(outstanding(g, [], 'Alex').mine).toBe(0);
  });

  it('a trip member who has voted on one of two has one left', () => {
    const g = group(ko('ko:1', ['Antek']), ko('ko:2'));
    expect(outstanding(g, [], 'Antek')).toMatchObject({ open: 2, mine: 1 });
  });

  it('others are names only: trip members other than me with an unvoted knockout', () => {
    const g = group(ko('ko:1', ['Brittany', 'Alex', 'Antek'], ['Lazza']), ko('ko:2', ['Brittany', 'Alex', 'Antek', 'Lazza']));
    expect(outstanding(g, [], 'Brittany').others).toEqual(['Saulie']);
    expect(outstanding(g, [], 'Saulie').others).toEqual([]);
  });

  it('nothing open gives zeros and no names', () => {
    expect(outstanding(group(), [], 'Alex')).toEqual({ open: 0, mine: 0, others: [] });
  });

  it('a guest is counted from the raw votes, because group tallies only hold the five', () => {
    const g = group(ko('ko:1', ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie']), ko('ko:2', ['Brittany']));
    const votes: Vote[] = [{ forkId: 'ko:1', name: 'Aunty', choice: 'a' }, { forkId: 'ko:1', name: 'Groom', choice: 'a' }];
    expect(outstanding(g, [], 'Aunty').mine).toBe(2);
    expect(outstanding(g, votes, 'Aunty').mine).toBe(1);
    expect(outstanding(g, votes, 'Tuktuk').mine).toBe(2);
    expect(outstanding(g, votes, 'Aunty').others).toEqual(['Alex', 'Antek', 'Lazza', 'Saulie']);
  });

  it('for a guest the latest vote on a fork still counts as voted', () => {
    const g = group(ko('ko:1'));
    const votes: Vote[] = [{ forkId: 'ko:1', name: 'Aunty', choice: 'a' }, { forkId: 'ko:1', name: 'Aunty', choice: 'b' }];
    expect(outstanding(g, votes, 'Aunty').mine).toBe(0);
    expect(outstanding(g, [], 'Aunty').mine).toBe(1);
  });

  it('a guest has voted on a same-type question only when every place in it is ticked', () => {
    const g = group({ forkId: 'genre:safari', a: ['p', 'q'], b: [], votes: { a: [], b: [] }, genre: { id: 'safari', tally: {} } });
    const one: Vote[] = [{ forkId: 'genre:safari:p', name: 'Aunty', choice: 'a' }];
    expect(outstanding(g, one, 'Aunty').mine).toBe(1);
    expect(outstanding(g, [...one, { forkId: 'genre:safari:q', name: 'Aunty', choice: 'b' }], 'Aunty').mine).toBe(0);
  });

  it('with no viewer nothing is mine', () => {
    expect(outstanding(group(ko('ko:1')), [], null).mine).toBe(0);
  });
});
