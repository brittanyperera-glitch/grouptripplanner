import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Plan, type Response } from './types';
import App from './App';
import { seenWalkToday, mkItem as mk } from './__fixtures__/seed';
// These tests exercise the tabs, not the once-a-day welcome-back walkthrough (it has its own tests), so it counts as seen today.

// tripadmin.ts reads the bookable places once at import, so the first items must already carry the booking note for 'a'.
const cat = vi.hoisted(() => ({ items: [{ id: 'a', name: 'Alpha Rock', book: 'Book a week ahead' }] as unknown[] }));
const grp = vi.hoisted(() => ({ current: null as unknown }));
const copy = vi.hoisted(() => ({
  welcome: '', guestWelcome: '', guestWelcomeSub: '',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, unknown>,
}));
vi.mock('./data/catalogue.json', () => ({ default: cat }));
vi.mock('./content/copy.json', () => ({ default: copy }));
vi.mock('./workers/usePlan', async orig => ({ ...(await orig<typeof import('./workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const ITEMS = [
  mk('a', 'Alpha Rock', 'Cultural Triangle', { book: 'Book a week ahead', warn: 'Steep climb' }),
  mk('b', 'Beta Falls', 'Cultural Triangle', { book: 'Permit needed' }),
  mk('c', 'Gamma Beach', 'South coast', { warn: 'Strong currents' }),
  mk('d', 'Delta Fort', 'Hill country', { warn: 'Closed Mondays' }),
];
const plan: Plan = {
  route: ['AIR', 'Colombo', 'AIR'], areas: ['Colombo'], chosen: ['a', 'b', 'c', 'd'], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [
    { n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'activity', label: 'Alpha Rock', hours: 1, itemId: 'a' }] },
    { n: 2, area: null, spare: 0, rainSlack: false, entries: [{ kind: 'activity', label: 'Gamma Beach', hours: 1, itemId: 'c' }] },
  ],
};
const locked = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: plan, final: plan, extras: [], knocked: [], finalized: [...PEOPLE], locked: true, results: [], knockouts: [], ...over,
});
const row = (name: Person): Response => ({
  name, days: 9, flex: false, pace: 1, ranking: { ...emptyRanking(), must: [['a'], ['b'], ['c'], ['d']] }, rated: ['a', 'b', 'c', 'd'], submitted: true, updatedAt: '2026-10-14T00:00:00Z',
});

beforeEach(() => {
  localStorage.clear(); seenWalkToday(); window.location.hash = ''; cat.items = ITEMS; grp.current = locked();
  for (const p of PEOPLE) localStorage.setItem(`tp:resp:${p}`, JSON.stringify(row(p)));
  localStorage.setItem('tp:me', 'Alex');
});
afterEach(() => { cleanup(); window.location.hash = ''; });

async function openGroupTrip() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Group trip' }));
  return { user, trip: await screen.findByRole('region', { name: 'The trip' }) };
}

describe('Group trip puts the important parts first', () => {
  it('locked: the route reveal entry is the first thing after the title block', async () => {
    const { trip } = await openGroupTrip();
    const btn = within(trip).getByRole('button', { name: 'Play route reveal' });
    const status = trip.querySelector('.sub')!;
    expect(btn.closest('section[aria-label="Route reveal"]')!.previousElementSibling).toBe(status);
    expect(trip.querySelector('.map')!.compareDocumentPosition(btn)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
  });

  it('before the lock there is no reveal placeholder', async () => {
    grp.current = locked({ locked: false, finalized: ['Alex'] });
    await openGroupTrip();
    expect(screen.queryByLabelText('Route reveal')).toBeNull();
    expect(screen.queryByText(/route reveal drops once/)).toBeNull();
  });

  // Changed deliberately (Brittany 2026-10-17): the read-only "Before you go" card is replaced by the Trip admin page.
  it('Group trip has one Trip admin link, above the map, with a count', async () => {
    const { trip } = await openGroupTrip();
    const links = within(trip).getAllByRole('button', { name: /^Trip admin/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent(/\d+ to do|All done/);
    expect(trip.querySelector('.map')!.compareDocumentPosition(links[0])).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(trip.querySelector('details.gh-book')).toBeNull();
  });

  it('a tip sits on its day row and there is no pooled list', async () => {
    const { trip } = await openGroupTrip();
    const days = Array.from(trip.querySelectorAll<HTMLElement>('.day'));
    expect(days[0]).toHaveTextContent('Steep climb');
    expect(days[1]).toHaveTextContent('Strong currents');
    expect(days[0]).not.toHaveTextContent('Strong currents');
    expect(within(trip).queryByText('Good to know')).toBeNull();
  });

  // Changed deliberately (Brittany 2026-10-17): the personal checklist is gone, so before the route is set there is nothing to book and no link.
  it('before Group trip opens, My trip shows no Trip admin link', async () => {
    localStorage.setItem('tp:resp:Saulie', JSON.stringify({ ...row('Saulie'), submitted: false }));
    render(<App />);
    const region = await screen.findByRole('region', { name: 'My trip' });
    expect(within(region).queryByRole('button', { name: /^Trip admin/ })).toBeNull();
  });
  it('My trip has no book card once Group trip is open', async () => {
    render(<App />);
    // Changed deliberately (Brittany 2026-10-16): Group trip opens first now, so pick the My trip view.
    await userEvent.setup().click(await screen.findByRole('button', { name: 'My trip' }));
    const region = await screen.findByRole('region', { name: 'My trip' });
    expect(region.querySelector('details.gh-book')).toBeNull();
    expect(within(region).queryByText(/to book soon/)).toBeNull();
  });
});
