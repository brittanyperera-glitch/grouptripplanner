import { describe, expect, it } from 'vitest';
import type { Knockout } from '../types';
import { groupByLoser, type KoEntry } from './koGroups';

const fork = (c: string, a: string[], b: string[]): Knockout => ({ forkId: `ko:${c}`, a, b, votes: { a: [], b: [] } });
// The five open forks on live data, 2026-10-16.
const LIVE = [
  fork('scuba', ['scuba', 'hiriketiya'], ['pidurangala', 'train']),
  fork('horton', ['horton'], ['yala']),
  fork('polonnaruwa', ['polonnaruwa'], ['pidurangala']),
  fork('anuradhapura', ['anuradhapura', 'udawalawe'], ['galle', 'pettah', 'pidurangala', 'rafting']),
  fork('diyaluma', ['diyaluma', 'hiriketiya'], ['coconut', 'pidurangala']),
];
const ids = (e: KoEntry) => e.kind === 'group' ? e.members.map(m => m.forkId) : [e.k.forkId];

describe('groupByLoser on the live forks', () => {
  it('puts the four forks that drop Pidurangala into one group and leaves Horton alone', () => {
    const out = groupByLoser(LIVE);
    expect(out.map(e => e.kind)).toEqual(['group', 'fork']);
    expect(out[0]).toMatchObject({ kind: 'group', loser: 'pidurangala' });
    expect(ids(out[0])).toEqual(['ko:scuba', 'ko:polonnaruwa', 'ko:anuradhapura', 'ko:diyaluma']);
    expect(ids(out[1])).toEqual(['ko:horton']);
  });
  it('does not group Hiriketiya, which is on the add side of two forks', () => {
    expect(groupByLoser(LIVE.filter(k => k.forkId === 'ko:scuba' || k.forkId === 'ko:diyaluma').map(k => ({ ...k, b: k.b.filter(id => id !== 'pidurangala') })))
      .every(e => e.kind === 'fork')).toBe(true);
  });
  it('leaves region and genre forks as they are, even when their b side matches', () => {
    const region = fork('x', ['n'], ['pidurangala']);
    const out = groupByLoser([{ ...region, forkId: 'region:north' }, { ...fork('g', ['g1'], ['pidurangala']), genre: { id: 'g', tally: {} } }, LIVE[2]]);
    expect(out.every(e => e.kind === 'fork')).toBe(true);
  });
  it('files a fork with two shared losers under the first by the given rank, once', () => {
    const forks = [fork('p', ['p'], ['x', 'y']), fork('q', ['q'], ['x', 'y']), fork('r', ['r'], ['y'])];
    expect(groupByLoser(forks, ids2 => [...ids2].sort().reverse()).map(e => e.kind === 'group' ? [e.loser, ...ids(e)] : ids(e)))
      .toEqual([['y', 'ko:p', 'ko:q', 'ko:r']]);
    expect(groupByLoser(forks).map(e => e.kind === 'group' ? [e.loser, ...ids(e)] : ids(e)))
      .toEqual([['x', 'ko:p', 'ko:q'], ['ko:r']]);
  });
});

// Seeded, so a failure reproduces.
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
describe('groupByLoser invariants over 100 random fork lists', () => {
  it('every fork appears exactly once, in a stable order, and a group never has fewer than two members', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed), pick = (n: number) => Math.floor(r() * n), pool = Array.from({ length: 8 }, (_, i) => `p${i}`);
      const forks = Array.from({ length: 1 + pick(8) }, (_, i) => fork(`f${i}`, [pool[pick(8)]], [...new Set(Array.from({ length: 1 + pick(3) }, () => pool[pick(8)]))]));
      const out = groupByLoser(forks);
      const seen = out.flatMap(ids);
      expect(seen.slice().sort(), `seed ${seed}`).toEqual(forks.map(k => k.forkId).sort());
      expect(new Set(seen).size).toBe(seen.length);
      expect(out.every(e => e.kind === 'fork' || (e.members.length >= 2 && e.members.every(m => m.b.includes(e.loser)))), `seed ${seed}`).toBe(true);
      expect(groupByLoser([...forks])).toEqual(out);
      const first = out.map(e => ids(e)[0]);
      expect(first, `seed ${seed}`).toEqual([...first].sort((x, y) => forks.findIndex(k => k.forkId === x) - forks.findIndex(k => k.forkId === y)));
    }
  });
});
