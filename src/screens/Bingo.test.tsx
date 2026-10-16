import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { BingoCard, Person } from '../types';
import Bingo, { isFullHouse, lines } from './Bingo';

const card = (ticked: boolean[], over: Partial<BingoCard> = {}): BingoCard => ({
  id: 'c1', title: 'Wild guesses', createdAt: '2026-10-16T00:00:00Z',
  squares: ticked.map((t, i) => ({ text: `Guess ${i + 1}`, ticked: t })), ...over,
});
const seedBingo = (name: Person, bingo: BingoCard[]) =>
  localStorage.setItem(`tp:stays:${name}`, JSON.stringify({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo, updatedAt: '2026-10-16T00:00:00Z' }));
const stored = (name: Person): BingoCard[] => JSON.parse(localStorage.getItem(`tp:stays:${name}`) ?? '{}').bingo ?? [];
const mount = () => render(<AppProvider store={new LocalStore()}><Bingo onBack={() => undefined} /></AppProvider>);

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Brittany'); });
afterEach(() => cleanup());

// Independent expectation: walk the 3x3 by coordinates instead of the index table in the component.
function bruteLines(t: boolean[]): number {
  const at = (r: number, c: number) => t[r * 3 + c];
  let n = 0;
  for (let r = 0; r < 3; r++) if (at(r, 0) && at(r, 1) && at(r, 2)) n++;
  for (let c = 0; c < 3; c++) if (at(0, c) && at(1, c) && at(2, c)) n++;
  if (at(0, 0) && at(1, 1) && at(2, 2)) n++;
  if (at(0, 2) && at(1, 1) && at(2, 0)) n++;
  return n;
}

describe('lines and full house', () => {
  it('match a brute-force count over 100 seeded random tick sets', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let k = 0; k < 100; k++) {
      const p = rnd();
      const t = Array.from({ length: 9 }, () => rnd() < p);
      expect(lines(card(t)), t.join()).toBe(bruteLines(t));
      expect(isFullHouse(card(t))).toBe(t.every(Boolean));
    }
    expect(lines(card(Array(9).fill(true)))).toBe(8);
  });
});

describe('Travel Bingo screen', () => {
  it('creates a card with nine squares and persists it', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /new card/i }));
    await u.type(screen.getByLabelText('Card title'), 'Day one');
    for (let i = 1; i <= 9; i++) await u.type(screen.getByLabelText(`Square ${i}`), `Pred ${i}`);
    await u.click(screen.getByRole('button', { name: 'Save card' }));
    await screen.findByText('0 of 9 ticked');
    await waitFor(() => expect(stored('Brittany')).toHaveLength(1));
    const [c] = stored('Brittany');
    expect(c.title).toBe('Day one');
    expect(c.squares.map(s => s.text)).toEqual(Array.from({ length: 9 }, (_, i) => `Pred ${i + 1}`));
  });

  it('keeps Save disabled until the title and all nine squares have text', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /new card/i }));
    const save = screen.getByRole('button', { name: 'Save card' });
    expect(save).toBeDisabled();
    await u.type(screen.getByLabelText('Card title'), 'T');
    for (let i = 1; i <= 8; i++) await u.type(screen.getByLabelText(`Square ${i}`), 'x');
    expect(save).toBeDisabled();
    await u.type(screen.getByLabelText('Square 9'), 'x');
    expect(save).toBeEnabled();
  });

  it('shows the friend avatar for an about square, and none for General', async () => {
    const u = userEvent.setup();
    const { container } = mount();
    await u.click(await screen.findByRole('button', { name: /new card/i }));
    expect(container.querySelector('[data-person]')).toBeNull();
    await u.selectOptions(screen.getByLabelText('Square 2 about'), 'Alex');
    expect(container.querySelector('[data-person="Alex"]')).not.toBeNull();
    await u.type(screen.getByLabelText('Card title'), 'T');
    for (let i = 1; i <= 9; i++) await u.type(screen.getByLabelText(`Square ${i}`), `P${i}`);
    await u.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(stored('Brittany')[0]?.squares[1].about).toBe('Alex'));
    expect(stored('Brittany')[0].squares[0].about).toBeUndefined();
    await u.click(await screen.findByRole('button', { name: /Wild|T\b/ }));
    await waitFor(() => expect(container.querySelector('[data-person="Alex"]')).not.toBeNull());
  });

  it('ticks and unticks a square, and the tick survives a remount', async () => {
    seedBingo('Brittany', [card(Array(9).fill(false))]);
    const u = userEvent.setup();
    const first = mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    const sq = screen.getByRole('button', { name: 'Guess 1, not ticked' });
    await u.click(sq);
    expect(screen.getByRole('button', { name: 'Guess 1, ticked' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(stored('Brittany')[0].squares[0].ticked).toBe(true));
    first.unmount();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    expect(screen.getByRole('button', { name: 'Guess 1, ticked' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Guess 1, ticked' }));
    await waitFor(() => expect(stored('Brittany')[0].squares[0].ticked).toBe(false));
  });

  it('says Line! for a completed line and Full house for all nine', async () => {
    seedBingo('Brittany', [card([true, true, false, false, false, false, false, false, false])]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    expect(screen.queryByText('Line!')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Guess 3, not ticked' }));
    expect(await screen.findByText('Line!')).toBeInTheDocument();
    for (let i = 4; i <= 9; i++) await u.click(screen.getByRole('button', { name: `Guess ${i}, not ticked` }));
    expect(await screen.findByText('Full house')).toBeInTheDocument();
  });

  it('deletes a card by saving the array without it', async () => {
    seedBingo('Brittany', [card(Array(9).fill(false)), card(Array(9).fill(false), { id: 'c2', title: 'Second' })]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    await u.click(screen.getByRole('button', { name: 'Delete card' }));
    await u.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await screen.findByText('Second');
    expect(screen.queryByText('Wild guesses')).toBeNull();
    await waitFor(() => expect(stored('Brittany').map(c => c.id)).toEqual(['c2']));
  });

  it('shows only my own cards: Alex sees nothing of the ones in Brittany\'s row', async () => {
    localStorage.setItem('tp:me', 'Alex');
    seedBingo('Brittany', [card(Array(9).fill(false), { title: 'Brittany secret card' })]);
    seedBingo('Alex', [card(Array(9).fill(false), { id: 'a1', title: 'Alex own card' })]);
    const { container } = mount();
    await screen.findByText('Alex own card');
    expect(container.textContent).not.toMatch(/Brittany secret card|Guess 1/);
    expect(within(container).queryByText('Brittany secret card')).toBeNull();
  });

  it('shows the lock line', async () => {
    mount();
    // Changed deliberately (Brittany 2026-10-16): the old line claimed more than the data guarantees.
    expect(await screen.findByText('Your cards are only shown to you in the app.')).toBeInTheDocument();
  });
});
