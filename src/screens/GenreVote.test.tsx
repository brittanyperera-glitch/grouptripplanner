import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult, Knockout } from '../types';
import Knockouts from './Knockouts';

class SpyStore extends LocalStore {
  vote = vi.fn(async () => {});
}

const fork = (over: Partial<Knockout> = {}): Knockout => ({
  forkId: 'genre:safari', a: ['yala', 'udawalawe'], b: [], votes: { a: ['Lazza'], b: [] },
  genre: { id: 'safari', tally: { yala: { keep: ['Lazza'], drop: [] }, udawalawe: { keep: [], drop: ['Lazza'] } } },
  ...over,
});
const group = (k: Knockout, over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knocked: [], finalized: [], locked: false,
  knockouts: [k], ...over,
});

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });

describe('same-type keep vote card', () => {
  it('reminds, defaults every place to kept, and saves one vote per place at once', async () => {
    const store = new SpyStore();
    const user = userEvent.setup();
    render(<AppProvider store={store}><Knockouts group={group(fork())} /></AppProvider>);
    const card = await screen.findByRole('group', { name: '2 safaris on the shortlist' });
    expect(within(card).getByText('You already have a safari: Yala leopard safari. Keep the others too?')).toBeInTheDocument();
    const keepYala = within(card).getByRole('button', { name: 'Keep Yala leopard safari' });
    const keepUda = within(card).getByRole('button', { name: 'Keep Udawalawe elephants and Transit Home' });
    expect(keepYala).toHaveAttribute('aria-pressed', 'true');
    expect(keepUda).toHaveAttribute('aria-pressed', 'true');
    await user.click(keepUda);
    expect(keepUda).toHaveAttribute('aria-pressed', 'false');
    expect(store.vote).not.toHaveBeenCalled();
    await user.click(within(card).getByRole('button', { name: 'Save my picks' }));
    expect(store.vote.mock.calls).toEqual([
      [{ forkId: 'genre:safari:yala', name: 'Alex', choice: 'a' }],
      [{ forkId: 'genre:safari:udawalawe', name: 'Alex', choice: 'b' }],
    ]);
    expect(await within(card).findByText('Saved')).toBeInTheDocument();
    // Lazza's ticks plus mine.
    expect(within(card).getByText('2 of 5 keep')).toBeInTheDocument();
    expect(within(card).getByText('0 of 5 keep')).toBeInTheDocument();
  });
  it('shows a place already in for good as kept, with no toggle', async () => {
    render(<AppProvider store={new SpyStore()}><Knockouts group={group(fork({ forkId: 'genre:safari#2', a: ['elephants'], b: ['yala'], votes: { a: [], b: [] }, genre: { id: 'safari', tally: { elephants: { keep: [], drop: [] } } } }))} /></AppProvider>);
    const card = await screen.findByRole('group', { name: '2 safaris on the shortlist' });
    expect(within(card).getByText('You already have a safari: Yala leopard safari. Keep the others too?')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Yala/ })).toBeNull();
    expect(within(card).getByRole('button', { name: 'Keep Elephant safari' })).toBeInTheDocument();
  });
  it('the waiting line counts keep votes: the place furthest from three decides', async () => {
    const k = fork({ votes: { a: ['Lazza', 'Alex'], b: [] }, genre: { id: 'safari', tally: { yala: { keep: ['Lazza', 'Alex'], drop: [] }, udawalawe: { keep: ['Alex'], drop: ['Lazza'] } } } });
    render(<AppProvider store={new SpyStore()}><Knockouts group={group(k)} /></AppProvider>);
    expect(await screen.findByRole('status')).toHaveTextContent('Waiting on votes to move onto the next knockout (2 more needed).');
  });
  it('lists a settled keep vote in Decided', async () => {
    const g = group(fork(), { knockouts: [], results: [{ forkId: 'genre:safari', a: ['yala'], b: ['udawalawe'], winner: 'a' }] });
    render(<AppProvider store={new SpyStore()}><Knockouts group={g} /></AppProvider>);
    expect(await screen.findByText('Safari: kept Yala leopard safari, dropped Udawalawe elephants and Transit Home')).toBeInTheDocument();
  });
});
