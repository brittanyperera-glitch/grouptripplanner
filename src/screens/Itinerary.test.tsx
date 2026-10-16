import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import type { AppState, CrewStays, Item, Leg, Plan, PlaceSuggestion, StaysState } from '../types';
import { EMPTY_STAYS, PEOPLE } from '../types';
import { chosenStays, Itinerary } from './Itinerary';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const legs = legsData as unknown as Leg[];
const pick = (...ids: string[]) => ids.map(id => ITEMS.find(i => i.id === id)!);
const [crab, train, galle, sigiriya] = pick('crab', 'train', 'galle', 'sigiriya');
const entry = (i: Item) => ({ kind: 'activity' as const, label: i.name, hours: i.hours, itemId: i.id });
const plan: Plan = {
  route: ['AIR', 'Sigiriya', 'Ella', 'AIR'], areas: ['Cultural Triangle', 'Ella'], chosen: [crab, train, galle, sigiriya].map(i => i.id), dropped: [],
  travelHours: 6.5, fits: true, missingMusts: [], score: 0,
  days: [
    { n: 1, area: 'Cultural Triangle', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'Drive from AIR to Sigiriya', hours: 4, from: 'AIR', to: 'Sigiriya' }, entry(sigiriya), entry(crab)] },
    { n: 2, area: 'Ella', spare: 0, rainSlack: false, entries: [entry(train), { kind: 'free', label: 'Free evening', hours: 0 }] },
    { n: 3, area: 'Ella', spare: 0, rainSlack: false, entries: [entry(galle)] },
  ],
};
const stay: PlaceSuggestion = { id: 's1', name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut', priceGbp: 40, stayType: 'guesthouse', link: 'https://example.com/hut', status: 'live', createdAt: '2026-10-16T00:00:00Z' };
const crew = (n: 'Brittany' | 'Alex', locked: boolean): CrewStays => ({ name: n, prefs: [], quizDone: true, locked, ranks: {}, bingo: [], updatedAt: '' });

afterEach(cleanup);

describe('Itinerary document', () => {
  it('lists every day and each chosen item once in the schedule, with the bookings and heads-up lists', () => {
    render(<Itinerary plan={plan} items={ITEMS} legs={legs} heading="Group itinerary" />);
    expect(screen.getByRole('heading', { name: 'Sri Lanka itinerary' })).toBeInTheDocument();
    expect(screen.getByText('Group itinerary')).toBeInTheDocument();
    for (const n of [1, 2, 3]) expect(screen.getByRole('region', { name: `Day ${n}` })).toBeInTheDocument();
    for (const i of [crab, train, galle, sigiriya]) {
      const inDays = [1, 2, 3].flatMap(n => within(screen.getByRole('region', { name: `Day ${n}` })).queryAllByText(i.name, { selector: '.it-name' }));
      expect(inDays, i.name).toHaveLength(1);
    }
    const bookings = screen.getByRole('region', { name: 'Bookings' });
    for (const i of [crab, train, sigiriya]) expect(within(bookings).getByText(i.name)).toBeInTheDocument();
    expect(within(bookings).queryByText(galle.name)).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Heads up' })).getByText(train.name)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Day 2' })).getByText(train.britt!, { exact: false })).toBeInTheDocument();
  });

  it('omits the stays section when none is chosen and prints it when one is', () => {
    const { rerender } = render(<Itinerary plan={plan} items={ITEMS} legs={legs} heading="My itinerary" stays={[]} />);
    expect(screen.queryByText('Where you are staying')).toBeNull();
    rerender(<Itinerary plan={plan} items={ITEMS} legs={legs} heading="My itinerary" stays={[{ area: 'Ella', title: 'Hill hut', nights: 2, priceGbp: 40, stayType: 'guesthouse', link: stay.link }]} />);
    const sec = screen.getByRole('region', { name: 'Where you are staying' });
    expect(within(sec).getByText('Ella: Hill hut')).toBeInTheDocument();
    expect(within(sec).getByText('2 nights')).toBeInTheDocument();
    expect(within(sec).getByText('https://example.com/hut')).toBeInTheDocument();
  });
});

describe('chosenStays', () => {
  const base = (over: Partial<StaysState>): AppState => ({ responses: {}, suggestions: [], votes: [], stays: { ...EMPTY_STAYS, ...over } });
  it('is empty when nothing is decided', () => {
    expect(chosenStays({ responses: {}, suggestions: [], votes: [] }, 'Brittany', plan)).toEqual([]);
    expect(chosenStays(base({ suggestions: [stay], crew: { Brittany: crew('Brittany', false) } }), 'Brittany', plan)).toEqual([]);
  });
  it('takes a pin over everything, with the nights the plan spends there', () => {
    const s = base({ suggestions: [stay], admin: { pins: [{ area: 'Ella', suggestionId: 's1', at: '2026-10-16T01:00:00Z' }], scouts: {} } });
    expect(chosenStays(s, 'Brittany', plan)).toEqual([{ area: 'Ella', title: 'Hill hut', stayType: 'guesthouse', priceGbp: 40, nights: 2, link: 'https://example.com/hut' }]);
  });
  it('takes a lone stay only once all five have locked in', () => {
    const lockedCrew = Object.fromEntries(PEOPLE.map(n => [n, { ...crew('Brittany', true), name: n }]));
    expect(chosenStays(base({ suggestions: [stay], crew: lockedCrew }), 'Brittany', plan).map(c => c.title)).toEqual(['Hill hut']);
    expect(chosenStays(base({ suggestions: [stay], crew: { ...lockedCrew, Saulie: { ...lockedCrew.Saulie, locked: false } } }), 'Brittany', plan)).toEqual([]);
  });
  it('ignores a pin on a withdrawn stay', () => {
    const s = base({ suggestions: [{ ...stay, status: 'withdrawn' }], admin: { pins: [{ area: 'Ella', suggestionId: 's1', at: '2026-10-16T01:00:00Z' }], scouts: {} } });
    expect(chosenStays(s, 'Brittany', plan)).toEqual([]);
  });
});
