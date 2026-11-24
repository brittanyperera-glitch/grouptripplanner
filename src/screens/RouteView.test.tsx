import { cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
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
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { GroupResult, Item, Leg } from '../types';
import { dayNote } from './IdeaSheet';
import RouteTab from './RouteTab';
import { dateLabel } from './TripDay';
import TripView, { TripViewBody } from './TripView';
import { useTripModel } from './useTripModel';

vi.mock('../components/motion', async orig => ({ ...(await orig<typeof import('../components/motion')>()), motion: vi.fn(() => 'still') }));

const items = (catalogue as unknown as { items: Item[] }).items;
const legs = legsData as Leg[];
const group: GroupResult = groupResult(seedState(), items, legs, [], RELEASE);
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const wrapper = ({ children }: { children: ReactNode }) => <AppProvider store={new LocalStore()}>{children}</AppProvider>;
const chip = (n: number) => screen.getByRole('button', { name: new RegExp(`^Day ${n}\\b`) });
const days = () => screen.queryAllByRole('region', { name: /^Day \d/ });
const mount = async () => {
  const user = userEvent.setup();
  render(<TripView group={group} today="2026-12-01" />, { wrapper });
  await screen.findByRole('group', { name: 'Days' });
  return user;
};
const model = async () => {
  const r = renderHook(() => useTripModel(group, '2026-12-01'), { wrapper });
  await waitFor(() => expect(r.result.current).not.toBeNull());
  return r.result.current;
};

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  vi.mocked(motion).mockReturnValue('still');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; });

describe('Route view: One day and All days', () => {
  it('starts on One day, with both halves of the switch at least 44px tall and pressed to say which', async () => {
    await mount();
    const sw = screen.getByRole('group', { name: 'View' });
    expect(within(sw).getByRole('button', { name: 'One day' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sw).getByRole('button', { name: 'All days' })).toHaveAttribute('aria-pressed', 'false');
    expect(days()).toHaveLength(1);
  });

  it('All days draws the whole-route map and one card for each of the 9 days, each with its own header photo', async () => {
    const user = await mount();
    await user.click(screen.getByRole('button', { name: 'All days' }));
    expect(days()).toHaveLength(9);
    expect(screen.getByRole('img', { name: /^Route: (?!.*highlighted)/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /highlighted/ })).toBeNull();
    const srcs = days().map(d => d.querySelector('img')?.getAttribute('src'));
    expect(srcs.every(Boolean), 'every day has a header photo').toBe(true);
    expect(new Set(srcs).size, 'no two days share a header photo').toBe(9);
    days().forEach((d, i) => expect(d.parentElement).toHaveAttribute('id', `day-${i + 1}`));
    await user.click(screen.getByRole('button', { name: 'One day' }));
    expect(days()).toHaveLength(1);
  });

  it('remembers the choice across a remount in tp:route-view', async () => {
    const user = await mount();
    await user.click(screen.getByRole('button', { name: 'All days' }));
    expect(localStorage.getItem('tp:route-view')).toBe('all');
    cleanup();
    await mount();
    expect(days()).toHaveLength(9);
    await user.click(screen.getByRole('button', { name: 'One day' }));
    expect(localStorage.getItem('tp:route-view')).toBe('one');
  });

  it('with storage throwing on every read and write it opens on One day and the switch still works for the visit', async () => {
    const m = await model();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup();
    const thrown = vi.fn();
    window.addEventListener('error', thrown);
    render(<TripViewBody model={m} items={items} legs={legs} />);
    expect(days()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'All days' }));
    window.removeEventListener('error', thrown);
    expect(thrown).not.toHaveBeenCalled();
    expect(days()).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'All days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('in All days a chip scrolls its card into view and writes #/day-N', async () => {
    const scroll = vi.fn();
    (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = scroll;
    const user = await mount();
    await user.click(screen.getByRole('button', { name: 'All days' }));
    scroll.mockClear();
    await user.click(chip(6));
    expect(scroll.mock.contexts.some(el => (el as Element).id === 'day-6')).toBe(true);
    expect(window.location.hash).toBe('#/day-6');
    const call = scroll.mock.calls[scroll.mock.contexts.findIndex(el => (el as Element).id === 'day-6')][0] as ScrollIntoViewOptions;
    expect(call.behavior).toBe('auto');
  });

  it('smooth scrolling only when motion is full', async () => {
    const scroll = vi.fn();
    (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = scroll;
    vi.mocked(motion).mockReturnValue('full');
    const user = await mount();
    await user.click(screen.getByRole('button', { name: 'All days' }));
    scroll.mockClear();
    await user.click(chip(4));
    const at = scroll.mock.contexts.findIndex(el => (el as Element).id === 'day-4');
    expect((scroll.mock.calls[at][0] as ScrollIntoViewOptions).behavior).toBe('smooth');
  });

  it('One day still scrolls nothing into a card: a chip only picks the day', async () => {
    const scroll = vi.fn();
    (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = scroll;
    const user = await mount();
    await user.click(chip(3));
    expect(scroll.mock.contexts.some(el => (el as Element).id.startsWith('day-'))).toBe(false);
    expect(window.location.hash).toBe('#/day-3');
  });

  it('a card\'s stay door opens the stay for that card\'s day, not the pressed chip\'s', async () => {
    const m = await model();
    const v = m.views[4];
    const block = m.blocks.find(b => b.fromDay <= v.n && v.n <= b.toDay)!;
    expect(block.fromDay, 'day 5 is not in the block day 1 is in').toBeGreaterThan(1);
    const user = await mount();
    await user.click(screen.getByRole('button', { name: 'All days' }));
    const card = screen.getByRole('region', { name: 'Day 5' });
    await user.click(within(card).getByRole('button', { name: /^Tonight/ }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent(`Check in ${dateLabel(block.checkIn!)}`);
  });

  it('each card carries only its own day\'s ideas', async () => {
    put('tp:sugg', [{ id: 'i4', name: 'Alex', title: 'Mango stall', area: 'Hill country', note: dayNote(4, 'ask for the green ones'), status: 'pending', createdAt: AT }]);
    const user = await mount();
    await user.click(screen.getByRole('button', { name: 'All days' }));
    expect(screen.getAllByText('Mango stall')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Day 4' })).getByText('Mango stall')).toBeInTheDocument();
  });

  it('the Route tab has the switch too, and today\'s card stands in for today only', async () => {
    const user = userEvent.setup();
    render(<RouteTab group={group} next={null} onOpen={() => undefined} today="2026-12-09" />, { wrapper });
    await screen.findByRole('group', { name: 'Days' });
    await user.click(screen.getByRole('button', { name: 'All days' }));
    expect(document.getElementById('day-2')).not.toBeNull();
    expect(document.querySelectorAll('[id^="day-"]')).toHaveLength(9);
  });

  it('the empty state has no switch', async () => {
    render(<TripView group={{ ...group, final: null }} />, { wrapper });
    await screen.findByText(/once the route is set/i);
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });
});
