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
import Plan from './Plan';

const group: GroupResult = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const AT = '2026-11-02T00:00:00Z';

beforeEach(() => {
  localStorage.clear();
  window.print = vi.fn();
  localStorage.setItem('tp:me', 'Brittany');
  localStorage.setItem('tp:settings', JSON.stringify({ startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT }));
  localStorage.setItem('tp:travellers', JSON.stringify({ Saulie: { name: 'Saulie', arriveLocal: '2026-12-08T09:30', arriveFlight: 'UL 504', departLocal: '2026-12-16T21:10', departFlight: 'UL 505', updatedAt: AT } }));
});
afterEach(cleanup);

const print = async (g: GroupResult) => {
  render(<AppProvider store={new LocalStore()}><Plan group={g} /></AppProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Save itinerary as PDF' }));
  return screen.findByTestId('itinerary');
};

describe('the Group trip screen prints from the trip model', () => {
  it('dates the days and lists flights and nights when the plan is the released one', async () => {
    const doc = await print(group);
    await waitFor(() => expect(within(doc).getAllByRole('heading', { name: /^Day 1 · Tue 8 Dec/ })).toHaveLength(1));
    expect(within(doc).getAllByRole('heading', { name: 'Bookings' })).toHaveLength(1);
    expect(within(doc).getByRole('list', { name: 'Flights' })).toBeInTheDocument();
    expect(within(doc).getByRole('list', { name: 'Nights' })).toBeInTheDocument();
  });

  it('prints undated when the screen shows a held plan, since the model only knows the final one', async () => {
    const held = { ...group, final: null, held: group.final ?? undefined, locked: false };
    const doc = await print(held);
    expect(within(doc).getAllByRole('region', { name: /^Day \d$/ }).length).toBeGreaterThan(0);
    expect(within(doc).queryByRole('heading', { name: /Tue 8 Dec/ })).toBeNull();
    expect(within(doc).getAllByRole('heading', { name: 'Bookings' }).length).toBeLessThanOrEqual(1);
  });
});
