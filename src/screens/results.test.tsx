import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import { emptyRanking } from '../types';
import type { GroupResult, Item, Person, Plan, Response, Suggestion } from '../types';
import Knockouts from './Knockouts';
import MyTrip from './MyTrip';
import Suggest from './Suggest';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const [A, B] = [ITEMS[0], ITEMS[1]];

const resp = (name: Person, must: string[]): Response => {
  const r = emptyRanking();
  r.must = must.map(id => [id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: must, submitted: true, updatedAt: '' };
};
const seedResp = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
const seedMe = (p: Person) => localStorage.setItem('tp:me', p);

class SpyStore extends LocalStore {
  vote = vi.fn(async () => {});
}

const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knocked: [], finalized: [], locked: false,
  knockouts: [{ forkId: 'ko:fixture', a: [A.id], b: [B.id], votes: { a: [], b: ['Lazza'] } }],
  ...over,
});

const nineDays = (): Plan & { mustFit: number | null } => ({
  route: ['AIR', 'Colombo', 'AIR'], areas: ['Colombo'], chosen: [], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0, mustFit: null,
  days: Array.from({ length: 9 }, (_, i) => ({
    n: i + 1, area: 'Colombo' as const, spare: 0, rainSlack: false,
    entries: [{ kind: 'free' as const, label: `Fixture entry ${i + 1}`, hours: 0 }],
  })),
});

beforeEach(() => localStorage.clear());

describe('Knockouts', () => {
  it('tapping side a votes a for me', async () => {
    seedMe('Alex');
    seedResp(resp('Brittany', [A.id]));
    const store = new SpyStore();
    const user = userEvent.setup();
    render(<AppProvider store={store}><Knockouts group={group()} /></AppProvider>);
    expect(await screen.findByText('1 of 5 voted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: new RegExp(A.name) }));
    expect(store.vote).toHaveBeenCalledWith({ forkId: 'ko:fixture', name: 'Alex', choice: 'a' });
    const card = screen.getByRole('group', { name: /Knockout/ });
    expect(within(card).getByText('Brittany Must')).toBeInTheDocument();
  });
});

describe('MyTrip', () => {
  it('renders one row per day for a 9 day plan', async () => {
    render(<AppProvider store={new LocalStore()}><MyTrip plan={nineDays()} days={9} /></AppProvider>);
    await screen.findByText('Your best 9 days');
    const list = screen.getByRole('list', { name: 'Days' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(9);
    expect(screen.queryByText(/Your Musts/)).toBeNull();
  });
});

describe('Suggest', () => {
  const pending: Suggestion = { id: 'p1', name: 'Alex', title: 'Tea factory tour', area: 'Hill country', note: '', status: 'pending', createdAt: '' };
  const show = async (me: Person, open: boolean) => {
    seedMe(me);
    localStorage.setItem('tp:sugg', JSON.stringify([pending]));
    render(<AppProvider store={new LocalStore()}><Suggest open={open} /></AppProvider>);
    await screen.findByText('Tea factory tour');
  };

  it('shows Approve only to Brittany and only before the group opens', async () => {
    await show('Brittany', false);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });
  it('hides Approve for Brittany once open and says so', async () => {
    await show('Brittany', true);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText("New ideas won't change this plan")).toBeInTheDocument();
  });
  it('hides Approve from everyone else', async () => {
    await show('Alex', false);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
