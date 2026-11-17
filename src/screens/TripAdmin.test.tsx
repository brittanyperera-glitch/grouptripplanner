import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { emptyRanking, PEOPLE } from '../types';
import type { GroupResult, Plan, Player, TripAdminRow } from '../types';
import TripAdmin, { TripAdminLink } from './TripAdmin';

const grp = vi.hoisted(() => ({ current: null as unknown, loading: false }));
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: grp.loading }) }));

const day = (n: number) => ({ n, area: 'Ella' as const, entries: [], spare: 0, rainSlack: false });
const plan: Plan = { route: ['AIR'], areas: ['Ella'], chosen: ['sigiriya', 'train'], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, days: [day(1), day(2)] };
const seed = (name: Player, items: TripAdminRow['items']) =>
  localStorage.setItem(`tp:tripadmin:${name}`, JSON.stringify({ name, items, updatedAt: '2026-10-17T00:00:00Z' }));
const stored = (name: Player) => JSON.parse(localStorage.getItem(`tp:tripadmin:${name}`) ?? 'null') as TripAdminRow | null;

const mount = async (me: Player = 'Alex') => {
  localStorage.setItem('tp:me', me);
  const user = userEvent.setup();
  render(<AppProvider store={new LocalStore()}><TripAdmin onBack={vi.fn()} /></AppProvider>);
  await screen.findByRole('checkbox', { name: 'Sigiriya Rock' });
  return user;
};

// Changed deliberately (route decided only once locked or reopened): the group fixture carries `locked`, as a real decided route does.
const decided = { final: plan, locked: true } as unknown as GroupResult;
const saveFinals = () => PEOPLE.forEach(n => localStorage.setItem(`tp:resp:${n}`, JSON.stringify({ name: n, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: true, updatedAt: 'x', final: emptyRanking() })));
beforeEach(() => { localStorage.clear(); grp.current = decided; grp.loading = false; });
afterEach(() => cleanup());

describe('TripAdmin', () => {
  it('shows only Loading while the route is still being computed, never the empty text or All done', async () => {
    localStorage.setItem('tp:me', 'Alex');
    grp.current = null; grp.loading = true;
    render(<AppProvider store={new LocalStore()}><TripAdmin onBack={vi.fn()} /></AppProvider>);
    await screen.findByRole('heading', { name: 'Trip admin' });
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/All done|Group bookings appear/);
  });

  // Changed deliberately (Brittany 2026-10-17): the personal flights/insurance checklist is gone, only group bookings remain.
  it('lists only the group bookings from the plan', async () => {
    await mount();
    const boxes = screen.getAllByRole('checkbox').map(b => b.getAttribute('aria-label'));
    expect(boxes).toEqual(['Sigiriya Rock', 'Nanu Oya to Ella train']);
  });

  it('ticking saves my entry and the count drops', async () => {
    const user = await mount();
    expect(screen.getByRole('status')).toHaveTextContent('2 still to do');
    await user.click(screen.getByRole('checkbox', { name: 'Sigiriya Rock' }));
    await waitFor(() => expect(stored('Alex')?.items['book:sigiriya']?.done).toBe(true));
    expect(screen.getByRole('checkbox', { name: 'Sigiriya Rock' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 still to do');
  });

  it('shows who has done an item, but never another person\'s price or reference', async () => {
    seed('Brittany', { 'book:sigiriya': { done: true, doneAt: 't', price: 'GBP 612', ref: 'SECRETREF', note: 'window seat' } });
    await mount('Alex');
    const row = screen.getByRole('checkbox', { name: 'Sigiriya Rock' }).closest('li')!;
    expect(within(row).getByRole('list', { name: 'Done by Brittany' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/SECRETREF|GBP 612|window seat/);
    expect(screen.getByRole('checkbox', { name: 'Sigiriya Rock' })).toHaveAttribute('aria-checked', 'false');
  });

  it('my own details save, show back to me and stay off other people\'s view', async () => {
    const user = await mount('Alex');
    await user.click(screen.getByRole('button', { name: 'Details: Sigiriya Rock' }));
    await user.type(screen.getByLabelText('Price'), 'USD 41');
    // Changed deliberately (Brittany 2026-10-17): no booking reference field; the form says plainly it is not secret.
    expect(screen.queryByLabelText('Booking reference')).toBeNull();
    expect(screen.getByText(/anyone with the trip password can read this/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Alex')?.items['book:sigiriya']).toMatchObject({ price: 'USD 41' }));
    expect(stored('Alex')?.items['book:sigiriya']?.ref).toBeUndefined();
    expect(await screen.findByText('USD 41')).toBeInTheDocument();
    cleanup();
    await mount('Lazza');
    expect(document.body.textContent).not.toMatch(/USD 41/);
  });

  it('a group item ticked by anyone shows as done for everyone', async () => {
    seed('Brittany', { 'book:train': { done: true, doneAt: 't' } });
    await mount('Alex');
    const row = screen.getByRole('checkbox', { name: 'Nanu Oya to Ella train' }).closest('li')!;
    expect(row).toHaveAttribute('data-done', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 still to do');
  });

  it('the link counts what I still owe and opens the page', async () => {
    localStorage.setItem('tp:me', 'Alex');
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><TripAdminLink group={decided} onOpen={onOpen} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /Trip admin.*2 to do/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  describe('a stay that fell through after it was ticked', () => {
    const stayRow = { id: 's1', name: 'Alex', area: 'Ella', kind: 'stay', title: 'Stay s1', status: 'live', createdAt: '2026-10-10' };
    // LocalStore does not persist a fallen list yet, so the test hands the screen the state a store that does would give it.
    class FallenStore extends LocalStore {
      async load() { const s = await super.load(); return { ...s, stays: { ...s.stays!, admin: { ...s.stays!.admin, fallen: [{ id: 'gone', area: 'Ella' as const, at: '2026-11-02T10:00' }] } } }; }
    }
    const mountStay = async (doneAt: string) => {
      localStorage.setItem('tp:placesug', JSON.stringify([stayRow]));
      localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [{ area: 'Ella', suggestionId: 's1', at: '2026-11-03T09:00' }], scouts: {}, closed: [] }));
      seed('Brittany', { 'stay:Ella': { done: true, doneAt } });
      localStorage.setItem('tp:me', 'Alex');
      render(<AppProvider store={new FallenStore()}><TripAdmin onBack={vi.fn()} /></AppProvider>);
      return (await screen.findByRole('checkbox', { name: 'Stay in Ella' })).closest('li')!;
    };

    it('a tick from before the fall is not shown as done, not counted, and has no avatar', async () => {
      const row = await mountStay('2026-11-01T08:00');
      expect(row).toHaveAttribute('data-done', 'false');
      expect(within(row).queryByRole('list', { name: /Done by/ })).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('3 still to do');
    });

    it('a tick from after the fall still counts', async () => {
      const row = await mountStay('2026-11-04T08:00');
      expect(row).toHaveAttribute('data-done', 'true');
      expect(within(row).getByRole('list', { name: 'Done by Brittany' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('2 still to do');
    });
  });

  describe('the route behind the group bookings', () => {
    const reopened = { final: null, held: plan, locked: false, knockouts: [{ forkId: 'ko:s:late' }] } as unknown as GroupResult;
    const provisional = { final: plan, locked: false } as unknown as GroupResult;
    const linkText = async (g: GroupResult) => {
      localStorage.setItem('tp:me', 'Alex');
      render(<AppProvider store={new LocalStore()}><TripAdminLink group={g} onOpen={vi.fn()} /></AppProvider>);
      return (await screen.findByRole('button', { name: /Trip admin/ })).textContent;
    };

    it('a late vote reopening the locked route keeps the group bookings, on the page and in the link count', async () => {
      saveFinals();
      grp.current = reopened;
      await mount();
      expect(screen.getAllByRole('checkbox').map(b => b.getAttribute('aria-label'))).toContain('Sigiriya Rock');
      cleanup();
      expect(await linkText(reopened)).toMatch(/2 to do/);
    });

    it('a provisional route lists nothing to book, and the link is not shown', async () => {
      grp.current = provisional;
      localStorage.setItem('tp:me', 'Alex');
      render(<AppProvider store={new LocalStore()}><TripAdmin onBack={vi.fn()} /></AppProvider>);
      expect(await screen.findByText(/Group bookings appear once the route is set/)).toBeInTheDocument();
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      expect(screen.queryByRole('status')).toBeNull();
      cleanup();
      localStorage.setItem('tp:me', 'Alex');
      render(<AppProvider store={new LocalStore()}><TripAdminLink group={provisional} onOpen={vi.fn()} /></AppProvider>);
      expect(screen.queryByRole('button', { name: /Trip admin/ })).toBeNull();
    });

    it('does not promise privacy it cannot keep', async () => {
      await mount();
      expect(document.body.textContent).not.toMatch(/never your prices/);
      expect(screen.getByText(/shown only to you in the app/)).toBeInTheDocument();
    });
  });

  describe('claims, chips and the calendar', () => {
    const e = (kind: 'activity' | 'train', itemId: string) => ({ kind, label: itemId, hours: 1, itemId });
    const dated: Plan = { ...plan, chosen: ['sigiriya', 'train', 'crab'], days: [{ ...day(1), entries: [e('activity', 'sigiriya')] }, { ...day(2), entries: [e('activity', 'crab')] }, { ...day(3), entries: [e('train', 'train')] }] };
    const startOn = (startDate: string | null) => localStorage.setItem('tp:settings', JSON.stringify({ startDate, plan: null, bookingDates: {}, overrides: [], updatedAt: '2026-11-01T00:00:00Z' }));
    const mountOn = async (today: string, me: Player = 'Alex') => {
      localStorage.setItem('tp:me', me);
      grp.current = { final: dated, locked: true } as unknown as GroupResult;
      const user = userEvent.setup();
      render(<AppProvider store={new LocalStore()}><TripAdmin onBack={vi.fn()} today={today} /></AppProvider>);
      await screen.findByRole('checkbox', { name: 'Nanu Oya to Ella train' });
      return user;
    };
    const rowOf = (name: string) => screen.getByRole('checkbox', { name }).closest('li')!;

    it('I will book this on the train row calls the claim setter with the train id and my name', async () => {
      startOn('2026-12-08');
      const spy = vi.spyOn(LocalStore.prototype, 'saveBookingClaim');
      const user = await mountOn('2026-12-01');
      await user.click(within(rowOf('Nanu Oya to Ella train')).getByRole('button', { name: "I'll book this" }));
      expect(spy).toHaveBeenCalledWith('book:train', 'Alex');
      expect(await within(rowOf('Nanu Oya to Ella train')).findByRole('button', { name: 'Unclaim: Nanu Oya to Ella train' })).toBeInTheDocument();
      spy.mockRestore();
    });

    it('the owner can unclaim, and someone else\'s claim shows their avatar with no claim button', async () => {
      startOn('2026-12-08');
      const spy = vi.spyOn(LocalStore.prototype, 'saveBookingClaim');
      localStorage.setItem('tp:claims', JSON.stringify({ 'book:crab': { itemId: 'book:crab', owner: 'Brittany', updatedAt: '2026-11-02T00:00:00Z' } }));
      const user = await mountOn('2026-12-01');
      const crab = rowOf('Ministry of Crab dinner');
      expect(within(crab).queryByRole('button', { name: "I'll book this" })).toBeNull();
      expect(within(crab).getByTitle('Brittany')).toBeInTheDocument();
      expect(within(crab).queryByRole('button', { name: /Unclaim/ })).toBeNull();
      await user.click(within(rowOf('Nanu Oya to Ella train')).getByRole('button', { name: "I'll book this" }));
      await user.click(await within(rowOf('Nanu Oya to Ella train')).findByRole('button', { name: /Unclaim/ }));
      expect(spy).toHaveBeenLastCalledWith('book:train', null);
      spy.mockRestore();
    });

    it('a booking whose book-by date is before today shows the overdue chip', async () => {
      startOn('2026-12-08');
      await mountOn('2026-12-01');
      expect(within(rowOf('Ministry of Crab dinner')).getByText('Overdue')).toBeInTheDocument();
      expect(within(rowOf('Nanu Oya to Ella train')).queryByText('Overdue')).toBeNull();
    });

    it('shows opens-on, book-by and done chips, sorted by date with undated last', async () => {
      startOn('2026-12-08');
      seed('Brittany', { 'book:sigiriya': { done: true, doneAt: 't' } });
      await mountOn('2026-11-05');
      expect(within(rowOf('Nanu Oya to Ella train')).getByText('Opens 10 Nov')).toBeInTheDocument();
      expect(within(rowOf('Ministry of Crab dinner')).getByText('Book by 25 Nov')).toBeInTheDocument();
      expect(within(rowOf('Sigiriya Rock')).getByText('Done')).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox').map(b => b.getAttribute('aria-label'))).toEqual(['Nanu Oya to Ella train', 'Ministry of Crab dinner', 'Sigiriya Rock']);
    });

    it('Add to calendar downloads homecoming.ics from the trip model', async () => {
      startOn('2026-12-08');
      const made: Blob[] = [];
      URL.createObjectURL = vi.fn((b: Blob) => { made.push(b); return 'blob:x'; });
      URL.revokeObjectURL = vi.fn();
      let name = '';
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
      const user = await mountOn('2026-12-01');
      await user.click(screen.getByRole('button', { name: 'Add to calendar' }));
      expect(name).toBe('homecoming.ics');
      const text = await new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsText(made[0]); });
      expect(text).toMatch(/BEGIN:VCALENDAR[\s\S]*Book by: Ministry of Crab dinner/);
      click.mockRestore();
    });

    it('a tick of mine from before that stay fell shows unticked', async () => {
      class FallenStore extends LocalStore {
        async load() { const s = await super.load(); return { ...s, stays: { ...s.stays!, admin: { ...s.stays!.admin, fallen: [{ id: 'gone', area: 'Ella' as const, at: '2026-11-02T10:00' }] } } }; }
      }
      localStorage.setItem('tp:placesug', JSON.stringify([{ id: 's1', name: 'Alex', area: 'Ella', kind: 'stay', title: 'Stay s1', status: 'live', createdAt: '2026-10-10' }]));
      localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [{ area: 'Ella', suggestionId: 's1', at: '2026-11-03T09:00' }], scouts: {}, closed: [] }));
      seed('Alex', { 'stay:Ella': { done: true, doneAt: '2026-11-01T08:00' } });
      localStorage.setItem('tp:me', 'Alex');
      render(<AppProvider store={new FallenStore()}><TripAdmin onBack={vi.fn()} /></AppProvider>);
      expect(await screen.findByRole('checkbox', { name: 'Stay in Ella' })).toHaveAttribute('aria-checked', 'false');
    });
  });
});
