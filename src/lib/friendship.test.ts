import { describe, expect, it } from 'vitest';
import { agreement, divisive, friendStats } from './friendship';
import { emptyRanking, PEOPLE } from '../types';
import type { Person, Response, Tier } from '../types';

const resp = (name: Person, tiers: Record<string, Tier>): Response => {
  const r = emptyRanking();
  for (const [id, t] of Object.entries(tiers)) r[t].push([id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: Object.keys(tiers), submitted: true, updatedAt: '' };
};

describe('agreement', () => {
  it('counts places rated within one tier over places both rated', () => {
    const a = resp('Alex', { p1: 'must', p2: 'must', p3: 'skip', p4: 'keen' });
    const b = resp('Antek', { p1: 'must', p2: 'keen', p3: 'must', p5: 'skip' });
    expect(agreement(a.ranking, b.ranking)).toEqual({ agree: 2, both: 3, pct: 67 });
  });
  it('is null when nothing is shared', () => {
    expect(agreement(resp('Alex', { p1: 'must' }).ranking, resp('Antek', { p2: 'must' }).ranking).pct).toBeNull();
  });
});

describe('friendStats', () => {
  const all: Partial<Record<Person, Response>> = {
    Brittany: resp('Brittany', { p1: 'must', p2: 'must', p3: 'skip' }),
    Alex: resp('Alex', { p1: 'must', p2: 'must', p3: 'skip' }),
    Antek: resp('Antek', { p1: 'skip', p2: 'skip', p3: 'must' }),
    Lazza: resp('Lazza', { p1: 'must', p2: 'keen', p3: 'meh' }),
    Saulie: resp('Saulie', { p1: 'keen', p2: 'must', p3: 'skip' }),
  };
  it('finds the viewer twin and biggest clash', () => {
    const s = friendStats(all, 'Brittany');
    expect(s.twin).toMatchObject({ name: 'Alex', pct: 100 });
    expect(s.clash).toMatchObject({ name: 'Antek', pct: 0 });
  });
  it('lists every pair once', () => {
    expect(friendStats(all, 'Brittany').pairs).toHaveLength(10);
  });
});

describe('divisive', () => {
  it('picks the widest spread and reports Must and Skip counts', () => {
    const rs = PEOPLE.map((p, i) => resp(p, { wide: i < 2 ? 'must' : 'skip', narrow: i === 0 ? 'must' : 'keen' }));
    expect(divisive(rs, ['wide', 'narrow'])).toEqual({ id: 'wide', musts: 2, skips: 3, label: '2 Must, 3 Skip' });
  });
  it('breaks a spread tie by more Musts plus Skips', () => {
    const rs = PEOPLE.map((p, i) => resp(p, { a: i === 0 ? 'must' : i === 1 ? 'skip' : 'keen', b: i < 2 ? 'must' : i < 4 ? 'skip' : 'keen' }));
    expect(divisive(rs, ['a', 'b'])?.id).toBe('b');
  });
  it('is null when everyone agrees', () => {
    expect(divisive(PEOPLE.map(p => resp(p, { a: 'keen' })), ['a'])).toBeNull();
  });
});
