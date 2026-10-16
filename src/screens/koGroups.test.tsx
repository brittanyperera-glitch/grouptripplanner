import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult, Knockout, Vote } from '../types';
import Knockouts from './Knockouts';

// Real catalogue ids; the five forks open on live data on 2026-10-16.
const fork = (c: string, a: string[], b: string[], votes: Knockout['votes'] = { a: [], b: [] }): Knockout => ({ forkId: `ko:${c}`, a, b, votes });
const FORKS = () => [
  fork('scuba', ['scuba', 'hiriketiya'], ['pidurangala', 'train']),
  fork('horton', ['horton'], ['yala']),
  fork('polonnaruwa', ['polonnaruwa'], ['pidurangala']),
  fork('anuradhapura', ['anuradhapura', 'udawalawe'], ['galle', 'pettah', 'pidurangala', 'rafting']),
  fork('diyaluma', ['diyaluma', 'hiriketiya'], ['coconut', 'pidurangala']),
];
const group = (knockouts = FORKS()): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knocked: [], finalized: [], locked: false, knockouts,
} as unknown as GroupResult);

class RecordingStore extends LocalStore {
  written: Vote[] = [];
  vote(v: Vote): Promise<void> { this.written.push(v); return super.vote(v); }
}
const show = (g = group(), store = new RecordingStore()) => {
  render(<AppProvider store={store}><Knockouts group={g} /></AppProvider>);
  return store;
};
const card = () => screen.findByRole('group', { name: 'Knockout: swap Pidurangala sunrise' });

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });

describe('one card for the place that loses four times', () => {
  it('shows Pidurangala once with a row per option, its cost, and one Keep control; Horton keeps its own card', async () => {
    show();
    const c = await card();
    expect(within(c).getByText('Pidurangala sunrise can only go once. Swap it for:')).toBeInTheDocument();
    expect(within(c).getAllByRole('button', { name: /^Vote for / })).toHaveLength(4);
    expect(within(c).getAllByRole('button', { name: /^Keep / })).toHaveLength(1);
    expect(within(c).getByText('Also drops Nanu Oya to Ella train')).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: /^Knockout:/ })).toHaveLength(2);
    expect(screen.getByRole('group', { name: /Horton/ })).toBeInTheDocument();
  });
  it('a swap writes a single vote: a on that option own fork, nothing on the others', async () => {
    const store = show();
    await userEvent.setup().click(within(await card()).getByRole('button', { name: /^Vote for Diyaluma/ }));
    expect(store.written).toEqual([{ forkId: 'ko:diyaluma', name: 'Alex', choice: 'a' }]);
  });
  it('Keep writes b on every fork in the group and nowhere else', async () => {
    const store = show();
    await userEvent.setup().click(within(await card()).getByRole('button', { name: 'Keep Pidurangala sunrise' }));
    expect(store.written.map(v => [v.forkId, v.choice]).sort()).toEqual([
      ['ko:anuradhapura', 'b'], ['ko:diyaluma', 'b'], ['ko:polonnaruwa', 'b'], ['ko:scuba', 'b'],
    ]);
  });
  it('shows my pick on the row I chose, and not on Keep', async () => {
    localStorage.setItem('tp:votes', JSON.stringify([{ forkId: 'ko:diyaluma', name: 'Alex', choice: 'a' }, { forkId: 'ko:scuba', name: 'Alex', choice: 'b' }]));
    show();
    expect(await screen.findByText(/You picked/)).toHaveTextContent('You picked Diyaluma Falls upper pools, Hiriketiya beach and surf');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change' }));
    const c = await card();
    expect(within(c).getByRole('button', { name: /^Vote for Diyaluma/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(c).getByRole('button', { name: /^Vote for Polonnaruwa/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(c).getByRole('button', { name: 'Keep Pidurangala sunrise' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('a stored keep on all four folds to "Keep Pidurangala sunrise" and the card marks Keep as mine', async () => {
    localStorage.setItem('tp:votes', JSON.stringify(FORKS().filter(k => k.b.includes('pidurangala')).map(k => ({ forkId: k.forkId, name: 'Alex', choice: 'b' }))));
    show();
    expect(await screen.findByText(/You picked/)).toHaveTextContent('You picked Keep Pidurangala sunrise');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change' }));
    expect(within(await card()).getByRole('button', { name: 'Keep Pidurangala sunrise' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('names who swapped to each option, from the existing per-fork tallies', async () => {
    const fs = FORKS(); fs[4] = fork('diyaluma', fs[4].a, fs[4].b, { a: ['Saulie'], b: ['Brittany'] });
    show(group(fs));
    const lists = within(await card()).getAllByRole('list', { name: 'Voted for this' });
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveTextContent('Saulie');
  });
  it('a fork that shares nothing stays a normal head to head', async () => {
    show(group([FORKS()[1]]));
    expect(await screen.findAllByRole('button', { name: /^Vote for / })).toHaveLength(2);
    expect(screen.queryByText(/can only go once/)).toBeNull();
  });
  it('shows a photo block for the first place of each option', async () => {
    show();
    const c = await card();
    expect(c.querySelectorAll('.kg-thumb')).toHaveLength(4);
    expect(c.querySelectorAll('.kg-thumb')[0].closest('.kg-row')).toHaveTextContent('Hiriketiya');
  });
  it('Details opens the full page for that option own places, and its vote writes a on that fork only', async () => {
    const store = show();
    const user = userEvent.setup();
    await user.click(within(await card()).getByRole('button', { name: /^Details of Anuradhapura/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Anuradhapura sacred city', 'Udawalawe elephants and Transit Home']);
    await user.click(within(sheet).getByRole('button', { name: 'Vote for this' }));
    expect(store.written).toEqual([{ forkId: 'ko:anuradhapura', name: 'Alex', choice: 'a' }]);
  });
  it('tapping the title area opens the same page', async () => {
    show();
    const row = (await card()).querySelectorAll('.kg-row')[1];
    await userEvent.setup().click(row.querySelector('.kg-open')!);
    expect(within(await screen.findByRole('dialog')).getByRole('heading', { level: 3 })).toHaveTextContent('Polonnaruwa by bike');
  });
});
