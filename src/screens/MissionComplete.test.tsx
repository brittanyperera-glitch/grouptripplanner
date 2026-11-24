import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
vi.mock('../components/sound', () => ({ thud: vi.fn(), jingle: vi.fn() }));
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { ADMIN_IDS } from '../lib/tripadmin';
import { AppProvider } from '../state';
import { freshStartFromUrl } from '../store/fresh';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Leg } from '../types';
import MissionComplete, { finaleDue, markFinaleSeen, SEEN_KEY } from './MissionComplete';

const group: GroupResult = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const areas = [...new Set(group.final!.days.flatMap(d => (d.area ? [d.area] : [])))];
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

/** Everything done, unless `dark` leaves one person's flights out. */
const seed = (dark?: string) => {
  localStorage.setItem('tp:me', 'Lazza');
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  put('tp:placesug', areas.map(a => ({ id: `s-${a}`, name: 'Alex', area: a, kind: 'stay', title: a, status: 'live', createdAt: AT })));
  put('tp:staysadmin', { pins: areas.map(a => ({ area: a, suggestionId: `s-${a}`, at: AT })), scouts: {}, closed: [] });
  put('tp:travellers', Object.fromEntries(PEOPLE.filter(p => p !== dark).map(p => [p, { name: p, arriveLocal: '2026-12-08T09:00', arriveFlight: null, departLocal: '2026-12-16T09:00', departFlight: null, updatedAt: AT }])));
  put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ADMIN_IDS.map(id => [id, { done: true, doneAt: AT }])), updatedAt: AT });
};
const mount = (onTrip = vi.fn(), markOnShow?: boolean) => {
  const view = render(<AppProvider store={new LocalStore()}><MissionComplete group={group} today="2026-12-01" onTrip={onTrip} markOnShow={markOnShow} /></AppProvider>);
  return { onTrip, view };
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Mission complete', () => {
  it('shows once: the stamp, crew 5/5 and one button to the trip, then sets the seen flag', async () => {
    seed();
    const { onTrip } = mount();
    expect(await screen.findByText('Crew 5/5')).toBeInTheDocument();
    expect(screen.getAllByText('Mission complete').length).toBeGreaterThan(0);
    await waitFor(() => expect(localStorage.getItem(SEEN_KEY)).toBe('1'));
    await userEvent.click(screen.getByRole('button', { name: 'Go to the trip' }));
    expect(onTrip).toHaveBeenCalledTimes(1);
    cleanup();
    const again = mount();
    await waitFor(() => expect(localStorage.getItem('tp:me')).toBe('Lazza'));
    await new Promise(r => setTimeout(r, 30));
    expect(again.view.container.innerHTML).toBe('');
  });

  it('with the seen flag already set it never shows', async () => {
    seed();
    localStorage.setItem(SEEN_KEY, '1');
    const { view } = mount();
    await new Promise(r => setTimeout(r, 30));
    expect(view.container.innerHTML).toBe('');
  });

  it('while a mission is open it does not show, and does not use up the flag', async () => {
    seed('Antek');
    const { view } = mount();
    await new Promise(r => setTimeout(r, 30));
    expect(view.container.innerHTML).toBe('');
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
  });

  it('a blocked storage does not crash it, and counts as seen: no finale on every mount', async () => {
    seed();
    const real = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) { if (k === SEEN_KEY) throw new Error('blocked'); return real.call(this, k); });
    const { view } = mount();
    await new Promise(r => setTimeout(r, 30));
    expect(view.container.innerHTML).toBe('');
    expect(screen.queryByText('Crew 5/5')).toBeNull();
    vi.restoreAllMocks();
  });

  it('the flag is a tp: key, so ?fresh resets it and the finale shows again', async () => {
    seed();
    mount();
    await waitFor(() => expect(localStorage.getItem(SEEN_KEY)).toBe('1'));
    freshStartFromUrl('https://x.test/?fresh');
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
    cleanup();
    seed();
    mount();
    expect(await screen.findByText('Crew 5/5')).toBeInTheDocument();
  });

  it('with nobody signed in, or someone outside the five, it does not show and does not use up the flag', async () => {
    for (const me of [null, 'Mum']) {
      seed();
      if (me) localStorage.setItem('tp:me', me); else localStorage.removeItem('tp:me');
      const { view } = mount();
      await new Promise(r => setTimeout(r, 30));
      expect(view.container.innerHTML).toBe('');
      expect(localStorage.getItem(SEEN_KEY)).toBeNull();
      cleanup();
    }
  });

  it('with markOnShow off it is not marked seen until its button is pressed', async () => {
    seed();
    const { onTrip } = mount(vi.fn(), false);
    expect(await screen.findByText('Crew 5/5')).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 30));
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Go to the trip' }));
    expect(localStorage.getItem(SEEN_KEY)).toBe('1');
    expect(onTrip).toHaveBeenCalledTimes(1);
  });

  it('finaleDue is true for one of the five with nothing open and the flag unset, until markFinaleSeen', async () => {
    seed();
    const i = { state: { responses: {}, suggestions: [], votes: [] }, plan: null, model: { bookings: [], missing: { flights: [], stays: [], bookings: 0, startDate: false } } };
    expect(finaleDue('Lazza', i)).toBe(true);
    expect(finaleDue('Mum', i)).toBe(false);
    expect(finaleDue(null, i)).toBe(false);
    expect(finaleDue('Lazza', { ...i, model: { ...i.model, missing: { ...i.model.missing, flights: ['Antek' as const] } } })).toBe(false);
    markFinaleSeen();
    expect(finaleDue('Lazza', i)).toBe(false);
  });
});
