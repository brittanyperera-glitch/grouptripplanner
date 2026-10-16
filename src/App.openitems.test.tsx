import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { openMenu } from './__fixtures__/menu';
import { WALKTHROUGH_KEY, todayKey } from './lib/walkthrough';
// These tests exercise the tabs, not the once-a-day welcome-back walkthrough (it has its own tests), so it counts as seen today.
const seenWalkToday = () => localStorage.setItem(WALKTHROUGH_KEY, todayKey(new Date()));

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

const mk = (id: string, name: string, area: string) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: `Credit ${id}`,
});
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
// One person rates a place Keen, so the "most enthusiastic" award has a single winner.
// Quiz marked done for the person under test, so this exercises what it did before the stayQuiz to-do existed.
const quizDone = (name: string) => localStorage.setItem(`tp:stays:${name}`, JSON.stringify({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' }));
const seedCrew = (me: Person, keener: Person = 'Alex') => {
  for (const p of PEOPLE) seed(row(p, p === keener ? { ranking: { ...emptyRanking(), must: [['b'], ['c']], keen: [['a']] } } : {}));
  localStorage.setItem('tp:me', me);
  quizDone(me);
};
const dot = () => document.querySelector('.oi-dot');
const knockoutCards = () => screen.findAllByRole('group', { name: /^Knockout:/ });

beforeEach(() => { localStorage.clear(); seenWalkToday(); window.location.hash = ''; cat.items = THREE; grp.current = group(); });
afterEach(() => { cleanup(); window.location.hash = ''; });

describe('Menu red dot', () => {
  it('shows while something is waiting on me and says how many, and not otherwise', async () => {
    seedCrew('Alex');
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(dot()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAccessibleDescription('1 thing to do');
    cleanup();
    grp.current = group(NONE);
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(dot()).toBeNull();
  });

  it('counts every kind of item, and Brittany alone is asked to approve ideas', async () => {
    seedCrew('Brittany');
    localStorage.setItem('tp:sugg', JSON.stringify([{ id: 's1', name: 'Alex', title: 'Tea tour', area: 'Colombo', note: '', status: 'pending', createdAt: 'x' }]));
    render(<App />);
    await screen.findByRole('tab', { name: 'Suggest' });
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAccessibleDescription('2 things to do');
    cleanup();
    seedCrew('Lazza');
    localStorage.setItem('tp:sugg', JSON.stringify([{ id: 's1', name: 'Alex', title: 'Tea tour', area: 'Colombo', note: '', status: 'pending', createdAt: 'x' }]));
    grp.current = group(NONE);
    render(<App />);
    await screen.findByRole('tab', { name: 'Suggest' });
    expect(dot()).toBeNull();
  });
});

describe('Open items page', () => {
  it('lists what is waiting and a row opens the Group knockouts view', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Open items' }));
    expect(await screen.findByRole('heading', { name: 'Open items' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Vote on 2 head-to-heads/ }));
    expect(await screen.findByRole('tab', { name: 'Group', selected: true })).toBeInTheDocument();
    expect((await knockoutCards()).length).toBe(2);
    expect(screen.queryByRole('heading', { name: 'Open items' })).toBeNull();
  });

  it('says so when there is nothing to do', async () => {
    seedCrew('Alex');
    grp.current = group(NONE);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Open items' }));
    expect(await screen.findByText('Nothing to do. Enjoy the planning.')).toBeInTheDocument();
  });

  it('is not offered before the tabs exist (while rating)', async () => {
    window.location.hash = '#/guest';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Aunty' }));
    openMenu();
    expect(screen.queryByRole('button', { name: 'Open items' })).toBeNull();
    expect(dot()).toBeNull();
  });
});

describe('Tab badges', () => {
  it('Group carries the votes owed, hidden from the tab name and read as a description', async () => {
    seedCrew('Brittany');
    render(<App />);
    const tab = await screen.findByRole('tab', { name: 'Group' });
    expect(tab.querySelector('.badge-count')).toHaveTextContent('2');
    expect(tab).toHaveAccessibleDescription('2 to do');
    expect(within(screen.getByRole('tablist')).queryAllByText(/^\d+\+?$/)).toHaveLength(1);
  });

  it('no badge at zero, and Picks and Suggest only carry their own counts', async () => {
    seedCrew('Alex');
    grp.current = group(NONE);
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(document.querySelectorAll('.badge-count')).toHaveLength(0);
  });
});

describe('My trip banner', () => {
  it('says Democracy needs you with the count, and its button lands on the knockouts', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Democracy needs you' })).toBeInTheDocument();
    expect(screen.getByText('You have 2 votes to cast.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vote now (2)' }));
    expect(await screen.findByRole('tab', { name: 'Group', selected: true })).toBeInTheDocument();
    expect((await knockoutCards()).length).toBe(2);
  });

  it('is absent when nothing is owed', async () => {
    seedCrew('Alex');
    grp.current = group(NONE);
    render(<App />);
    await screen.findByRole('region', { name: 'My trip' });
    expect(screen.queryByRole('heading', { name: 'Democracy needs you' })).toBeNull();
  });
});

describe('Group awards reveal', () => {
  const reveal = () => screen.queryByRole('dialog', { name: 'The group awards' });

  it('shows once when the plan is locked, not again after it is closed, and again when the result changes', async () => {
    seedCrew('Lazza');
    grp.current = group({ ...NONE, locked: true, finalized: [...PEOPLE] });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('dialog', { name: 'The group awards' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(reveal()).toBeNull();
    expect(localStorage.getItem('tp:awards-seen')).toBeTruthy();

    cleanup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(reveal()).toBeNull();

    cleanup();
    seedCrew('Lazza', 'Saulie');
    render(<App />);
    expect(await screen.findByRole('dialog', { name: 'The group awards' })).toBeInTheDocument();
  });

  it('is not shown before the plan is locked, and the Menu offers Awards only once locked', async () => {
    seedCrew('Lazza');
    grp.current = group(NONE);
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(reveal()).toBeNull();
    openMenu();
    expect(screen.queryByRole('button', { name: 'Awards' })).toBeNull();
  });

  it('can be reopened from the Menu after it has been seen', async () => {
    seedCrew('Lazza');
    grp.current = group({ ...NONE, locked: true, finalized: [...PEOPLE] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Awards' }));
    expect(await screen.findByRole('dialog', { name: 'The group awards' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(reveal()).toBeNull());
  });
});
