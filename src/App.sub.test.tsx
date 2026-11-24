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
  it('picking a day and leaving the Group trip view keep the entry that says which tab it is', async () => {
    seed(true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Group trip' }));
    await userEvent.click(await screen.findByRole('button', { name: /Day 2/ }));
    expect(window.location.hash).toBe('#/day-2');
    expect(history.state?.tpTab).toBe('My trip');
    await userEvent.click(screen.getByRole('button', { name: 'Back to My trip' }));
    expect(history.state?.tpTab).toBe('My trip');
    expect(window.location.hash).toBe('');
  });

  it('See the whole trip on Today keeps the entry that says which tab it is', async () => {
    clock('2026-12-10T08:00:00Z');
    seed(false);
    localStorage.setItem(SEEN_KEY, '1');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'See the whole trip' }));
    expect(window.location.hash).toBe('#/day-3');
    expect(history.state?.tpTab).toBe('My trip');
  });

  it('a new tab entry starts without the day, and Back onto the old entry brings the day back', async () => {
    seed(true);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Group trip' }));
    await userEvent.click(await screen.findByRole('button', { name: /Day 2/ }));
    await userEvent.click(screen.getByRole('tab', { name: /Stays/ }));
    expect(window.location.hash).toBe('');
    expect(history.state?.tpTab).toBe('Stays');
    history.back();
    expect(await screen.findByRole('button', { name: /Day 2/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a Crew entry opens its page over the tab with a Back that names the tab, and Back closes it', async () => {
    seed(true);
    render(<App />);
    await screen.findByRole('heading', { name: 'Mission HQ' });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: { tpTab: 'My trip', tpFile: 'crew-stats' } })); });
    const back = await screen.findByRole('button', { name: /Back to My trip/ });
    expect(screen.queryByRole('heading', { name: 'Mission HQ' })).toBeNull();
    await userEvent.click(back);
    expect(await screen.findByRole('heading', { name: 'Mission HQ' })).toBeInTheDocument();
  });

  it('a stored command entry from before the rename opens the Organiser', async () => {
    seed(true);
    localStorage.setItem('tp:me', 'Brittany');
    render(<App />);
    await screen.findByRole('heading', { name: 'Mission HQ' });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: { tpTab: 'My trip', tpFile: 'command' } })); });
    expect(await screen.findByRole('heading', { name: 'Organiser' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Mission HQ' })).toBeNull());
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
