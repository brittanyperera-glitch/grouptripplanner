import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, type Person, type Response } from '../types';
import App from '../App';
import { seenWalkToday } from '../__fixtures__/seed';
// These tests exercise the tabs, not the once-a-day welcome-back walkthrough (it has its own tests), so it counts as seen today.

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('../data/catalogue.json', () => ({ default: cat }));
vi.mock('../content/copy.json', () => ({ default: { welcome: '', quips: { name: {}, days: {}, pace: {}, tier: {} }, items: {} } }));

const mk = (id: string, name: string) => ({
  id, name, area: 'Cultural Triangle', about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0,
  photo: id, when: 'morning', credit: `Credit ${id}`, google: { rating: '4.7', reviews: '1', url: `https://maps.example/${id}` },
});
const row = (name: Person, over: Partial<Response> = {}): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: '2026-10-14T00:00:00Z', ...over,
});
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
const submitted = () => row('Alex', { submitted: true, rated: ['a'], ranking: { ...emptyRanking(), must: [['a']] } });

beforeEach(() => {
  localStorage.clear(); seenWalkToday();
  cat.items = [mk('a', 'Alpha Rock'), mk('b', 'Beta Falls')];
  localStorage.setItem('tp:me', 'Alex');
});

describe('Guide access', () => {
  it('is not offered before I submit: no tab, no button', async () => {
    seed(row('Alex', { rated: [] }));
    render(<App />);
    await screen.findByRole('button', { name: 'Menu' });
    expect(screen.queryByRole('tab', { name: 'Guide' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open the guide' })).toBeNull();
  });

  it('after I submit there is a Guide tab', async () => {
    seed(submitted());
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Guide' })).toBeInTheDocument();
  });

  it('the waiting screen has an Open the guide button that opens the Guide tab', async () => {
    seed(submitted());
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    await user.click(await screen.findByRole('button', { name: 'Open the guide' }));
    expect(await screen.findByRole('tab', { name: 'Guide', selected: true })).toBeInTheDocument();
    // Brittany 2026-10-16: the Guide opens on Phrases.
    expect(screen.getByRole('region', { name: 'Phrases' })).toBeInTheDocument();
  });
});

describe('Guide sections', () => {
  it('shows one section at a time', async () => {
    seed(submitted());
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Guide' }));
    await screen.findByRole('region', { name: 'Phrases' });
    await user.click(screen.getByRole('button', { name: 'Food' }));
    const food = await screen.findByRole('region', { name: 'Food' });
    expect(within(food).getByText('Kottu roti')).toBeInTheDocument();
    expect(screen.queryByText('Jackfruit')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Fruit' }));
    const fruit = screen.getByRole('region', { name: 'Fruit' });
    expect(within(fruit).getByText('Jackfruit')).toBeInTheDocument();
    expect(screen.queryByText('Kottu roti')).toBeNull();
    expect(screen.getAllByRole('region', { name: /^(Food|Fruit|Desserts|Beaches|Packing|Phrases)$/ })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Phrases' }));
    expect(within(screen.getByRole('region', { name: 'Phrases' })).getByText('Ayubowan')).toBeInTheDocument();
    expect(screen.queryByText('Jackfruit')).toBeNull();
  });
});
