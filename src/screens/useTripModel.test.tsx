import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { stayItemId } from '../lib/tripadmin';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE, type Area, type GroupResult, type Item, type Leg, type PlaceSuggestion } from '../types';
import { useTripModel } from './useTripModel';

const group: GroupResult = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const START = '2026-12-08';
const TODAY = '2026-12-01';
const wrapper = ({ children }: { children: ReactNode }) => <AppProvider store={new LocalStore()}>{children}</AppProvider>;
const model = async (g: GroupResult = group, today = TODAY) => {
  const r = renderHook(() => useTripModel(g, today), { wrapper });
  await waitFor(() => expect(r.result.current).not.toBeNull());
  return r;
};
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const stayOf = (area: Area): PlaceSuggestion => ({ id: `s-${area}`, name: 'Alex', area, kind: 'stay', title: `House ${area}`, link: `https://x.test/${area}`, status: 'live', createdAt: '2026-11-01T00:00:00Z' });
const AT = '2026-11-02T00:00:00Z';

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe('useTripModel on the released plan', () => {
  it('dates nine views 8 to 16 Dec, has no night on day 9, and is a draft while no stay is decided', async () => {
    put('tp:settings', { startDate: START, plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
    const { result } = await model();
    const m = result.current;
    expect(m.views.map(v => v.date)).toEqual(['2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14', '2026-12-15', '2026-12-16']);
    expect(m.views[8].tonight).toBeNull();
    expect(m.views[0].tonight).toMatchObject({ checkIn: true, stayId: null });
    expect(m.draft).toBe(true);
    expect(m.missing.stays).toEqual([...new Set(m.blocks.map(b => b.area))]);
    expect(m.missing.startDate).toBe(false);
    expect(m.missing.flights).toEqual(PEOPLE);
    expect(m.bookings.some(b => b.id.startsWith('stay:'))).toBe(false);
  });

  it('has no dates and is a draft without a start date', async () => {
    const { result } = await model();
    expect(result.current.views.every(v => v.date === null)).toBe(true);
    expect(result.current.missing.startDate).toBe(true);
    expect(result.current.draft).toBe(true);
    expect(result.current.bookings.every(b => b.status === 'undated' || b.status === 'done')).toBe(true);
  });

  it('is the same object on a re-render with the same inputs', async () => {
    const { result, rerender } = await model();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('is empty for a group with no final plan', async () => {
    const { result } = await model({ ...group, final: null });
    expect(result.current.plan).toBeNull();
    expect(result.current.views).toEqual([]);
    expect(result.current.draft).toBe(true);
  });

  it('carries the organiser warnings through', async () => {
    const { result } = await model({ ...group, warnings: ['Day 2 is over budget by 1 h.'] });
    expect(result.current.warnings).toEqual(['Day 2 is over budget by 1 h.']);
  });
});

describe('stays, bookings and flights from live state', () => {
  it('puts a decided stay on every night of its block and lists its booking under the check-in day', async () => {
    const first = (await model()).result.current.blocks[0];
    put('tp:placesug', [stayOf(first.area)]);
    put('tp:staysadmin', { pins: [{ area: first.area, suggestionId: `s-${first.area}`, at: AT }], scouts: {}, closed: [] });
    put('tp:settings', { startDate: START, plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
    const { result } = await model();
    const m = result.current;
    for (let n = first.fromDay; n <= first.toDay; n++) expect(m.views[n - 1].tonight).toMatchObject({ title: `House ${first.area}`, link: `https://x.test/${first.area}`, checkIn: n === first.fromDay });
    expect(m.views[first.fromDay - 1].bookings.map(b => b.id)).toContain(stayItemId(first.area));
    expect(m.staysByArea[first.area]?.title).toBe(`House ${first.area}`);
    expect(m.missing.stays).not.toContain(first.area);
  });

  it('counts a stay tick only when newer than the fall, and drops a stale claim', async () => {
    const first = (await model()).result.current.blocks[0];
    const id = stayItemId(first.area);
    put('tp:placesug', [stayOf(first.area)]);
    put('tp:staysadmin', { pins: [{ area: first.area, suggestionId: `s-${first.area}`, at: AT }], scouts: {}, closed: [], fallen: [{ id: 'old', area: first.area, at: '2026-11-10T00:00:00Z' }] });
    put('tp:tripadmin:Alex', { name: 'Alex', items: { [id]: { done: true, doneAt: '2026-11-05T00:00:00Z' } }, updatedAt: AT });
    put('tp:claims', { [id]: { itemId: id, owner: 'Lazza', updatedAt: '2026-11-05T00:00:00Z' } });
    put('tp:settings', { startDate: START, plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
    const stale = (await model()).result.current.bookings.find(b => b.id === id)!;
    expect(stale).toMatchObject({ status: 'open', owner: null });

    localStorage.clear();
    put('tp:placesug', [stayOf(first.area)]);
    put('tp:staysadmin', { pins: [{ area: first.area, suggestionId: `s-${first.area}`, at: AT }], scouts: {}, closed: [], fallen: [{ id: 'old', area: first.area, at: '2026-11-10T00:00:00Z' }] });
    put('tp:tripadmin:Alex', { name: 'Alex', items: { [id]: { done: true, doneAt: '2026-11-12T00:00:00Z' } }, updatedAt: AT });
    put('tp:claims', { [id]: { itemId: id, owner: 'Lazza', updatedAt: '2026-11-12T00:00:00Z' } });
    const fresh = (await model()).result.current.bookings.find(b => b.id === id)!;
    expect(fresh).toMatchObject({ status: 'done', owner: 'Lazza' });
  });

  it('is not a draft once the start date, every stay, every booking and every flight is in', async () => {
    const blocks = (await model()).result.current.blocks;
    const places = [...new Set(blocks.map(b => b.area))].map(stayOf);
    put('tp:placesug', places);
    put('tp:staysadmin', { pins: places.map(s => ({ area: s.area, suggestionId: s.id, at: AT })), scouts: {}, closed: [] });
    put('tp:settings', { startDate: START, plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
    const ids = (await model()).result.current.bookings.map(b => b.id);
    expect(ids.length).toBeGreaterThan(places.length);
    put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ids.map(id => [id, { done: true, doneAt: '2026-11-20T00:00:00Z' }])), updatedAt: AT });
    put('tp:travellers', Object.fromEntries(PEOPLE.map(name => [name, { name, arriveLocal: '2026-12-08T09:00', arriveFlight: 'UL 1', departLocal: '2026-12-16T20:00', departFlight: 'UL 2', updatedAt: AT }])));
    const m = (await model()).result.current;
    expect(m.missing).toEqual({ flights: [], stays: [], bookings: 0, startDate: false });
    expect(m.draft).toBe(false);
    expect(m.views[0].flights.map(f => f.kind)).toEqual(expect.arrayContaining(['arrive']));
  });

  it('writes an all-day calendar with one titled event per day', async () => {
    put('tp:settings', { startDate: START, plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
    const ics = (await model()).result.current.icsText();
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBeGreaterThanOrEqual(9);
    expect(ics).toContain('SUMMARY:Day 1 · ');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261208');
  });
});

describe('today stays current while the app is open', () => {
  // 18:29 UTC is 23:59 in Colombo (UTC+5:30, no daylight saving). Only Date and the interval are faked so waitFor keeps its real timers.
  const fake = (iso: string) => vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: new Date(iso) });
  const live = () => renderHook(() => useTripModel(group), { wrapper });
  const train = (m: ReturnType<typeof useTripModel>) => m.bookings.find(b => b.id === 'book:train')!;
  beforeEach(() => put('tp:settings', { startDate: START, plan: null, bookingDates: { 'book:train': { bookBy: '2026-11-19' } }, overrides: [], updatedAt: AT }));
  afterEach(() => vi.useRealTimers());

  it('flips a booking from open to overdue when the clock crosses midnight in Colombo', async () => {
    fake('2026-11-19T18:29:00Z');
    const r = live();
    await vi.waitFor(() => expect(train(r.result.current)).toMatchObject({ status: 'open' }));
    expect(r.result.current.today).toBe('2026-11-19');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(r.result.current.today).toBe('2026-11-20');
    expect(train(r.result.current)).toMatchObject({ status: 'overdue' });
  });

  it('catches up when the tab becomes visible again after sleeping past midnight', async () => {
    fake('2026-11-19T18:29:00Z');
    const r = live();
    await vi.waitFor(() => expect(train(r.result.current).status).toBe('open'));
    act(() => { vi.setSystemTime(new Date('2026-11-20T03:00:00Z')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(train(r.result.current).status).toBe('overdue');
  });

  it('keeps an injected today fixed', async () => {
    fake('2026-11-19T18:29:00Z');
    const r = renderHook(() => useTripModel(group, '2026-11-19'), { wrapper });
    await vi.waitFor(() => expect(train(r.result.current).status).toBe('open'));
    act(() => { vi.advanceTimersByTime(3_600_000); });
    expect(r.result.current.today).toBe('2026-11-19');
  });
});
