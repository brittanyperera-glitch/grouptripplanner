import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
// The group result is fixed here so the test controls which knockouts are open; the guest's own votes still come from the real store.
vi.mock('./workers/usePlan', async orig => ({ ...(await orig<typeof import('./workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const mk = (id: string, name: string, area: string, extra = {}) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: `Credit ${id}`, ...extra,
});
const THREE = [mk('a', 'Alpha Rock', 'Cultural Triangle', { book: 'Book a week ahead' }), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')];

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

const row = (name: Person, over: Partial<Response> = {}): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c']] }, rated: ['a', 'b', 'c'], submitted: true, updatedAt: '2026-10-14T00:00:00Z', ...over,
});
const seed = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
// Quiz marked done for the person under test, so this exercises what it did before the stayQuiz to-do existed.
const quizDone = (name: string) => localStorage.setItem(`tp:stays:${name}`, JSON.stringify({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' }));
const seedCrew = (me: Person, lacking?: Person) => {
  for (const p of PEOPLE) seed(row(p, p === lacking ? { submitted: false } : {}));
  localStorage.setItem('tp:me', me);
  quizDone(me);
};
const blocks = () => Array.from(document.querySelectorAll<HTMLElement>('.gh-block'));
const koBlock = () => blocks().find(b => /Group knockouts/.test(b.textContent ?? ''));

beforeEach(() => { localStorage.clear(); seenWalkToday(); window.location.hash = ''; cat.items = THREE; grp.current = group(); });
afterEach(() => { cleanup(); window.location.hash = ''; });

async function guestToTabs(user: ReturnType<typeof userEvent.setup>) {
  window.location.hash = '#/guest';
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
  await user.click(await screen.findByRole('button', { name: 'Aunty' }));
  await user.click(await screen.findByRole('button', { name: /^9 days/ }));
  await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
  for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Must' }));
  await user.click(await screen.findByRole('button', { name: 'Done, submit' }));
}

describe('Group tab as a hub', () => {
  it('a guest sees the knockouts and picks blocks, no stats block, and the knockouts block is alert until every fork is voted', async () => {
    const user = userEvent.setup();
    await guestToTabs(user);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    await waitFor(() => expect(blocks()).toHaveLength(2));
    expect(blocks().map(b => b.textContent)).toEqual([expect.stringContaining('Group knockouts'), expect.stringContaining("Everyone's picks")]);
    expect(koBlock()).toHaveClass('gh-alert');
    expect(koBlock()).toHaveTextContent('You have 2 to vote on');

    await user.click(koBlock()!);
    for (const g of await screen.findAllByRole('group', { name: /^Knockout:/ })) await user.click(within(g).getAllByRole('button', { name: /^Vote for/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(koBlock()).not.toHaveClass('gh-alert'));
    expect(koBlock()).not.toHaveTextContent(/to vote on/);
  });

  it('a trip member sees three blocks, each opening its view with a Back to the hub', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    await waitFor(() => expect(blocks()).toHaveLength(3));
    expect(blocks().map(b => b.textContent)).toEqual([expect.stringContaining('Group stats'), expect.stringContaining('Group knockouts'), expect.stringContaining("Everyone's picks")]);
    expect(koBlock()).toHaveClass('gh-alert');
    expect(koBlock()).toHaveTextContent('You have 2 to vote on');
    expect(koBlock()).toHaveTextContent('Still to vote: Alex, Antek, Lazza, Saulie');

    await user.click(blocks()[0]);
    expect(await screen.findByLabelText('Friendship stats')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(blocks()[2]);
    expect(await screen.findByLabelText('Everyone')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(blocks()).toHaveLength(3);
  });

  it('shows the Waiting screen, not the hub, until the group is open', async () => {
    seedCrew('Alex', 'Saulie');
    grp.current = group({ open: false, base: null, knockouts: [] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    expect(await screen.findByRole('region', { name: 'Waiting for the group' })).toBeInTheDocument();
    expect(blocks()).toHaveLength(0);
  });
});

describe('Menu Group stats', () => {
  it('a trip member gets Group stats in the Menu, which opens the stats view', async () => {
    seedCrew('Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Group stats' }));
    expect(await screen.findByLabelText('Friendship stats')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Group', selected: true })).toBeInTheDocument();
  });

  it('is not offered to a guest, nor before all five have submitted', async () => {
    const user = userEvent.setup();
    await guestToTabs(user);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    expect(screen.queryByRole('button', { name: 'Group stats' })).toBeNull();
    cleanup();
    localStorage.clear(); seenWalkToday();
    window.location.hash = '';
    seedCrew('Alex', 'Saulie');
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    openMenu();
    expect(screen.queryByRole('button', { name: 'Group stats' })).toBeNull();
  });
});

describe('My trip sub-tabs', () => {
  it('Group trip is disabled with a hint until all five have rated, and opens the group plan after', async () => {
    seedCrew('Alex', 'Saulie');
    grp.current = group({ open: false, base: null, knockouts: [] });
    const user = userEvent.setup();
    render(<App />);
    const groupTrip = await screen.findByRole('button', { name: 'Group trip' });
    expect(groupTrip).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Opens when all five have finished rating')).toBeInTheDocument();
    await user.click(groupTrip);
    expect(screen.queryByLabelText('The trip')).toBeNull();
    expect(screen.getByRole('button', { name: 'My trip' })).toHaveAttribute('aria-pressed', 'true');

    cleanup();
    seedCrew('Alex');
    grp.current = group();
    render(<App />);
    const open = await screen.findByRole('button', { name: 'Group trip' });
    expect(open).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('Opens when all five have finished rating')).toBeNull();
    await user.click(open);
    expect(await screen.findByRole('region', { name: 'The trip' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'My trip' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'My trip' }));
    expect(await screen.findByRole('region', { name: 'My trip' })).toBeInTheDocument();
  });

  it('My trip is the default sub-tab', async () => {
    seedCrew('Alex');
    render(<App />);
    expect(await screen.findByRole('region', { name: 'My trip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My trip' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Ratings locked on Picks', () => {
  it('a big block says so and one button goes straight to the knockouts, labelled with my open votes', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Picks' }));
    const go = await screen.findByRole('button', { name: 'Vote now (2)' });
    expect(screen.getByRole('heading', { name: 'Ratings are locked' })).toBeInTheDocument();
    await user.click(go);
    expect(await screen.findByRole('tab', { name: 'Group', selected: true })).toBeInTheDocument();
    expect((await screen.findAllByRole('group', { name: /^Knockout:/ })).length).toBe(2);
  });

  it('with nothing left to vote on the button says See the group stage', async () => {
    seedCrew('Alex');
    grp.current = group({ knockouts: [] });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Picks' }));
    expect(await screen.findByRole('button', { name: 'See the group stage' })).toBeInTheDocument();
  });
});

describe('guest exit', () => {
  it('Log out (guest) also clears the #/guest hash so a reload does not re-enter guest mode', async () => {
    const user = userEvent.setup();
    await guestToTabs(user);
    await screen.findByRole('tab', { name: 'Group' });
    expect(window.location.hash).toBe('#/guest');
    openMenu();
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    await screen.findByRole('heading', { name: 'The Homecoming' });
    expect(window.location.hash).toBe('');
  });
});

describe('Accommodation battles teaser', () => {
  it('shows on the Group hub only once the plan is locked', async () => {
    seedCrew('Brittany');
    grp.current = group({ knockouts: [], locked: true, final: plan, finalized: [...PEOPLE] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    expect(await screen.findByText('Accommodation battles')).toBeInTheDocument();
    // Changed deliberately (Brittany 2026-10-16): the teaser now says it is in dev.
    expect(screen.getByText('In dev. Opens once everyone has finished the knockouts.')).toBeInTheDocument();
  });
  it('is absent while the group stage is still open', async () => {
    seedCrew('Brittany');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    await waitFor(() => expect(koBlock()).toBeDefined());
    expect(screen.queryByText('Accommodation battles')).toBeNull();
  });
});
