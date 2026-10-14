import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult, Item } from '../types';
import Knockouts from './Knockouts';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const byId = (id: string) => ITEMS.find(i => i.id === id)!;

class SpyStore extends LocalStore {
  vote = vi.fn(async () => {});
}

const NORTH = ['jaffna', 'delft', 'trinco', 'nainativu'], SOUTH = ['sigiriya', 'yala', 'galle', 'horton'];
const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [],
  knockouts: [{ forkId: 'region:north', a: NORTH, b: SOUTH, votes: { a: ['Brittany'], b: [] } }],
  ...over,
});

beforeEach(() => localStorage.clear());

describe('region knockout card', () => {
  it('renders "North or South?" with the full north list on the left and the full south list on the right', async () => {
    localStorage.setItem('tp:me', 'Alex');
    const store = new SpyStore();
    const user = userEvent.setup();
    render(<AppProvider store={store}><Knockouts group={group()} /></AppProvider>);
    const card = await screen.findByRole('group', { name: /North or South\?/ });
    expect(within(card).getByText('North or South?')).toBeInTheDocument();
    const picks = within(card).getAllByRole('button');
    expect(picks).toHaveLength(2);
    for (const id of NORTH) expect(within(picks[0]).getByText(byId(id).name)).toBeInTheDocument();
    for (const id of SOUTH) expect(within(picks[1]).getByText(byId(id).name)).toBeInTheDocument();
    expect(within(picks[0]).queryByText(byId(SOUTH[0]).name)).toBeNull();
    expect(within(card).getByText('1 of 5 voted')).toBeInTheDocument();
    await user.click(picks[0]);
    expect(store.vote).toHaveBeenCalledWith({ forkId: 'region:north', name: 'Alex', choice: 'a' });
    await user.click(picks[1]);
    expect(store.vote).toHaveBeenCalledWith({ forkId: 'region:north', name: 'Alex', choice: 'b' });
  });
  it('shows a decided region result', async () => {
    render(<AppProvider store={new SpyStore()}><Knockouts group={group({ knockouts: [], results: [{ forkId: 'region:north', a: NORTH, b: SOUTH, winner: 'b' }] })} /></AppProvider>);
    expect(await screen.findByText('South beat North')).toBeInTheDocument();
  });
});
