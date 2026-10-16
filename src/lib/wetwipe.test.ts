import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import genresJson from '../data/genres.json';
import { emptyRanking, type AppState, type Genre, type Item, type Person, type Response, type Vote } from '../types';
import { favesGivenUp, groupAwards } from './awards';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const GENRES = (genresJson as { genres: Genre[] }).genres;
const ORDER: Person[] = ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'];

const resp = (name: Person, must: string[] = [], keen: string[] = []): Response => ({
  name, days: 9, flex: false, pace: 1, rated: [...must, ...keen], submitted: true, updatedAt: '2026-10-16T00:00:00Z',
  ranking: { ...emptyRanking(), must: must.map(id => [id]), keen: keen.map(id => [id]) },
});
const state = (rows: Response[], votes: Vote[]): AppState => ({ responses: Object.fromEntries(rows.map(r => [r.name, r])), suggestions: [], votes });
const FORKS = [{ forkId: 'ko:surf', a: ['surf', 'beachday'], b: ['yala'] }];

describe('favesGivenUp (biggest wetwipe)', () => {
  it('counts own Must/Keen places on the side the person voted against', () => {
    const s = state([resp('Alex', ['surf'], ['beachday'])], [{ forkId: 'ko:surf', name: 'Alex', choice: 'b' }]);
    expect(favesGivenUp(s, FORKS)[ORDER.indexOf('Alex')]).toBe(2);
  });
  it('voting for your own fave gives nothing up', () => {
    const s = state([resp('Alex', ['surf'])], [{ forkId: 'ko:surf', name: 'Alex', choice: 'a' }]);
    expect(favesGivenUp(s, FORKS)[ORDER.indexOf('Alex')]).toBe(0);
  });
  it('a Meh place on the losing side is not a fave', () => {
    const r = resp('Alex'); r.ranking.meh = [['surf']];
    expect(favesGivenUp(state([r], [{ forkId: 'ko:surf', name: 'Alex', choice: 'b' }]), FORKS)[ORDER.indexOf('Alex')]).toBe(0);
  });
  it('only the latest vote on a fork counts', () => {
    const s = state([resp('Alex', ['surf'])], [{ forkId: 'ko:surf', name: 'Alex', choice: 'b' }, { forkId: 'ko:surf', name: 'Alex', choice: 'a' }]);
    expect(favesGivenUp(s, FORKS)[ORDER.indexOf('Alex')]).toBe(0);
  });
  it('a genre keep vote of drop on your own fave counts once', () => {
    const s = state([resp('Lazza', [], ['yala'])], [{ forkId: 'genre:safari:yala', name: 'Lazza', choice: 'b' }, { forkId: 'genre:safari:udawalawe', name: 'Lazza', choice: 'b' }]);
    expect(favesGivenUp(s, [])[ORDER.indexOf('Lazza')]).toBe(1);
  });
  it('a guest vote never counts', () => {
    const s = state([resp('Alex', ['surf'])], [{ forkId: 'ko:surf', name: 'Aunty', choice: 'b' }]);
    expect(favesGivenUp(s, FORKS).every(n => n === 0)).toBe(true);
  });
});

describe('groupAwards with forks', () => {
  it('awards Biggest wetwipe to whoever gave up most, ties shared', () => {
    const s = state(
      [resp('Alex', ['surf']), resp('Lazza', ['surf']), resp('Saulie', ['yala'])],
      [{ forkId: 'ko:surf', name: 'Alex', choice: 'b' }, { forkId: 'ko:surf', name: 'Lazza', choice: 'b' }, { forkId: 'ko:surf', name: 'Saulie', choice: 'b' }],
    );
    expect(groupAwards(s, ITEMS, GENRES, FORKS).find(a => a.id === 'wetwipe')).toMatchObject({ winners: ['Alex', 'Lazza'], value: 1, unit: 'fave given up' });
  });
  it('is left out when nobody gave anything up or no forks are passed', () => {
    const s = state([resp('Alex', ['surf'])], [{ forkId: 'ko:surf', name: 'Alex', choice: 'a' }]);
    expect(groupAwards(s, ITEMS, GENRES, FORKS).find(a => a.id === 'wetwipe')).toBeUndefined();
    expect(groupAwards(s, ITEMS, GENRES).find(a => a.id === 'wetwipe')).toBeUndefined();
  });
});
