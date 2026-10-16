import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrewStays, Person, PrefAnswer, PrefStance, PrefTopic } from '../types';
import { GUESTS, PEOPLE } from '../types';

let crewNow: Partial<Record<Person, CrewStays>> = {};
vi.mock('../state', async () => ({
  ...(await vi.importActual<object>('../state')),
  useApp: () => ({ state: { stays: { crew: crewNow, suggestions: [], admin: { pins: [], scouts: {} } } } }),
}));

import GroupAnswers from './GroupAnswers';

const pref = (topic: PrefTopic, picks: Record<string, PrefStance>): PrefAnswer => ({ topic, picks, noPreference: false, skipped: false });
const row = (name: Person, done: boolean, prefs: PrefAnswer[] = []): CrewStays =>
  ({ name, prefs, quizDone: done, locked: false, ranks: {}, bingo: [], updatedAt: '' });

// Hand-written answers, counted by eye below.
const answers: Record<Person, PrefAnswer[]> = {
  Brittany: [pref('stayType', { hostel: 'happy', hotel: 'happy' }), pref('rooms', { dorm: 'noway' }), pref('budget', { '30to60': 'happy' }), pref('nos', { dorm: 'noway' })],
  Alex: [pref('stayType', { hostel: 'happy', villa: 'noway' }), pref('rooms', { dorm: 'happy', private: 'happy' }), pref('budget', { '30to60': 'happy' })],
  Antek: [pref('stayType', { hostel: 'noway' }), pref('rooms', { private: 'happy' }), pref('budget', { under30: 'happy' }), pref('nos', { dorm: 'noway', noac: 'noway' })],
  Lazza: [pref('stayType', { hotel: 'happy' })],
  Saulie: [],
};
const seed = (done: Person[]) => {
  crewNow = Object.fromEntries(PEOPLE.map(p => [p, row(p, done.includes(p), answers[p])]));
};
const open = (c: HTMLElement) => { (c.querySelector('details') as HTMLDetailsElement).open = true; };

beforeEach(() => { crewNow = {}; });

describe('Group answers row', () => {
  it('is hidden under 3 finished quizzes and shown at 3', () => {
    seed(['Brittany', 'Alex']);
    const a = render(<GroupAnswers />);
    expect(a.container.querySelector('.ga-row')).toBeNull();
    a.unmount();
    seed(['Brittany', 'Alex', 'Antek']);
    const b = render(<GroupAnswers />);
    expect(b.container.querySelector('.ga-row')).not.toBeNull();
    expect(screen.getByText('3 of 5 done')).toBeInTheDocument();
  });

  it('ignores unfinished rows and guests when counting', () => {
    seed(['Brittany', 'Alex', 'Antek']);
    crewNow = { ...crewNow, Lazza: row('Lazza', false, answers.Lazza), Tuktuk: row('Tuktuk' as Person, true, answers.Lazza) } as typeof crewNow;
    const { container } = render(<GroupAnswers />);
    open(container);
    expect(screen.getByText('3 of 5 done')).toBeInTheDocument();
    expect(container.textContent).toContain('Hotel: 1 happy, 0 no way');
  });

  it('shows counts that match a hand count of the three finished answers', () => {
    seed(['Brittany', 'Alex', 'Antek']);
    const { container } = render(<GroupAnswers />);
    open(container);
    const text = container.textContent ?? '';
    for (const line of [
      'Hostel dorm: 2 happy, 1 no way', // Brittany, Alex happy; Antek no way
      'Hotel: 1 happy, 0 no way', // Brittany
      'Villa: 0 happy, 1 no way', // Alex
      'Dorm bunk: 1 happy, 1 no way', // Alex happy; Brittany no way
      'Own room: 2 happy, 0 no way', // Alex, Antek
      'Under 30: 1', // Antek
      '30 to 60: 2', // Brittany, Alex
      'Dorm beds: 2', // Brittany, Antek
      'No air con: 1', // Antek
    ]) expect(text, line).toContain(line);
    expect(text).not.toContain('Guesthouse');
  });

  it('never prints a name', () => {
    seed(['Brittany', 'Alex', 'Antek']);
    const { container } = render(<GroupAnswers />);
    open(container);
    for (const n of [...PEOPLE, ...GUESTS]) expect(container.innerHTML, n).not.toContain(n);
  });
});
