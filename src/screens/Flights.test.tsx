import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { Person } from '../types';
import FlightsScreen, { Flights } from './Flights';

beforeEach(() => { localStorage.clear(); });
afterEach(() => cleanup());

const mount = async (me: Person, seed?: (s: LocalStore) => Promise<void>) => {
  localStorage.setItem('tp:me', me);
  const store = new LocalStore();
  await seed?.(store);
  const save = vi.spyOn(store, 'saveTraveller');
  render(<AppProvider store={store}><FlightsScreen /></AppProvider>);
  await screen.findByRole('list', { name: 'Flights' });
  return { save, user: userEvent.setup() };
};

describe('Flights', () => {
  it('saving my row calls saveTraveller with the date and time joined as YYYY-MM-DDTHH:mm', async () => {
    const { save, user } = await mount('Alex');
    const mine = within(screen.getByRole('listitem', { name: 'Alex' }));
    await user.type(mine.getByLabelText('Arrival date'), '2026-12-08');
    await user.type(mine.getByLabelText('Arrival time'), '06:40');
    await user.type(mine.getByLabelText('Arrival flight'), 'UL 504');
    await user.type(mine.getByLabelText('Departure date'), '2026-12-17');
    await user.type(mine.getByLabelText('Departure time'), '21:15');
    await user.click(mine.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Alex', { arriveLocal: '2026-12-08T06:40', arriveFlight: 'UL 504', departLocal: '2026-12-17T21:15', departFlight: null }));
  });

  it('another person row shows their flight and times and has no inputs', async () => {
    await mount('Alex', s => s.saveTraveller('Antek', { arriveLocal: '2026-12-08T06:40', arriveFlight: 'QR 664', departLocal: '2026-12-17T21:15', departFlight: 'QR 665' }));
    const theirs = within(screen.getByRole('listitem', { name: 'Antek' }));
    expect(theirs.getByText(/QR 664/)).toBeInTheDocument();
    expect(theirs.getByText(/2026-12-08 06:40/)).toBeInTheDocument();
    expect(theirs.getByText(/QR 665/)).toBeInTheDocument();
    expect(theirs.queryAllByRole('textbox')).toHaveLength(0);
    expect(theirs.queryByRole('button')).toBeNull();
    expect(document.querySelectorAll('li[aria-label="Antek"] input')).toHaveLength(0);
    expect(document.querySelectorAll('li[aria-label="Alex"] input').length).toBeGreaterThan(0);
  });

  it('a traveller landing after day 1 shows the late flag under their name', async () => {
    await mount('Alex', async s => {
      await s.saveTripSettings({ startDate: '2026-12-07' });
      await s.saveTraveller('Antek', { arriveLocal: '2026-12-08T06:40', departLocal: '2026-12-17T21:15' });
    });
    expect(within(screen.getByRole('listitem', { name: 'Antek' })).getByText('Antek lands on 2026-12-08, after day 1 (2026-12-07)')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Alex' })).queryByText(/lands on/)).toBeNull();
  });

  it('a half-filled pair saves as null, so a lone time is never stored as a date', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Flights me="Alex" travellers={{}} startDate={null} days={9} onSave={onSave} />);
    await user.type(screen.getByLabelText('Arrival time'), '06:40');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ arriveLocal: null, arriveFlight: null, departLocal: null, departFlight: null });
  });
});
