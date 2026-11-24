import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('./lib/release');
vi.mock('./components/sound', async orig => ({ ...(await orig<typeof import('./components/sound')>()), thud: vi.fn(), jingle: vi.fn() }));
import App from './App';
import catalogue from './data/catalogue.json';
import legsData from './data/legs.json';
import { seenWalkToday, submittedResp } from './__fixtures__/seed';
import { seedState } from './guest/seed';
import { groupResult } from './lib/group';
import { ADMIN_KEY } from './store/tripKey';
import { RELEASE } from './lib/release';
import { ADMIN_IDS } from './lib/tripadmin';
import { SEEN_KEY } from './screens/MissionComplete';
import { LocalStore } from './store/local';
import { PEOPLE } from './types';
import type { Area, Item, Leg, Person } from './types';

const group = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const areas = [...new Set(group.final!.days.flatMap(d => (d.area ? [d.area] : [])))];
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const stay = (area: Area) => ({ id: `s-${area}`, name: 'Alex' as const, area, kind: 'stay' as const, title: `${area} stay`, status: 'live' as const, createdAt: AT });

/** A released trip starting 2026-12-08. `open` leaves every booking unticked, so a mission has work left and spy mode is on. */
function seed(me: Person, open: boolean) {
  localStorage.setItem('tp:me', me);
  for (const p of PEOPLE) put(`tp:resp:${p}`, submittedResp(p));
  localStorage.setItem('tp:reveal-seen', `${RELEASE!.days}:${RELEASE!.items.join(',')}`);
  seenWalkToday();
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  put('tp:placesug', areas.map(stay));
  put('tp:staysadmin', { pins: areas.map(a => ({ area: a, suggestionId: `s-${a}`, at: AT })), scouts: {}, closed: [] });
  put('tp:travellers', Object.fromEntries(PEOPLE.map(p => [p, { name: p, arriveLocal: '2026-12-08T09:00', arriveFlight: null, departLocal: '2026-12-16T09:00', departFlight: null, updatedAt: AT }])));
  put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ADMIN_IDS.map(id => [id, { done: !open, doneAt: AT }])), updatedAt: AT });
  if (!open) localStorage.setItem(SEEN_KEY, '1');
}
const clock = (iso: string) => vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date(iso));

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; });

const tabNamed = (name: RegExp) => screen.findByRole('tab', { name });

describe('released app, Route and To do tabs', () => {
  it('To do shows the board while a task is open; the Flights card opens the flights screen with the tab bar still there', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await tabNamed(/^To do/));
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
    expect(document.querySelector('.mt-seg')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Days' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Flights/ }));
    expect(await screen.findByRole('heading', { name: 'Flights' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'To do' })).toBeNull();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
  });

  it('the Stays and Bookings cards open sub-screens over To do, each with a Back that names To do', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await tabNamed(/^To do/));
    await userEvent.click(await screen.findByRole('button', { name: /Stays/ }));
    expect(await screen.findByRole('button', { name: /Back to To do/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^To do/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Back to To do/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Bookings/ }));
    expect(await screen.findByRole('heading', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to To do/ })).toBeInTheDocument();
  });

  it('with every mission done, inside the trip dates, Route shows today\'s card with the strip and map, and there is no To do tab', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', false);
    render(<App />);
    const today = await screen.findByLabelText('Today');
    expect(within(today).getByLabelText('Day 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Day 3/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Replay mission' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Group trip' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^To do/ })).toBeNull();
  });

  it('with storage blocked for the finale flag, To do still shows the board and Route still shows the route', async () => {
    clock('2026-12-01T08:00:00Z');
    seed('Lazza', false);
    const get = Storage.prototype.getItem;
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === 'tp:mission-complete-seen') throw new Error('blocked');
      return get.call(this, k);
    });
    render(<App />);
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    await userEvent.click(await tabNamed(/^To do/));
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('Route before the trip shows Trip view and the countdown line, with no Replay mission control', async () => {
    clock('2026-12-01T08:00:00Z');
    seed('Lazza', false);
    render(<App />);
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.queryByText(/Your best \d+ days/)).toBeNull();
    expect(screen.getByText(/9 days, about/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay mission' })).toBeNull();
  });

  it('while a task is open Route shows the map and the day strip, with no Replay mission control', async () => {
    seed('Lazza', true);
    render(<App />);
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Days' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay mission' })).toBeNull();
  });

  it('the route is the first tab, not a link inside the board', async () => {
    seed('Lazza', true);
    render(<App />);
    const first = (await screen.findAllByRole('tab'))[0];
    expect(first).toHaveAccessibleName(/^Route/);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel', { name: 'Route' })).getByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Group trip' })).toBeNull();
  });

  it('plays Mission complete once on open, is marked seen when its button is pressed, and lands on Route', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', false);
    localStorage.removeItem(SEEN_KEY);
    render(<App />);
    const go = await screen.findByRole('button', { name: 'Go to the trip' });
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
    await userEvent.click(go);
    expect(localStorage.getItem(SEEN_KEY)).toBe('1');
    expect(await screen.findByLabelText('Today')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Route/ })).toHaveAttribute('aria-selected', 'true');
    cleanup();
    render(<App />);
    expect(await screen.findByLabelText('Today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to the trip' })).toBeNull();
  });

  it('outside the trip dates Route leads with the map and the countdown line; a #/day-N link selects that chip', async () => {
    clock('2026-12-01T08:00:00Z');
    seed('Lazza', false);
    const { unmount } = render(<App />);
    expect(await screen.findByText(/^Trip starts/)).toBeInTheDocument();
    expect(screen.getByLabelText('Trip view')).toBeInTheDocument();
    unmount();
    clock('2026-12-10T08:00:00Z');
    seenWalkToday();
    window.location.hash = '#/day-5';
    render(<App />);
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Day 5/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives a friend no Menu and no Picks tab, even while I am still rating', async () => {
    seed('Lazza', true);
    put('tp:resp:Lazza', { ...submittedResp('Lazza'), submitted: false });
    render(<App />);
    await screen.findByRole('button', { name: /^Lazza,/ });
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Picks/ })).toBeNull();
  });
});

describe('released app, Me and the task doors', () => {
  const toDo = async (me: Person) => {
    seed(me, true);
    render(<App />);
    await userEvent.click(await tabNamed(/^To do/));
  };
  const meTab = async (me: Person) => {
    seed(me, true);
    render(<App />);
    await userEvent.click(await tabNamed(/^Me/));
  };
  it('offers Organiser under Me to Brittany only and the Flights card on To do to everyone, never safe house', async () => {
    await meTab('Brittany');
    expect(screen.getByRole('button', { name: 'Organiser' })).toBeInTheDocument();
    await userEvent.click(await tabNamed(/^To do/));
    expect(screen.getByRole('button', { name: /Flights/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/safe house/i);
    cleanup(); localStorage.clear();
    await meTab('Alex');
    expect(screen.queryByRole('button', { name: 'Organiser' })).toBeNull();
    await userEvent.click(await tabNamed(/^To do/));
    expect(screen.getByRole('button', { name: /Flights/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/safe house/i);
  });
  it('the Flights card opens the flights screen and the tab bar stays', async () => {
    await toDo('Alex');
    await userEvent.click(screen.getByRole('button', { name: /Flights/ }));
    expect(await screen.findByRole('heading', { name: 'Flights' })).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
  it('an organiser change refused for want of the key says so outside Organiser, and the notice opens Organiser', async () => {
    seed('Brittany', true);
    localStorage.setItem('tp-local-admin-key', 'secret');
    localStorage.setItem(ADMIN_KEY, 'wrong');
    render(<App />);
    await userEvent.click(await tabNamed(/^To do/));
    await userEvent.click(await screen.findByRole('button', { name: /Stays/ }));
    await userEvent.click((await screen.findAllByRole('button', { name: /\d nights?/ }))[0]);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Unpin' }))[0]);
    await userEvent.click(await screen.findByRole('button', { name: /not saved.*organiser password/i }));
    expect(await screen.findByLabelText('Organiser password')).toBeInTheDocument();
  });
  it('Organiser under Me opens the organiser panel headed Organiser', async () => {
    await meTab('Brittany');
    localStorage.setItem(ADMIN_KEY, 'k');
    await userEvent.click(screen.getByRole('button', { name: 'Organiser' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Organiser' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Organiser' })).toBeInTheDocument();
  });
});

describe('released app, deep link, Back and the loading plan', () => {
  it('a day chosen on Route is not a deep link: another tab starts clean, and the phone Back brings Route back with that day picked', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Day 2/ }));
    expect(window.location.hash).toBe('#/day-2');
    await userEvent.click(screen.getByRole('tab', { name: /^To do/ }));
    expect(window.location.hash).toBe('');
    history.back();
    expect(await screen.findByRole('button', { name: /Day 2/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: /^Route/ })).toHaveAttribute('aria-selected', 'true');
  });

  it.each([['the open tab', 'To do'], ['another tab', 'Me']])('tapping %s while Flights is open closes it (%s)', async (_which, tab) => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await tabNamed(/^To do/));
    await userEvent.click(screen.getByRole('button', { name: /Flights/ }));
    expect(await screen.findByRole('heading', { name: 'Flights' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Flights' })).toBeNull());
    expect(screen.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(history.state?.tpFile).toBeUndefined());
  });

  it('the phone Back button closes Flights onto the tab it was opened from, not another tab or out of the app', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await tabNamed(/^To do/));
    await userEvent.click(screen.getByRole('button', { name: /Flights/ }));
    expect(await screen.findByRole('heading', { name: 'Flights' })).toBeInTheDocument();
    const depth = history.length;
    history.back();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Flights' })).toBeNull());
    expect(screen.getByRole('tab', { name: /^To do/ })).toHaveAttribute('aria-selected', 'true');
    // The Back link inside the screen leaves no extra entry behind.
    await userEvent.click(screen.getByRole('button', { name: /Flights/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Back/ }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Flights' })).toBeNull());
    await waitFor(() => expect(history.state?.tpFile).toBeUndefined());
    expect(screen.getByRole('tab', { name: /^To do/ })).toHaveAttribute('aria-selected', 'true');
    expect(history.length).toBeLessThanOrEqual(depth + 1);
  });

  it('shares the poster with the month the organiser set', async () => {
    seed('Lazza', true);
    put('tp:settings', { startDate: '2027-01-03', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('jpg', { status: 200, headers: { 'content-type': 'image/jpeg' } })));
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Play route reveal' }));
    await userEvent.click(await screen.findByRole('button', { name: 'See the poster' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save poster' }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect((share.mock.calls[0] as unknown as [{ title: string }])[0].title).toBe('Sri Lanka, Jan 2027');
    vi.unstubAllGlobals();
  });

  it('a task reopened and closed again after the finale shows the board on To do, not a blank, and no second finale', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', true);
    const store = new LocalStore();
    const all = (done: boolean) => Object.fromEntries(ADMIN_IDS.map(id => [id, { done, doneAt: AT }]));
    render(<App store={store} />);
    await userEvent.click(await tabNamed(/^To do/));
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
    await act(async () => { await store.saveTripAdmin('Brittany', all(true)); });
    expect(await screen.findByRole('button', { name: 'Go to the trip' })).toBeInTheDocument();
    await act(async () => { await store.saveTripAdmin('Brittany', all(false)); });
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
    await act(async () => { await store.saveTripAdmin('Brittany', all(true)); });
    expect(await screen.findByLabelText('Today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to the trip' })).toBeNull();
  });

  it('while the trip settings are still loading no plan shows, not the seed plan', async () => {
    seed('Lazza', true);
    const inner = new LocalStore();
    const loading = Object.assign(Object.create(inner), {
      load: async () => { const { tripSettings, ...rest } = await inner.load(); void tripSettings; return rest; },
    }) as LocalStore;
    render(<App store={loading} />);
    expect(await screen.findByText('Working out the plan...')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Route' })).toBeNull();
  });
});
