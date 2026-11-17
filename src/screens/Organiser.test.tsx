import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import releaseJson from '../content/release.json';
import { DAY_MONTH } from '../lib/dates';
import { missionFiles, spyActive } from '../lib/missions';
import { releaseFor } from '../lib/release';
import { effectiveRelease, releaseState } from '../lib/tripPlan';
import { AppProvider, useApp } from '../state';
import { LocalStore } from '../store/local';
import { emptyRanking, PEOPLE } from '../types';
import type { GroupResult, Player, ReleasePlan, TripSettings } from '../types';
import { useGroupResult } from '../workers/usePlan';
import Organiser from './Organiser';

import { SAVE_COPY } from './saveStatus';
import { useTripModel } from './useTripModel';

// The real planner, catalogue and store run here: only the store's write is watched, so the test sees exactly what the app would send the server.
class Spy extends LocalStore {
  saves: Parameters<LocalStore['saveTripSettings']>[0][] = [];
  claims: [string, string | null][] = [];
  saveTripSettings(patch: Parameters<LocalStore['saveTripSettings']>[0]) { this.saves.push(patch); return super.saveTripSettings(patch); }
  saveBookingClaim(id: string, owner: Parameters<LocalStore['saveBookingClaim']>[1]) { this.claims.push([id, owner]); return super.saveBookingClaim(id, owner); }
}

// The spy shell classes come from the kit's stylesheet, so this screen must load it itself.
const kit = vi.hoisted(() => ({ css: false }));
vi.mock('../components/spy/spy.css', () => { kit.css = true; return {}; });

const seed: ReleasePlan = { ...(releaseJson as Omit<ReleasePlan, 'dayEdits'>), dayEdits: [] };
const settings = (over: Partial<TripSettings> = {}): TripSettings => ({ startDate: null, lastDayStart: null, plan: seed, bookingDates: {}, overrides: [], updatedAt: '2026-11-01T00:00:00.000Z', ...over });

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

  it('saves the last day start', async () => {
    const { store, user } = await mount();
    await open(user, /^Start date/);
    await user.type(await screen.findByLabelText('Last day starts at'), '07:00');
    await user.click(screen.getByRole('button', { name: 'Save hour' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0].lastDayStart).toBe('07:00');
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

describe('Organiser honest saves and kept drafts', () => {
  afterEach(() => vi.restoreAllMocks());
  const statusText = () => screen.getAllByRole('status').map(n => n.textContent).join(' ');
  const addLongStop = async (user: ReturnType<typeof userEvent.setup>, day: string, hours: string) => {
    await user.type(screen.getByLabelText('Stop title'), 'Long hike');
    await user.clear(screen.getByLabelText('Stop hours'));
    await user.type(screen.getByLabelText('Stop hours'), hours);
    await user.selectOptions(screen.getByLabelText('Stop day'), day);
    await user.click(screen.getByRole('button', { name: 'Add stop' }));
  };

  it('says Saved after a write that went through', async () => {
    const { user } = await mount();
    await open(user, /^Start date/);
    await user.type(await screen.findByLabelText('Start date'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save date' }));
    await waitFor(() => expect(statusText()).toMatch(/Saved/));
  });

  it('a write that failed says it is not saved yet, never Saved', async () => {
    vi.spyOn(Spy.prototype, 'saveTripSettings').mockRejectedValue(new Error('offline'));
    const { user } = await mount();
    await open(user, /^Start date/);
    await user.type(await screen.findByLabelText('Start date'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save date' }));
    await waitFor(() => expect(statusText()).toMatch(/Not saved yet, will retry when you're online/));
    expect(statusText()).not.toMatch(/Saved/);
  });

  it('a route save refused with 42501 keeps the edited route, and Save sends it after the password is entered', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    const { store, user } = await mount('Brittany', {}, false);
    localStorage.setItem('tp-admin-key', 'stale');
    await open(user, /^Route/);
    await user.click(await screen.findByRole('button', { name: /^Remove Galle Face/ }));
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    const box = await screen.findByLabelText('Organiser password');
    await waitFor(() => expect(store.saves).toHaveLength(1));
    // Still the edited route: Galle Face is gone from the preview and the change can be discarded.
    expect(screen.queryByRole('button', { name: /^Remove Galle Face/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    expect(screen.queryByText(/saved from another device/)).toBeNull();
    await user.type(box, 'secret');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.queryByLabelText('Organiser password')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    await waitFor(() => expect(store.saves).toHaveLength(2));
    expect(store.saves[1].plan?.items).not.toContain('galleface');
    expect(store.saves[1].plan?.ruledOut).toContain('galleface');
  });

  it('a custom stop that overfills a day shows the over-budget line, not Every place fits', async () => {
    const { user } = await mount();
    await open(user, /^Route/);
    expect(await screen.findByText(/^Every place fits in 9 days/)).toBeInTheDocument();
    await addLongStop(user, '2', '12');
    expect(await screen.findByText(/^Not everything fits/)).toBeInTheDocument();
    expect(screen.queryByText(/^Every place fits/)).toBeNull();
  });

  it('lowering Days below a saved move target shows that move as gone, with a button that removes it', async () => {
    const { user } = await mount('Brittany', { plan: { ...seed, days: 12, dayEdits: [{ kind: 'move', id: 'galleface', day: 12 }] } });
    await open(user, /^Route/);
    await user.selectOptions(await screen.findByLabelText('Days'), '11');
    const select = await screen.findByLabelText(/^Move Galle Face/);
    expect(within(select).getByRole('option', { name: 'Day 12 no longer exists' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Remove move of Galle Face/ }));
    expect(screen.queryByRole('option', { name: /no longer exists/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove move of/ })).toBeNull();
  });
});

// The same inputs the panel builds, read back from the real app state so the screen is compared with missionFiles itself.
function Probe() {
  const { state, me, items, legs } = useApp();
  const base = effectiveRelease(releaseState(state.tripSettings), releaseFor(me), null);
  const { data } = useGroupResult(state, items, legs, base);
  const model = useTripModel({ ...data, final: data?.final ?? null } as GroupResult);
  const input = { state, plan: data?.final ?? null, model };
  return <><output data-testid="cand">{data?.final && !data.locked ? 'candidate' : 'none'}</output><output data-testid="probe">{JSON.stringify({ files: missionFiles(input), bookings: model.bookings, active: spyActive(input) })}</output></>;
}
type Probed = { files: ReturnType<typeof missionFiles>; bookings: { id: string; opensOn: string | null; bookBy: string | null; label: string }[]; active: boolean };
const probe = async () => JSON.parse((await screen.findByTestId('probe')).textContent ?? '{}') as Probed;
const AT = '2026-11-02T00:00:00Z';
const AREAS5 = ['Cultural Triangle', 'Kandy and Knuckles', 'Hill country', 'South coast', 'Colombo'];
const put = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const landed = (except: string[]) => put('tp:travellers', Object.fromEntries(PEOPLE.filter(n => !except.includes(n)).map(name => [name, { name, arriveLocal: '2026-12-08T09:00', arriveFlight: 'UL 1', departLocal: '2026-12-16T20:00', departFlight: 'UL 2', updatedAt: AT }])));
const mountProbe = async (over: Partial<TripSettings> = {}) => {
  localStorage.setItem('tp:me', 'Brittany');
  put('tp:settings', settings(over));
  localStorage.setItem('tp-admin-key', 'k');
  const user = userEvent.setup();
  render(<AppProvider store={new Spy()}><Organiser /><Probe /></AppProvider>);
  return { user };
};

describe('Organiser as Command', () => {
  // B1: a flex-basis on a child of a column container becomes a height there.
  it('no rule sets a flex-basis on a child of a column flex container', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/screens/Organiser.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
    const rows = new Set(rules.filter(r => /^\.[\w-]+$/.test(r.sel) && /display:\s*flex/.test(r.body) && !/flex-direction:\s*column/.test(r.body)).map(r => r.sel));
    const withBasis = rules.filter(r => /(?:^|[;\s])flex:\s*[^\s;]+\s+[^\s;]+\s+(?!auto\b)[^\s;]+|flex-basis:/.test(r.body));
    expect(withBasis.length).toBeGreaterThan(0);
    for (const r of withBasis) for (const sel of r.sel.split(',').map(x => x.trim())) expect(sel.includes('>') && rows.has(sel.split('>')[0].trim()), sel).toBe(true);
  });

  // B2
  it('shows no raw YYYY-MM-DD in the headline, the log or the booking dates', async () => {
    const { user } = await mountProbe({ startDate: '2026-12-08', overrides: [{ at: '2026-11-01T10:00:00.000Z', what: 'Start date set to 2026-12-08' }] });
    await screen.findByRole('button', { name: /^Route/ });
    for (const h of screen.getAllByRole('button', { expanded: false })) await user.click(h);
    expect(screen.getByRole('button', { name: /^Start date/ })).toHaveTextContent('Tue 8 Dec');
    expect(screen.getByText(/Start date set to 8 Dec/)).toBeInTheDocument();
    expect(document.querySelector('.og')!.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  // Hard case 1
  it('Missing intel counts bookings, stays and flights the way missionFiles does', async () => {
    landed(['Antek', 'Saulie']);
    const { user } = await mountProbe({ startDate: '2026-12-08' });
    const { files } = await probe();
    const open = (id: string) => { const f = files.find(x => x.id === id)!; return f.total - f.done; };
    expect(open('touchdown')).toBe(2);
    expect(open('supply')).toBeGreaterThan(0);
    await user.click(await screen.findByRole('button', { name: /^Missing intel/ }));
    const intel = within(screen.getByRole('list', { name: 'Missing intel' }));
    expect(intel.getByText(/^Bookings/).closest('li')).toHaveTextContent(`Bookings: ${open('supply')} to secure`);
    expect(intel.getByText(/^Stays/).closest('li')).toHaveTextContent(`Stays: ${open('stays')} to decide`);
    expect(intel.getByText(/^Flights/).closest('li')).toHaveTextContent('Flights: 2 to add, Antek and Saulie');
    // A8: the Bookings headline is that same count, not a second one.
    expect(screen.getByRole('button', { name: /^Bookings/ })).toHaveTextContent(`${open('supply')} to secure`);
  });

  // A8
  it('a booking row shows the dates in use and prefills them, and Save dates waits for a change', async () => {
    const { user } = await mountProbe({ startDate: '2026-12-08' });
    const b = (await probe()).bookings.find(x => x.bookBy)!;
    expect(b).toBeDefined();
    await user.click(await screen.findByRole('button', { name: /^Bookings/ }));
    const row = (await screen.findByLabelText(`Owner of ${b.label}`)).closest('li')!;
    expect(row).toHaveTextContent(`Book by ${DAY_MONTH.format(new Date(`${b.bookBy}T00:00:00Z`))}`);
    expect(within(row).getByLabelText('Book by')).toHaveValue(b.bookBy);
    expect(within(row).getByRole('button', { name: 'Save dates' })).toBeDisabled();
  });

  // Hard case 3
  it('a route save that resolves false says Not saved yet beside Save route, then Saved once the queue lands it', async () => {
    let fail = true;
    class Flaky extends Spy { saveTripSettings(p: Parameters<LocalStore['saveTripSettings']>[0]) { return fail ? Promise.reject(new Error('offline')) : super.saveTripSettings(p); } }
    localStorage.setItem('tp:me', 'Brittany');
    put('tp:settings', settings());
    localStorage.setItem('tp-admin-key', 'k');
    const user = userEvent.setup();
    render(<AppProvider store={new Flaky()}><Organiser /></AppProvider>);
    await open(user, /^Route/);
    await user.selectOptions(await screen.findByLabelText('Days'), '12');
    const save = screen.getByRole('button', { name: 'Save route' });
    await user.click(save);
    const beside = within(save.parentElement!);
    await waitFor(() => expect(beside.getByRole('status')).toHaveTextContent(SAVE_COPY.unsaved));
    fail = false;
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(beside.getByRole('status')).toHaveTextContent(SAVE_COPY.saved));
  });

  it('a refused save never says it will retry, not even after the password is entered', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    const { user } = await mount('Brittany', {}, false);
    localStorage.setItem('tp-admin-key', 'stale');
    await open(user, /^Start date/);
    await user.type(await screen.findByLabelText('Start date'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Save date' }));
    const box = await screen.findByLabelText('Organiser password');
    expect(document.querySelector('.og')!.textContent).not.toMatch(/will retry/);
    await user.type(box, 'secret');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.queryByLabelText('Organiser password')).toBeNull());
    expect(document.querySelector('.og')!.textContent).not.toMatch(/will retry/);
  });

  it('wears the spy look while a mission file is open and the normal look once all are done', async () => {
    await mountProbe({ startDate: '2026-12-08' });
    expect((await probe()).active).toBe(true);
    expect(document.querySelector('.spy')).not.toBeNull();
    cleanup();
    // Everything done: every stay pinned (which adds their bookings), everyone landed, every booking ticked.
    put('tp:placesug', AREAS5.map(area => ({ id: `s-${area}`, name: 'Alex', area, kind: 'stay', title: `House ${area}`, status: 'live', createdAt: AT })));
    put('tp:staysadmin', { pins: AREAS5.map(area => ({ area, suggestionId: `s-${area}`, at: AT })), scouts: {}, closed: [] });
    landed([]);
    await mountProbe({ startDate: '2026-12-08' });
    const ids = (await probe()).bookings.map(b => b.id);
    cleanup();
    put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ids.map(id => [id, { done: true, doneAt: '2026-11-20T00:00:00Z' }])), updatedAt: AT });
    await mountProbe({ startDate: '2026-12-08' });
    await waitFor(async () => expect((await probe()).active).toBe(false));
    expect(document.querySelector('.spy')).toBeNull();
  });

  it('Save dates keeps its row and shows Saved beside it, even though the dates in use change', async () => {
    const { user } = await mountProbe({ startDate: '2026-12-08' });
    const b = (await probe()).bookings.find(x => x.bookBy)!;
    await user.click(await screen.findByRole('button', { name: /^Bookings/ }));
    const row = (await screen.findByLabelText(`Owner of ${b.label}`)).closest('li')!;
    const field = within(row).getByLabelText('Book by');
    const next = b.bookBy === '2026-11-25' ? '2026-11-26' : '2026-11-25';
    await user.clear(field);
    await user.type(field, next);
    await user.click(within(row).getByRole('button', { name: 'Save dates' }));
    await waitFor(() => expect(within(row).getByRole('status')).toHaveTextContent(SAVE_COPY.saved));
    expect(row.isConnected).toBe(true);
    expect(within(row).getByLabelText('Book by')).toHaveValue(next);
    expect(row).toHaveTextContent(`Book by ${DAY_MONTH.format(new Date(`${next}T00:00:00Z`))}`);
  });

  it('keeps an open section and an unsaved route when the last mission file completes and the spy look goes', async () => {
    put('tp:placesug', AREAS5.map(area => ({ id: `s-${area}`, name: 'Alex', area, kind: 'stay', title: `House ${area}`, status: 'live', createdAt: AT })));
    put('tp:staysadmin', { pins: AREAS5.map(area => ({ area, suggestionId: `s-${area}`, at: AT })), scouts: {}, closed: [] });
    landed([]);
    await mountProbe({ startDate: '2026-12-08' });
    const ids = (await probe()).bookings.map(b => b.id);
    cleanup();
    const ticks = (all: string[]) => ({ name: 'Brittany', items: Object.fromEntries(all.map(id => [id, { done: true, doneAt: '2026-11-20T00:00:00Z' }])), updatedAt: AT });
    put('tp:tripadmin:Brittany', ticks(ids.slice(1)));
    const { user } = await mountProbe({ startDate: '2026-12-08' });
    await waitFor(async () => expect((await probe()).active).toBe(true));
    await user.click(await screen.findByRole('button', { name: /^Route/ }));
    await user.selectOptions(await screen.findByLabelText('Days'), '12');
    put('tp:tripadmin:Brittany', ticks(ids));
    window.dispatchEvent(new StorageEvent('storage', { key: 'tp:tripadmin:Brittany' }));
    await waitFor(() => expect(document.querySelector('.spy')).toBeNull());
    expect(screen.getByLabelText('Days')).toHaveValue('12');
    expect(screen.getByRole('button', { name: /^Route/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('with no route set, Missing intel says so instead of listing zeros and five missing flights', async () => {
    const { user } = await mountProbe({ plan: { ...seed, items: [] } });
    const head = await screen.findByRole('button', { name: /^Missing intel/ });
    await waitFor(() => expect(head).toHaveTextContent('No route is set yet'));
    await user.click(head);
    expect(screen.queryByRole('list', { name: 'Missing intel' })).toBeNull();
    expect(document.querySelector('.og')!.textContent).not.toMatch(/to add/);
  });

  // The vote flow: five ranked lists that agree give a plan that is not yet locked, so no route is decided and nothing is counted for it.
  it('an unlocked candidate from the votes is not counted as the decided route', async () => {
    const must = (releaseJson as { items: string[] }).items.filter(id => !id.startsWith('galle')).slice(0, 6);
    for (const name of PEOPLE) put(`tp:resp:${name}`, { name, days: 9, flex: false, pace: 1, ranking: { ...emptyRanking(), must: must.map(id => [id]) }, rated: must, submitted: true, updatedAt: AT });
    const { user } = await mountProbe({ plan: { ...seed, items: [] } });
    await waitFor(() => expect(screen.getByTestId('cand')).toHaveTextContent('candidate'));
    const head = await screen.findByRole('button', { name: /^Missing intel/ });
    expect(head).toHaveTextContent('No route is set yet');
    await user.click(head);
    expect(screen.queryByRole('list', { name: 'Missing intel' })).toBeNull();
  });
});

describe('Organiser fix round', () => {
  it('loads the spy kit stylesheet by importing it', () => {
    expect(kit.css).toBe(true);
  });

  it('stacks the sections in the spy look with the same class and a rule for it', async () => {
    await mountProbe({ startDate: '2026-12-08' });
    expect((await probe()).active).toBe(true);
    const sec = document.querySelector('.og-spy')!;
    expect(sec).toHaveClass('og-main');
    const css = fs.readFileSync(path.join(__dirname, 'Organiser.css'), 'utf8');
    expect(css).toMatch(/^\.og-main \{[^}]*flex-direction: column; gap: 14px/m);
  });

  it('Route headline and Missing intel read the same condition, also while the plan is still being worked out', async () => {
    await mountProbe({ startDate: '2026-12-08' });
    const route = await screen.findByRole('button', { name: /^Route/ });
    const intel = screen.getByRole('button', { name: /^Missing intel/ });
    expect(/ places/.test(route.textContent ?? '')).toBe(/ open/.test(intel.textContent ?? ''));
  });

  it('editing one prefilled date overrides only that date, and clearing it returns to the catalogue', async () => {
    // The train's opening date comes from the catalogue; the organiser has set only Book by.
    const { store, user } = await mount('Brittany', { startDate: '2026-12-08', bookingDates: { 'book:train': { bookBy: '2026-11-20' } } });
    await open(user, /^Bookings/);
    const row = (await screen.findByLabelText('Owner of Nanu Oya to Ella train')).closest('li')!;
    expect(within(row).getByLabelText('Opens on')).not.toHaveValue('');
    const bookBy = within(row).getByLabelText('Book by') as HTMLInputElement;
    const was = bookBy.value;
    await user.clear(bookBy);
    await user.type(bookBy, was === '2026-11-25' ? '2026-11-26' : '2026-11-25');
    await user.click(within(row).getByRole('button', { name: 'Save dates' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    const saved = Object.values(store.saves[0].bookingDates!);
    expect(saved).toEqual([{ bookBy: bookBy.value }]);
    await waitFor(() => expect(within(row).getByRole('status')).toHaveTextContent(SAVE_COPY.saved));
    await user.clear(bookBy);
    await user.click(within(row).getByRole('button', { name: 'Save dates' }));
    await waitFor(() => expect(store.saves).toHaveLength(2));
    expect(store.saves[1].bookingDates).toEqual({});
  });
});
