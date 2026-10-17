import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { AppProvider, useApp } from '../state';
import { LocalStore } from '../store/local';
import { EMPTY_STAYS, PEOPLE } from '../types';
import type { CrewStays, GroupResult, Plan, Player } from '../types';
import Stays from './Stays';

const grp = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../workers/usePlan', async orig => ({ ...(await orig<typeof import('../workers/usePlan')>()), useGroupResult: () => ({ data: grp.current, loading: false }) }));

const day = (n: number, area: Plan['days'][number]['area']) => ({ n, area, entries: [], spare: 0, rainSlack: false });
const plan: Plan = {
  route: ['AIR', 'Sigiriya', 'Ella', 'AIR'], areas: ['Cultural Triangle', 'Ella'], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: [day(1, 'Cultural Triangle'), day(2, 'Cultural Triangle'), day(3, null), day(4, 'Ella')],
};
const seedCrew = (name: Player) => localStorage.setItem(`tp:stays:${name}`, JSON.stringify({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-14T00:00:00Z' } satisfies CrewStays));
const stored = <T,>(key: string): T => JSON.parse(localStorage.getItem(key) ?? 'null') as T;
const GROUP = 'Stay nights in Ella';

const mount = async (me: Player) => {
  localStorage.setItem('tp:me', me);
  const user = userEvent.setup();
  render(<AppProvider store={new LocalStore()}><Stays /></AppProvider>);
  await screen.findByRole('list', { name: 'Stays steps' });
  await user.click(screen.getByRole('button', { name: /^Ella, \d+ nights?, 0 stays/ }));
  return user;
};

beforeEach(() => { localStorage.clear(); grp.current = { final: plan, locked: true } as unknown as GroupResult; });
afterEach(() => cleanup());

describe('Brittany sets stay nights', () => {
  it('More nights stores the override, the board and the itinerary note use it, and returning to the itinerary count clears it', async () => {
    seedCrew('Brittany');
    const user = await mount('Brittany');
    expect(screen.getByRole('group', { name: GROUP })).toHaveTextContent('1 night');
    expect(screen.queryByText(/The itinerary still has/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More nights' }));
    expect(stored<{ nights: Record<string, number> }>('tp:staysadmin').nights).toEqual({ Ella: 2 });
    expect(await screen.findByRole('heading', { name: 'Ella, 2 nights' })).toBeInTheDocument();
    // Changed deliberately (review 2026-10-17): the note names its unit.
    expect(screen.getByText('Brittany set these stay nights. The itinerary still has 1 night.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fewer nights' }));
    expect(stored<{ nights?: Record<string, number> }>('tp:staysadmin').nights ?? {}).toEqual({});
    expect(screen.queryByText(/The itinerary still has/)).toBeNull();
  });

  it('the destination list uses the override and says when it differs', async () => {
    seedCrew('Brittany');
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [], scouts: {}, closed: [], nights: { Ella: 5 } }));
    localStorage.setItem('tp:me', 'Brittany');
    render(<AppProvider store={new LocalStore()}><Stays /></AppProvider>);
    expect(await screen.findByRole('button', { name: /^Ella, 5 nights, 0 stays/ })).toHaveTextContent('The itinerary still has 1 night.');
    expect(screen.getByRole('button', { name: /^Cultural Triangle, 2 nights/ })).not.toHaveTextContent('itinerary still has');
  });

  it('stops at 14 and ignores a stored value outside 1 to 14', async () => {
    seedCrew('Brittany');
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [], scouts: {}, closed: [], nights: { Ella: 14 } }));
    await mount('Brittany');
    expect(screen.getByRole('button', { name: 'More nights' })).toBeDisabled();
    cleanup();
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [], scouts: {}, closed: [], nights: { Ella: 99 } }));
    await mount('Brittany');
    expect(screen.getByRole('group', { name: GROUP })).toHaveTextContent('1 night');
  });
});

describe('only Brittany sees the stepper', () => {
  it.each(PEOPLE.filter(p => p !== 'Brittany'))('%s sees the override but no control', async who => {
    seedCrew(who);
    localStorage.setItem('tp:staysadmin', JSON.stringify({ pins: [], scouts: {}, closed: [], nights: { Ella: 3 } }));
    await mount(who);
    expect(screen.getByRole('heading', { name: 'Ella, 3 nights' })).toBeInTheDocument();
    expect(screen.getByText('Brittany set these stay nights. The itinerary still has 1 night.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: GROUP })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More nights' })).toBeNull();
  });

  it('a guest sees the override but no control', async () => {
    function AsGuest() {
      const { me, setMe } = useApp();
      useEffect(() => { setMe('Aunty'); }, [setMe]);
      return me ? <Stays /> : null;
    }
    const store = new MemoryStore({ ...seedState(), stays: { ...EMPTY_STAYS, admin: { pins: [], scouts: {}, closed: [], nights: { Ella: 3 } } } });
    const user = userEvent.setup();
    render(<AppProvider store={store} sandbox={{ onFinish: () => undefined }}><AsGuest /></AppProvider>);
    await screen.findByRole('list', { name: 'Stays steps' });
    await user.click(screen.getByRole('button', { name: /^Ella, 3 nights/ }));
    expect(screen.getByRole('heading', { name: 'Ella, 3 nights' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: GROUP })).toBeNull();
  });
});
