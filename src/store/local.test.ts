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

  it('load always carries a stays block, empty when nothing is saved', async () => {
    expect((await new LocalStore().load()).stays).toEqual({ crew: {}, suggestions: [], admin: { pins: [], scouts: {} } });
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
