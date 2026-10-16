import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { openMenu } from './__fixtures__/menu';
import { seenWalkToday, quizDone } from './__fixtures__/seed';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const grp = vi.hoisted(() => ({ current: null as unknown }));
const copy = vi.hoisted(() => ({
  welcome: '', guestWelcome: '', guestWelcomeSub: '',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, unknown>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));
vi.mock('./workers/usePlan', async orig => ({ ...(await orig<typeof import('./workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const mk = (id: string, name: string) => ({ id, name, area: 'Cultural Triangle', about: name, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: id });
const plan: Plan = {
  route: ['AIR', 'Colombo', 'AIR'], areas: ['Colombo'], chosen: ['a', 'b', 'c'], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [{ n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'activity', label: 'Alpha', hours: 1, itemId: 'a' }] }],
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
// Changed deliberately (Brittany 2026-10-16): Bingo is now a to-do, so a person with nothing to do also has one card.
const seedCrew = (me: Person, lacking?: Person) => {
  for (const p of PEOPLE) seed(row(p, p === lacking ? { submitted: false } : {}));
  localStorage.setItem('tp:me', me);
  quizDone(me);
};
const tabNames = () => screen.getAllByRole('tab').map(t => t.querySelector(':scope > span:not([class])')?.textContent);
const open = () => group();
const waiting = () => group({ open: false, base: null, knockouts: [] });

beforeEach(() => {
  localStorage.clear(); seenWalkToday(); window.location.hash = '';
  cat.items = [mk('a', 'Alpha Rock'), mk('b', 'Beta Falls'), mk('c', 'Gamma Beach')];
  grp.current = open();
});
afterEach(() => { cleanup(); window.location.hash = ''; });

describe('C2a: no Menu dot, no duplicate banner', () => {
  it('never shows the red dot or a description on Menu, even with things to do', async () => {
    seedCrew('Brittany');
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    expect(document.querySelector('.oi-dot')).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).not.toHaveAttribute('aria-describedby');
  });

  it('the Open items entry carries the count, and has no count when there is nothing to do', async () => {
    seedCrew('Brittany');
    localStorage.setItem('tp:sugg', JSON.stringify([{ id: 's1', name: 'Alex', title: 'Tea tour', area: 'Colombo', note: '', status: 'pending', createdAt: 'x' }]));
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    openMenu();
    expect(screen.getByRole('button', { name: 'Open items (2)' })).toBeInTheDocument();
    cleanup();
    seedCrew('Alex');
    grp.current = group({ knockouts: [] });
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    openMenu();
    expect(screen.getByRole('button', { name: 'Open items' })).toBeInTheDocument();
  });

  it('My trip has no Democracy needs you banner, with or without votes owed', async () => {
    seedCrew('Brittany');
    render(<App />);
    await screen.findByRole('button', { name: 'Group trip' });
    expect(screen.queryByRole('heading', { name: 'Democracy needs you' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Vote now/ })).toBeNull();
  });
});

describe('C2b: Picks is gone once ratings are locked', () => {
  it('the bar has five tabs when locked and six before', async () => {
    seedCrew('Brittany');
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    expect(tabNames()).toEqual(['My trip', 'Group', 'Suggest', 'Guide', 'Profile']);
    cleanup();
    seedCrew('Brittany', 'Saulie');
    grp.current = waiting();
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    expect(tabNames()).toEqual(['My trip', 'Picks', 'Group', 'Suggest', 'Guide', 'Profile']);
  });

  it('someone on Picks when the last person submits is shown Group, with no Picks tab', async () => {
    seedCrew('Brittany', 'Saulie');
    grp.current = waiting();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Picks' }));
    expect(await screen.findByRole('tabpanel', { name: 'Picks' })).toBeInTheDocument();
    grp.current = open();
    seed(row('Saulie'));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tp:resp:Saulie' })); });
    expect(await screen.findByRole('tab', { name: 'Group', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Picks' })).toBeNull();
    expect(screen.queryByRole('tabpanel', { name: 'Picks' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ratings are locked' })).toBeNull();
  });

  it('an old Picks history entry lands on Group when locked', async () => {
    seedCrew('Brittany');
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: { tpTab: 'Picks' } })); });
    expect(await screen.findByRole('tab', { name: 'Group', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Picks' })).toBeNull();
  });

  it('no Picks badge once locked, because the rate item is not offered', async () => {
    seedCrew('Brittany');
    cat.items = [...cat.items, mk('d', 'Delta Cave')];
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    expect(screen.queryByRole('tab', { name: /Picks/ })).toBeNull();
  });
});

describe('C2c: My trip opens on the group plan once it is open', () => {
  const pressed = (n: string) => screen.getByRole('button', { name: n }).getAttribute('aria-pressed');

  it('opens on Group trip when all five have submitted, and on My trip before', async () => {
    seedCrew('Alex');
    render(<App />);
    expect(await screen.findByRole('region', { name: 'The trip' })).toBeInTheDocument();
    expect(pressed('Group trip')).toBe('true');
    expect(pressed('My trip')).toBe('false');
    cleanup();
    seedCrew('Alex', 'Saulie');
    grp.current = waiting();
    render(<App />);
    expect(await screen.findByRole('region', { name: 'My trip' })).toBeInTheDocument();
    expect(pressed('My trip')).toBe('true');
  });

  it('keeps a picked sub-view during the visit and resets to Group trip after leaving and coming back', async () => {
    seedCrew('Alex');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('region', { name: 'The trip' });
    await user.click(screen.getByRole('button', { name: 'My trip' }));
    expect(await screen.findByRole('region', { name: 'My trip' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Suggest/ }));
    await screen.findByRole('tabpanel', { name: 'Suggest' });
    await user.click(screen.getByRole('tab', { name: /^My trip/ }));
    expect(await screen.findByRole('region', { name: 'The trip' })).toBeInTheDocument();
    expect(pressed('Group trip')).toBe('true');
  });
});
