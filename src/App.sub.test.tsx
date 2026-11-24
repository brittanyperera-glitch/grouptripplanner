import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
import { RELEASE } from './lib/release';
import { ADMIN_IDS } from './lib/tripadmin';
import { ADMIN_KEY } from './store/tripKey';
import { SEEN_KEY } from './screens/MissionComplete';
import { PEOPLE } from './types';
import type { Area, Item, Leg } from './types';

const group = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const areas = [...new Set(group.final!.days.flatMap(d => (d.area ? [d.area] : [])))] as Area[];
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const clock = (iso: string) => vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date(iso));

/** A released trip for Lazza starting 2026-12-08; `open` leaves every booking unticked so the board shows, else every mission is done. */
function seed(open: boolean) {
  localStorage.setItem('tp:me', 'Lazza');
  for (const p of PEOPLE) put(`tp:resp:${p}`, submittedResp(p));
  localStorage.setItem('tp:reveal-seen', `${RELEASE!.days}:${RELEASE!.items.join(',')}`);
  seenWalkToday();
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  put('tp:placesug', areas.map(a => ({ id: `s-${a}`, name: 'Alex', area: a, kind: 'stay', title: a, status: 'live', createdAt: AT })));
  put('tp:staysadmin', { pins: areas.map(a => ({ area: a, suggestionId: `s-${a}`, at: AT })), scouts: {}, closed: [] });
  put('tp:travellers', Object.fromEntries(PEOPLE.map(p => [p, { name: p, arriveLocal: '2026-12-08T09:00', arriveFlight: null, departLocal: '2026-12-16T09:00', departFlight: null, updatedAt: AT }])));
  put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ADMIN_IDS.map(id => [id, { done: !open, doneAt: AT }])), updatedAt: AT });
}

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = ''; });

describe('sub-screens and the history entry', () => {
  it('picking a day on Route keeps the entry that says which tab it is', async () => {
    seed(true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Day 2/ }));
    expect(window.location.hash).toBe('#/day-2');
    expect(history.state?.tpTab).toBe('Route');
  });

  it('picking a day on a trip day keeps the entry that says which tab it is', async () => {
    clock('2026-12-10T08:00:00Z');
    seed(false);
    localStorage.setItem(SEEN_KEY, '1');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Day 5/ }));
    expect(window.location.hash).toBe('#/day-5');
    expect(history.state?.tpTab).toBe('Route');
  });

  it('a new tab entry starts without the day, and Back onto the old entry brings the day back', async () => {
    seed(true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Day 2/ }));
    await userEvent.click(screen.getByRole('tab', { name: /^To do/ }));
    expect(window.location.hash).toBe('');
    expect(history.state?.tpTab).toBe('To do');
    history.back();
    expect(await screen.findByRole('button', { name: /Day 2/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a Crew entry from before the four tabs opens its page over Route with a Back that names it, and Back closes it', async () => {
    seed(true);
    render(<App />);
    await screen.findByLabelText('Trip view');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: { tpTab: 'My trip', tpFile: 'crew-stats' } })); });
    const back = await screen.findByRole('button', { name: /Back to Route/ });
    expect(screen.queryByLabelText('Trip view')).toBeNull();
    await userEvent.click(back);
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
  });

  it('a stored command entry from before the rename opens the Organiser', async () => {
    seed(true);
    localStorage.setItem('tp:me', 'Brittany');
    render(<App />);
    await screen.findByLabelText('Trip view');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: { tpTab: 'My trip', tpFile: 'command' } })); });
    expect(await screen.findByRole('heading', { name: 'Organiser' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('Trip view')).toBeNull());
  });

  it('a door tapped while a page the member opened is up closes that page and shows the sub-screen', async () => {
    seed(true);
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp-local-admin-key', 'secret');
    localStorage.setItem(ADMIN_KEY, 'wrong');
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: /^To do/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Stays/ }));
    await userEvent.click((await screen.findAllByRole('button', { name: /\d nights?/ }))[0]);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Unpin' }))[0]);
    await userEvent.click(screen.getByRole('tab', { name: /^Me/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Do it, 3 minutes' }));
    await userEvent.click(await screen.findByRole('button', { name: /not saved.*organiser password/i }));
    expect(await screen.findByLabelText('Organiser password')).toBeInTheDocument();
  });
});

describe('the finale', () => {
  it('hides the tab bar, is not marked seen by showing, and is marked seen when its button is pressed', async () => {
    clock('2026-12-01T08:00:00Z');
    seed(false);
    render(<App />);
    const go = await screen.findByRole('button', { name: 'Go to the trip' });
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
    await userEvent.click(go);
    expect(localStorage.getItem(SEEN_KEY)).toBe('1');
    expect(await screen.findByLabelText('Trip view')).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
