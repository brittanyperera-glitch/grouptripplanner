import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { emptyRanking, PEOPLE } from '../types';
import type { GroupResult, Plan, Player, TripAdminRow } from '../types';
import TripAdmin, { TripAdminLink } from './TripAdmin';

const grp = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const day = (n: number) => ({ n, area: 'Ella' as const, entries: [], spare: 0, rainSlack: false });
const plan: Plan = { route: ['AIR'], areas: ['Ella'], chosen: ['sigiriya', 'train'], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, days: [day(1), day(2)] };
const seed = (name: Player, items: TripAdminRow['items']) =>
  localStorage.setItem(`tp:tripadmin:${name}`, JSON.stringify({ name, items, updatedAt: '2026-10-17T00:00:00Z' }));
const stored = (name: Player) => JSON.parse(localStorage.getItem(`tp:tripadmin:${name}`) ?? 'null') as TripAdminRow | null;

const mount = async (me: Player = 'Alex') => {
  localStorage.setItem('tp:me', me);
  const user = userEvent.setup();
  render(<AppProvider store={new LocalStore()}><TripAdmin onBack={vi.fn()} /></AppProvider>);
  await screen.findByRole('checkbox', { name: 'Flights in and out' });
  return user;
};

// Changed deliberately (route decided only once locked or reopened): the group fixture carries `locked`, as a real decided route does.
const decided = { final: plan, locked: true } as unknown as GroupResult;
const saveFinals = () => PEOPLE.forEach(n => localStorage.setItem(`tp:resp:${n}`, JSON.stringify({ name: n, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: true, updatedAt: 'x', final: emptyRanking() })));
beforeEach(() => { localStorage.clear(); grp.current = decided; });
afterEach(() => cleanup());

describe('TripAdmin', () => {
  it('lists my items, then the group bookings from the plan', async () => {
    await mount();
    const boxes = screen.getAllByRole('checkbox').map(b => b.getAttribute('aria-label'));
    expect(boxes).toEqual(['Flights in and out', 'Sri Lanka ETA', 'Travel insurance', 'Vaccines and meds check', 'Phone or eSIM', 'Money plan', 'Sigiriya Rock', 'Nanu Oya to Ella train']);
  });

  it('ticking saves my entry and the count drops', async () => {
    const user = await mount();
    expect(screen.getByRole('status')).toHaveTextContent('8 still to do');
    await user.click(screen.getByRole('checkbox', { name: 'Sri Lanka ETA' }));
    await waitFor(() => expect(stored('Alex')?.items.eta?.done).toBe(true));
    expect(screen.getByRole('checkbox', { name: 'Sri Lanka ETA' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('7 still to do');
  });

  it('shows who has done an item, but never another person\'s price or reference', async () => {
    seed('Brittany', { flights: { done: true, doneAt: 't', price: 'GBP 612', ref: 'SECRETREF', note: 'window seat' } });
    await mount('Alex');
    const row = screen.getByRole('checkbox', { name: 'Flights in and out' }).closest('li')!;
    expect(within(row).getByRole('list', { name: 'Done by Brittany' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/SECRETREF|GBP 612|window seat/);
    expect(screen.getByRole('checkbox', { name: 'Flights in and out' })).toHaveAttribute('aria-checked', 'false');
  });

  it('my own details save, show back to me and stay off other people\'s view', async () => {
    const user = await mount('Alex');
    await user.click(screen.getByRole('button', { name: 'Details: Sigiriya Rock' }));
    await user.type(screen.getByLabelText('Price'), 'USD 41');
    await user.type(screen.getByLabelText('Booking reference'), 'SG-77');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Alex')?.items['book:sigiriya']).toMatchObject({ price: 'USD 41', ref: 'SG-77' }));
    expect(await screen.findByText('USD 41, SG-77')).toBeInTheDocument();
    cleanup();
    await mount('Lazza');
    expect(document.body.textContent).not.toMatch(/SG-77|USD 41/);
  });

  it('a group item ticked by anyone shows as done for everyone', async () => {
    seed('Brittany', { 'book:train': { done: true, doneAt: 't' } });
    await mount('Alex');
    const row = screen.getByRole('checkbox', { name: 'Nanu Oya to Ella train' }).closest('li')!;
    expect(row).toHaveAttribute('data-done', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('7 still to do');
  });

  it('the link counts what I still owe and opens the page', async () => {
    localStorage.setItem('tp:me', 'Alex');
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><TripAdminLink group={decided} onOpen={onOpen} /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: /Trip admin.*8 to do/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
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
      expect(await linkText(reopened)).toMatch(/8 to do/);
    });

    it('a provisional route lists no group bookings, and the link counts the same six', async () => {
      grp.current = provisional;
      await mount();
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
      expect(screen.getByText(/Group bookings appear once the route is set/)).toBeInTheDocument();
      cleanup();
      expect(await linkText(provisional)).toMatch(/6 to do/);
    });

    it('does not promise privacy it cannot keep', async () => {
      await mount();
      expect(document.body.textContent).not.toMatch(/never your prices/);
      expect(screen.getByText(/shown only to you in the app/)).toBeInTheDocument();
    });
  });
});
