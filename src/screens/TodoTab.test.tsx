import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
vi.mock('../components/sound', () => ({ thud: vi.fn(), jingle: vi.fn() }));
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { MemoryStore } from '../guest/MemoryStore';
import { guestSeed, seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { GUEST_SAMPLE, RELEASE } from '../lib/release';
import type { Task } from '../lib/todo';
import { ADMIN_IDS } from '../lib/tripadmin';
import { AppProvider, useApp } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { Area, GroupResult, Item, Leg, Person, Player } from '../types';
import TodoTab from './TodoTab';

const group: GroupResult = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const areas = [...new Set(group.final!.days.flatMap(d => (d.area ? [d.area] : [])))];
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const stay = (area: Area) => ({ id: `s-${area}-1`, name: 'Alex' as const, area, kind: 'stay' as const, title: area, status: 'live' as const, createdAt: AT });

// The stored state of a finished crew: every booking ticked, every flight in, every area pinned, unless `o` leaves one open.
function seed(o: { me?: Person; dark?: Person[]; open?: boolean } = {}) {
  localStorage.setItem('tp:me', o.me ?? 'Lazza');
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  put('tp:placesug', areas.map(stay));
  put('tp:staysadmin', { pins: areas.map(a => ({ area: a, suggestionId: `s-${a}-1`, at: AT })), scouts: {}, closed: [] });
  put('tp:travellers', Object.fromEntries(PEOPLE.filter(p => !o.dark?.includes(p)).map(p => [p, { name: p, arriveLocal: '2026-12-08T09:00', arriveFlight: null, departLocal: '2026-12-16T09:00', departFlight: null, updatedAt: AT }])));
  put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ADMIN_IDS.map(id => [id, { done: !o.open, doneAt: AT }])), updatedAt: AT });
}
const top2: Task = { id: 'stay:rank', kind: 'stay', file: 'stays', label: 'Pick your top 2', owed: true, open: { sub: 'stays', target: 'Hill country' } };
const bingo: Task = { id: 'bingo', kind: 'bingo', label: 'Make your travel bingo card', owed: false, open: { overlay: 'bingo' } };
const mount = (tasks: Task[], onOpen = vi.fn()) => {
  const view = render(<AppProvider store={new LocalStore()}><TodoTab group={group} tasks={tasks} onOpen={onOpen} /></AppProvider>);
  return { onOpen, view };
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('To do board', () => {
  it('is titled To do, shows the next move with its level, and Start opens that task', async () => {
    seed({ open: true });
    const { onOpen } = mount([top2]);
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
    expect(screen.getByText('Your next move')).toBeInTheDocument();
    expect(screen.getAllByText('Pick your top 2').length).toBeGreaterThan(0);
    expect(screen.getByText(/^Agent Lazza · Level \d/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Crew readiness \d+ percent$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onOpen).toHaveBeenCalledWith(top2.open);
    expect(screen.queryByRole('button', { name: 'Group trip' })).toBeNull();
  });

  it('the Stays card reads You: Pick your top 2, the others You: nothing to do, each with a Group line', async () => {
    seed({ open: true });
    mount([top2]);
    const card = (name: RegExp) => screen.findByRole('button', { name });
    const stays = await card(/Stays/), bookings = await card(/Bookings/), flights = await card(/Flights/);
    expect(within(stays).getByText('You: Pick your top 2')).toBeInTheDocument();
    expect(within(bookings).getByText('You: nothing to do')).toBeInTheDocument();
    expect(within(flights).getByText('You: nothing to do')).toBeInTheDocument();
    expect(within(stays).getByText(/^Group: \d+ of \d+ decided$/)).toBeInTheDocument();
    expect(within(bookings).getByText(/^Group: \d+ of \d+ secured/)).toBeInTheDocument();
    expect(within(flights).getByText('Group: Everyone is down')).toBeInTheDocument();
  });

  it('the Stays card reads You: nothing to do for someone locked and waiting (no stays task)', async () => {
    seed({ open: true });
    mount([]);
    expect(await within(await screen.findByRole('button', { name: /Stays/ })).findByText('You: nothing to do')).toBeInTheDocument();
    expect(screen.getByText('All clear')).toBeInTheDocument();
  });

  it('a card opens its screen: Stays, Bookings, Flights', async () => {
    seed({ open: true });
    const { onOpen } = mount([]);
    await userEvent.click(await screen.findByRole('button', { name: /Stays/ }));
    await userEvent.click(screen.getByRole('button', { name: /Bookings/ }));
    await userEvent.click(screen.getByRole('button', { name: /Flights/ }));
    expect(onOpen.mock.calls).toEqual([[{ sub: 'stays' }], [{ sub: 'bookings' }], [{ sub: 'flights' }]]);
  });

  it('For fun lists the not-owed tasks and opens one on tap, and is absent when there are none', async () => {
    seed({ open: true });
    const { onOpen, view } = mount([bingo]);
    expect(await screen.findByText('For fun')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Make your travel bingo card' }));
    expect(onOpen).toHaveBeenCalledWith({ overlay: 'bingo' });
    view.unmount();
    mount([]);
    await screen.findByRole('heading', { name: 'To do' });
    expect(screen.queryByText('For fun')).toBeNull();
  });

  it('with every mission done it stays a stamped board: three Done stamps, no plain fallback', async () => {
    seed();
    mount([]);
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
    expect(document.querySelector('.spy')).not.toBeNull();
    expect(document.querySelectorAll('.spy-mission .spy-stamp')).toHaveLength(3);
    expect(screen.queryByText('Every mission is done.')).toBeNull();
    expect(document.querySelector('.spyhq-plain')).toBeNull();
  });

  it('renders nothing for someone who is not one of the five', async () => {
    seed();
    localStorage.setItem('tp:me', 'Mum');
    const { view } = mount([]);
    await waitFor(() => expect(localStorage.getItem('tp:me')).toBe('Mum'));
    expect(view.container.innerHTML).toBe('');
  });

  // Changed deliberately (D11, 24 Nov 2026, "Show the new four tabs"): a demo guest is not one of the five, and now gets the board.
  it('renders the next move and the files for a demo guest on a guest store, and for a member', async () => {
    const guestGroup = groupResult(guestSeed(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], GUEST_SAMPLE);
    const Guest = ({ name }: { name: Player }) => { const { me, setMe } = useApp(); useEffect(() => { setMe(name); }, [name, setMe]); return me === name ? <TodoTab group={guestGroup} tasks={[top2, bingo]} onOpen={vi.fn()} /> : null; };
    render(<AppProvider store={new MemoryStore(guestSeed())} sandbox={{ onFinish: () => {} }}><Guest name="Aunty" /></AppProvider>);
    expect(await screen.findByRole('heading', { name: 'To do' })).toBeInTheDocument();
    expect(screen.getByText('Your next move')).toBeInTheDocument();
    expect(screen.getByText('Your files')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stays/ })).toBeInTheDocument();
    expect(screen.getByText(/^Agent Aunty · Level 1 · 1 task to Level 2$/)).toBeInTheDocument();
    cleanup();
    seed({ open: true });
    mount([top2]);
    expect(await screen.findByText('Your files')).toBeInTheDocument();
    expect(screen.getByText('Your next move')).toBeInTheDocument();
  });
});
