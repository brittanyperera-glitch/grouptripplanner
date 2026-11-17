import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import releaseJson from '../content/release.json';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { Player, ReleasePlan, TripSettings } from '../types';
import Organiser from './Organiser';

// The real planner, catalogue and store run here: only the store's write is watched, so the test sees exactly what the app would send the server.
class Spy extends LocalStore {
  saves: Parameters<LocalStore['saveTripSettings']>[0][] = [];
  claims: [string, string | null][] = [];
  saveTripSettings(patch: Parameters<LocalStore['saveTripSettings']>[0]) { this.saves.push(patch); return super.saveTripSettings(patch); }
  saveBookingClaim(id: string, owner: Parameters<LocalStore['saveBookingClaim']>[1]) { this.claims.push([id, owner]); return super.saveBookingClaim(id, owner); }
}

const seed: ReleasePlan = { ...(releaseJson as Omit<ReleasePlan, 'dayEdits'>), dayEdits: [] };
const settings = (over: Partial<TripSettings> = {}): TripSettings => ({ startDate: null, plan: seed, bookingDates: {}, overrides: [], updatedAt: '2026-11-01T00:00:00.000Z', ...over });

const mount = async (me: Player = 'Brittany', over: Partial<TripSettings> = {}, unlocked = true) => {
  localStorage.setItem('tp:me', me);
  localStorage.setItem('tp:settings', JSON.stringify(settings(over)));
  if (unlocked) localStorage.setItem('tp-admin-key', 'k');
  const store = new Spy();
  const user = userEvent.setup();
  const view = render(<AppProvider store={store}><Organiser /></AppProvider>);
  return { store, user, view };
};
const open = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => user.click(await screen.findByRole('button', { name }));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('Organiser', () => {
  // Hard case 3: a friend sees nothing, not even the password prompt.
  it('renders nothing for a friend', async () => {
    const { view } = await mount('Alex');
    await waitFor(() => expect(localStorage.getItem('tp:me')).toBe('Alex'));
    await new Promise(r => setTimeout(r, 50));
    expect(view.container.innerHTML).toBe('');
  });

  it('asks the organiser password first, refuses a wrong one and opens on the right one', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    const { user } = await mount('Brittany', {}, false);
    const box = await screen.findByLabelText('Organiser password');
    expect(screen.queryByRole('button', { name: /^Route/ })).toBeNull();
    await user.type(box, 'nope');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That's not it");
    await user.clear(box);
    await user.type(box, 'secret');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('button', { name: /^Route/ })).toBeInTheDocument();
    expect(localStorage.getItem('tp-admin-key')).toBe('secret');
  });

  it('shows each section as a one-line headline until opened', async () => {
    const { user } = await mount();
    await screen.findByRole('button', { name: /^Route/ });
    for (const n of [/^Start date/, /^Route/, /^Overrides log/, /^Nights note/, /^Bookings/]) expect(screen.getByRole('button', { name: n })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Stop title')).toBeNull();
    await open(user, /^Route/);
    expect(screen.getByLabelText('Stop title')).toBeInTheDocument();
  });

  // Hard case 1
  it('adding a custom stop on day 4 saves a plan whose dayEdits holds it, with a log line naming it', async () => {
    const { store, user } = await mount();
    await open(user, /^Route/);
    await user.type(screen.getByLabelText('Stop title'), 'Sunset walk');
    await user.selectOptions(screen.getByLabelText('Stop area'), 'Colombo');
    await user.clear(screen.getByLabelText('Stop hours'));
    await user.type(screen.getByLabelText('Stop hours'), '1');
    await user.selectOptions(screen.getByLabelText('Stop day'), '4');
    await user.click(screen.getByRole('button', { name: 'Add stop' }));
    expect(store.saves).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    const saved = store.saves[0];
    expect(saved.plan?.dayEdits).toEqual([expect.objectContaining({ kind: 'custom', id: 'c:1', day: 4, title: 'Sunset walk', area: 'Colombo', hours: 1 })]);
    expect(saved.plan?.items).toEqual(seed.items);
    expect(saved.overrides?.at(-1)?.what).toMatch(/Sunset walk.*day 4/);
  });

  // Hard case 2
  it('warns about an over-full day before Save is pressed', async () => {
    const { store, user } = await mount();
    await open(user, /^Route/);
    await user.type(screen.getByLabelText('Stop title'), 'Long hike');
    await user.clear(screen.getByLabelText('Stop hours'));
    await user.type(screen.getByLabelText('Stop hours'), '12');
    await user.selectOptions(screen.getByLabelText('Stop day'), '2');
    await user.click(screen.getByRole('button', { name: 'Add stop' }));
    expect(await screen.findByText(/Day 2 is over budget/)).toBeInTheDocument();
    expect(store.saves).toEqual([]);
  });

  it('adds a ruled-out place back and removes a place, then saves both', async () => {
    const { store, user } = await mount();
    await open(user, /^Route/);
    await user.click(await screen.findByRole('button', { name: /^Remove Galle Face/ }));
    await user.selectOptions(screen.getByLabelText('Add a place'), 'ellarock');
    await user.click(screen.getByRole('button', { name: 'Add place' }));
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    const plan = store.saves[0].plan!;
    expect(plan.items).toContain('ellarock');
    expect(plan.ruledOut).not.toContain('ellarock');
    expect(plan.items).not.toContain('galleface');
    expect(plan.ruledOut).toContain('galleface');
  });

  it('moves a place to a day and hides another', async () => {
    const { store, user } = await mount();
    await open(user, /^Route/);
    await user.selectOptions(await screen.findByLabelText(/^Move Pettah/), '3');
    await user.click(screen.getByRole('button', { name: /^Hide Galle Face/ }));
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0].plan?.dayEdits).toEqual(expect.arrayContaining([{ kind: 'move', id: 'pettah', day: 3 }, { kind: 'hide', id: 'galleface' }]));
  });

  it('saves the start date with a log line', async () => {
    const { store, user } = await mount();
    await open(user, /^Start date/);
    await user.type(await screen.findByLabelText('Start date'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save date' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0].startDate).toBe('2026-12-01');
    expect(store.saves[0].overrides?.at(-1)?.what).toMatch(/2026-12-01/);
  });

  it('lists the overrides log newest first', async () => {
    const { user } = await mount('Brittany', { overrides: [{ at: '2026-11-01T10:00:00.000Z', what: 'first change' }, { at: '2026-11-02T10:00:00.000Z', what: 'second change' }] });
    await open(user, /^Overrides log/);
    const rows = (await screen.findAllByRole('listitem')).map(li => li.textContent ?? '').filter(t => /change/.test(t));
    expect(rows[0]).toMatch(/second change/);
    expect(rows[1]).toMatch(/first change/);
  });

  it('reassigns a booking owner through the claim setter and saves booking dates', async () => {
    const { store, user } = await mount();
    await open(user, /^Bookings/);
    const owner = await screen.findByLabelText('Owner of Sigiriya Rock');
    await user.selectOptions(owner, 'Lazza');
    await waitFor(() => expect(store.claims).toEqual([['book:sigiriya', 'Lazza']]));
    const row = owner.closest('li')!;
    await user.type(within(row).getByLabelText('Opens on'), '2026-11-20');
    await user.click(within(row).getByRole('button', { name: 'Save dates' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0].bookingDates).toEqual({ 'book:sigiriya': { opensOn: '2026-11-20' } });
  });

  it('asks for the organiser password again when a save is refused', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    localStorage.setItem('tp-admin-key', 'stale');
    const { user } = await mount('Brittany', {}, false);
    localStorage.setItem('tp-admin-key', 'stale');
    await open(user, /^Start date/);
    await user.type(await screen.findByLabelText('Start date'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save date' }));
    expect(await screen.findByLabelText('Organiser password')).toBeInTheDocument();
    // The refused change did not reach anyone, so the status must not say it did.
    expect(screen.getAllByRole('status').map(n => n.textContent).join(' ')).not.toMatch(/Saved/);
    expect(screen.getAllByRole('status').map(n => n.textContent).join(' ')).toMatch(/Couldn't save/);
  });

  it('sets the number of days by choosing it, so any value from 5 to 21 is reachable', async () => {
    const { store, user } = await mount();
    await open(user, /^Route/);
    await user.selectOptions(await screen.findByLabelText('Days'), '12');
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0].plan?.days).toBe(12);
  });

  it('keeps a stop day that Days no longer reaches usable, on the last day', async () => {
    const { store, user } = await mount();
    await open(user, /^Route/);
    await user.selectOptions(await screen.findByLabelText('Stop day'), '9');
    await user.selectOptions(screen.getByLabelText('Days'), '6');
    expect(screen.getByLabelText('Stop day')).toHaveValue('6');
    await user.type(screen.getByLabelText('Stop title'), 'Late walk');
    await user.click(screen.getByRole('button', { name: 'Add stop' }));
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0].plan?.dayEdits).toEqual([expect.objectContaining({ kind: 'custom', day: 6, title: 'Late walk' })]);
  });

  it('offers no booking note on a custom stop, since nothing reads one', async () => {
    const { user } = await mount();
    await open(user, /^Route/);
    expect(await screen.findByLabelText('Stop note')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Booking note/)).toBeNull();
  });

  it('says loading, not that no route is set, while the settings have not arrived', async () => {
    // A store whose settings read has not answered: tripSettings is undefined, as in a snapshot taken before the table loaded.
    class Slow extends Spy { async load() { const s = await super.load(); return { ...s, tripSettings: undefined }; } }
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp-admin-key', 'k');
    const user = userEvent.setup();
    render(<AppProvider store={new Slow()}><Organiser /></AppProvider>);
    const head = await screen.findByRole('button', { name: /^Route/ });
    expect(head).toHaveTextContent('Loading');
    expect(head).not.toHaveTextContent(/No route is set yet/);
    await user.click(head);
    expect(screen.queryByText(/No route is set yet/)).toBeNull();
  });

  it('keeps an unsaved candidate when another device saves a route, and says so', async () => {
    const { user } = await mount();
    await open(user, /^Route/);
    await user.selectOptions(await screen.findByLabelText('Days'), '12');
    localStorage.setItem('tp:settings', JSON.stringify(settings({ plan: { ...seed, days: 7 } })));
    window.dispatchEvent(new StorageEvent('storage', { key: 'tp:settings' }));
    expect(await screen.findByText(/saved from another device/)).toBeInTheDocument();
    expect(screen.getByLabelText('Days')).toHaveValue('12');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Days')).toHaveValue('7');
    expect(screen.queryByText(/saved from another device/)).toBeNull();
  });
});
