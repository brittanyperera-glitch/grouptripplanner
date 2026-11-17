import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalSub } from '../lib/stayflow';
import type { Outcome } from '../lib/stayflow';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { CrewStays, GroupResult, Plan, PlaceSuggestion, Player } from '../types';
import Stays from './Stays';

const grp = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const day = (n: number, area: Plan['days'][number]['area']) => ({ n, area, entries: [], spare: 0, rainSlack: false });
const plan = { route: ['AIR'], areas: ['Ella', 'Hill country'], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, days: [day(1, 'Ella'), day(2, 'Hill country'), day(3, null)] } as Plan;
const crewRow = (name: Player): CrewStays => ({ name, prefs: [], quizDone: true, locked: true, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' });
const place = (id: string, area: PlaceSuggestion['area'], over: Partial<PlaceSuggestion> = {}): PlaceSuggestion => ({ id, name: 'Alex', area, kind: 'stay', title: `Stay ${id}`, status: 'live', createdAt: `2026-10-1${id.slice(-1)}`, ...over });
const places = (list: PlaceSuggestion[]) => localStorage.setItem('tp:placesug', JSON.stringify(list));
const admin = (over: object) => localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [], scouts: {}, ...over }));
const stored = <T,>(key: string): T => JSON.parse(localStorage.getItem(key) ?? 'null') as T;
const AT = '2026-11-01T10:00:00.000Z';
const pin = (area: string, id: string) => ({ area, suggestionId: id, at: AT });
const mount = async (me: Player, spy = false) => {
  localStorage.setItem('tp:me', me);
  const view = render(<AppProvider store={new LocalStore()}><Stays spy={spy} /></AppProvider>);
  await (spy ? screen.findByRole('heading', { name: 'Stays' }) : screen.findByRole('list', { name: 'Stays steps' }));
  return { user: userEvent.setup(), view };
};
const row = (text: string) => screen.getByRole('button', { name: new RegExp(`^${text}`) });

beforeEach(() => {
  localStorage.clear();
  grp.current = { final: plan, locked: true } as unknown as GroupResult;
  PEOPLE.forEach(p => localStorage.setItem(`tp:stays:${p}`, JSON.stringify(crewRow(p))));
});
afterEach(() => cleanup());

describe('Fell through asks first and can be undone (A5)', () => {
  const seed = () => {
    places([place('a1', 'Ella', { title: 'Hill hut' }), place('a2', 'Ella', { title: 'River house' })]);
    admin({ pins: [pin('Ella', 'a2')] });
    localStorage.setItem('tp:claims', JSON.stringify({ 'stay:Ella': { itemId: 'stay:Ella', owner: 'Lazza', updatedAt: AT } }));
  };
  it('asks naming the claim, Keep changes nothing, Confirm saves, Undo restores the stay and its claim', async () => {
    seed();
    const { user } = await mount('Brittany');
    await user.click(row('Ella, 1 night, 2 stays'));
    await user.click(screen.getByRole('button', { name: 'Fell through' }));
    expect(screen.getByText(/Lazza's claim/)).toBeInTheDocument();
    expect(stored<{ fallen?: unknown[] }>('tp:staysadmin').fallen).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText(/Lazza's claim/)).toBeNull();
    expect(stored<{ fallen?: unknown[] }>('tp:staysadmin').fallen).toBeUndefined();
    expect(stored<Record<string, { owner: string | null }>>('tp:claims')['stay:Ella'].owner).toBe('Lazza');

    await user.click(screen.getByRole('button', { name: 'Fell through' }));
    await user.click(screen.getByRole('button', { name: 'Yes, it fell through' }));
    expect(stored<{ fallen: { id: string }[] }>('tp:staysadmin').fallen.map(f => f.id)).toEqual(['a2']);
    expect(stored<Record<string, { owner: string | null }>>('tp:claims')['stay:Ella'].owner).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stored<{ fallen: unknown[] }>('tp:staysadmin').fallen).toEqual([]);
    expect(stored<Record<string, { owner: string | null }>>('tp:claims')['stay:Ella'].owner).toBe('Lazza');
    expect(screen.getByRole('button', { name: 'Fell through' })).toBeInTheDocument();
  });
});

describe('the Fell through confirm carries no money (Brittany 16 Nov: no money at all)', () => {
  it('the stay card shows its price until Fell through is tapped, and not while it asks', async () => {
    places([place('a1', 'Ella', { title: 'Hill hut', priceGbp: 28 }), place('a2', 'Ella', { title: 'River house', priceGbp: 28 })]);
    admin({ pins: [pin('Ella', 'a2')] });
    const { user } = await mount('Brittany');
    await user.click(row('Ella, 1 night, 2 stays'));
    const card = screen.getByRole('article', { name: 'River house' });
    expect(card).toHaveTextContent(/£28 per person per night/);
    await user.click(within(card).getByRole('button', { name: 'Fell through' }));
    expect(within(card).getByRole('alertdialog')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/£|per person per night/);
    expect(screen.getByRole('article', { name: 'Hill hut' })).toHaveTextContent(/£28 per person per night/);
    await user.click(within(card).getByRole('button', { name: 'Keep it' }));
    expect(card).toHaveTextContent(/£28 per person per night/);
  });
});

describe('one phrasing for a replacing area, for any area name (copy finding)', () => {
  it('names the area after the verb: no "a Ella", on the header, the row and the board, per role', async () => {
    places([place('a1', 'Ella'), place('a2', 'Ella')]);
    admin({ pins: [pin('Ella', 'a2')], fallen: [{ id: 'a2', area: 'Ella', at: AT }] });
    const friend = await mount('Alex');
    expect(screen.getAllByText('Brittany is finding a replacement for Ella')).toHaveLength(2);
    await friend.user.click(row('Ella, 1 night, 2 stays'));
    expect(screen.getByText('Brittany is finding a replacement for Ella')).toBeInTheDocument();
    cleanup();
    const boss = await mount('Brittany');
    expect(screen.getAllByText('Pin a replacement for Ella')).toHaveLength(2);
    await boss.user.click(row('Ella, 1 night, 2 stays'));
    expect(screen.getByText('Pin a replacement for Ella')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/a Ella|a Hill/);
  });
  it('several areas read as a list, plural, never "a A and B"', () => {
    const outs: Outcome[] = [{ kind: 'replacing' }, { kind: 'replacing' }];
    expect(finalSub(outs, ['Ella', 'Hill country'], true)).toBe('Pin replacements for Ella and Hill country');
    expect(finalSub(outs, ['Ella', 'Hill country'], false)).toBe('Brittany is finding replacements for Ella and Hill country');
  });
});

describe('a row counts distinct stays (copy finding)', () => {
  it('two people suggesting the same hostel is 1 stay, and the area still waits for a 2nd', async () => {
    places([place('a1', 'Ella', { title: 'Zoe Hostel', hostelId: 'zoe' }), place('a2', 'Ella', { title: 'Zoe hostel Ella', hostelId: 'zoe', name: 'Lazza' })]);
    const { user } = await mount('Saulie');
    const ella = row('Ella, 1 night, 1 stay').closest('li') as HTMLElement;
    expect(screen.getByText('Waiting on a 2nd stay for Ella')).toBeInTheDocument();
    await user.click(within(ella).getByRole('button', { name: 'Suggest a stay' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Destination')).toHaveValue('Ella');
  });
});

describe('decided areas carry no scout tag, and spy mode swaps the stepper for the mission (A10)', () => {
  const seed = () => {
    places([place('a1', 'Ella'), place('a2', 'Ella'), place('a3', 'Hill country')]);
    admin({ pins: [pin('Ella', 'a1')], scouts: { Ella: 'Alex', 'Hill country': 'Alex' } });
  };
  it('no "You scout" tag on a decided area, still one on an undecided one', async () => {
    seed();
    await mount('Alex');
    expect(within(row('Ella, 1 night, 2 stays')).queryByText('You scout')).toBeNull();
    expect(within(row('Hill country, 1 night, 1 stay')).getByText('You scout')).toBeInTheDocument();
  });
  it('spy: .spy root, no stepper, "2 areas, 1 set", the scout duty on the short area; off: no .spy', async () => {
    seed();
    const { view } = await mount('Alex', true);
    expect(view.container.querySelector('.spy')).not.toBeNull();
    expect(screen.queryByRole('list', { name: 'Stays steps' })).toBeNull();
    expect(screen.getByText('2 areas, 1 set')).toBeInTheDocument();
    expect(within(row('Hill country, 1 night, 1 stay')).getByText('Your duty: find a 2nd stay')).toBeInTheDocument();
    cleanup();
    const off = await mount('Alex');
    expect(off.view.container.querySelector('.spy')).toBeNull();
  });
  it('spy: another scout is named on a short area, and Unlock sits in a closed fold', async () => {
    seed();
    await mount('Brittany', true);
    expect(within(row('Hill country, 1 night, 1 stay')).getByText('Alex is finding a 2nd stay')).toBeInTheDocument();
    const fold = screen.getByText('Organiser tools').closest('details') as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(within(fold).getByRole('button', { name: 'Unlock Antek' })).toBeInTheDocument();
  });
});

describe('spy head to head: vote stamps and "3 settle it"', () => {
  it('your vote is stamped on the card you picked, the line says 3 settle it; off spy there is no stamp', async () => {
    places([place('a1', 'Ella'), place('a2', 'Ella')]);
    const { user } = await mount('Alex', true);
    await user.click(screen.getByRole('button', { name: 'Head to head' }));
    const duel = await screen.findByRole('group', { name: 'Stay vote: Ella' });
    expect(within(duel).getByText('Tap one to stamp your vote. 3 settle it.')).toBeInTheDocument();
    expect(within(duel).queryByText('Your vote')).toBeNull();
    await user.click(within(duel).getAllByRole('button', { name: /^Vote for/ })[0]);
    expect(within(duel).getAllByText('Your vote')).toHaveLength(1);
    cleanup();
    const off = await mount('Alex');
    await off.user.click(screen.getByRole('button', { name: 'Head to head' }));
    expect(within(await screen.findByRole('group', { name: 'Stay vote: Ella' })).queryByText('Your vote')).toBeNull();
  });
});
