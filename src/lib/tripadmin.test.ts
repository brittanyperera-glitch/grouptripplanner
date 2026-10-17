import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { AREAS } from '../types';
import type { AppState, Item, Plan, PlaceSuggestion } from '../types';
import { ADMIN_IDS, adminChecklist, adminOutstanding, BOOK_IDS, doneBy, PERSON_IDS, stayItemId, toggleDone, visibleEntry, withDetails } from './tripadmin';

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
  it('are a stable list: person items, bookable places from the catalogue, one stay per area', () => {
    expect(PERSON_IDS).toEqual(['flights', 'eta', 'insurance', 'health', 'phone', 'money']);
    expect(BOOK_IDS).toEqual(['book:crab', 'book:sigiriya', 'book:rafting', 'book:train']);
    expect(ADMIN_IDS).toEqual([...PERSON_IDS, ...BOOK_IDS, ...AREAS.map(a => `stay:${a}`)]);
    expect(new Set(ADMIN_IDS).size).toBe(ADMIN_IDS.length);
  });

  it('bookable places are exactly the catalogue items with a booking note', () => {
    const withBook = (catalogue as unknown as { items: Item[] }).items.filter(i => i.book).map(i => `book:${i.id}`);
    expect(BOOK_IDS).toEqual(withBook);
  });

  it('every shown string is plain: under 25 words, no em dash, no emoji', () => {
    const all = adminChecklist(withStay(), 'Alex', plan(['crab', 'sigiriya', 'rafting', 'train']));
    expect(all.length).toBeGreaterThan(PERSON_IDS.length);
    for (const d of all) {
      for (const text of [d.label, d.hint, d.info ?? '']) {
        expect(text.split(/\s+/).filter(Boolean).length, text).toBeLessThanOrEqual(25);
        expect(text).not.toMatch(/\u2014|\p{Extended_Pictographic}/u);
      }
    }
  });
});

describe('adminChecklist', () => {
  it('without a plan only the person items apply', () => {
    expect(adminChecklist(base(), 'Alex', null).map(d => d.id)).toEqual(PERSON_IDS);
  });

  it('group places appear only when the plan holds them', () => {
    const ids = adminChecklist(base(), 'Alex', plan(['sigiriya', 'train'])).map(d => d.id);
    expect(ids).toEqual([...PERSON_IDS, 'book:sigiriya', 'book:train']);
  });

  it('a stay item appears only once that stop is decided, and names the stay and its price', () => {
    expect(adminChecklist(base(), 'Alex', plan([])).some(d => d.id === stayItemId('Ella'))).toBe(false);
    const d = adminChecklist(withStay(), 'Alex', plan([])).find(x => x.id === 'stay:Ella');
    expect(d).toMatchObject({ scope: 'group', label: 'Stay in Ella', hint: 'Book Hill hut.', info: 'about £40 a night' });
  });
});

describe('adminOutstanding', () => {
  it('lists my unticked person items; a tick by someone else does not clear mine', () => {
    const s = base({ tripAdmin: { ...tick('Brittany', ['flights', 'eta']), ...tick('Alex', ['flights']) } });
    expect(adminOutstanding('Alex', s).map(d => d.id)).toEqual(['eta', 'insurance', 'health', 'phone', 'money']);
    expect(adminOutstanding('Brittany', s).map(d => d.id)).toEqual(['insurance', 'health', 'phone', 'money']);
  });

  it('a group item is owed until anyone ticks it, then nobody owes it', () => {
    const p = plan(['sigiriya']);
    expect(adminOutstanding('Alex', base(), p).find(d => d.id === 'book:sigiriya')).toEqual({ id: 'book:sigiriya', scope: 'group', label: 'Sigiriya Rock' });
    const s = base({ tripAdmin: tick('Brittany', ['book:sigiriya']) });
    expect(adminOutstanding('Alex', s, p).some(d => d.id === 'book:sigiriya')).toBe(false);
    expect(doneBy(s, 'book:sigiriya')).toEqual(['Brittany']);
  });

  it('is empty once everything applicable is ticked', () => {
    expect(adminOutstanding('Alex', base({ tripAdmin: tick('Alex', PERSON_IDS) }))).toEqual([]);
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
    const out = withDetails({ done: true, doneAt: 't', price: 'old' }, { price: '  ', ref: ' R1 ', note: 'x'.repeat(500) });
    expect(out).toEqual({ done: true, doneAt: 't', ref: 'R1', note: 'x'.repeat(200) });
  });
});
