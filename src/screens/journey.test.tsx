import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import legsData from '../data/legs.json';
import type { CrewStays, Hub, Leg, Person, Plan } from '../types';
import { GUESTS, PEOPLE } from '../types';

let crewNow: Partial<Record<Person, CrewStays>> = {};
vi.mock('../state', async () => ({
  ...(await vi.importActual<object>('../state')),
  useApp: () => ({ state: { stays: { crew: crewNow } }, legs: legsData }),
}));

import { DayRows } from './MyTrip';

const legs = legsData as unknown as Leg[];
const journeyPref = (a: string) => [{ topic: 'journey' as const, picks: { [a]: 'happy' as const }, noPreference: false, skipped: false }];
const row = (name: Person, done: boolean, answer: string): CrewStays =>
  ({ name, prefs: journeyPref(answer), quizDone: done, locked: false, ranks: {}, bingo: [], updatedAt: '' });
type Seed = [Person, boolean, string][];
const seed = (answers: Seed) => { crewNow = Object.fromEntries(answers.map(([n, d, a]) => [n, row(n, d, a)])); };

const route: Hub[] = ['Colombo', 'Sigiriya', 'Kandy', 'Kitulgala', 'Nuwara Eliya', 'Ella'];
const plan: Plan = {
  route, areas: [], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: route.slice(1).map((to, i) => ({
    n: i + 1, area: null, spare: 0, rainSlack: false,
    entries: [{ kind: 'drive' as const, label: `Drive from ${route[i]} to ${to}`, hours: 0, from: route[i], to }],
  })),
};
// Hours for the route straight from the raw JSON: 4.33, 2.97, 2.33, 2.3, 1.92.
const hoursOf = (a: string, b: string) => (legsData as { a: string; b: string; hours: number }[]).find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))!.hours;
const notes = (c: HTMLElement) => [...c.querySelectorAll('.jf-note')].map(n => n.textContent);

beforeEach(() => { crewNow = {}; });

describe('journey notes on group trip days', () => {
  const five: Seed = [['Brittany', true, 'under2h'], ['Alex', true, 'under2h'], ['Antek', true, '2to3h'], ['Lazza', true, '3to4h'], ['Saulie', true, 'bigday']];

  it('flags exactly the legs over a limit, counts matching a hand count from legs.json', () => {
    seed(five);
    const { container } = render(<DayRows plan={plan} legs={legs} />);
    const caps: Record<string, number> = { under2h: 2, '2to3h': 3, '3to4h': 4 };
    const expected = route.slice(1).filter((to, i) => five.some(([, , a]) => (caps[a] ?? Infinity) < hoursOf(route[i], to))).length;
    expect(expected).toBe(4);
    // Changed deliberately (found by an independent recount, 2026-10-16): the note counts everyone over their own limit.
    // The expectation is computed here from the raw hours and the five limits, not from the component.
    const want = route.slice(1).map((to, i) => five.filter(([, , a]) => (caps[a] ?? Infinity) < hoursOf(route[i], to)).length).filter(n => n > 0)
      .map(n => `${n} ${n === 1 ? 'person prefers' : 'people prefer'} a shorter drive`);
    expect(want).toEqual(['4 people prefer a shorter drive', '2 people prefer a shorter drive', '2 people prefer a shorter drive', '2 people prefer a shorter drive']);
    expect(notes(container)).toEqual(want);
    expect(notes(container)).toHaveLength(expected);
    expect(container.querySelectorAll('.jf-note svg')).toHaveLength(0);
  });

  it('is absent under 3 finished quizzes', () => {
    seed([['Brittany', true, 'under2h'], ['Alex', true, 'under2h'], ['Antek', false, 'under2h']]);
    const { container } = render(<DayRows plan={plan} legs={legs} />);
    expect(notes(container)).toEqual([]);
  });

  it('is shown at exactly 3 finished', () => {
    seed([['Brittany', true, 'under2h'], ['Alex', true, 'under2h'], ['Antek', true, 'under2h']]);
    const { container } = render(<DayRows plan={plan} legs={legs} />);
    expect(notes(container)).toHaveLength(4);
    expect(notes(container)[0]).toBe('3 people prefer a shorter drive');
  });

  it('can be switched off for My trip', () => {
    seed(five);
    const { container } = render(<DayRows plan={plan} legs={legs} journey={false} />);
    expect(notes(container)).toEqual([]);
  });

  it('never names anyone', () => {
    seed(five);
    const { container } = render(<DayRows plan={plan} legs={legs} />);
    for (const n of [...PEOPLE, ...GUESTS]) expect(notes(container).join(' '), n).not.toContain(n);
  });
});
