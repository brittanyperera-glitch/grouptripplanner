import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { openMenu } from './__fixtures__/menu';
import { seenWalkToday, quizDone, mkItem as mk } from './__fixtures__/seed';
// These tests exercise the tabs, not the once-a-day welcome-back walkthrough (it has its own tests), so it counts as seen today.

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
// One person rates a place Keen, so the "most enthusiastic" award has a single winner.
// Quiz marked done for the person under test, so this exercises what it did before the stayQuiz to-do existed.
// Changed deliberately (Brittany 2026-10-16): Bingo is now a to-do, so a person with nothing to do also has one card.
const seedCrew = (me: Person, keener: Person = 'Alex') => {
  for (const p of PEOPLE) seed(row(p, p === keener ? { ranking: { ...emptyRanking(), must: [['b'], ['c']], keen: [['a']] } } : {}));
  localStorage.setItem('tp:me', me);
  quizDone(me);
};

beforeEach(() => { localStorage.clear(); seenWalkToday(); window.location.hash = ''; cat.items = THREE; grp.current = group(); });
afterEach(() => { cleanup(); window.location.hash = ''; });


// Changed deliberately (Brittany 2026-10-16): the empty page now has the big "All done." headline instead of the "Open items" one,
// so the page is found by its region label, which both states carry.
const itemsPage = () => screen.queryByRole('region', { name: 'Open items' });
const quizPage = () => screen.queryByText('1 of 6');
const bingoPage = () => screen.queryByRole('button', { name: /New card/ });
const awardsPage = () => screen.queryByRole('dialog', { name: 'The group awards' });
const MARKERS = { items: itemsPage, quiz: quizPage, bingo: bingoPage, awards: awardsPage };
const visible = () => Object.entries(MARKERS).filter(([, f]) => f()).map(([k]) => k);
const back = async () => { act(() => { history.back(); }); await new Promise(r => setTimeout(r, 30)); };

describe('one overlay at a time', () => {
  it('phone Back from Open items closes it and shows the tab under it, then the tab before', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    openMenu();
    await user.click(await screen.findByRole('button', { name: /^Open items/ }));  // Changed deliberately (Brittany 2026-10-16): the Menu entry now carries the count.
    expect(await screen.findByRole('heading', { name: 'Open items' })).toBeInTheDocument();
    await back();
    await waitFor(() => expect(itemsPage()).toBeNull());
    expect(screen.getByRole('tab', { name: 'Group', selected: true })).toBeInTheDocument();
    await back();
    expect(await screen.findByRole('tab', { name: 'My trip', selected: true })).toBeInTheDocument();
  });

  it('Back from Open items works on a fresh load with no earlier tab switch', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: /^Open items/ }));  // Changed deliberately (Brittany 2026-10-16): the Menu entry now carries the count.
    await screen.findByRole('heading', { name: 'Open items' });
    await back();
    await waitFor(() => expect(itemsPage()).toBeNull());
    expect(screen.getByRole('tab', { name: 'My trip', selected: true })).toBeInTheDocument();
  });

  it('going to another tab from Open items closes it', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: /^Open items/ }));  // Changed deliberately (Brittany 2026-10-16): the Menu entry now carries the count.
    await screen.findByRole('heading', { name: 'Open items' });
    openMenu();
    await user.click(screen.getByRole('button', { name: 'My profile' }));
    expect(await screen.findByRole('tab', { name: 'Profile', selected: true })).toBeInTheDocument();
    expect(itemsPage()).toBeNull();
    // The overlay's history entry was replaced, not left behind: one Back reaches My trip.
    await back();
    expect(await screen.findByRole('tab', { name: 'My trip', selected: true })).toBeInTheDocument();
  });

  it('swapping one overlay for another and closing leaves no stray history entry', async () => {
    seedCrew('Lazza');
    grp.current = group({ ...NONE, locked: true, finalized: [...PEOPLE] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('tab', { name: 'Group' }));
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Open items' }));
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Awards' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(visible()).toEqual([]));
    await back();
    expect(await screen.findByRole('tab', { name: 'My trip', selected: true })).toBeInTheDocument();
  });

  it('never shows two overlays together, whichever is opened after whichever', async () => {
    seedCrew('Lazza');
    grp.current = group({ ...NONE, locked: true, finalized: [...PEOPLE] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    const open = {
      items: async () => { openMenu(); await user.click(await screen.findByRole('button', { name: 'Open items' })); },
      awards: async () => { openMenu(); await user.click(await screen.findByRole('button', { name: 'Awards' })); },
      quiz: async () => { openMenu(); await user.click(await screen.findByRole('button', { name: 'My profile' })); await user.click(await screen.findByRole('button', { name: 'Retake' })); },
      bingo: async () => { openMenu(); await user.click(await screen.findByRole('button', { name: 'My profile' })); await user.click(await screen.findByRole('button', { name: 'Travel Bingo' })); },
    };
    const names = Object.keys(open) as (keyof typeof open)[];
    for (const a of names) for (const b of names) {
      await open[a]();
      await waitFor(() => expect(visible()).toEqual([a]));
      await open[b]();
      await waitFor(() => expect(visible(), `${a} then ${b}`).toEqual([b]));
      // Back out of whatever is open before the next pair.
      await back();
      await waitFor(() => expect(visible()).toEqual([]));
      while (!screen.queryByRole('tab', { name: 'My trip', selected: true })) await back();
    }
  });
});

describe('Travel Bingo from My profile', () => {
  it('opens from the profile card and Back returns to the profile', async () => {
    seedCrew('Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'My profile' }));
    await user.click(await screen.findByRole('button', { name: 'Travel Bingo' }));
    expect(await screen.findByRole('button', { name: /New card/ })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(bingoPage()).toBeNull();
    expect(await screen.findByRole('tab', { name: 'Profile', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Travel Bingo' })).toBeInTheDocument();
  });

  it('is on the card view only', async () => {
    seedCrew('Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'My profile' }));
    await user.click(await screen.findByRole('button', { name: 'Character' }));
    expect(screen.queryByRole('button', { name: 'Travel Bingo' })).toBeNull();
  });
});
