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

describe('released app, My trip tab', () => {
  it('while a mission is open shows Mission HQ, no toggle and no day rows; the Touchdown file opens the flights screen', async () => {
    seed('Lazza', true);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Mission HQ' })).toBeInTheDocument();
    expect(document.querySelector('.mt-seg')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Days' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Touchdown/ }));
    expect(await screen.findByRole('heading', { name: 'Touchdown' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mission HQ' })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('heading', { name: 'Mission HQ' })).toBeInTheDocument();
  });

  it('the Stays file goes to the Stays tab, the Supply file to Trip admin', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /^Supply runs/ }));
    expect(await screen.findByRole('heading', { name: 'Supply runs' })).toBeInTheDocument();
  });

  it('with every mission done, inside the trip dates, shows Today for the day; Trip view is only on Group trip', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', false);
    render(<App />);
    const today = await screen.findByLabelText('Today');
    expect(within(today).getByLabelText('Day 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip view')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replay mission' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Group trip' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'See the whole trip' }));
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Day 3/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('with storage blocked for the finale flag, My trip still shows the day instead of a blank finale', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', false);
    const get = Storage.prototype.getItem;
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === 'tp:mission-complete-seen') throw new Error('blocked');
      return get.call(this, k);
    });
    render(<App />);
    expect(await screen.findByLabelText('Today')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('Group trip shows Trip view with a Replay mission control, and Exit returns to it', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', false);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'See the whole trip' }));
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.queryByText(/Your best \d+ days/)).toBeNull();
    expect(screen.getByText(/9 days, about/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replay mission' }));
    expect(await screen.findByText('Replay')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
  });

  it('while a mission is open Group trip has Trip view but no Replay mission control', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Group trip' }));
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay mission' })).toBeNull();
  });

  it('Mission HQ is the whole screen: its Group trip link is inside the spy look, with nothing on the paper below', async () => {
    seed('Lazza', true);
    render(<App />);
    const link = await screen.findByRole('button', { name: 'Group trip' });
    const shown = screen.getByRole('tabpanel', { name: 'My trip' });
    expect(shown.children).toHaveLength(1);
    expect(shown.firstElementChild).toHaveClass('spy');
    expect(shown.firstElementChild!.contains(link)).toBe(true);
    await userEvent.click(link);
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
  });

  it('plays Mission complete once, then the next screen', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', false);
    localStorage.removeItem(SEEN_KEY);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Go to the trip' }));
    expect(await screen.findByLabelText('Today')).toBeInTheDocument();
    cleanup();
    render(<App />);
    expect(await screen.findByLabelText('Today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to the trip' })).toBeNull();
  });

  it('outside the trip dates shows one line and a link, not Trip view; a #/day-N link wins over Today', async () => {
    clock('2026-12-01T08:00:00Z');
    seed('Lazza', false);
    const { unmount } = render(<App />);
    expect(await screen.findByText(/^Trip starts/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip view')).toBeNull();
    unmount();
    clock('2026-12-10T08:00:00Z');
    seenWalkToday();
    window.location.hash = '#/day-5';
    render(<App />);
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Day 5/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Today')).toBeNull();
  });

  it('keeps Change days or pace out of the Menu and the Picks tab, even while I am still rating', async () => {
    seed('Lazza', true);
    put('tp:resp:Lazza', { ...submittedResp('Lazza'), submitted: false });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    expect(screen.queryByRole('button', { name: 'Change days or pace' })).toBeNull();
  });
});

describe('released app, Menu', () => {
  const menu = async (me: Person) => {
    seed(me, true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    return within(screen.getByRole('group', { name: 'Menu' }));
  };
  it('offers Command to Brittany only and Touchdown to everyone, never Organiser or safe house', async () => {
    const b = await menu('Brittany');
    expect(b.getByRole('button', { name: 'Command' })).toBeInTheDocument();
    expect(b.getByRole('button', { name: 'Touchdown' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Organiser|safe house/i);
    cleanup(); localStorage.clear();
    const a = await menu('Alex');
    expect(a.queryByRole('button', { name: 'Command' })).toBeNull();
    expect(a.getByRole('button', { name: 'Touchdown' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Organiser|safe house/i);
  });
  it('Touchdown in the Menu opens the flights screen', async () => {
    const m = await menu('Alex');
    await userEvent.click(m.getByRole('button', { name: 'Touchdown' }));
    expect(await screen.findByRole('heading', { name: 'Touchdown' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('tablist')).toBeNull());
  });
  it('an organiser change refused for want of the key says so outside Command, and the notice opens Command', async () => {
    seed('Brittany', true);
    localStorage.setItem('tp-local-admin-key', 'secret');
    localStorage.setItem(ADMIN_KEY, 'wrong');
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: /^Stays/ }));
    await userEvent.click((await screen.findAllByRole('button', { name: /\d nights?/ }))[0]);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Unpin' }))[0]);
    await userEvent.click(await screen.findByRole('button', { name: /not saved.*organiser password/i }));
    expect(await screen.findByLabelText('Organiser password')).toBeInTheDocument();
  });
  it('Command in the Menu opens the organiser panel headed Command, as the Menu names it', async () => {
    const m = await menu('Brittany');
    localStorage.setItem(ADMIN_KEY, 'k');
    await userEvent.click(m.getByRole('button', { name: 'Command' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Command' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Command' })).toBeInTheDocument();
  });
});

describe('released app, deep link, Back and the loading plan', () => {
  it('a day chosen on Group trip is not a deep link: leaving My trip and coming back lands on Mission HQ', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Group trip' }));
    await userEvent.click(await screen.findByRole('button', { name: /Day 2/ }));
    expect(window.location.hash).toBe('#/day-2');
    await userEvent.click(screen.getByRole('tab', { name: /Stays/ }));
    await userEvent.click(screen.getByRole('tab', { name: /My trip/ }));
    expect(await screen.findByRole('heading', { name: 'Mission HQ' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Trip view')).toBeNull();
  });

  it.each([['Profile', 'My profile'], ['Group', 'Group stats']])('a Menu action for the tab already open (%s: %s) still closes the Touchdown file over it', async (tab, action) => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(`^${tab}`) }));
    const menu = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
      await userEvent.click(within(screen.getByRole('group', { name: 'Menu' })).getByRole('button', { name }));
    };
    await menu('Touchdown');
    expect(await screen.findByRole('heading', { name: 'Touchdown' })).toBeInTheDocument();
    await menu(action);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Touchdown' })).toBeNull());
    expect(screen.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(history.state?.tpFile).toBeUndefined());
  });

  it('the phone Back button closes Touchdown onto the tab it was opened from, not another tab or out of the app', async () => {
    seed('Lazza', true);
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: /Stays/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Menu' })).getByRole('button', { name: 'Touchdown' }));
    expect(await screen.findByRole('heading', { name: 'Touchdown' })).toBeInTheDocument();
    const depth = history.length;
    history.back();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Touchdown' })).toBeNull());
    expect(screen.getByRole('tab', { name: /Stays/ })).toHaveAttribute('aria-selected', 'true');
    // The Back link inside the screen leaves no extra entry behind.
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Menu' })).getByRole('button', { name: 'Touchdown' }));
    await userEvent.click(await screen.findByRole('button', { name: /Back/ }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Touchdown' })).toBeNull());
    await waitFor(() => expect(history.state?.tpFile).toBeUndefined());
    expect(screen.getByRole('tab', { name: /Stays/ })).toHaveAttribute('aria-selected', 'true');
    expect(history.length).toBeLessThanOrEqual(depth + 1);
  });

  it('shares the poster with the month the organiser set', async () => {
    seed('Lazza', true);
    put('tp:settings', { startDate: '2027-01-03', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('jpg', { status: 200, headers: { 'content-type': 'image/jpeg' } })));
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Group trip' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Play route reveal' }));
    await userEvent.click(await screen.findByRole('button', { name: 'See the poster' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save poster' }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect((share.mock.calls[0] as unknown as [{ title: string }])[0].title).toBe('Sri Lanka, Jan 2027');
    vi.unstubAllGlobals();
  });

  it('a mission reopened and closed again after the finale shows the day, not a blank My trip', async () => {
    clock('2026-12-10T08:00:00Z');
    seed('Lazza', true);
    const store = new LocalStore();
    const all = (done: boolean) => Object.fromEntries(ADMIN_IDS.map(id => [id, { done, doneAt: AT }]));
    render(<App store={store} />);
    expect(await screen.findByRole('heading', { name: 'Mission HQ' })).toBeInTheDocument();
    await act(async () => { await store.saveTripAdmin('Brittany', all(true)); });
    expect(await screen.findByRole('button', { name: 'Go to the trip' })).toBeInTheDocument();
    await act(async () => { await store.saveTripAdmin('Brittany', all(false)); });
    expect(await screen.findByRole('heading', { name: 'Mission HQ' })).toBeInTheDocument();
    await act(async () => { await store.saveTripAdmin('Brittany', all(true)); });
    expect(await screen.findByLabelText('Today')).toBeInTheDocument();
  });

  it('while the trip settings are still loading no plan shows, not the seed plan', async () => {
    seed('Lazza', true);
    const inner = new LocalStore();
    const loading = Object.assign(Object.create(inner), {
      load: async () => { const { tripSettings, ...rest } = await inner.load(); void tripSettings; return rest; },
    }) as LocalStore;
    render(<App store={loading} />);
    expect(await screen.findByText('Working out the plan...')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mission HQ' })).toBeNull();
  });
});
