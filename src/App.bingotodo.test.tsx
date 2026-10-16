import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { openMenu } from './__fixtures__/menu';
import { seenWalkToday, mkItem as mk } from './__fixtures__/seed';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const grp = vi.hoisted(() => ({ current: null as unknown }));
const copy = vi.hoisted(() => ({
  welcome: '', guestWelcome: 'Pick your guest character', guestWelcomeSub: 'Try it',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, unknown>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));
// The group result is fixed so the test controls which knockouts are open and whether the plan is locked.
vi.mock('./workers/usePlan', async orig => ({ ...(await orig<typeof import('./workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const THREE = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];

const plan: Plan = {
  route: ['AIR', 'Colombo', 'AIR'], areas: ['Colombo'], chosen: ['a', 'b', 'c'], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [{ n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'activity', label: 'Alpha Rock', hours: 1, itemId: 'a' }] }],
};
const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: plan, final: null, extras: [], knocked: [], finalized: [], locked: false, results: [],
  knockouts: [
    { forkId: 'ko:1', a: ['a'], b: ['b'], votes: { a: ['Alex'], b: [] } },
    { forkId: 'ko:2', a: ['c'], b: ['a'], votes: { a: [], b: ['Antek'] } },
  ],
  ...over,
});
const NONE = { knockouts: [] as GroupResult['knockouts'] };

const row = (name: Person, over: Partial<Response> = {}): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] }, rated: ['a', 'b', 'c'], submitted: true, updatedAt: '2026-10-14T00:00:00Z', ...over,
});
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
const CARD = { id: 'b1', title: 't', squares: Array.from({ length: 9 }, () => ({ text: 's', ticked: false })), createdAt: '' };
// The quiz is done, so Bingo is the only to-do unless a card is seeded.
const crew = (name: string, bingo: unknown[]) => localStorage.setItem(`tp:stays:${name}`, JSON.stringify({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo, updatedAt: '2026-10-14T00:00:00Z' }));
const seedCrew = (me: Person, bingo: unknown[] = []) => {
  for (const p of PEOPLE) seed(row(p));
  localStorage.setItem('tp:me', me);
  crew(me, bingo);
};
const bingoPage = () => screen.findByRole('button', { name: /New card/ });

beforeEach(() => { localStorage.clear(); window.location.hash = ''; cat.items = THREE; grp.current = group(NONE); });
afterEach(() => { cleanup(); window.location.hash = ''; });

describe('Bingo is a to-do', () => {
  it('a submitted member with no card sees Open items (1), and the row opens Bingo', async () => {
    seenWalkToday();
    seedCrew('Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Open items (1)' }));
    await user.click(await screen.findByRole('button', { name: /Make your travel bingo card/ }));
    expect(await bingoPage()).toBeInTheDocument();
  });

  it('a member with a saved card has nothing to do', async () => {
    seenWalkToday();
    seedCrew('Alex', [CARD]);
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    expect(await screen.findByRole('button', { name: 'Open items' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Open items \(/ })).toBeNull();
  });

  it('is not owed while still rating: no tabs, no Open items', async () => {
    seenWalkToday();
    seedCrew('Alex');
    seed(row('Alex', { submitted: false }));
    render(<App />);
    await screen.findByRole('button', { name: 'Menu' });
    openMenu();
    expect(screen.queryByRole('button', { name: /Open items/ })).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('the welcome-back walkthrough shows the bingo screen when it is the only to-do, and its button opens Bingo', async () => {
    seedCrew('Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId('walkthrough');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const w = await screen.findByTestId('walkthrough');
    expect(w).toHaveTextContent('Your travel bingo card is missing. Predict the chaos before it happens.');
    await user.click(screen.getByRole('button', { name: 'Make my card' }));
    expect(await bingoPage()).toBeInTheDocument();
    expect(screen.queryByTestId('walkthrough')).toBeNull();
  });

  it('the walkthrough stays away once a card exists', async () => {
    seedCrew('Alex', [CARD]);
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(screen.queryByTestId('walkthrough')).toBeNull();
  });
});
