import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      // Changed deliberately (Brittany 2026-10-17): an empty square never counts, so blanking one breaks any line through it.
      const blanked = card(t); blanked.squares[4] = { text: '', ticked: false };
      expect(lines(blanked)).toBe(bruteLines(t.map((v, k) => (k === 4 ? false : v))));
    }
    expect(lines(card(Array(9).fill(true)))).toBe(8);
  });
});

describe('Travel Bingo screen', () => {
  const blank = () => card(Array(9).fill(false), { id: 'e1', title: 'Blank', squares: Array.from({ length: 9 }, () => ({ text: '', ticked: false })) });
  const sheet = () => screen.getByRole('dialog');

  // Changed deliberately (Brittany 2026-10-17): the nine-input create form is gone; New card makes nine empty squares and opens the grid.
  it('New card makes nine empty squares, titled Card 1, and opens it', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /new card/i }));
    expect(await screen.findByRole('group', { name: 'Card 1' })).toBeInTheDocument();
    await waitFor(() => expect(stored('Brittany')).toHaveLength(1));
    const [c] = stored('Brittany');
    expect(c.title).toBe('Card 1');
    expect(c.squares).toHaveLength(9);
    expect(c.squares.every(s => s.text === '' && !s.ticked)).toBe(true);
    expect(screen.getAllByRole('button', { name: /^Add square/ })).toHaveLength(9);
  });

  // Changed deliberately (Brittany 2026-10-17): squares are written one at a time in a bottom sheet, not in a nine-box form.
  it('tapping an empty square opens the sheet, and Save writes the text to that square only', async () => {
    seedBingo('Brittany', [blank()]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Blank/ }));
    await u.click(screen.getByRole('button', { name: 'Add square 5' }));
    await u.type(within(sheet()).getByRole('textbox'), 'Monkey steals food');
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Brittany')[0].squares[4].text).toBe('Monkey steals food'));
    expect(stored('Brittany')[0].squares.filter(s => s.text)).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Monkey steals food, not ticked' })).toBeInTheDocument();
  });

  it('an empty square cannot be ticked and ticking never writes to it', async () => {
    seedBingo('Brittany', [blank()]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Blank/ }));
    expect(screen.queryAllByRole('button', { pressed: false })).toHaveLength(0);
    await u.click(screen.getByRole('button', { name: 'Add square 1' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await u.keyboard('{Escape}');
    expect(stored('Brittany')[0].squares.every(s => !s.ticked)).toBe(true);
  });

  it('ticks and unticks a filled square, and the tick survives a remount', async () => {
    seedBingo('Brittany', [card(Array(9).fill(false))]);
    const u = userEvent.setup();
    const first = mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    await u.click(screen.getByRole('button', { name: 'Guess 1, not ticked' }));
    expect(screen.getByRole('button', { name: 'Guess 1, ticked' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(stored('Brittany')[0].squares[0].ticked).toBe(true));
    first.unmount();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    expect(screen.getByRole('button', { name: 'Guess 1, ticked' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Guess 1, ticked' }));
    await waitFor(() => expect(stored('Brittany')[0].squares[0].ticked).toBe(false));
  });

  // Changed deliberately (Brittany 2026-10-17): the About choice is a row of friend pills in the sheet, not a select.
  it('the About friend persists and shows as an avatar on the square, none for General', async () => {
    seedBingo('Brittany', [blank()]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Blank/ }));
    await u.click(screen.getByRole('button', { name: 'Add square 2' }));
    await u.type(within(sheet()).getByRole('textbox'), 'Gets lost');
    await u.click(within(sheet()).getByRole('button', { name: /Alex/ }));
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Brittany')[0].squares[1].about).toBe('Alex'));
    const grid = screen.getByRole('group', { name: 'Blank' });
    expect(grid.querySelector('[data-person="Alex"]')).not.toBeNull();
    await u.click(screen.getByRole('button', { name: 'Add square 1' }));
    await u.type(within(sheet()).getByRole('textbox'), 'No friend');
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Brittany')[0].squares[0].text).toBe('No friend'));
    expect(stored('Brittany')[0].squares[0].about).toBeUndefined();
  });

  it('Cancel and Esc write nothing and return focus to the square', async () => {
    seedBingo('Brittany', [blank()]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Blank/ }));
    const sq = screen.getByRole('button', { name: 'Add square 3' });
    await u.click(sq);
    await u.type(within(sheet()).getByRole('textbox'), 'draft');
    await u.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sq).toHaveFocus();
    await u.click(sq);
    await u.type(within(sheet()).getByRole('textbox'), 'draft');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stored('Brittany')[0].squares.every(s => s.text === '')).toBe(true);
  });

  it('the pencil on a filled square edits it, and the rename sheet changes the title', async () => {
    seedBingo('Brittany', [card([true, ...Array(8).fill(false)])]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    await u.click(screen.getByRole('button', { name: 'Edit square 1' }));
    const box = within(sheet()).getByRole('textbox');
    await u.clear(box);
    await u.type(box, 'Changed guess');
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Brittany')[0].squares[0]).toMatchObject({ text: 'Changed guess', ticked: false }));
    await u.click(screen.getByRole('button', { name: 'Rename card' }));
    const t = within(sheet()).getByRole('textbox');
    await u.clear(t);
    await u.type(t, 'Renamed');
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Brittany')[0].title).toBe('Renamed'));
  });

  it('a written square can be cleared back to blank, and a blank one cannot be saved empty', async () => {
    seedBingo('Brittany', [card([true, ...Array(8).fill(false)], { squares: [{ text: 'Guess 1', ticked: true, about: 'Alex' }, ...Array.from({ length: 8 }, () => ({ text: '', ticked: false }))] })]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    await u.click(screen.getByRole('button', { name: 'Add square 2' }));
    expect(within(sheet()).getByRole('button', { name: 'Save' })).toBeDisabled();
    await u.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    await u.click(screen.getByRole('button', { name: 'Edit square 1' }));
    await u.clear(within(sheet()).getByRole('textbox'));
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored('Brittany')[0].squares[0]).toEqual({ text: '', ticked: false }));
  });

  it('the list shows how many are written and ticked', async () => {
    seedBingo('Brittany', [card([true, false, false, false, false, false, false, false, false], { squares: [{ text: 'a', ticked: true }, { text: 'b', ticked: false }, ...Array.from({ length: 7 }, () => ({ text: '', ticked: false }))] })]);
    mount();
    expect(await screen.findByText('2 of 9 written, 1 ticked')).toBeInTheDocument();
  });

  it('says Line! for a completed line and Full house only when all nine are filled and ticked', async () => {
    seedBingo('Brittany', [card([true, true, false, false, false, false, false, false, false])]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    expect(screen.queryByText('Line!')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Guess 3, not ticked' }));
    expect(await screen.findByText('Line!')).toBeInTheDocument();
    for (let i = 4; i <= 8; i++) await u.click(screen.getByRole('button', { name: `Guess ${i}, not ticked` }));
    expect(screen.queryByText('Full house')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Guess 9, not ticked' }));
    expect(await screen.findByText('Full house')).toBeInTheDocument();
  });

  it('eight filled and ticked plus one empty (even if marked ticked) is not a full house', () => {
    const c = card(Array(9).fill(true));
    c.squares[8] = { text: '', ticked: true };
    expect(isFullHouse(c)).toBe(false);
  });

  it('deletes a card after confirming, by saving the array without it', async () => {
    seedBingo('Brittany', [card(Array(9).fill(false)), card(Array(9).fill(false), { id: 'c2', title: 'Second' })]);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: /Wild guesses/ }));
    await u.click(screen.getByRole('button', { name: 'Delete card' }));
    expect(stored('Brittany')).toHaveLength(2);
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
