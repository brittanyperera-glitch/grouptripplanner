import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../lib/__fixtures__/catalogue-46.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult, Item } from '../types';
import Knockouts from './Knockouts';

// The app reads src/data/catalogue.json, which Brittany's curation changes; this test pins the 46-place set.
vi.mock('../data/catalogue.json', async () => ({ default: (await import('../lib/__fixtures__/catalogue-46.json')).default }));

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const byId = (id: string) => ITEMS.find(i => i.id === id)!;

class SpyStore extends LocalStore {
  vote = vi.fn(async () => {});
}

const NORTH = ['jaffna', 'delft', 'trinco', 'nainativu'], SOUTH = ['sigiriya', 'yala', 'galle', 'horton'];
const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knocked: [], finalized: [], locked: false,
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
    const picks = Array.from(card.querySelectorAll<HTMLElement>('.pick'));
    expect(picks).toHaveLength(2);
    for (const id of NORTH) expect(within(picks[0]).getByText(byId(id).name)).toBeInTheDocument();
    for (const id of SOUTH) expect(within(picks[1]).getByText(byId(id).name)).toBeInTheDocument();
    expect(within(picks[0]).queryByText(byId(SOUTH[0]).name)).toBeNull();
    expect(within(card).getByText('1 of 5 voted')).toBeInTheDocument();
    await user.click(within(picks[0]).getByRole('button', { name: /^Vote for/ }));
    expect(store.vote).toHaveBeenCalledWith({ forkId: 'region:north', name: 'Alex', choice: 'a' });
    await user.click(within(picks[1]).getByRole('button', { name: /^Vote for/ }));
    expect(store.vote).toHaveBeenCalledWith({ forkId: 'region:north', name: 'Alex', choice: 'b' });
  });
  it('shows a decided region result', async () => {
    render(<AppProvider store={new SpyStore()}><Knockouts group={group({ knockouts: [], results: [{ forkId: 'region:north', a: NORTH, b: SOUTH, winner: 'b' }] })} /></AppProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'Decided 1' }));
    expect(await screen.findByText('South beat North')).toBeInTheDocument();
  });
  // D6 (Brittany 2026-10-15): North or South first, alone; the place head to heads follow it.
  it('says the place head to heads come next while North or South is open', async () => {
    render(<AppProvider store={new SpyStore()}><Knockouts group={group()} /></AppProvider>);
    expect(await screen.findByText(/Head to heads on places come once North or South is settled/)).toBeInTheDocument();
  });
  // Brittany 2026-10-15: "say waiting on votes to move onto next knockout".
  it('once I have voted, says it is waiting on votes and how many more are needed', async () => {
    localStorage.setItem('tp:me', 'Brittany');
    render(<AppProvider store={new SpyStore()}><Knockouts group={group()} /></AppProvider>);
    expect(await screen.findByRole('status')).toHaveTextContent('Waiting on votes to move onto the next knockout (2 more needed).');
  });
  it('does not say it is waiting before I have voted', async () => {
    localStorage.setItem('tp:me', 'Alex');
    render(<AppProvider store={new SpyStore()}><Knockouts group={group()} /></AppProvider>);
    await screen.findByRole('group', { name: /North or South\?/ });
    expect(screen.queryByText(/Waiting on votes/)).toBeNull();
  });
  it('shows the region result above the place head to heads that follow it', async () => {
    const g = group({
      knockouts: [{ forkId: 'ko:galle', a: ['galle'], b: ['horton'], votes: { a: [], b: [] } }],
      results: [{ forkId: 'region:north', a: NORTH, b: SOUTH, winner: 'b' }],
    });
    render(<AppProvider store={new SpyStore()}><Knockouts group={g} /></AppProvider>);
    const line = await screen.findByText('South beat North');
    const card = screen.getByRole('group', { name: /^Knockout: / });
    expect(line.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('South beat North')).toHaveLength(1);
    expect(screen.queryByText(/come once North or South is settled/)).toBeNull();
  });
});
