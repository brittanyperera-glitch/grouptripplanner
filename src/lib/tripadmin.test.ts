import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { AREAS } from '../types';
import type { AppState, Fallen, Item, Plan, PlaceSuggestion } from '../types';
import { ADMIN_IDS, adminChecklist, adminOutstanding, BOOK_IDS, claimIsFresh, doneBy, stayItemId, toggleDone, visibleEntry, withDetails } from './tripadmin';

const day = (n: number, area: Plan['days'][number]['area']) => ({ n, area, entries: [], spare: 0, rainSlack: false });
const plan = (chosen: string[]): Plan => ({
  route: ['AIR'], areas: ['Ella'], chosen, dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, days: [day(1, 'Ella'), day(2, 'Ella')],
});
const stay: PlaceSuggestion = { id: 's1', name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut', priceGbp: 40, status: 'live', createdAt: '2026-10-16' };
const base = (over: Partial<AppState> = {}): AppState => ({ responses: {}, suggestions: [], votes: [], ...over });
const withStay = (): AppState => base({ stays: { crew: {}, suggestions: [stay], admin: { pins: [], scouts: {}, closed: [] } } });
const tick = (who: 'Alex' | 'Brittany', ids: string[]): AppState['tripAdmin'] =>
  ({ [who]: { name: who, updatedAt: 't', items: Object.fromEntries(ids.map(i => [i, { done: true }])) } });

describe('item ids', () => {
  // Changed deliberately (Brittany 2026-10-17: remove the flights/insurance checklist, she does not want to babysit): no personal items remain.
  it('are a stable list: bookable places from the catalogue, one stay per area', () => {
    expect(BOOK_IDS).toEqual(['book:crab', 'book:sigiriya', 'book:rafting', 'book:train']);
    expect(ADMIN_IDS).toEqual([...BOOK_IDS, ...AREAS.map(a => `stay:${a}`)]);
    expect(new Set(ADMIN_IDS).size).toBe(ADMIN_IDS.length);
  });

  it('bookable places are exactly the catalogue items with a booking note', () => {
    const withBook = (catalogue as unknown as { items: Item[] }).items.filter(i => i.book).map(i => `book:${i.id}`);
    expect(BOOK_IDS).toEqual(withBook);
  });

  it('every shown string is plain: under 25 words, no em dash, no emoji', () => {
    const all = adminChecklist(withStay(), 'Alex', plan(['crab', 'sigiriya', 'rafting', 'train']));
    expect(all.length).toBeGreaterThan(0);
    for (const d of all) {
      for (const text of [d.label, d.hint, d.info ?? '']) {
        expect(text.split(/\s+/).filter(Boolean).length, text).toBeLessThanOrEqual(25);
        expect(text).not.toMatch(/\u2014|\p{Extended_Pictographic}/u);
      }
    }
  });
});

describe('adminChecklist', () => {
  it('without a plan there is nothing to book', () => {
    expect(adminChecklist(base(), 'Alex', null)).toEqual([]);
  });

  it('group places appear only when the plan holds them', () => {
    const ids = adminChecklist(base(), 'Alex', plan(['sigiriya', 'train'])).map(d => d.id);
    expect(ids).toEqual(['book:sigiriya', 'book:train']);
  });

  it('a stay item appears only once that stop is decided, and names the stay', () => {
    expect(adminChecklist(base(), 'Alex', plan([])).some(d => d.id === stayItemId('Ella'))).toBe(false);
    const d = adminChecklist(withStay(), 'Alex', plan([])).find(x => x.id === 'stay:Ella');
    expect(d).toMatchObject({ label: 'Stay in Ella', hint: 'Book Hill hut.' });
    expect(d?.info).toBeUndefined();
  });
});

describe('adminOutstanding', () => {
  it('a group item is owed until anyone ticks it, then nobody owes it', () => {
    const p = plan(['sigiriya']);
    expect(adminOutstanding('Alex', base(), p).find(d => d.id === 'book:sigiriya')).toEqual({ id: 'book:sigiriya', label: 'Sigiriya Rock' });
    const s = base({ tripAdmin: tick('Brittany', ['book:sigiriya']) });
    expect(adminOutstanding('Alex', s, p).some(d => d.id === 'book:sigiriya')).toBe(false);
    expect(doneBy(s, 'book:sigiriya')).toEqual(['Brittany']);
  });

  it('is empty once everything applicable is ticked', () => {
    expect(adminOutstanding('Alex', base())).toEqual([]);
    expect(adminOutstanding('Alex', base({ tripAdmin: tick('Brittany', BOOK_IDS) }), plan(['crab', 'sigiriya', 'rafting', 'train']))).toEqual([]);
  });
});

describe('privacy in the UI contract', () => {
  const e = { done: true, doneAt: 't1', price: 'USD 35', ref: 'ABC123', note: 'back door' };
  it('the owner sees everything; anyone else sees only done and when', () => {
    expect(visibleEntry('Alex', 'Alex', e)).toEqual(e);
    expect(visibleEntry('Brittany', 'Alex', e)).toEqual({ done: true, doneAt: 't1' });
    expect(visibleEntry(null, 'Alex', e)).toEqual({ done: true, doneAt: 't1' });
    expect(visibleEntry('Alex', 'Alex', undefined)).toBeUndefined();
  });
});

describe('entry patches', () => {
  it('ticking stamps doneAt and keeps details; unticking drops the stamp but keeps details', () => {
    const on = toggleDone({ done: false, price: '£5' }, true, 'now');
    expect(on).toEqual({ done: true, doneAt: 'now', price: '£5' });
    expect(toggleDone(on, false, 'later')).toEqual({ done: false, price: '£5' });
  });

  it('details are trimmed, capped and dropped when empty, and keep the tick', () => {
    // Changed deliberately (Brittany 2026-10-17): the booking reference is gone; an old stored one is dropped on the next save.
    const out = withDetails({ done: true, doneAt: 't', price: 'old', ref: 'OLD-REF' }, { price: '  ', note: 'x'.repeat(500) });
    expect(out).toEqual({ done: true, doneAt: 't', note: 'x'.repeat(200) });
  });
});

describe('freshness after a stay falls through', () => {
  const stay2: PlaceSuggestion = { ...stay, id: 's2', title: 'Tea cabin' };
  const fell = (at: string, id = 's1', area: Fallen['area'] = 'Ella'): Fallen => ({ id, area, at });
  const stateWith = (doneAt: string | undefined, fallen: Fallen[], pin = 's2'): AppState => base({
    stays: { crew: {}, suggestions: [stay, stay2], admin: { pins: [{ area: 'Ella', suggestionId: pin, at: '2026-11-03T09:00' }], scouts: {}, closed: [], fallen } },
    tripAdmin: { Brittany: { name: 'Brittany', updatedAt: 't', items: { 'stay:Ella': { done: true, ...(doneAt ? { doneAt } : {}) } } } },
  });
  const owed = (s: AppState) => adminOutstanding('Alex', s, plan([])).some(d => d.id === 'stay:Ella');

  it('a tick dated before the fall does not count, one after does', () => {
    expect(owed(stateWith('2026-11-01T08:00', [fell('2026-11-02T10:00')]))).toBe(true);
    expect(owed(stateWith('2026-11-04T08:00', [fell('2026-11-02T10:00')]))).toBe(false);
    expect(owed(stateWith('2026-11-01T08:00', []))).toBe(false);
  });
  it('ticks stamped in UTC are read as the same instant as Sri Lanka local falls', () => {
    expect(owed(stateWith('2026-11-02T04:00:00.000Z', [fell('2026-11-02T10:00')]))).toBe(true);
    expect(owed(stateWith('2026-11-02T05:00:00.000Z', [fell('2026-11-02T10:00')]))).toBe(false);
  });
  it('with two falls in one area the latest wins', () => {
    const both = [fell('2026-11-02T10:00'), fell('2026-11-05T10:00', 's9')];
    expect(owed(stateWith('2026-11-04T08:00', both))).toBe(true);
    expect(owed(stateWith('2026-11-06T08:00', both))).toBe(false);
  });
  it('a fall in another area does not matter; a tick with no time does not count once something fell', () => {
    expect(owed(stateWith('2026-11-01T08:00', [fell('2026-11-02T10:00', 'x', 'Kitulgala')]))).toBe(false);
    expect(owed(stateWith(undefined, [fell('2026-11-02T10:00')]))).toBe(true);
  });
  it('doneBy takes the fallen list directly and leaves other items alone', () => {
    const s = stateWith('2026-11-01T08:00', []);
    expect(doneBy(s, 'stay:Ella', [fell('2026-11-02T10:00')])).toEqual([]);
    expect(doneBy(s, 'stay:Ella')).toEqual(['Brittany']);
    expect(doneBy(base({ tripAdmin: tick('Brittany', ['book:crab']) }), 'book:crab', [fell('2026-11-02T10:00')])).toEqual(['Brittany']);
  });
});

describe('claimIsFresh', () => {
  const claim = (updatedAt: string) => ({ itemId: 'stay:Ella', owner: 'Alex' as const, updatedAt });
  const fallen: Fallen[] = [{ id: 's1', area: 'Ella', at: '2026-11-02T10:00' }, { id: 's0', area: 'Ella', at: '2026-11-05T10:00' }, { id: 'k', area: 'Kitulgala', at: '2026-11-09T10:00' }];
  it('counts only after the latest fall in that area', () => {
    expect(claimIsFresh(claim('2026-11-04T10:00'), fallen, 'Ella')).toBe(false);
    expect(claimIsFresh(claim('2026-11-06T10:00'), fallen, 'Ella')).toBe(true);
    expect(claimIsFresh(claim('2026-11-04T10:00'), fallen, 'Colombo')).toBe(true);
  });
  it('no claim is never fresh, and no fallen data leaves a claim as it was', () => {
    expect(claimIsFresh(undefined, [], 'Ella')).toBe(false);
    expect(claimIsFresh(claim('2020-01-01T00:00'), [], 'Ella')).toBe(true);
  });
});

describe('no money in what the checklist says', () => {
  it('over the real catalogue, no label, hint or info mentions a price', () => {
    const ids = (catalogue as unknown as { items: Item[] }).items.filter(i => i.book).map(i => i.id);
    const all = adminChecklist(withStay(), 'Alex', plan(ids));
    expect(all.length).toBe(ids.length + 1);
    for (const d of all) for (const text of [d.label, d.hint, d.info ?? '']) expect(text).not.toMatch(/£|\bLKR\b|\bUSD\b|\$\d|\brs\.?\s?\d|cost|price/i);
  });
});
