import { beforeEach, describe, expect, it } from 'vitest';
import { isLocalStoreKey, LocalStore } from './local';

beforeEach(() => localStorage.clear());

describe('LocalStore', () => {
  it('saving Alex leaves Brittany stored JSON byte-identical', async () => {
    const tabA = new LocalStore();
    const tabB = new LocalStore();
    await tabB.load();
    await tabA.saveResponse('Brittany', { days: 9, pace: 1 });
    const before = localStorage.getItem('tp:resp:Brittany');
    expect(before).not.toBeNull();
    await tabB.saveResponse('Alex', { days: 7 });
    expect(localStorage.getItem('tp:resp:Brittany')).toBe(before);
    const st = await tabA.load();
    expect(st.responses.Alex?.days).toBe(7);
    expect(st.responses.Brittany?.days).toBe(9);
  });

  it('a second vote by the same person on the same fork replaces the first', async () => {
    const s = new LocalStore();
    await s.vote({ forkId: 'f1', name: 'Alex', choice: 'a' });
    await s.vote({ forkId: 'f1', name: 'Alex', choice: 'b' });
    const { votes } = await s.load();
    expect(votes).toEqual([{ forkId: 'f1', name: 'Alex', choice: 'b' }]);
  });

  it('a saved flex: true reloads as flex true', async () => {
    await new LocalStore().saveResponse('Saulie', { flex: true });
    expect((await new LocalStore().load()).responses.Saulie?.flex).toBe(true);
  });

  it('corrupt tp:sugg loads as []', async () => {
    localStorage.setItem('tp:sugg', '{not json');
    expect((await new LocalStore().load()).suggestions).toEqual([]);
  });

  it('subscribe callback fires after saveResponse', async () => {
    const s = new LocalStore();
    let got: unknown = null;
    const off = s.subscribe(st => { got = st; });
    await s.saveResponse('Lazza', { days: 5 });
    await new Promise(r => setTimeout(r, 0));
    off();
    expect((got as { responses: Record<string, { days: number }> }).responses.Lazza.days).toBe(5);
  });

  it('crew stays merge field by field across stores, stamp updatedAt and reload', async () => {
    await new LocalStore().saveCrewStays('Alex', { locked: true });
    await new LocalStore().saveCrewStays('Alex', { quizDone: true });
    const c = (await new LocalStore().load()).stays?.crew.Alex;
    expect(c).toMatchObject({ name: 'Alex', locked: true, quizDone: true, prefs: [], ranks: {}, bingo: [] });
    expect(Date.parse(c!.updatedAt)).toBeGreaterThan(0);
  });

  it('trip admin merges by item id across stores and is a local store key', async () => {
    await new LocalStore().saveTripAdmin('Alex', { flights: { done: true } });
    await new LocalStore().saveTripAdmin('Alex', { eta: { done: true }, flights: { done: false } });
    const t = (await new LocalStore().load()).tripAdmin?.Alex;
    expect(t).toMatchObject({ name: 'Alex', items: { flights: { done: false }, eta: { done: true } } });
    expect(Date.parse(t!.updatedAt)).toBeGreaterThan(0);
    expect(isLocalStoreKey('tp:tripadmin:Alex')).toBe(true);
  });

  it('load always carries a stays block, empty when nothing is saved', async () => {
    expect((await new LocalStore().load()).stays).toEqual({ crew: {}, suggestions: [], admin: { pins: [], scouts: {}, closed: [] } });
  });

  it('subscribe callback fires after saveCrewStays', async () => {
    const s = new LocalStore();
    let got: Awaited<ReturnType<LocalStore['load']>> | null = null;
    const off = s.subscribe(st => { got = st; });
    await s.saveCrewStays('Lazza', { quizDone: true });
    off();
    expect(got!.stays?.crew.Lazza?.quizDone).toBe(true);
  });

  it('crew stays rows count as shared store data, cleared by Start over', () => {
    expect(isLocalStoreKey('tp:stays:Alex')).toBe(true);
    expect(isLocalStoreKey('tp:me')).toBe(false);
  });
});

describe('LocalStore place suggestions and stays admin', () => {
  const draft = { name: 'Alex' as const, area: 'Ella' as const, kind: 'stay' as const, title: 'Hill hut', priceGbp: 40 };

  it('adds a live suggestion with an id and stamp, withdraws it, and both survive a new store', async () => {
    await new LocalStore().addPlaceSuggestion(draft);
    const [p] = (await new LocalStore().load()).stays!.suggestions;
    expect(p).toMatchObject({ ...draft, status: 'live' });
    expect(p.id).toBeTruthy();
    expect(Date.parse(p.createdAt)).toBeGreaterThan(0);
    await new LocalStore().setPlaceStatus(p.id, 'withdrawn');
    expect((await new LocalStore().load()).stays!.suggestions).toEqual([{ ...p, status: 'withdrawn' }]);
  });

  it('admin pins are replaced whole, scouts merge by area, and undefined clears an area', async () => {
    const pin = (suggestionId: string | null) => ({ area: 'Ella' as const, suggestionId, at: 't' });
    await new LocalStore().saveStaysAdmin({ pins: [pin('a'), { ...pin('b'), area: 'Kandy and Knuckles' }], scouts: { Ella: 'Lazza', Colombo: 'Alex', North: 'Antek' } });
    await new LocalStore().saveStaysAdmin({ pins: [pin(null)], scouts: { Ella: 'Saulie', Colombo: undefined } });
    expect((await new LocalStore().load()).stays!.admin).toEqual({ pins: [pin(null)], scouts: { Ella: 'Saulie', North: 'Antek' }, closed: [] });
  });

  it('closed is replaced whole, and saving closed keeps pins and scouts while saving them keeps closed', async () => {
    const pin = { area: 'Ella' as const, suggestionId: 'a', at: 't' };
    await new LocalStore().saveStaysAdmin({ pins: [pin], scouts: { Ella: 'Lazza' } });
    await new LocalStore().saveStaysAdmin({ closed: ['Ella'] });
    expect((await new LocalStore().load()).stays!.admin).toEqual({ pins: [pin], scouts: { Ella: 'Lazza' }, closed: ['Ella'] });
    await new LocalStore().saveStaysAdmin({ scouts: { North: 'Alex' } });
    expect((await new LocalStore().load()).stays!.admin).toEqual({ pins: [pin], scouts: { Ella: 'Lazza', North: 'Alex' }, closed: ['Ella'] });
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [], scouts: {} }));
    expect((await new LocalStore().load()).stays!.admin.closed).toEqual([]);
  });

  it('subscribe fires after each new write', async () => {
    const s = new LocalStore();
    let n = 0;
    const off = s.subscribe(() => { n++; });
    await s.addPlaceSuggestion(draft);
    await s.setPlaceStatus('x', 'withdrawn');
    await s.saveStaysAdmin({ scouts: { Ella: 'Alex' } });
    off();
    expect(n).toBe(3);
  });

  it('place suggestions and admin count as shared store data, cleared by Start over', () => {
    expect(isLocalStoreKey('tp:placesug')).toBe(true);
    expect(isLocalStoreKey('tp:staysadmin')).toBe(true);
  });
});
