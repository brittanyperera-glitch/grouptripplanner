import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalogue from '../data/catalogue.json';
import { dayView } from '../lib/dayView';
import { sideQuests } from '../lib/sideQuests';
import { emptyRanking } from '../types';
import type { DayBooking, DayView, Item, Plan, Response } from '../types';
import { DayRows } from './MyTrip';
import TripDay, { dateLabel } from './TripDay';
import type { DayTip } from './BookCard';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const A = ITEMS[0];
const drive = { kind: 'drive' as const, label: 'Drive from Kandy to Nuwara Eliya', hours: 2, from: 'Kandy' as const, to: 'Nuwara Eliya' as const };
const free = { kind: 'free' as const, label: 'Free day', hours: 0 };
const act = (i: Item, o = {}) => ({ kind: 'activity' as const, label: i.name, hours: 2, onSite: 1.5, itemId: i.id, ...o });
// The fixtures of the DayRows tests (sideQuests.ui, skipped): a free day with a side quest, and a day with a skipped place.
const plan: Plan = {
  route: ['AIR', 'Colombo', 'Kandy', 'Nuwara Eliya', 'AIR'], areas: ['Colombo', 'Kandy and Knuckles', 'Hill country'], chosen: [A.id], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [
    { n: 1, area: 'Colombo', entries: [{ kind: 'drive', label: 'Drive', hours: 2 }], spare: 0, rainSlack: false },
    { n: 2, area: 'Kandy and Knuckles', entries: [{ kind: 'drive', label: 'Drive', hours: 2 }], spare: 0, rainSlack: false },
    { n: 3, area: 'Hill country', entries: [free], spare: 5, rainSlack: false },
    { n: 4, area: 'Hill country', entries: [drive, act(A, { roundTrip: 0.8 })], spare: 0, rainSlack: false },
    { n: 5, area: 'Colombo', entries: [{ kind: 'drive', label: 'Drive', hours: 6 }], spare: 0, rainSlack: true },
  ],
};
const lazza = (): Response => {
  const ranking = emptyRanking(); ranking.keen = [['tea']];
  return { name: 'Lazza', days: 9, flex: false, pace: 1, ranking, rated: ['tea'], submitted: true, updatedAt: '2026-10-14T00:00:00Z' };
};
const tea = { id: 'tea', name: 'Damro Labookellie tea estate', area: 'Hill country', hours: 1.5, sideTrip: 1.06, slot: 'any' } as unknown as Item;
const quests = sideQuests(plan, 'Lazza', { responses: { Lazza: lazza() }, suggestions: [], votes: [] }, [tea]);
const tips: DayTip[] = [{ day: 4, name: A.name, text: 'Wear shoes you can get wet' }, { day: 3, name: 'Tea', text: 'Bring cash' }];
const skippedBy = (id: string) => (id === A.id ? ['Alex', 'Lazza'] : []);
const view = (n: number, extra: Partial<Parameters<typeof dayView>[0]> = {}): DayView =>
  dayView({ plan, start: '2026-12-09', blocks: [], stays: {}, bookingsByDay: {}, travellers: {}, custom: [], paceHours: 9, ...extra }, n);

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe('TripDay header and nights', () => {
  it('reads "Day 3 · Wed 9 Dec" with the area, and drops the date without a start', () => {
    const { rerender } = render(<TripDay view={view(1)} />);
    expect(screen.getByText('Day 1 · Wed 9 Dec')).toBeInTheDocument();
    expect(dateLabel('2026-12-09')).toBe('Wed 9 Dec');
    rerender(<TripDay view={view(3, { start: null })} />);
    expect(screen.getByText('Day 3')).toBeInTheDocument();
    expect(screen.getByText('Hill country')).toBeInTheDocument();
  });

  it('shows tonight and opens the stay by area when tapped', () => {
    const onStay = vi.fn();
    const v = view(3, { blocks: [{ area: 'Hill country', hub: 'Nuwara Eliya', checkIn: '2026-12-11', checkOut: '2026-12-13', nights: 2, fromDay: 3, toDay: 4 }], stays: { 'Hill country': { id: 'stay:Hill country', title: 'Mist House', link: null } } });
    render(<TripDay view={v} onStay={onStay} />);
    fireEvent.click(screen.getByRole('button', { name: /Mist House/ }));
    expect(onStay).toHaveBeenCalledWith('Hill country');
  });

  it('says no stay is chosen yet when the area has none', () => {
    const v = view(3, { blocks: [{ area: 'Hill country', hub: 'Nuwara Eliya', checkIn: null, checkOut: null, nights: 2, fromDay: 3, toDay: 4 }] });
    render(<TripDay view={v} />);
    expect(screen.getByText(/No stay chosen yet/)).toBeInTheDocument();
  });
});

describe('TripDay bookings and flights', () => {
  const booking = (o: Partial<DayBooking>): DayBooking => ({ id: 'book:train', label: 'Ella train', status: 'open', opensOn: null, bookBy: '2026-12-01', owner: 'Alex', ...o });
  it('lists the day\'s bookings with a status chip and owner, and its flights', () => {
    const v = view(1, { bookingsByDay: { 1: [booking({}), booking({ id: 'stay:Colombo', label: 'Stay in Colombo', status: 'overdue', owner: null })] }, travellers: { Saulie: { name: 'Saulie', arriveLocal: '2026-12-09T09:30', arriveFlight: 'UL 504', departLocal: null, departFlight: null, updatedAt: '' } } });
    render(<TripDay view={v} />);
    const list = screen.getByRole('list', { name: 'Day bookings' });
    expect(within(list).getByText('Ella train')).toBeInTheDocument();
    expect(within(list).getByText('Open')).toBeInTheDocument();
    expect(within(list).getByText('Overdue')).toBeInTheDocument();
    expect(within(list).getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Saulie arrives 09:30 · UL 504')).toBeInTheDocument();
  });
});

describe('TripDay booking wording', () => {
  const train = ITEMS.find(i => i.id === 'train')!;
  const trainPlan: Plan = { ...plan, days: [{ n: 1, area: 'Colombo', entries: [act(train)], spare: 0, rainSlack: false }] };
  const mk = (bookings: DayBooking[]) => dayView({ plan: trainPlan, start: '2026-12-09', blocks: [], stays: {}, bookingsByDay: { 1: bookings }, travellers: {}, custom: [], paceHours: 9 }, 1);
  const open: DayBooking = { id: 'book:train', label: 'Ella train', status: 'open', opensOn: null, bookBy: '2026-12-01', owner: 'Alex' };

  it('prints the day booking line with the shared wording', () => {
    render(<TripDay view={mk([open])} items={ITEMS} compact />);
    expect(screen.getByText('Book: Ella train, Open · Alex booking')).toBeInTheDocument();
  });

  it('drops the per-activity Book text when the day lists that booking, and keeps it when the day does not', () => {
    const { rerender } = render(<TripDay view={mk([open])} items={ITEMS} compact />);
    expect(screen.queryByText(train.book!)).toBeNull();
    rerender(<TripDay view={mk([])} items={ITEMS} compact />);
    expect(screen.getByText(train.book!)).toBeInTheDocument();
  });

  it('shows the chip, the owner and the note as the same words on screen', () => {
    render(<TripDay view={mk([open, { ...open, id: 'book:x', label: 'Later', status: 'not-open', opensOn: '2026-11-08', owner: null }])} />);
    const list = screen.getByRole('list', { name: 'Day bookings' });
    expect(within(list).getByText('Alex')).toHaveTextContent('Alex booking');
    expect(within(list).getByText('Opens 8 Nov')).toBeInTheDocument();
  });
});

describe('TripDay print facts carry no money', () => {
  it('keeps the best time and drops the cost of a place', () => {
    const pettah = ITEMS.find(i => i.id === 'pettah')!;
    expect(pettah.fee).toBeTruthy();
    const p: Plan = { ...plan, days: [{ n: 1, area: 'Colombo', entries: [act(pettah)], spare: 0, rainSlack: false }] };
    const v = dayView({ plan: p, start: '2026-12-09', blocks: [], stays: {}, bookingsByDay: {}, travellers: {}, custom: [], paceHours: 9 }, 1);
    render(<TripDay view={v} items={ITEMS} compact />);
    expect(screen.getByText(`Best time: ${pettah.when}`)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Cost:|spend what you like/);
  });
});

describe('TripDay carries what DayRows carries', () => {
  const texts = (root: HTMLElement, sel: string) => [...root.querySelectorAll(sel)].map(e => e.textContent);
  const rows = (n: number) => within(screen.getByRole('list', { name: 'Days' })).getAllByRole('listitem')[n - 1];

  it('shows the side quest, the tip and "Skipped by" under their own day', () => {
    expect(quests.map(q => q.day)).toEqual([3]);
    const { rerender } = render(<TripDay view={view(3)} quests={quests} tips={tips} skippedBy={skippedBy} />);
    expect(screen.getByText('Side quest: free morning for Damro Labookellie tea estate (1.5 h)')).toBeInTheDocument();
    expect(screen.getByText('Tea: Bring cash')).toBeInTheDocument();
    expect(screen.queryByText(/Skipped by/)).toBeNull();
    rerender(<TripDay view={view(4)} quests={quests} tips={tips} skippedBy={skippedBy} />);
    expect(screen.getByText('Skipped by Alex and Lazza').closest('.entry')).toHaveTextContent(A.name);
    expect(screen.getByText(`${A.name}: Wear shoes you can get wet`)).toBeInTheDocument();
    expect(screen.queryByText(/Side quest/)).toBeNull();
    expect(screen.getByText('plus about 0.8 h there and back')).toBeInTheDocument();
  });

  it.each([1, 2, 3, 4, 5])('says the same as DayRows for day %i', n => {
    const { unmount } = render(<DayRows plan={plan} items={ITEMS} quests={quests} tips={tips} skippedBy={skippedBy} />);
    const old = rows(n);
    const want = { entries: texts(old, '.entry-txt'), notes: texts(old, 'small'), area: texts(old, '.day-area') };
    unmount();
    const { container } = render(<TripDay view={view(n)} items={ITEMS} quests={quests} tips={tips} skippedBy={skippedBy} rainSlack={plan.days[n - 1].rainSlack} />);
    const got = container.firstElementChild as HTMLElement;
    expect({ entries: texts(got, '.entry-txt'), notes: texts(got, 'small'), area: texts(got, '.day-area') }).toEqual(want);
  });

  it('opens a place by id when it is tapped, and not a drive', () => {
    const onPlace = vi.fn();
    render(<TripDay view={view(4)} onPlace={onPlace} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(A.name) }));
    expect(onPlace).toHaveBeenCalledWith(A.id);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('keeps the long-driving and rain notes, and a custom stop', () => {
    const v = view(5, { custom: [{ kind: 'custom', id: 'c:1', day: 5, title: 'Long lunch', hours: 1.5, note: 'By the lake' }] });
    render(<TripDay view={v} rainSlack />);
    expect(screen.getByText('Long driving day')).toBeInTheDocument();
    expect(screen.getByText('Spare for rain')).toBeInTheDocument();
    expect(screen.getByText('Long lunch, 1.5 h')).toBeInTheDocument();
    expect(screen.getByText('By the lake')).toBeInTheDocument();
  });
});

describe('TripDay doors', () => {
  const booking = (o: Partial<DayBooking>): DayBooking => ({ id: 'book:train', label: 'Ella train', status: 'open', opensOn: null, bookBy: '2026-12-01', owner: 'Alex', ...o });
  const v = view(1, { bookingsByDay: { 1: [booking({})] }, travellers: { Saulie: { name: 'Saulie', arriveLocal: '2026-12-09T09:30', arriveFlight: 'UL 504', departLocal: null, departFlight: null, updatedAt: '' } } });

  it('passes the booking id to onBooking and calls onFlights from the flights line', () => {
    const onBooking = vi.fn(), onFlights = vi.fn();
    render(<TripDay view={v} onBooking={onBooking} onFlights={onFlights} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ella train' }));
    expect(onBooking).toHaveBeenCalledWith('book:train');
    fireEvent.click(screen.getByRole('button', { name: /Saulie arrives 09:30/ }));
    expect(onFlights).toHaveBeenCalledTimes(1);
  });

  it('draws no buttons for them when no handler is given', () => {
    render(<TripDay view={v} />);
    expect(screen.queryByRole('button', { name: 'Ella train' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Saulie arrives/ })).toBeNull();
  });
});

// Her review 24 Nov: day 1 (airport drive) drew a plain beige header while every visit day had a photo.
describe('TripDay header photo on a day with no visit', () => {
  it("takes a photo from a place in the day's area", () => {
    const { container } = render(<TripDay view={view(1)} items={ITEMS} />);
    expect(container.querySelector('.strip.plain')).toBeNull();
    expect(container.querySelector('.strip.scene.cover')).not.toBeNull();
  });
  it('skips a place the trip visits, so the photo repeats no other day', () => {
    const area = ITEMS.filter(i => i.area === 'Colombo' && i.photo);
    const { container } = render(<TripDay view={view(1)} items={ITEMS} visited={[area[0].id]} />);
    expect(area.length).toBeGreaterThan(1);
    expect(container.querySelector('.strip img')?.getAttribute('src')).toBe(`/img/${area[1].photo}.jpg`);
  });
  it('stays plain when no place in the area is known', () => {
    const { container } = render(<TripDay view={view(1)} items={[]} />);
    expect(container.querySelector('.strip.plain')).not.toBeNull();
  });
});

describe('TripDay ideas', () => {
  const ideas = [{ id: 'i1', name: 'Lazza', title: 'Tea factory', text: 'go early' }];

  it('lists a pending idea with who sent it and that it waits on Brittany', () => {
    render(<TripDay view={view(3)} ideas={ideas} />);
    expect(screen.getByText('Tea factory')).toBeInTheDocument();
    expect(screen.getByText('go early')).toBeInTheDocument();
    expect(screen.getByText('Idea · Lazza · waiting on Brittany')).toBeInTheDocument();
  });

  it('the door is there only when a handler is given, and calls it', () => {
    const onIdea = vi.fn();
    const { rerender } = render(<TripDay view={view(3)} />);
    expect(screen.queryByRole('button', { name: 'Add an idea for this day' })).toBeNull();
    rerender(<TripDay view={view(3)} onIdea={onIdea} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an idea for this day' }));
    expect(onIdea).toHaveBeenCalledTimes(1);
  });

  it('the print layout carries neither', () => {
    render(<TripDay view={view(3)} ideas={ideas} onIdea={() => {}} compact />);
    expect(screen.queryByText('Tea factory')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add an idea for this day' })).toBeNull();
  });
});
