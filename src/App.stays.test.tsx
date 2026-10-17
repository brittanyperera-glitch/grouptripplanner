import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { seenWalkToday, quizDone, mkItem as mk } from './__fixtures__/seed';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const grp = vi.hoisted(() => ({ current: null as unknown }));
const copy = vi.hoisted(() => ({
  welcome: '', guestWelcome: 'Pick your guest character', guestWelcomeSub: 'Try it',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, unknown>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));
vi.mock('./workers/usePlan', async orig => ({ ...(await orig<typeof import('./workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const plan: Plan = {
  route: ['AIR', 'Colombo', 'AIR'], areas: ['Colombo'], chosen: ['a'], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [{ n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'activity', label: 'Alpha Rock', hours: 1, itemId: 'a' }] }],
};
const group = (over: Partial<GroupResult>): GroupResult => ({
  open: true, days: 9, pace: 1, base: plan, final: null, extras: [], knocked: [], finalized: [], locked: false, results: [], knockouts: [], ...over,
});
const finalList = { ...emptyRanking(), must: [['a']] };
const seedCrew = (me: Person, withFinals: boolean) => {
  for (const p of PEOPLE) {
    const r: Response = { name: p, days: 9, flex: false, pace: 1, ranking: finalList, rated: ['a'], submitted: true, updatedAt: '2026-10-14T00:00:00Z', ...(withFinals ? { final: finalList } : {}) };
    localStorage.setItem(`tp:resp:${p}`, JSON.stringify(r));
  }
  localStorage.setItem('tp:me', me);
  quizDone(me);
};
const late = { forkId: 'ko:s:late', a: ['a'], b: ['a'], votes: { a: [], b: [] } };

beforeEach(() => { localStorage.clear(); seenWalkToday(); window.location.hash = ''; cat.items = [mk('a', 'Alpha Rock', 'Cultural Triangle')]; });
afterEach(() => { cleanup(); window.location.hash = ''; });

describe('the Stays tab follows the decided route', () => {
  it('is there once the route is locked', async () => {
    grp.current = group({ final: plan, locked: true });
    seedCrew('Alex', true);
    render(<App />);
    expect(await screen.findByRole('tab', { name: /^Stays/ })).toBeInTheDocument();
  });
  it('stays while a late item reopens the vote (final cleared, plan held, all five lists saved)', async () => {
    grp.current = group({ held: plan, knockouts: [late] });
    seedCrew('Alex', true);
    render(<App />);
    expect(await screen.findByRole('tab', { name: /^Stays/ })).toBeInTheDocument();
  });
  it('is not there while the lists are still being saved', async () => {
    grp.current = group({ final: plan, locked: false });
    seedCrew('Alex', false);
    render(<App />);
    await screen.findByRole('tab', { name: /^Group/ });
    expect(screen.queryByRole('tab', { name: /^Stays/ })).toBeNull();
  });
});
