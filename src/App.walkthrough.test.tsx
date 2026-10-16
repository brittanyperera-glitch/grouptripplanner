import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { WALKTHROUGH_KEY, todayKey } from './lib/walkthrough';
import { quizDone, mkItem as mk } from './__fixtures__/seed';

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
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); };
const walk = () => screen.findByTestId('walkthrough');

beforeEach(() => { localStorage.clear(); window.location.hash = ''; cat.items = THREE; grp.current = group(); });
afterEach(() => { cleanup(); window.location.hash = ''; });

describe('welcome-back walkthrough', () => {
  it('replaces the tabs for a returning member with open items, greeting them by name', async () => {
    seedCrew('Alex');
    render(<App />);
    expect(await walk()).toHaveTextContent('Greetings, Alex. It seems you have some travel admin to do.');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('skip goes to the tabs, remembers today, and stays away on a same-day reopen', async () => {
    seedCrew('Alex');
    const user = userEvent.setup();
    render(<App />);
    await walk();
    await user.click(screen.getByRole('button', { name: "Skip, I'll do it later" }));
    await screen.findByRole('tab', { name: 'Group' });
    expect(localStorage.getItem(WALKTHROUGH_KEY)).toBe(todayKey(new Date()));
    cleanup();
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(screen.queryByTestId('walkthrough')).toBeNull();
  });

  it('shows again when it was last seen yesterday', async () => {
    seedCrew('Alex');
    localStorage.setItem(WALKTHROUGH_KEY, yesterday());
    render(<App />);
    expect(await walk()).toBeInTheDocument();
  });

  it('does not show to a returning member with nothing to do', async () => {
    seedCrew('Alex');
    grp.current = group(NONE);
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(screen.queryByTestId('walkthrough')).toBeNull();
  });

  it('a returning member with nothing else to do but no quiz sees the travel profile line, and not once it is done', async () => {
    seedCrew('Alex');
    localStorage.removeItem('tp:stays:Alex'); // seedCrew marks the quiz done; this member has not done it.
    grp.current = group(NONE);
    const user = userEvent.setup();
    render(<App />);
    await walk();
    await user.click(screen.getByRole('button', { name: 'Next' })); // the greeting comes first, then one step per to-do.
    expect(await walk()).toHaveTextContent(/travel profile/i);
    cleanup();
    quizDone('Alex');
    render(<App />);
    await screen.findByRole('tab', { name: 'Group' });
    expect(screen.queryByTestId('walkthrough')).toBeNull();
  });

  it('never shows to a guest who finishes the sandbox flow', async () => {
    window.location.hash = '#/guest';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Aunty' }));
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Done, submit' }));
    await screen.findByRole('tab', { name: 'My trip' });
    expect(screen.queryByTestId('walkthrough')).toBeNull();
  });

  it('does not show to someone who submits during this session', async () => {
    localStorage.setItem('tp:me', 'Alex');
    for (const p of PEOPLE) if (p !== 'Alex') seed(row(p));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Done, submit' }));
    await screen.findByRole('tab', { name: 'Group' });
    await waitFor(() => expect(screen.queryByTestId('walkthrough')).toBeNull());
  });
});
