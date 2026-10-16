import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { LocalStore } from './store/local';
import { AppProvider } from './state';
import Bingo from './screens/Bingo';
import Suggest from './screens/Suggest';
import { seenWalkToday, quizDoneNoBingo as quizDone, mkItem as mk } from './__fixtures__/seed';
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
// The group result is fixed here so the test controls which knockouts are open; the guest's own votes still come from the real store.
vi.mock('./workers/usePlan', async orig => ({ ...(await orig<typeof import('./workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

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
const seedCrew = (me: Person, lacking?: Person) => {
  for (const p of PEOPLE) seed(row(p, p === lacking ? { submitted: false } : {}));
  localStorage.setItem('tp:me', me);
  quizDone(me);
};
const koBlock = () => Array.from(document.querySelectorAll<HTMLElement>('.gh-block')).find(b => /Group knockouts/.test(b.textContent ?? ''));

beforeEach(() => { localStorage.clear(); seenWalkToday(); window.location.hash = ''; cat.items = THREE; grp.current = group(); });
afterEach(() => { cleanup(); window.location.hash = ''; });


const li = (name: string) => screen.getByRole('listitem', { name: new RegExp(`^${name},`) });
const buttonsIn = (el: HTMLElement) => el.querySelectorAll('button').length;
const crewOf = () => document.querySelector('.bs-crew') as HTMLElement;

describe('big states: Waiting (Group tab before the group opens)', () => {
  it('shows the headline, a tick for who submitted and a clock for who has not, and at most one button', async () => {
    seedCrew('Alex', 'Saulie');
    grp.current = group({ open: false, base: null, knockouts: [] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    const region = await screen.findByRole('region', { name: 'Waiting for the group' });
    expect(within(region).getByRole('heading', { name: 'Waiting on the crew.' })).toBeInTheDocument();
    expect(li('Alex')).toHaveAttribute('data-done', 'true');
    expect(within(li('Alex')).getByRole('img', { name: 'Submitted' })).toBeInTheDocument();
    expect(li('Saulie')).toHaveAttribute('data-done', 'false');
    expect(within(li('Saulie')).getByRole('img', { name: 'not yet' })).toBeInTheDocument();
    expect(within(li('Saulie')).queryByRole('img', { name: 'Submitted' })).toBeNull();
    expect(buttonsIn(region.querySelector('.bs') as HTMLElement)).toBeLessThanOrEqual(1);
  });

  it('is gone once the group is open', async () => {
    seedCrew('Alex');
    grp.current = group();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    await screen.findByText('Group knockouts');
    expect(screen.queryByRole('heading', { name: 'Waiting on the crew.' })).toBeNull();
  });
});

describe('big states: Group trip before the plan opens', () => {
  it('keeps the toggle, shows a locked-plan headline with the crew strip, and one screen at a time', async () => {
    seedCrew('Alex', 'Saulie');
    grp.current = group({ open: false, base: null, knockouts: [] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'My trip' });
    expect(screen.queryByRole('heading', { name: 'The plan is locked.' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Group trip' }));
    const page = await screen.findByRole('region', { name: 'Group trip, not open yet' });
    expect(within(page).getByRole('heading', { name: 'The plan is locked.' })).toBeInTheDocument();
    expect(li('Alex')).toHaveAttribute('data-done', 'true');
    expect(within(li('Saulie')).getByRole('img', { name: 'still rating' })).toBeInTheDocument();
    expect(buttonsIn(page)).toBe(0);
    expect(screen.getByRole('button', { name: 'My trip' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'My trip' }));
    expect(screen.queryByRole('heading', { name: 'The plan is locked.' })).toBeNull();
  });
});

describe('big states: Knockouts once I have voted on everything', () => {
  const voted = () => group({
    knockouts: [
      { forkId: 'ko:1', a: ['a'], b: ['b'], votes: { a: ['Brittany', 'Alex'], b: [] } },
      { forkId: 'ko:2', a: ['c'], b: ['a'], votes: { a: [], b: ['Brittany', 'Alex'] } },
    ],
  });
  const openKnockouts = async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    await user.click(await waitFor(() => { const b = koBlock(); if (!b) throw new Error('no block'); return b; }));
  };

  it('shows the headline, who still owes votes, and the N more needed line', async () => {
    seedCrew('Brittany');
    grp.current = voted();
    await openKnockouts();
    expect(await screen.findByRole('heading', { name: 'Votes are in.' })).toBeInTheDocument();
    expect(screen.queryByText('Vote on these')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting on votes to move onto the next knockout (1 more needed).');
    expect(li('Brittany')).toHaveAttribute('data-done', 'true');
    expect(li('Alex')).toHaveAttribute('data-done', 'true');
    for (const p of ['Antek', 'Lazza', 'Saulie']) expect(li(p)).toHaveAttribute('data-done', 'false');
    expect(within(li('Antek')).getByRole('img', { name: 'still to vote' })).toBeInTheDocument();
    expect(buttonsIn(crewOf().closest('.bs') as HTMLElement)).toBe(0);
  });

  it('is absent while I still owe a vote', async () => {
    seedCrew('Brittany');
    grp.current = group();
    await openKnockouts();
    expect(await screen.findByText('Vote on these')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Votes are in.' })).toBeNull();
  });
});

describe('big states: Suggest and Bingo empty states', () => {
  const sug = (status: 'pending' | 'live') => localStorage.setItem('tp:sugg', JSON.stringify([{ id: 's1', name: 'Alex', title: 'Tea factory tour', area: 'Hill country', note: '', status, createdAt: '' }]));
  const mountSuggest = () => render(<AppProvider store={new LocalStore()}><Suggest open={false} /></AppProvider>);

  it('Suggest: a big invitation with the form still primary when there are no ideas', async () => {
    localStorage.setItem('tp:me', 'Brittany');
    mountSuggest();
    expect(await screen.findByRole('heading', { name: 'Got an idea?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest it' })).toBeInTheDocument();
    expect(screen.queryByText('Something missing?')).toBeNull();
    expect(buttonsIn(document.querySelector('.bs') as HTMLElement)).toBe(0);
  });

  it.each(['pending', 'live'] as const)('Suggest: no invitation once a %s idea exists', async status => {
    localStorage.setItem('tp:me', 'Brittany');
    sug(status);
    mountSuggest();
    await screen.findAllByText('Tea factory tour');
    expect(screen.queryByRole('heading', { name: 'Got an idea?' })).toBeNull();
    expect(screen.getByText('Something missing?')).toBeInTheDocument();
  });

  const mountBingo = () => render(<AppProvider store={new LocalStore()}><Bingo onBack={() => undefined} /></AppProvider>);
  it('Bingo: no cards shows the invitation with one example square and New card as the only button besides Back', async () => {
    localStorage.setItem('tp:me', 'Brittany');
    mountBingo();
    expect(await screen.findByRole('heading', { name: 'Make your first card.' })).toBeInTheDocument();
    expect(document.querySelectorAll('.bs-eg')).toHaveLength(1);
    expect(buttonsIn(document.querySelector('.bs') as HTMLElement)).toBe(0);
    expect(screen.getAllByRole('button', { name: /New card/ })).toHaveLength(1);
  });

  it('Bingo: not shown once a card exists', async () => {
    localStorage.setItem('tp:me', 'Brittany');
    localStorage.setItem('tp:stays:Brittany', JSON.stringify({ name: 'Brittany', prefs: [], quizDone: true, locked: false, ranks: {}, updatedAt: '2026-10-16T00:00:00Z',
      bingo: [{ id: 'c1', title: 'Wild guesses', createdAt: '2026-10-16T00:00:00Z', squares: Array.from({ length: 9 }, (_, i) => ({ text: `Guess ${i + 1}`, ticked: false })) }] }));
    mountBingo();
    await screen.findByText('Wild guesses');
    expect(screen.queryByRole('heading', { name: 'Make your first card.' })).toBeNull();
  });
});
