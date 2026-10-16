import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRanking, PEOPLE, type GroupResult, type Person, type Response } from '../types';
import App from '../App';

const cat = vi.hoisted(() => ({ items: [] as unknown[] }));
const copy = vi.hoisted(() => ({
  welcome: 'Welcome', guestWelcome: 'Pick your guest character', guestWelcomeSub: 'Try it.',
  quips: { name: {} as Record<string, string>, days: {} as Record<string, string>, pace: {} as Record<string, string>, tier: {} as Record<string, string> },
  items: {} as Record<string, { take?: string; review?: string; reviewUrl?: string }>,
}));
vi.mock('../data/catalogue.json', () => ({ default: cat }));
vi.mock('../content/copy.json', () => ({ default: copy }));
const grp: GroupResult = { open: true, days: 9, pace: 1, base: null, final: null, extras: [], knocked: [], finalized: [], locked: false, results: [], knockouts: [] } as unknown as GroupResult;
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp, loading: false }) }));

const LINE = "Example picks for the demo, not the real group's.";
const mk = (id: string, name: string, area: string) => ({
  id, name, area, about: `About ${name}`, hours: 3, slot: 'morning', fee: 'free', sideTrip: 0, photo: id, when: 'morning', credit: `Credit ${id}`,
});
const submitted = (name: Person): Response => ({ name, days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: true, updatedAt: '2026-10-14T00:00:00Z' });

// Quiz marked done for the person under test, so this exercises what it did before the stayQuiz to-do existed.
// Changed deliberately (Brittany 2026-10-16): Bingo is now a to-do, so a person with nothing to do also has one card.
const quizDone = (name: string) => localStorage.setItem(`tp:stays:${name}`, JSON.stringify({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [{ id: 'b1', title: 't', squares: Array.from({ length: 9 }, () => ({ text: 's', ticked: false })), createdAt: '' }], updatedAt: '2026-10-14T00:00:00Z' }));
beforeEach(() => { localStorage.clear(); window.location.hash = ''; cat.items = [mk('a', 'Alpha Rock', 'Cultural Triangle'), mk('b', 'Beta Falls', 'Cultural Triangle'), mk('c', 'Gamma Beach', 'South coast')]; });
afterEach(() => { cleanup(); window.location.hash = ''; });

describe('demo label on the Group hub and Everyone', () => {
  it('a guest sees the line on the hub and on Everyone\'s picks', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/guest';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Choose your character' }));
    await user.click(await screen.findByRole('button', { name: 'Aunty' }));
    await user.click(await screen.findByRole('button', { name: /^9 days/ }));
    await user.click(await screen.findByRole('button', { name: /^Balanced/ }));
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Must' }));
    await user.click(await screen.findByRole('button', { name: 'Done, submit' }));
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    expect(await screen.findByText(LINE)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Everyone's picks/ }));
    expect(await screen.findByText(LINE)).toBeInTheDocument();
  });

  it('a trip member sees it on neither', async () => {
    const user = userEvent.setup();
    for (const p of PEOPLE) localStorage.setItem(`tp:resp:${p}`, JSON.stringify(submitted(p)));
    localStorage.setItem('tp:me', 'Alex');
    quizDone('Alex');
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Group' }));
    await screen.findByRole('button', { name: /Everyone's picks/ });
    expect(screen.queryByText(LINE)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Everyone's picks/ }));
    await screen.findByRole('table');
    expect(screen.queryByText(LINE)).toBeNull();
  });
});
