import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sideQuests } from '../lib/sideQuests';
import { AppProvider } from '../state';
import { emptyRanking } from '../types';
import type { Day, Plan, Response } from '../types';
import { DayRows } from './MyTrip';
import { Reveal } from './Reveal';

const drive = { kind: 'drive' as const, label: 'Drive', hours: 2 };
const day = (n: number, area: Day['area'], o: Partial<Day> = {}): Day => ({ n, area, entries: [drive], spare: 0, rainSlack: false, ...o });
const plan: Plan = {
  route: ['AIR', 'Colombo', 'Kandy', 'Nuwara Eliya', 'AIR'], areas: ['Colombo', 'Kandy and Knuckles', 'Hill country'], chosen: [], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [day(1, 'Colombo'), day(2, 'Kandy and Knuckles'), day(3, 'Hill country', { entries: [{ kind: 'free', label: 'Free day', hours: 0 }], spare: 5 }), day(4, 'Hill country'), day(5, 'Colombo')],
};
const lazza = (): Response => {
  const ranking = emptyRanking(); ranking.keen = [['tea']];
  return { name: 'Lazza', days: 9, flex: false, pace: 1, ranking, rated: ['tea'], submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
};
const LINE = 'Day 3, Hill country: free morning for Damro Labookellie tea estate (1.5 h)';
const mount = async (ui: ReactElement) => { render(ui); await act(async () => { await Promise.resolve(); }); await act(async () => { await Promise.resolve(); }); };

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe('side quests in the group reveal', () => {
  it('shows one collapsed line for the viewer, expands to a line each, and a safety line', async () => {
    localStorage.setItem('tp:me', 'Lazza'); localStorage.setItem('tp:resp:Lazza', JSON.stringify(lazza()));
    await mount(<AppProvider><Reveal plan={plan} onClose={() => {}} /></AppProvider>);
    const summary = screen.getByText('1 optional side quest for you');
    const box = summary.closest('details')!;
    expect(box.open).toBe(false);
    fireEvent.click(summary);
    expect(box.open).toBe(true);
    expect(within(box).getByText(LINE)).toBeInTheDocument();
    expect(within(box).getByText('Optional. Go with a friend if you can.')).toBeInTheDocument();
  });
  it('shows nothing when the viewer has no side quest', async () => {
    localStorage.setItem('tp:me', 'Alex');
    await mount(<AppProvider><Reveal plan={plan} onClose={() => {}} /></AppProvider>);
    expect(screen.queryByText(/optional side quest/)).toBeNull();
    expect(screen.queryByText(/Go with a friend/)).toBeNull();
  });
  it('shows none in someone\'s own trip reveal', async () => {
    localStorage.setItem('tp:me', 'Lazza'); localStorage.setItem('tp:resp:Lazza', JSON.stringify(lazza()));
    await mount(<AppProvider><Reveal plan={plan} who="Lazza" onClose={() => {}} /></AppProvider>);
    expect(screen.queryByText(/optional side quest/)).toBeNull();
  });
});

describe('side quests on the Group trip day list', () => {
  const quests = () => {
    const tea = { id: 'tea', name: 'Damro Labookellie tea estate', area: 'Hill country', hours: 1.5, sideTrip: 1.06, slot: 'any' } as never;
    const state = { responses: { Lazza: lazza() }, suggestions: [], votes: [] };
    return sideQuests(plan, 'Lazza', state, [tea]);
  };
  it('puts the quest under its own day only', () => {
    render(<DayRows plan={plan} quests={quests()} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    rows.forEach((r, i) => {
      const hit = within(r).queryByText('Side quest: free morning for Damro Labookellie tea estate (1.5 h)');
      if (i === 2) expect(hit).toBeInTheDocument(); else expect(hit).toBeNull();
    });
    expect(screen.getAllByText(/Side quest:/)).toHaveLength(1);
  });
  it('shows no side quest text without quests', () => {
    render(<DayRows plan={plan} />);
    expect(screen.queryByText(/Side quest/)).toBeNull();
  });
});
