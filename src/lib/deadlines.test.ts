import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { Item, Leg, Plan } from '../types';
import { addDays, bookingsByDay, bookingStatus } from './deadlines';
import { groupResult } from './group';
import { RELEASE } from './release';

const ALL = (catalogue as unknown as { items: Item[] }).items;
const item = (id: string) => ALL.find(i => i.id === id)!;
const plan = (days: Record<number, string[]>): Plan => ({
  route: [], areas: [], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: Object.entries(days).map(([n, ids]) => ({
    n: +n, area: null, spare: 0, rainSlack: false, entries: ids.map(itemId => ({ kind: 'activity' as const, label: itemId, hours: 1, itemId })),
  })),
});
const base = { start: '2026-12-08', today: '2026-11-16', items: ALL, stayItems: [], done: {}, owners: {}, overrides: {} };

describe('bookingStatus', () => {
  const a = { id: 'x', label: 'X', owner: null, done: false, today: '2026-11-16', useDate: '2026-12-08', rule: {} };
  it('is undated with no use date, whatever else is set', () => {
    expect(bookingStatus({ ...a, useDate: null, rule: { opensDaysBefore: 30 } })).toMatchObject({ status: 'undated', opensOn: null, bookBy: null });
  });
  it('is not-open before opensOn, open from it', () => {
    const rule = { opensDaysBefore: 30 };
    expect(bookingStatus({ ...a, rule, today: '2026-11-07' })).toMatchObject({ status: 'not-open', opensOn: '2026-11-08' });
    expect(bookingStatus({ ...a, rule, today: '2026-11-08' }).status).toBe('open');
  });
  it('is overdue only the day after bookBy', () => {
    const rule = { bookByDaysBefore: 14 };
    expect(bookingStatus({ ...a, rule, today: '2026-11-24' })).toMatchObject({ status: 'open', bookBy: '2026-11-24' });
    expect(bookingStatus({ ...a, rule, today: '2026-11-25' }).status).toBe('overdue');
  });
  it('is done whatever the dates say', () => {
    expect(bookingStatus({ ...a, rule: { bookByDaysBefore: 14 }, today: '2026-12-01', done: true }).status).toBe('done');
    expect(bookingStatus({ ...a, useDate: null, done: true }).status).toBe('done');
  });
  it('lets an override replace either date', () => {
    const b = bookingStatus({ ...a, rule: { opensDaysBefore: 30, bookByDaysBefore: 14 }, override: { bookBy: '2026-12-01' } });
    expect(b).toMatchObject({ opensOn: '2026-11-08', bookBy: '2026-12-01' });
    expect(bookingStatus({ ...a, rule: { bookByDaysBefore: 14 }, override: { bookBy: '2026-11-10' } }).status).toBe('overdue');
  });
  it('carries the owner', () => {
    expect(bookingStatus({ ...a, owner: 'Alex' }).owner).toBe('Alex');
  });
});

describe('bookingsByDay', () => {
  it('has no dates for a start that cannot be read, rather than throwing', () => {
    const t = bookingsByDay({ ...base, start: 'soon', plan: plan({ 5: ['train'] }) })[5].find(b => b.id === 'book:train')!;
    expect(t).toMatchObject({ opensOn: null, bookBy: null });
  });
  it('puts the train on its day, opening 30 days before that day\'s date', () => {
    const out = bookingsByDay({ ...base, plan: plan({ 1: ['crab'], 5: ['train'] }) });
    const t = out[5].find(b => b.id === 'book:train')!;
    expect(t).toMatchObject({ label: item('train').name, opensOn: addDays('2026-12-08', 4 - 30), bookBy: null, status: 'open' });
    expect(t.opensOn).toBe('2026-11-12');
  });
  it('reads bookByDaysBefore from the catalogue for the crab dinner', () => {
    const b = bookingsByDay({ ...base, plan: plan({ 2: ['crab'] }) })[2][0];
    expect(b).toMatchObject({ id: 'book:crab', bookBy: '2026-11-25', opensOn: null });
  });
  it('lets an override win over the catalogue rule', () => {
    const b = bookingsByDay({ ...base, plan: plan({ 2: ['crab'] }), overrides: { 'book:crab': { bookBy: '2026-11-01' } } })[2][0];
    expect(b).toMatchObject({ bookBy: '2026-11-01', status: 'overdue' });
  });
  it('keeps an item with no lead time open with null dates', () => {
    const b = bookingsByDay({ ...base, plan: plan({ 3: ['sigiriya'] }) })[3][0];
    expect(b).toMatchObject({ id: 'book:sigiriya', opensOn: null, bookBy: null, status: 'open' });
  });
  it('skips items with no book note and items not in the plan', () => {
    const out = bookingsByDay({ ...base, plan: plan({ 1: ['kottu'] }) });
    expect(Object.values(out).flat()).toEqual([]);
  });
  it('dates a stay on its check-in day and honours an override on its id', () => {
    const b = bookingsByDay({ ...base, plan: plan({}), stayItems: [{ id: 'stay:Ella', label: 'Stay in Ella', day: 6 }], overrides: { 'stay:Ella': { bookBy: '2026-12-01' } } })[6][0];
    expect(b).toMatchObject({ id: 'stay:Ella', label: 'Stay in Ella', opensOn: null, bookBy: '2026-12-01', status: 'open' });
  });
  it('is undated for everything when there is no start date, and done and owners are carried', () => {
    const out = bookingsByDay({ ...base, start: null, plan: plan({ 5: ['train', 'rafting'] }), done: { 'book:train': true }, owners: { 'book:rafting': 'Saulie' } });
    expect(out[5].map(b => [b.id, b.status, b.owner])).toEqual([['book:train', 'done', null], ['book:rafting', 'undated', 'Saulie']]);
  });
  it('works on the real released plan: the train opens 30 days before its day', () => {
    const g = groupResult(seedState(), ALL, legs as Leg[], [], RELEASE).final!;
    const day = g.days.find(d => d.entries.some(e => e.itemId === 'train'))!;
    const t = bookingsByDay({ ...base, plan: g })[day.n].find(b => b.id === 'book:train')!;
    expect(t.opensOn).toBe(addDays('2026-12-08', day.n - 1 - 30));
  });
});
