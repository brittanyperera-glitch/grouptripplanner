import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { hubName } from '../components/Map';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Leg } from '../types';
import { SaveItinerary } from './Itinerary';
import { TripViewBody } from './TripView';
import { dayCover } from './TripDay';
import { useTripModel } from './useTripModel';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const legs = legsData as Leg[];
const group: GroupResult = groupResult(seedState(), ITEMS, legs, [], RELEASE);
const plan = group.final!;
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const wrapper = ({ children }: { children: ReactNode }) => <AppProvider store={new LocalStore()}>{children}</AppProvider>;
const photo = (i: Item | undefined) => (i?.photo ? `/img/${i.photo}.jpg` : null);

beforeEach(() => {
  localStorage.clear();
  window.print = vi.fn();
  localStorage.setItem('tp:me', 'Brittany');
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const button = async (g: GroupResult | undefined, kind: 'Group' | 'My' = 'Group', provisional = false) => {
  render(<SaveItinerary plan={plan} kind={kind} group={g} provisional={provisional} />, { wrapper });
  return screen.findByRole('button', { name: 'Save itinerary as PDF' });
};
const open = async (g: GroupResult | undefined, kind: 'Group' | 'My' = 'Group', provisional = false) => {
  fireEvent.click(await button(g, kind, provisional));
  const doc = await screen.findByTestId('itinerary');
  if (g) await waitFor(() => expect(within(doc).getAllByRole('heading', { name: /^Day 1 · Tue 8 Dec/ })).toHaveLength(1));
  return doc;
};
const dayRegions = (doc: HTMLElement) => within(doc).getAllByRole('region', { name: /^Day \d$/ });
const imgs = () => [...document.querySelectorAll<HTMLImageElement>('.it-print img')];

describe('the saved itinerary reads like a travel agency\'s', () => {
  it('opens with a cover: title, kind, the date range, the length, all five travellers, the route in order, the map and a hero photo', async () => {
    const doc = await open(group, 'Group', true);
    const cover = within(doc).getByRole('region', { name: 'Cover' });
    expect(within(cover).getByRole('heading', { level: 1, name: 'Sri Lanka itinerary' })).toBeInTheDocument();
    expect(within(cover).getByText('Group itinerary')).toBeInTheDocument();
    expect(cover).toHaveTextContent('Tue 8 Dec to Wed 16 Dec 2026');
    expect(cover).toHaveTextContent(`9 days · about ${plan.travelHours.toFixed(1)} h driving`);
    for (const p of PEOPLE) expect(cover).toHaveTextContent(p);
    expect(within(within(cover).getByRole('list', { name: 'Route' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(plan.route.map(hubName));
    expect(within(cover).getByRole('img', { name: /^Route:/ })).toBeInTheDocument();
    expect(cover).toHaveTextContent('Provisional');
    const m = renderHook(() => useTripModel(group), { wrapper });
    await waitFor(() => expect(m.result.current?.views).toHaveLength(9));
    expect(cover.querySelector('img.it-hero')).toHaveAttribute('src', photo(dayCover(m.result.current.views[0], ITEMS, plan.chosen))!);
  });

  it('leaves out the date range when the trip has no start date, and the provisional note when the plan is locked', async () => {
    localStorage.setItem('tp:settings', JSON.stringify({ startDate: null, plan: null, bookingDates: {}, overrides: [], updatedAt: AT }));
    const doc = await open(undefined);
    const cover = within(doc).getByRole('region', { name: 'Cover' });
    expect(cover).not.toHaveTextContent(/ to \w{3} \d+ \w{3} 20\d\d/);
    expect(cover).not.toHaveTextContent('Provisional');
  });

  it('gives each of the 9 days a photo band that is the very photo its card on screen shows', async () => {
    const m = renderHook(() => useTripModel(group, '2026-12-01'), { wrapper });
    await waitFor(() => expect(m.result.current.views).toHaveLength(9));
    render(<TripViewBody model={m.result.current} items={ITEMS} legs={legs} />);
    fireEvent.click(screen.getByRole('button', { name: 'All days' }));
    const onScreen = screen.getAllByRole('region', { name: /^Day \d$/ }).map(d => d.querySelector('img')?.getAttribute('src'));
    cleanup();
    expect(onScreen).toHaveLength(9);
    const doc = await open(group);
    const days = dayRegions(doc);
    expect(days).toHaveLength(9);
    const bands = days.map(d => d.parentElement!.querySelector('img.it-photo')?.getAttribute('src'));
    expect(bands).toEqual(onScreen);
    for (const d of days) expect(d.parentElement).toContainElement(d.parentElement!.querySelector('img'));
  });

  it('puts one dated heading, the area and the day\'s schedule in each day, and the back matter as Bookings, Where you sleep and Heads up', async () => {
    const doc = await open(group);
    const day3 = within(doc).getByRole('region', { name: 'Day 3' });
    expect(within(day3).getByRole('heading', { name: /^Day 3 · Thu 10 Dec/ })).toBeInTheDocument();
    expect(within(day3).getAllByRole('listitem').length).toBeGreaterThan(1);
    for (const name of ['Bookings', 'Where you sleep', 'Heads up']) expect(within(doc).getAllByRole('region', { name })).toHaveLength(1);
    expect(within(within(doc).getByRole('region', { name: 'Where you sleep' })).getByRole('list', { name: 'Nights' })).toBeInTheDocument();
  });

  it('never asks the browser to defer a picture, since a deferred one is blank in the file', async () => {
    const doc = await open(group);
    expect(imgs().length).toBeGreaterThan(9);
    expect(doc.querySelectorAll('img[loading]')).toHaveLength(0);
  });

  it('still prints from My trip, which has no group and no model: undated, travelling as me', async () => {
    const doc = await open(undefined, 'My');
    const cover = within(doc).getByRole('region', { name: 'Cover' });
    expect(within(cover).getByText('My itinerary')).toBeInTheDocument();
    expect(cover).toHaveTextContent('Brittany');
    expect(cover).not.toHaveTextContent('Alex');
    expect(dayRegions(doc)).toHaveLength(9);
  });
});

describe('Save itinerary waits for the pictures', () => {
  const settle = (el: HTMLImageElement, ev: 'load' | 'error') => fireEvent(el, new Event(ev));
  const click = async () => {
    const b = await button(group);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(b);
    return imgs();
  };

  it('prints only after every picture has loaded or failed', async () => {
    const all = await click();
    expect(all.length).toBeGreaterThan(9);
    expect(window.print).not.toHaveBeenCalled();
    all.slice(0, -1).forEach((el, i) => settle(el, i % 2 ? 'error' : 'load'));
    await vi.advanceTimersByTimeAsync(0);
    expect(window.print).not.toHaveBeenCalled();
    settle(all[all.length - 1], 'error');
    await vi.advanceTimersByTimeAsync(0);
    expect(window.print).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('says it is preparing while it waits, and stops saying so once the dialog is asked for', async () => {
    const all = await click();
    expect(screen.getByRole('status')).toHaveTextContent(/Preparing/);
    expect(screen.getByRole('button', { name: 'Save itinerary as PDF' })).toHaveAttribute('aria-busy', 'true');
    all.forEach(el => settle(el, 'load'));
    await vi.advanceTimersByTimeAsync(0);
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save itinerary as PDF' })).toHaveAttribute('aria-busy', 'false');
  });

  it('prints once after 4 s even when one picture never settles, and not a moment before', async () => {
    const all = await click();
    all.slice(1).forEach(el => settle(el, 'load'));
    await vi.advanceTimersByTimeAsync(3900);
    expect(window.print).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(window.print).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('a second tap while it waits does not queue a second print', async () => {
    const all = await click();
    fireEvent.click(screen.getByRole('button', { name: 'Save itinerary as PDF' }));
    all.forEach(el => settle(el, 'load'));
    await vi.advanceTimersByTimeAsync(0);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('names the file while printing and puts the tab title back on afterprint', async () => {
    document.title = 'Group Trip Hero';
    const all = await click();
    expect(document.title).toBe('Sri Lanka group itinerary');
    all.forEach(el => settle(el, 'load'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.title).toBe('Sri Lanka group itinerary');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Group Trip Hero');
  });

  it('prints straight away when there is nothing left to load', async () => {
    const b = await button(group);
    fireEvent.click(b);
    const all = imgs();
    all.forEach(el => settle(el, 'load'));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    all.forEach(el => Object.defineProperty(el, 'complete', { value: true }));
    fireEvent.click(b);
    expect(window.print).toHaveBeenCalledTimes(2);
  });
});
