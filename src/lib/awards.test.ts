import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import genresJson from '../data/genres.json';
import { seedState } from '../guest/seed';
import { emptyRanking, type AppState, type Genre, type Item, type Player, type Response } from '../types';
import { groupAwards, seaItemIds } from './awards';

// The late scuba entry is asked after the ratings close, so these ordinary-catalogue tests leave it out.
const ITEMS = (catalogue as unknown as { items: Item[] }).items.filter(i => !i.late);
const GENRES = (genresJson as { genres: Genre[] }).genres;
const CREW = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];

const resp = (name: Player, t: Partial<Record<'must' | 'keen' | 'meh' | 'skip', string[]>>): Response => {
  const ranking = emptyRanking();
  for (const k of ['must', 'keen', 'meh', 'skip'] as const) ranking[k] = (t[k] ?? []).map(id => [id]);
  return { name, days: 9, flex: false, pace: 1, ranking, rated: [], submitted: true, updatedAt: 'x' };
};
const state = (rows: Response[]): AppState => ({ responses: Object.fromEntries(rows.map(r => [r.name, r])), suggestions: [], votes: [] });
const get = (s: AppState, id: string) => groupAwards(s, ITEMS, GENRES).find(a => a.id === id);

describe('groupAwards', () => {
  it('most-enthusiastic counts Keen only', () => {
    const s = state([resp('Alex', { keen: ['crab', 'tea'] }), resp('Antek', { must: ['crab', 'tea', 'kottu'], keen: ['pettah'] })]);
    expect(get(s, 'most-enthusiastic')).toMatchObject({ winners: ['Alex'], value: 2 });
  });
  it('most-indifferent counts Meh', () => {
    const s = state([resp('Alex', { meh: ['crab'] }), resp('Lazza', { meh: ['crab', 'tea'] })]);
    expect(get(s, 'most-indifferent')).toMatchObject({ winners: ['Lazza'], value: 2 });
  });
  it('attenborough counts Must or Keen on Wildlife and safari items', () => {
    const s = state([resp('Alex', { must: ['yala', 'udawalawe'], meh: ['rekawa'] }), resp('Saulie', { keen: ['elephants'], skip: ['yala'] }), resp('Antek', { must: ['crab'] })]);
    expect(get(s, 'attenborough')).toMatchObject({ winners: ['Alex'], value: 2 });
  });
  it('poseidon item set is exactly the beach, beach/surf genre and water-name items', () => {
    const { ids, byName } = seaItemIds(ITEMS, GENRES);
    expect([...ids].sort()).toEqual(['beachday', 'coconut', 'hiriketiya', 'junglebeach', 'surf']);
    expect(byName).toEqual([]);
    const s = state([resp('Saulie', { must: ['surf', 'hiriketiya'], keen: ['junglebeach'] }), resp('Alex', { must: ['yala'] })]);
    expect(get(s, 'poseidon')).toMatchObject({ winners: ['Saulie'], value: 3 });
  });
  it('poseidon pulls in an item whose name says boat, and reports it', () => {
    const items = [...ITEMS, { id: 'whaleboat', name: 'Whale watching boat', category: 'Nature' } as Item];
    const { ids, byName } = seaItemIds(items, GENRES);
    expect(ids.has('whaleboat')).toBe(true);
    expect(byName).toEqual(['whaleboat']);
  });
  it('ties give every tied person the award, in PEOPLE order', () => {
    const s = state([resp('Saulie', { keen: ['crab'] }), resp('Alex', { keen: ['tea'] }), resp('Lazza', { keen: [] })]);
    expect(get(s, 'most-enthusiastic')).toMatchObject({ winners: ['Alex', 'Saulie'], value: 1 });
  });
  it('a guest never wins', () => {
    const s = state([resp('Tuktuk', { keen: ['crab', 'tea', 'kottu'] }), resp('Alex', { keen: ['crab'] })]);
    expect(get(s, 'most-enthusiastic')).toMatchObject({ winners: ['Alex'], value: 1 });
    expect(groupAwards(s, ITEMS, GENRES).flatMap(a => a.winners as Player[])).not.toContain('Tuktuk');
  });
  it('an award all five tie on is omitted', () => {
    const s = state(['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'].map(p => resp(p as Player, { meh: ['crab'] })));
    expect(get(s, 'most-indifferent')).toBeUndefined();
  });
  it('an award nobody scores on is omitted', () => {
    const ids = groupAwards(state([resp('Alex', { keen: ['crab'] })]), ITEMS, GENRES).map(a => a.id);
    expect(ids).toContain('most-enthusiastic');
    expect(ids).not.toContain('skipper');
    expect(ids).not.toContain('attenborough');
  });
  it('the other rules pick the right person', () => {
    const s = state([
      resp('Brittany', { must: ['tooth', 'dambulla'], keen: ['sigiriya'], skip: ['kottu', 'crab'] }),
      resp('Alex', { must: ['horton'], keen: ['ellarock', 'pidurangala', 'crab'] }),
      resp('Antek', { must: ['pidurangala'], keen: ['train', 'ninearch'] }),
      resp('Lazza', { keen: ['kottu'], skip: ['tea'] }),
    ]);
    expect(get(s, 'culture-vulture')).toMatchObject({ winners: ['Brittany'], value: 3 });
    expect(get(s, 'mountain-goat')).toMatchObject({ winners: ['Alex'], value: 3 });
    expect(get(s, 'early-bird')).toMatchObject({ winners: ['Alex'], value: 3 });
    expect(get(s, 'skipper')).toMatchObject({ winners: ['Brittany'], value: 2 });
    expect(get(s, 'foodie')).toMatchObject({ winners: ['Alex', 'Lazza'], value: 1 });
    expect(get(s, 'train-spotter')).toMatchObject({ winners: ['Antek'], value: 2 });
  });
  it('is deterministic and does not mutate its input', () => {
    const s = seedState();
    const before = JSON.stringify(s);
    expect(groupAwards(s, ITEMS, GENRES)).toEqual(groupAwards(s, ITEMS, GENRES));
    expect(JSON.stringify(s)).toBe(before);
  });
  it('the seeded crew yields at least six non-empty awards, all won by the five friends', () => {
    const out = groupAwards(seedState(), ITEMS, GENRES);
    expect(out.length).toBeGreaterThanOrEqual(6);
    for (const a of out) {
      expect(a.value).toBeGreaterThan(0);
      expect(a.winners.length).toBeGreaterThan(0);
      expect(a.winners.every(w => CREW.includes(w))).toBe(true);
    }
  });
});

describe('award unit pluralisation', () => {
  it("uses 'hike' for 1 and 'hikes' for 2", () => {
    const one = state([resp('Alex', { must: ['crab'] })]);
    const hike = ITEMS.find(i => i.category === 'Hike')!.id;
    const hike2 = ITEMS.filter(i => i.category === 'Hike')[1].id;
    expect(get(state([resp('Alex', { must: [hike] })]), 'mountain-goat')).toMatchObject({ value: 1, unit: 'hike' });
    expect(get(state([resp('Alex', { must: [hike, hike2] })]), 'mountain-goat')).toMatchObject({ value: 2, unit: 'hikes' });
    expect(one).toBeTruthy();
  });
});
