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
  Brittany: [pref('stayType', { hostel: 'happy', hotel: 'happy' }), pref('rooms', { dorm: 'noway' }), pref('budget', { '35to55': 'happy' }), pref('nos', { dorm: 'noway' })],
  Alex: [pref('stayType', { hostel: 'happy', villa: 'noway' }), pref('rooms', { dorm: 'happy', private: 'happy' }), pref('budget', { '35to55': 'happy' })],
  Antek: [pref('stayType', { hostel: 'noway' }), pref('rooms', { private: 'happy' }), pref('budget', { under10: 'happy' }), pref('nos', { dorm: 'noway', noac: 'noway' })],
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

  // Changed deliberately (Brittany 2026-10-16): budget bands now follow the researched prices (reports in ~/.claude/plans/review/budget-research.md and her own)
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
      'Under 10: 1', // Antek
      '35 to 55: 2', // Brittany, Alex
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

describe('Group answers budget bands', () => {
  it('counts each of the six bands and ignores old keys', () => {
    const b = (picks: Record<string, PrefStance>) => [pref('budget', picks)];
    const per: Record<string, PrefAnswer[]> = {
      Brittany: b({ '10to20': 'happy' }), Alex: b({ '10to20': 'happy' }), Antek: b({ '85plus': 'happy' }),
      Lazza: b({ '30to60': 'happy' }), Saulie: b({ '55to85': 'happy' }),
    };
    crewNow = Object.fromEntries(PEOPLE.map(p => [p, row(p, true, per[p])]));
    const { container } = render(<GroupAnswers />);
    open(container);
    const text = container.textContent ?? '';
    for (const line of ['10 to 20: 2', '55 to 85: 1', '85 plus: 1']) expect(text, line).toContain(line);
    for (const absent of ['Under 10:', '20 to 35:', '35 to 55:', '30 to 60', 'Under 30']) expect(text, absent).not.toContain(absent);
  });
});
