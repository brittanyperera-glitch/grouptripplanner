import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { groupResult, VOTES_TO_RESOLVE } from '../lib/group';
import { finalListFrom } from '../lib/ranking';
import { PEOPLE, type AppState, type Item, type Leg } from '../types';
import { MemoryStore } from './MemoryStore';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const WHO = 'Aunty' as const;
const sugg = { name: WHO, title: 'A cafe', area: 'Colombo' as const, note: 'n' };

describe('MemoryStore', () => {
  it('saveResponse then load shows the row with defaults', async () => {
    const s = new MemoryStore();
    await s.saveResponse(WHO, { days: 7 });
    const r = (await s.load()).responses[WHO]!;
    expect(r).toMatchObject({ name: WHO, days: 7, flex: false, pace: null, submitted: false });
  });

  it('a guest saving their final list finalizes the example crew with their own rankings; nothing else does', async () => {
    const s = new MemoryStore();
    await s.saveResponse(WHO, { days: 7 });
    expect(PEOPLE.some(p => (s as unknown as { state: AppState }).state.responses[p]?.final)).toBe(false);
    const before = (await s.load()).responses;
    await s.saveResponse(WHO, { final: before.Brittany!.ranking });
    const after = (await s.load()).responses;
    for (const p of PEOPLE) expect(after[p]!.final).toEqual(before[p]!.ranking);
  });

  it('two stores never share state', async () => {
    const a = new MemoryStore(); const b = new MemoryStore();
    await a.saveResponse('Brittany', { days: 5 });
    await a.vote({ forkId: 'f', name: 'Brittany', choice: 'a' });
    const sb = await b.load();
    expect(sb.responses.Brittany!.days).not.toBe(5);
    expect(sb.votes).toEqual([]);
  });

  it('mutating a load() result does not leak', async () => {
    const s = new MemoryStore();
    const first = await s.load();
    first.responses.Brittany!.days = 99;
    first.votes.push({ forkId: 'x', name: 'Alex', choice: 'b' });
    const second = await s.load();
    expect(second.responses.Brittany!.days).not.toBe(99);
    expect(second.votes).toEqual([]);
  });

  it('subscribe fires on each write with a clone and stops after unsubscribe', async () => {
    const s = new MemoryStore();
    const seen: AppState[] = [];
    const off = s.subscribe(x => seen.push(x));
    await s.saveResponse(WHO, { days: 6 });
    await s.vote({ forkId: 'f', name: WHO, choice: 'a' });
    expect(seen).toHaveLength(2);
    seen[1].votes.length = 0;
    expect((await s.load()).votes).toHaveLength(1);
    off();
    await s.saveResponse(WHO, { days: 8 });
    expect(seen).toHaveLength(2);
  });

  it('vote upserts by forkId and name', async () => {
    const s = new MemoryStore();
    await s.vote({ forkId: 'f', name: 'Alex', choice: 'a' });
    await s.vote({ forkId: 'f', name: 'Alex', choice: 'b' });
    await s.vote({ forkId: 'f', name: 'Antek', choice: 'a' });
    const v = (await s.load()).votes;
    expect(v).toHaveLength(2);
    expect(v.find(x => x.name === 'Alex')!.choice).toBe('b');
  });

  it('addSuggestion then setSuggestionStatus', async () => {
    const s = new MemoryStore();
    await s.addSuggestion({ ...sugg, name: 'Alex' });
    const [one] = (await s.load()).suggestions;
    expect(one).toMatchObject({ title: 'A cafe', status: 'pending' });
    expect(one.id).toBeTruthy();
    await s.setSuggestionStatus(one.id, 'live');
    expect((await s.load()).suggestions[0].status).toBe('live');
  });

  it('logChoice then loadLog returns entries with id and at', async () => {
    const s = new MemoryStore();
    await s.logChoice({ name: WHO, kind: 'days', ref: null, value: 7 });
    await s.logChoice({ name: WHO, kind: 'pace', ref: null, value: 1 });
    const log = await s.loadLog();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ kind: 'days', value: 7 });
    expect(log[0].id).toBeTruthy(); expect(log[0].at).toBeTruthy();
    log.length = 0;
    expect(await s.loadLog()).toHaveLength(2);
  });

  it('(d) touches neither localStorage writes nor fetch', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const s = new MemoryStore();
    const off = s.subscribe(() => {});
    await s.load();
    await s.saveResponse(WHO, { days: 7 });
    await s.addSuggestion(sugg);
    const id = (await s.load()).suggestions[0].id;
    await s.setSuggestionStatus(id, 'live');
    await s.vote({ forkId: 'f', name: WHO, choice: 'a' });
    await s.logChoice({ name: WHO, kind: 'days', ref: null, value: 7 });
    await s.loadLog();
    await s.saveCrewStays(WHO, { quizDone: true });
    await s.addPlaceSuggestion({ name: WHO, area: 'Ella', kind: 'eat', title: 'Curry' });
    await s.setPlaceStatus('x', 'withdrawn');
    await s.saveStaysAdmin({ scouts: { Ella: WHO } });
    await s.saveTripAdmin(WHO, { eta: { done: true } });
    off();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MemoryStore crew stays', () => {
  it('starts with no crew rows, so the guest takes the quiz', async () => {
    expect((await new MemoryStore().load()).stays?.crew).toEqual({});
  });

  it('merges saves field by field and stamps updatedAt', async () => {
    const s = new MemoryStore();
    await s.saveCrewStays(WHO, { locked: true });
    await s.saveCrewStays(WHO, { quizDone: true });
    const c = (await s.load()).stays!.crew[WHO]!;
    expect(c).toMatchObject({ name: WHO, locked: true, quizDone: true, prefs: [], ranks: {}, bingo: [] });
    expect(Date.parse(c.updatedAt)).toBeGreaterThan(0);
  });
});

describe('MemoryStore place suggestions and stays admin', () => {
  it('adds a live suggestion, withdraws it, and merges admin like the real stores', async () => {
    const s = new MemoryStore();
    await s.addPlaceSuggestion({ name: WHO, area: 'Ella', kind: 'stay', title: 'Hill hut' });
    const [p] = (await s.load()).stays!.suggestions;
    expect(p).toMatchObject({ name: WHO, title: 'Hill hut', status: 'live' });
    await s.setPlaceStatus(p.id, 'withdrawn');
    expect((await s.load()).stays!.suggestions[0].status).toBe('withdrawn');
    await s.saveStaysAdmin({ pins: [{ area: 'Ella', suggestionId: p.id, at: 't' }], scouts: { Ella: WHO, Colombo: WHO } });
    await s.saveStaysAdmin({ scouts: { Colombo: undefined } });
    expect((await s.load()).stays!.admin).toEqual({ pins: [{ area: 'Ella', suggestionId: p.id, at: 't' }], scouts: { Ella: WHO }, closed: [] });
  });

  it('a caller mutating what it passed or loaded cannot change the stored copy', async () => {
    const s = new MemoryStore();
    const pins = [{ area: 'Ella' as const, suggestionId: 'a', at: 't' }];
    await s.saveStaysAdmin({ pins });
    pins[0].suggestionId = 'changed';
    (await s.load()).stays!.admin.pins.push({ area: 'Colombo', suggestionId: 'b', at: 't' });
    expect((await s.load()).stays!.admin.pins).toEqual([{ area: 'Ella', suggestionId: 'a', at: 't' }]);
  });
});

describe('MemoryStore guest sandbox', () => {
  const items = (catalogue as unknown as { items: Item[] }).items;
  const legs = legsData as unknown as Leg[];
  const firstKo = async (s: MemoryStore) => groupResult(await s.load(), items, legs).knockouts.find(k => k.forkId.startsWith('ko:'))!;

  it('(a) a guest knockout vote resolves the fork in favour of that choice', async () => {
    const s = new MemoryStore();
    const k = await firstKo(s);
    await s.vote({ forkId: k.forkId, name: 'Aunty', choice: 'a' });
    const g = groupResult(await s.load(), items, legs);
    expect(g.results.find(r => r.forkId === k.forkId)?.winner).toBe('a');
    expect(g.knockouts.some(x => x.forkId === k.forkId)).toBe(false);
  });

  it('(b) the guest own vote is kept under the guest name', async () => {
    const s = new MemoryStore();
    const k = await firstKo(s);
    await s.vote({ forkId: k.forkId, name: 'Aunty', choice: 'a' });
    const votes = (await s.load()).votes.filter(v => v.forkId === k.forkId);
    expect(votes.find(v => v.name === 'Aunty')).toMatchObject({ choice: 'a' });
    expect(votes.length).toBe(1 + VOTES_TO_RESOLVE);
  });

  it('(c) a trip member vote is not mirrored', async () => {
    const s = new MemoryStore();
    const k = await firstKo(s);
    await s.vote({ forkId: k.forkId, name: 'Alex', choice: 'a' });
    expect((await s.load()).votes.filter(v => v.forkId === k.forkId)).toHaveLength(1);
  });

  it('(d) a guest vote on a non-ko, non-genre fork is stored once', async () => {
    const s = new MemoryStore();
    await s.vote({ forkId: 'region:north', name: 'Groom', choice: 'b' });
    expect((await s.load()).votes).toHaveLength(1);
  });

  it('(d2) a guest genre keep vote is mirrored by the first members without a vote, so the place resolves', async () => {
    const s = new MemoryStore();
    await s.vote({ forkId: 'genre:trainviews:train', name: 'Groom', choice: 'a' });
    const v = (await s.load()).votes.filter(x => x.forkId === 'genre:trainviews:train');
    expect(v.filter(x => (PEOPLE as readonly string[]).includes(x.name) && x.choice === 'a')).toHaveLength(VOTES_TO_RESOLVE);
    await s.vote({ forkId: 'genre:trainviews#2', name: 'Groom', choice: 'b' });
    expect((await s.load()).votes.filter(x => x.forkId === 'genre:trainviews#2')).toHaveLength(1 + VOTES_TO_RESOLVE);
  });

  it('(d3) a member vote on a genre fork is not mirrored', async () => {
    const s = new MemoryStore();
    await s.vote({ forkId: 'genre:trainviews:train', name: 'Alex', choice: 'a' });
    expect((await s.load()).votes).toHaveLength(1);
  });

  it('(e) a guest suggestion is live, a member suggestion is pending', async () => {
    const s = new MemoryStore();
    await s.addSuggestion(sugg);
    await s.addSuggestion({ ...sugg, name: 'Alex' });
    const out = (await s.load()).suggestions;
    expect(out.find(x => x.name === 'Aunty')?.status).toBe('live');
    expect(out.find(x => x.name === 'Alex')?.status).toBe('pending');
  });

  it('(g) a guest who votes B on every head to head gets none of the voted-out places back in the finished route', async () => {
    const s = new MemoryStore();
    let g = groupResult(await s.load(), items, legs);
    for (let round = 0; round < 15 && g.knockouts.length; round++) {
      for (const k of g.knockouts) await s.vote({ forkId: k.forkId, name: 'Aunty', choice: 'b' });
      g = groupResult(await s.load(), items, legs);
    }
    expect(g.knockouts).toEqual([]);
    const knocked = g.knocked;
    expect(knocked.length).toBeGreaterThan(0);
    const ranking = (await s.load()).responses.Brittany!.ranking;
    await s.saveResponse('Aunty', { days: 9, ranking, final: finalListFrom(ranking, knocked) });
    const after = await s.load();
    for (const p of PEOPLE) {
      expect(after.responses[p]!.final!.must.flat().filter(id => knocked.includes(id))).toEqual([]);
      expect(after.responses[p]!.final).toEqual(finalListFrom(after.responses[p]!.ranking, knocked));
    }
    const route = groupResult(after, items, legs);
    expect(route.locked).toBe(true);
    expect(route.final!.chosen.filter(id => knocked.includes(id))).toEqual([]);
  });

  it('(f) groupResult does not throw with a live guest suggestion', async () => {
    const s = new MemoryStore();
    await s.addSuggestion(sugg);
    const state = await s.load();
    expect(() => groupResult(state, items, legs)).not.toThrow();
  });
});

describe('MemoryStore trip admin', () => {
  it('starts empty, merges by item id and stamps updatedAt, with no storage or network', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const s = new MemoryStore();
    expect((await s.load()).tripAdmin ?? {}).toEqual({});
    await s.saveTripAdmin(WHO, { flights: { done: true } });
    await s.saveTripAdmin(WHO, { eta: { done: true }, flights: { done: false } });
    const t = (await s.load()).tripAdmin![WHO]!;
    expect(t.items).toEqual({ flights: { done: false }, eta: { done: true } });
    expect(Date.parse(t.updatedAt)).toBeGreaterThan(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
