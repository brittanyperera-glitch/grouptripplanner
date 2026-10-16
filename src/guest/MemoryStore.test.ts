import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppState } from '../types';
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
    await s.addSuggestion(sugg);
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
    off();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
