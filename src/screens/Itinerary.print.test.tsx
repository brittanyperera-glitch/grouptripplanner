import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { GroupResult, Item, Leg } from '../types';
import { Itinerary, SaveItinerary } from './Itinerary';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const group: GroupResult = groupResult(seedState(), ITEMS, legsData as Leg[], [], RELEASE);
const plan = group.final!;
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const AT = '2026-11-02T00:00:00Z';

beforeEach(() => {
  localStorage.clear();
  window.print = vi.fn();
  localStorage.setItem('tp:me', 'Brittany');
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  put('tp:travellers', { Saulie: { name: 'Saulie', arriveLocal: '2026-12-08T09:30', arriveFlight: 'UL 504', departLocal: '2026-12-16T21:10', departFlight: 'UL 505', updatedAt: AT } });
  put('tp:claims', { 'book:train': { itemId: 'book:train', owner: 'Alex', updatedAt: AT } });
});
afterEach(cleanup);

const open = async (g: GroupResult | undefined) => {
  render(<AppProvider store={new LocalStore()}><SaveItinerary plan={plan} kind="Group" group={g} /></AppProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Save itinerary as PDF' }));
  return screen.findByTestId('itinerary');
};

describe('the print document from the trip model', () => {
  it('has one Bookings heading, with status and owner, and lists the flights and the nights', async () => {
    const doc = await open(group);
    await waitFor(() => expect(within(doc).getAllByRole('heading', { name: /^Day 1 · Tue 8 Dec/ })).toHaveLength(1));
    expect(within(doc).getAllByRole('heading', { name: 'Bookings' })).toHaveLength(1);
    expect(within(doc).getAllByRole('region', { name: 'Bookings' })).toHaveLength(1);
    const bookings = within(doc).getByRole('region', { name: 'Bookings' });
    expect(within(bookings).getByText(/Ella train|Scenic train|train/i, { selector: '.it-name' })).toBeInTheDocument();
    expect(within(bookings).getByText(/Alex is booking/)).toBeInTheDocument();
    expect(within(within(bookings).getByRole('list', { name: 'Flights' })).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      expect.stringContaining('Saulie arrives 09:30 · UL 504'), expect.stringContaining('Saulie leaves 21:10 · UL 505'),
    ]);
    const nights = within(bookings).getByRole('list', { name: 'Nights' });
    expect(within(nights).getAllByRole('listitem').length).toBeGreaterThan(3);
    expect(within(nights).getAllByRole('listitem')[0]).toHaveTextContent(/Tue 8 Dec to \w{3} \d+ Dec, \d nights?/);
    expect(within(doc).getAllByRole('region', { name: /^Day \d$/ })).toHaveLength(9);
  });

  it('prints the same nine days without a model, undated', () => {
    render(<Itinerary plan={plan} items={ITEMS} legs={legsData as Leg[]} heading="Group itinerary" />);
    expect(screen.getAllByRole('region', { name: /^Day \d$/ })).toHaveLength(9);
    expect(screen.getAllByRole('heading', { name: 'Bookings' })).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Flights' })).toBeNull();
  });
});
