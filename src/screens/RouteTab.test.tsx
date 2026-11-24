import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { motion } from '../components/motion';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import type { Task } from '../lib/todo';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { GroupResult, Item, Leg } from '../types';
import RouteTab from './RouteTab';

vi.mock('../components/motion', async orig => ({ ...(await orig<typeof import('../components/motion')>()), motion: vi.fn(() => 'still') }));

const items = (catalogue as unknown as { items: Item[] }).items;
const group: GroupResult = groupResult(seedState(), items, legsData as Leg[], [], RELEASE);
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const wrapper = ({ children }: { children: ReactNode }) => <AppProvider store={new LocalStore()}>{children}</AppProvider>;
const task: Task = { id: 'booking:book:x', kind: 'booking', file: 'supply', label: 'Book the Ella train', owed: true, open: { sub: 'bookings', target: 'book:x' } };
const mount = async (o: { today: string; next?: Task | null; hash?: string }) => {
  window.location.hash = o.hash ?? '';
  const onOpen = vi.fn(), reveal = vi.fn();
  render(<RouteTab group={group} next={o.next ?? null} onOpen={onOpen} reveal={reveal} today={o.today} />, { wrapper });
  await screen.findByRole('group', { name: 'Days' });
  return { onOpen, reveal, user: userEvent.setup() };
};
const chip = (n: number) => screen.getByRole('button', { name: new RegExp(`^Day ${n}\\b`) });
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  localStorage.clear(); window.location.hash = ''; window.history.replaceState(null, '');
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: '2026-11-02T00:00:00Z' });
  vi.mocked(motion).mockReturnValue('still');
});
afterEach(cleanup);

describe('Route tab', () => {
  it('shows the next line with its label only when a task is owed, and tapping it opens the task target', async () => {
    const { onOpen, user } = await mount({ today: '2026-12-01', next: task });
    await user.click(screen.getByRole('button', { name: /Book the Ella train/ }));
    expect(onOpen).toHaveBeenCalledWith(task.open);
    cleanup();
    await mount({ today: '2026-12-01' });
    expect(screen.queryByRole('button', { name: /Book the Ella train/ })).toBeNull();
  });

  it('before the trip puts the map first and shows the countdown and summary line', async () => {
    await mount({ today: '2026-12-01' });
    expect(screen.getByText(/Trip starts Tue 8 Dec · 9 days, about [\d.]+ h/)).toBeInTheDocument();
    expect(before(document.querySelector('.map')!, screen.getByRole('group', { name: 'Days' }))).toBe(true);
    expect(chip(1)).toHaveAttribute('aria-pressed', 'true');
  });

  it('on a trip day puts the strip and then today\'s card before the map, with today\'s chip pressed and no countdown', async () => {
    await mount({ today: '2026-12-10' });
    const strip = screen.getByRole('group', { name: 'Days' });
    expect(chip(3)).toHaveAttribute('aria-pressed', 'true');
    expect(before(strip, screen.getByLabelText('Today'))).toBe(true);
    expect(before(screen.getByLabelText('Today'), document.querySelector('.map')!)).toBe(true);
    expect(screen.queryByText(/Trip starts/)).toBeNull();
  });

  it('a day in the hash wins over today', async () => {
    await mount({ today: '2026-12-10', hash: '#/day-5' });
    expect(chip(5)).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping a day chip keeps the history entry it was given', async () => {
    window.history.replaceState({ tpTab: 'Route' }, '');
    const { user } = await mount({ today: '2026-12-01' });
    await user.click(chip(4));
    expect(window.history.state).toEqual({ tpTab: 'Route' });
    expect(window.location.hash).toBe('#/day-4');
  });

  it('Play route reveal calls reveal and Save itinerary is offered', async () => {
    const { reveal, user } = await mount({ today: '2026-12-01' });
    await user.click(screen.getByRole('button', { name: 'Play route reveal' }));
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save itinerary as PDF' })).toBeInTheDocument();
  });

  it('shows the flights line of day 1 as a door that opens Flights', async () => {
    put('tp:travellers', { Saulie: { name: 'Saulie', arriveLocal: '2026-12-08T09:30', arriveFlight: 'UL 504', departLocal: null, departFlight: null, updatedAt: '' } });
    const { onOpen, user } = await mount({ today: '2026-12-01' });
    await user.click(screen.getByRole('button', { name: /Saulie arrives 09:30/ }));
    expect(onOpen).toHaveBeenCalledWith({ sub: 'flights' });
  });
});
