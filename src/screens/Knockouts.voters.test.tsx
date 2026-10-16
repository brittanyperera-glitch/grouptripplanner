import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import type { GroupResult, Item, Vote } from '../types';
import Knockouts from './Knockouts';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const [A, C] = [ITEMS[0], ITEMS[2]];
const group = (votes: { a: string[]; b: string[] }): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], knocked: [], finalized: [], locked: false, results: [],
  knockouts: [{ forkId: 'ko:x', a: [A.id], b: [C.id], votes }],
} as unknown as GroupResult);

// A store whose vote write never finishes, standing in for a slow network.
class SlowVoteStore extends LocalStore { vote(_v: Vote): Promise<void> { return new Promise(() => undefined); } }

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });

describe('head to head cards', () => {
  it('names each voter on the side they chose', async () => {
    render(<AppProvider store={new LocalStore()}><Knockouts group={group({ a: ['Lazza'], b: ['Saulie', 'Antek'] })} /></AppProvider>);
    const add = await screen.findAllByRole('list', { name: 'Voted for this' });
    expect(add).toHaveLength(2);
    expect(within(add[0]).getAllByRole('listitem').map(n => n.textContent)).toEqual(['Lazza']);
    expect(within(add[1]).getAllByRole('listitem').map(n => n.textContent)).toEqual(['Saulie', 'Antek']);
  });
  it('shows my vote at once, without waiting for the write', async () => {
    const user = userEvent.setup();
    render(<AppProvider store={new SlowVoteStore()}><Knockouts group={group({ a: [], b: [] })} /></AppProvider>);
    const buttons = await screen.findAllByRole('button', { name: /^Vote for/ });
    await user.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });
});
