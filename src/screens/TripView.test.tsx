import { cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { hubXY } from '../components/Map';
import { motion } from '../components/motion';
import { buildLegs, legD } from '../components/routeDrive';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { stayItemId } from '../lib/tripadmin';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { GroupResult, Hub, Item, Leg, PlaceSuggestion } from '../types';
import TripView, { TripViewBody } from './TripView';
import { useTripModel } from './useTripModel';

vi.mock('../components/motion', async orig => ({ ...(await orig<typeof import('../components/motion')>()), motion: vi.fn(() => 'still') }));

const items = (catalogue as unknown as { items: Item[] }).items;
const group: GroupResult = groupResult(seedState(), items, legsData as Leg[], [], RELEASE);
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const start = (d = '2026-12-08') => put('tp:settings', { startDate: d, plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
const wrapper = ({ children }: { children: ReactNode }) => <AppProvider store={new LocalStore()}>{children}</AppProvider>;
const mount = async (hash = '') => {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<TripView group={group} today="2026-12-01" />, { wrapper });
  await screen.findByRole('group', { name: 'Days' });
  return user;
};
const chip = (n: number) => screen.getByRole('button', { name: new RegExp(`^Day ${n}\\b`) });
const tuk = (c: HTMLElement) => {
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(c.querySelector('[data-tuktuk]')?.parentElement?.getAttribute('transform') ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};
// The tuk-tuk's transform is its top-left corner, so it sits left of and above its hub: judge by the nearest hub, not an offset.
const hubAt = (p: number[] | null, route: Hub[]) => [...new Set(route)].sort((a, b) => dist(p, a) - dist(p, b))[0];
const dist = (p: number[] | null, h: Hub) => (p ? Math.hypot(p[0] - hubXY(h)[0], p[1] - hubXY(h)[1]) : Infinity);
const views = async () => {
  const r = renderHook(() => useTripModel(group, '2026-12-01'), { wrapper });
  await waitFor(() => expect(r.result.current).not.toBeNull());
  return r.result.current;
};

beforeEach(() => { localStorage.clear(); window.location.hash = ''; start(); vi.mocked(motion).mockReturnValue('still'); });
afterEach(cleanup);

describe('Trip view', () => {
  it('opens on day 1, shows one day card, and puts the chips in a strip apart from the map and the card', async () => {
    await mount();
    expect(chip(1)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('region', { name: /^Day \d/ })).toHaveLength(1);
    const strip = screen.getByRole('group', { name: 'Days' });
    expect(strip.querySelectorAll('button')).toHaveLength(9);
    expect(strip.contains(document.querySelector('.map'))).toBe(false);
    expect(strip.contains(screen.getByRole('region', { name: 'Day 1' }))).toBe(false);
  });

  it('tapping chip 3 shows Thu 10 Dec, tonight in Kandy and Knuckles, and #/day-3', async () => {
    const user = await mount();
    await user.click(chip(3));
    expect(chip(3)).toHaveAttribute('aria-pressed', 'true');
    const card = screen.getByRole('region', { name: 'Day 3' });
    expect(card).toHaveTextContent('Day 3 · Thu 10 Dec');
    expect(card).toHaveTextContent('Tonight, check in: No stay chosen yet in Kandy and Knuckles');
    expect(window.location.hash).toBe('#/day-3');
  });

  it('opens on the day in the hash, on the first render', async () => {
    window.location.hash = '#/day-6';
    const model = await views();
    // No provider and no waiting: the chip and card are right in the very first commit.
    render(<TripViewBody model={model} items={items} legs={legsData as Leg[]} />);
    expect(chip(6)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Day 6' })).toBeInTheDocument();
  });

  it('follows the hash when it changes, and ignores a day the trip does not have', async () => {
    await mount();
    window.location.hash = '#/day-4';
    await waitFor(() => expect(chip(4)).toHaveAttribute('aria-pressed', 'true'));
    window.location.hash = '#/day-99';
    await waitFor(() => expect(chip(1)).toHaveAttribute('aria-pressed', 'true'));
  });

  it('leaves a hash it does not own alone', async () => {
    const user = await mount('#/raw');
    await user.click(chip(2));
    expect(window.location.hash).toBe('#/raw');
    expect(chip(2)).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping a place opens its sheet', async () => {
    const user = await mount();
    await user.click(chip(3));
    await user.click(screen.getByRole('button', { name: /Sigiriya Rock/ }));
    expect(screen.getByRole('dialog', { name: /Sigiriya Rock/ })).toBeInTheDocument();
  });

  it('tonight\'s stay opens a sheet with the dates, the link and who is booking it', async () => {
    const first = (await views()).blocks[0];
    const stay: PlaceSuggestion = { id: 's1', name: 'Alex', area: first.area, kind: 'stay', title: 'Kandy Hills Hostel', link: 'https://x.test/kandy', status: 'live', createdAt: AT };
    put('tp:placesug', [stay]);
    put('tp:staysadmin', { pins: [{ area: first.area, suggestionId: 's1', at: AT }], scouts: {}, closed: [] });
    put('tp:claims', { [stayItemId(first.area)]: { itemId: stayItemId(first.area), owner: 'Lazza', updatedAt: AT } });
    const user = await mount();
    await user.click(screen.getByRole('button', { name: /Tonight, check in: Kandy Hills Hostel/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Kandy Hills Hostel' });
    expect(sheet).toHaveTextContent('Check in Tue 8 Dec');
    expect(within(sheet).getByRole('link', { name: /stay/i })).toHaveAttribute('href', 'https://x.test/kandy');
    expect(sheet).toHaveTextContent('Lazza booking');
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says so, and draws nothing else, when there is no route yet', async () => {
    render(<TripView group={{ ...group, final: null }} />, { wrapper });
    expect(await screen.findByText(/once the route is set/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Days' })).toBeNull();
  });
});

describe('Trip view and the tuk-tuk', () => {
  const legged = (m: Awaited<ReturnType<typeof views>>) => m.views.find(v => v.legs.length > 0)!;
  const parked = (m: Awaited<ReturnType<typeof views>>) => m.views.find(v => v.legs.length === 0)!;

  it('with motion still, picking a day starts no drive and puts the tuk-tuk at the end of its leg', async () => {
    const m = await views(), v = legged(m), route = m.plan!.route;
    const user = await mount();
    await user.click(chip(v.n));
    expect(document.querySelector('.map')).not.toHaveAttribute('data-drive');
    expect(hubAt(tuk(document.body), route)).toBe(route[v.legs[v.legs.length - 1] + 1]);
  });

  it('with motion full, picking a day starts the drive', async () => {
    vi.mocked(motion).mockReturnValue('full');
    const user = await mount();
    await user.click(chip(legged(await views()).n));
    await waitFor(() => expect(document.querySelector('.map')).toHaveAttribute('data-drive'));
  });

  it('tapping a shorter day while the tuk-tuk is on a later leg of a longer one does not crash', async () => {
    vi.mocked(motion).mockReturnValue('full');
    const m = await views();
    const long = m.views.find(v => v.legs.length >= 2)!, short = m.views.find(v => v.legs.length === 1)!;
    const user = await mount();
    await user.click(chip(long.n));
    const route = m.plan!.route, second = long.legs[1];
    await waitFor(() => expect(document.querySelector('mask path')?.getAttribute('d')).toBe(legD(buildLegs(route.map(hubXY))[second])), { timeout: 6000 });
    await user.click(chip(short.n));
    expect(chip(short.n)).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.map')).toBeInTheDocument();
  }, 10000);

  it('a day with no drive or train leg parks the tuk-tuk at that day\'s hub', async () => {
    const m = await views(), v = parked(m);
    const user = await mount();
    await user.click(chip(v.n));
    expect(hubAt(tuk(document.body), m.plan!.route)).toBe(v.parkAt);
    expect(document.querySelector('.map')).not.toHaveAttribute('data-drive');
  });
});
