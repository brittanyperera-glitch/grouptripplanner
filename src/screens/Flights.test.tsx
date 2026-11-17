import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import releaseJson from '../content/release.json';
import type { Pace, Person } from '../types';
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

  it('a half-filled pair is refused with a message, so a lone time never erases the stored arrival', async () => {
    const { save, user } = await mount('Alex', s => s.saveTraveller('Alex', { arriveLocal: '2026-12-08T06:40', departLocal: '2026-12-17T21:15' }));
    const mine = within(screen.getByRole('listitem', { name: 'Alex' }));
    await user.clear(mine.getByLabelText('Arrival time'));
    save.mockClear();
    await user.click(mine.getByRole('button', { name: 'Save' }));
    expect(await mine.findByRole('alert')).toHaveTextContent('Fill in both the date and the time, or clear both.');
    expect(save).not.toHaveBeenCalled();
    await user.clear(mine.getByLabelText('Arrival date'));
    await user.click(mine.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Alex', expect.objectContaining({ arriveLocal: null, departLocal: '2026-12-17T21:15' })));
  });

  it('shows Saved after the real save, even though saveTraveller changes my row at once', async () => {
    const { user } = await mount('Alex');
    const mine = within(screen.getByRole('listitem', { name: 'Alex' }));
    await user.type(mine.getByLabelText('Arrival date'), '2026-12-08');
    await user.type(mine.getByLabelText('Arrival time'), '06:40');
    await user.click(mine.getByRole('button', { name: 'Save' }));
    expect(await mine.findByRole('status')).toHaveTextContent('Saved');
  });

  it('keeps what I am typing while my save is still in flight', async () => {
    const { save, user } = await mount('Alex');
    let release!: () => void;
    save.mockImplementation(() => new Promise<void>(r => { release = r; }));
    const mine = within(screen.getByRole('listitem', { name: 'Alex' }));
    await user.type(mine.getByLabelText('Arrival flight'), 'UL 504');
    await user.click(mine.getByRole('button', { name: 'Save' }));
    await user.type(mine.getByLabelText('Departure flight'), 'QR 665');
    expect(mine.getByLabelText('Departure flight')).toHaveValue('QR 665');
    expect(mine.getByLabelText('Arrival flight')).toHaveValue('UL 504');
    release();
    await waitFor(() => expect(mine.queryByRole('status')).toBeInTheDocument());
  });

  it('flags a departure before the last day using the trip length from the plan', async () => {
    await mount('Alex', async s => {
      await s.saveTripSettings({ startDate: '2026-12-07', plan: { ...releaseJson, pace: releaseJson.pace as Pace, days: 5, dayEdits: [] } });
      await s.saveTraveller('Antek', { arriveLocal: '2026-12-07T06:40', departLocal: '2026-12-10T21:15' });
    });
    expect(within(screen.getByRole('listitem', { name: 'Antek' })).getByText('Antek leaves on 2026-12-10, before the last day (2026-12-11)')).toBeInTheDocument();
  });

  it('with the trip length unknown, no leaves-early flag is guessed', () => {
    render(<Flights me="Alex" travellers={{ Antek: { name: 'Antek', arriveLocal: '2026-12-07T06:40', arriveFlight: null, departLocal: '2026-12-10T21:15', departFlight: null, updatedAt: '' } }} startDate="2026-12-07" days={null} onSave={vi.fn()} />);
    expect(screen.queryByText(/before the last day/)).toBeNull();
  });
});
