import { describe, expect, it } from 'vitest';
import { compromises, routeStops } from './compromises';
import { emptyRanking, PEOPLE } from '../types';
import type { Area, GroupResult, Item, Person, Plan, Response, Tier, Vote } from '../types';

const item = (id: string, name: string, area: Area): Item => ({ id, name, area, about: '', hours: 2, slot: 'any', fee: '', sideTrip: 0 }) as unknown as Item;
const ITEMS = [
  item('sig', 'Sigiriya', 'Cultural Triangle'), item('knu', 'Knuckles', 'Kandy and Knuckles'), item('del', 'Delft', 'North'),
  item('yal', 'Yala', 'Wild south'), item('gal', 'Galle Fort', 'South coast'), item('ell', 'Ella Rock', 'Ella'),
  item('tri', 'Trinco beach', 'East coast'), item('kit', 'Kitulgala rafting', 'Kitulgala'),
];
const route = ['AIR', 'Colombo', 'Sigiriya', 'Kandy', 'Ella', 'Weligama', 'AIR'] as Plan['route'];
const planOf = (chosen: string[]): Plan => ({ route, areas: [], days: [], chosen, dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0 });

const resp = (name: Person, tiers: Partial<Record<Tier, string[]>>): Response => {
  const r = emptyRanking();
  for (const [t, ids] of Object.entries(tiers)) r[t as Tier] = ids.map(id => [id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: [], submitted: true, updatedAt: '' };
};
const responses = (m: Partial<Record<Person, Partial<Record<Tier, string[]>>>>) =>
  Object.fromEntries(PEOPLE.map(p => [p, resp(p, m[p] ?? {})])) as Record<Person, Response>;
const votes = (fork: string, a: number, b: number): Vote[] => [
  ...PEOPLE.slice(0, a).map(name => ({ forkId: fork, name, choice: 'a' as const })),
  ...PEOPLE.slice(a, a + b).map(name => ({ forkId: fork, name, choice: 'b' as const })),
];
const group = (over: Partial<GroupResult>): GroupResult => ({
  open: true, days: 9, pace: 1, base: planOf([]), knockouts: [], results: [], final: planOf(['sig']), extras: [], knocked: [], finalized: [...PEOPLE], locked: true, ...over,
});
const run = (g: GroupResult, v: Vote[] = [], r = responses({})) => compromises(g, { responses: r, votes: v }, ITEMS);

describe('routeStops', () => {
  it('lists each hub once in visit order', () => {
    expect(routeStops(['AIR', 'Colombo', 'Kandy', 'Colombo', 'AIR'])).toEqual(['AIR', 'Colombo', 'Kandy']);
  });
});

describe('compromises', () => {
  it('(a) North result with the vote count, attached to the North stop or else the last stop', () => {
    const g = group({ results: [{ forkId: 'region:north', a: ['del'], b: ['yal'], winner: 'b' }] });
    const c = run(g, votes('region:north', 2, 3));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'region', text: 'North out: South won 3 to 2', stop: 'Weligama' });
    const n = run(group({ results: [{ forkId: 'region:north', a: ['del'], b: ['yal'], winner: 'a' }], final: planOf(['del']) }), votes('region:north', 4, 1));
    expect(n[0].text).toBe('North in: North won 4 to 1');
  });

  it('(b) head to heads, closest margin first, worded by winner', () => {
    const g = group({ results: [
      { forkId: 'ko:del', a: ['del'], b: ['sig'], winner: 'b' },
      { forkId: 'ko:yal', a: ['yal'], b: ['gal'], winner: 'a' },
    ] });
    const c = run(g, [...votes('ko:yal', 3, 2), ...votes('ko:del', 1, 3)]);
    expect(c.map(x => x.text)).toEqual(['Added Yala over Galle Fort: 3 to 2', 'Kept the plan over Delft: 3 to 1']);
    expect(c[0].stop).toBe('Weligama');
  });

  it('(c) planned places someone skipped, using the skip tier', () => {
    const c = run(group({ final: planOf(['sig']) }), [], responses({ Alex: { skip: ['sig'] } }));
    expect(c).toEqual([{ kind: 'skipped', text: 'Sigiriya stays though Alex skipped it', stop: 'Sigiriya' }]);
    const two = run(group({ final: planOf(['sig']) }), [], responses({ Alex: { skip: ['sig'] }, Lazza: { skip: ['sig'] } }));
    expect(two[0].text).toBe('Sigiriya stays though Alex and Lazza skipped it');
  });

  it('(d) a knocked-down Must that is back in the plan', () => {
    const c = run(group({ knocked: ['knu'], final: planOf(['knu']) }), [], responses({ Brittany: { must: ['knu'] } }));
    expect(c).toEqual([{ kind: 'back', text: 'Knuckles is back: there was room', stop: 'Kandy' }]);
  });

  it('(e) Musts that did not fit, most wanted first', () => {
    const c = run(group({ final: planOf([]) }), [], responses({ Brittany: { must: ['yal', 'gal'] }, Alex: { must: ['gal'] } }));
    expect(c.map(x => x.text)).toEqual(['Galle Fort missed out: not enough days', 'Yala missed out: not enough days']);
  });

  it('does not call a northern Must "not enough days" when South won the region vote', () => {
    const g = group({ final: planOf([]), results: [{ forkId: 'region:north', a: ['del'], b: ['yal'], winner: 'b' }] });
    const c = run(g, votes('region:north', 2, 3), responses({ Brittany: { must: ['del'] } }));
    expect(c.map(x => x.kind)).toEqual(['region']);
  });

  it('keeps at most 5, in priority order a to e', () => {
    const g = group({
      final: planOf(['sig', 'knu', 'yal']), knocked: ['knu'],
      results: [
        { forkId: 'region:north', a: ['del'], b: ['gal'], winner: 'b' },
        { forkId: 'ko:yal', a: ['yal'], b: ['ell'], winner: 'a' },
        { forkId: 'ko:tri', a: ['tri'], b: ['kit'], winner: 'b' },
      ],
    });
    const r = responses({ Alex: { skip: ['sig'] }, Brittany: { must: ['knu', 'ell', 'gal'] } });
    const c = run(g, [...votes('region:north', 2, 3), ...votes('ko:yal', 3, 2), ...votes('ko:tri', 2, 3)], r);
    expect(c).toHaveLength(5);
    expect(c.map(x => x.kind)).toEqual(['region', 'headToHead', 'headToHead', 'skipped', 'back']);
  });

  it('is empty before the plan exists, and every line is short with no em dash', () => {
    expect(run(group({ final: null, base: null }))).toEqual([]);
    const g = group({ final: planOf(['sig']), results: [{ forkId: 'ko:yal', a: ['yal'], b: ['kit'], winner: 'a' }] });
    for (const c of run(g, votes('ko:yal', 3, 2))) { expect(c.text.length).toBeLessThanOrEqual(45); expect(c.text).not.toContain('—'); }
  });
});
