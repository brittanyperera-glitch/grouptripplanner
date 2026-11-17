import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { CrewStays, GroupResult, Plan, PlaceSuggestion, Player } from '../types';
import Stays from './Stays';

const grp = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const day = (n: number, area: Plan['days'][number]['area']) => ({ n, area, entries: [], spare: 0, rainSlack: false });
const plan = { route: ['AIR'], areas: ['Ella', 'Kandy and Knuckles'], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, days: [day(1, 'Ella'), day(2, 'Kandy and Knuckles'), day(3, null)] } as Plan;
const crewRow = (name: Player): CrewStays => ({ name, prefs: [], quizDone: true, locked: true, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' });
const place = (id: string, area: PlaceSuggestion['area']): PlaceSuggestion => ({ id, name: 'Alex', area, kind: 'stay', title: `Stay ${id}`, status: 'live', createdAt: `2026-10-1${id.slice(-1)}` });
const admin = (over: object) => localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [], scouts: {}, ...over }));
const mount = async (me: Player) => {
  localStorage.setItem('tp:me', me);
  render(<AppProvider store={new LocalStore()}><Stays /></AppProvider>);
  await screen.findByRole('list', { name: 'Stays steps' });
  return userEvent.setup();
};

beforeEach(() => {
  localStorage.clear();
  grp.current = { final: plan, locked: true } as unknown as GroupResult;
  PEOPLE.forEach(p => localStorage.setItem(`tp:stays:${p}`, JSON.stringify(crewRow(p))));
});
afterEach(() => cleanup());

describe('Stays header with one area replacing and the rest decided (review A4)', () => {
  // Kandy is pinned; Ella's pinned stay then fell through, so Ella is replacing and nothing else is unfinished.
  const seed = () => {
    localStorage.setItem('tp:placesug', JSON.stringify([place('a1', 'Ella'), place('a2', 'Ella'), place('a3', 'Kandy and Knuckles'), place('a4', 'Kandy and Knuckles')]));
    admin({ pins: [{ area: 'Ella', suggestionId: 'a1', at: '2026-11-01T10:00:00.000Z' }, { area: 'Kandy and Knuckles', suggestionId: 'a3', at: '2026-11-01T10:00:00.000Z' }], fallen: [{ id: 'a1', area: 'Ella', at: '2026-11-02T10:00:00.000Z' }] });
  };
  it('Brittany is told to pin the replacement', async () => {
    seed();
    await mount('Brittany');
    expect(screen.getAllByText('Pin a replacement for Ella')).toHaveLength(2);
    expect(screen.queryByText('Waiting on the others to pick their top 2.')).toBeNull();
  });
  it('a friend is told Brittany is sorting it', async () => {
    seed();
    await mount('Alex');
    expect(screen.getAllByText('Brittany is finding a replacement for Ella')).toHaveLength(2);
    expect(screen.queryByText('Waiting on the others to pick their top 2.')).toBeNull();
  });
});

describe('an area with one stay is short, not decided', () => {
  const seed = () => {
    localStorage.setItem('tp:placesug', JSON.stringify([place('a1', 'Ella'), place('a2', 'Kandy and Knuckles'), place('a3', 'Kandy and Knuckles')]));
    admin({ pins: [{ area: 'Kandy and Knuckles', suggestionId: 'a2', at: '2026-11-01T10:00:00.000Z' }] });
  };
  it('the header asks for a 2nd stay, the story is not finished, and the row offers Suggest a stay to everyone', async () => {
    seed();
    const user = await mount('Alex');
    expect(screen.getByText('Waiting on a 2nd stay for Ella')).toBeInTheDocument();
    expect(screen.queryByText('Your stays are set')).toBeNull();
    const ella = screen.getByRole('button', { name: /^Ella, 1 night, 1 stay/ }).closest('li') as HTMLElement;
    await user.click(within(ella).getByRole('button', { name: 'Suggest a stay' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Destination')).toHaveValue('Ella');
  });
});
