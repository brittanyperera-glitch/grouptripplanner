import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import releaseJson from '../content/release.json';
import type { Pace, Person } from '../types';
import { SAVE_COPY } from './saveStatus';
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
    expect(theirs.getByText(/Tue 8 Dec 06:40/)).toBeInTheDocument();
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
    expect(within(screen.getByRole('listitem', { name: 'Antek' })).getByText('Antek lands on Tue 8 Dec, after day 1 (Mon 7 Dec)')).toBeInTheDocument();
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
    expect(within(screen.getByRole('listitem', { name: 'Antek' })).getByText('Antek leaves on Thu 10 Dec, before the last day (Fri 11 Dec)')).toBeInTheDocument();
  });

  it('with the trip length unknown, no leaves-early flag is guessed', () => {
    render(<Flights me="Alex" travellers={{ Antek: { name: 'Antek', arriveLocal: '2026-12-07T06:40', arriveFlight: null, departLocal: '2026-12-10T21:15', departFlight: null, updatedAt: '' } }} startDate="2026-12-07" days={null} onSave={vi.fn()} />);
    expect(screen.queryByText(/before the last day/)).toBeNull();
  });
});

describe('Flights honest saves, flight length and row sync', () => {
  const row = (over: Partial<Parameters<typeof Flights>[0]['travellers'] & object> = {}) => ({ Alex: { name: 'Alex' as const, arriveLocal: '2026-12-08T06:40', arriveFlight: 'UL 504', departLocal: null, departFlight: null, updatedAt: '' }, ...over });
  const props = { me: 'Alex' as const, startDate: null, days: null, onSave: vi.fn(async () => true) };

  it('a save the server refuses resolves false and the row says it is not saved, never Saved', async () => {
    const { save, user } = await mount('Alex');
    save.mockRejectedValue(Object.assign(new Error('denied'), { code: '42501' }));
    const mine = within(screen.getByRole('listitem', { name: 'Alex' }));
    await user.type(mine.getByLabelText('Arrival date'), '2026-12-08');
    await user.type(mine.getByLabelText('Arrival time'), '06:40');
    await user.click(mine.getByRole('button', { name: 'Save' }));
    expect(await mine.findByRole('status')).toHaveTextContent("Not saved yet, will retry when you're online");
    expect(mine.queryByText('Saved')).toBeNull();
  });

  it('a flight number pasted as Sri Lankan UL504 is cut to 12 characters before it reaches the store', async () => {
    const { save, user } = await mount('Alex');
    const mine = within(screen.getByRole('listitem', { name: 'Alex' }));
    expect(mine.getByLabelText('Arrival flight')).toHaveAttribute('maxLength', '12');
    expect(mine.getByLabelText('Departure flight')).toHaveAttribute('maxLength', '12');
    // fireEvent skips the input's maxLength, as an autofill does.
    fireEvent.change(mine.getByLabelText('Arrival flight'), { target: { value: '  Sri Lankan UL504 ' } });
    fireEvent.change(mine.getByLabelText('Departure flight'), { target: { value: 'Sri Lankan UL504' } });
    await user.click(mine.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const sent = save.mock.calls[0][1];
    expect(sent.arriveFlight).toBe('Sri Lankan U');
    expect(sent.departFlight).toBe('Sri Lankan U');
    expect(sent.arriveFlight!.length).toBeLessThanOrEqual(12);
  });

  it('inputs take the stored row when it arrives after mount, and never overwrite typing in progress', () => {
    const { rerender } = render(<Flights {...props} travellers={{}} />);
    const mine = () => within(screen.getByRole('listitem', { name: 'Alex' }));
    expect(mine().getByLabelText('Arrival flight')).toHaveValue('');
    rerender(<Flights {...props} travellers={row()} />);
    expect(mine().getByLabelText('Arrival flight')).toHaveValue('UL 504');
    expect(mine().getByLabelText('Arrival date')).toHaveValue('2026-12-08');
    fireEvent.change(mine().getByLabelText('Arrival flight'), { target: { value: 'QR 664' } });
    rerender(<Flights {...props} travellers={row({ Alex: { ...row().Alex, arriveFlight: 'EK 650' } })} />);
    expect(mine().getByLabelText('Arrival flight')).toHaveValue('QR 664');
  });
});

describe('Touchdown board', () => {
  const when = /Leave by \w{3} (\d+) Dec (\d{2}):(\d{2})/;
  const crew = (s: LocalStore) => Promise.all([
    s.saveTripSettings({ startDate: '2026-12-08', plan: { ...releaseJson, pace: releaseJson.pace as Pace, dayEdits: [] } }),
    s.saveTraveller('Lazza', { arriveLocal: '2026-12-08T10:00', departLocal: '2026-12-16T03:15' }),
    s.saveTraveller('Alex', { arriveLocal: '2026-12-08T09:00', departLocal: '2026-12-16T14:30' }),
  ]).then(() => undefined);

  it('flags the 03:15 flyer and gives each person their own leave-by (A7)', async () => {
    await mount('Brittany', crew);
    const lazza = within(screen.getByRole('listitem', { name: 'Lazza' })), alex = within(screen.getByRole('listitem', { name: 'Alex' }));
    expect(lazza.getByText(/Lazza must leave by Tue 15 Dec \d{2}:\d{2}, before the last day \(Wed 16 Dec\) starts/)).toBeInTheDocument();
    expect(alex.queryByText(/must leave by/)).toBeNull();
    const [, lDay] = lazza.getByText('Leave by').parentElement!.textContent!.match(when)!, [, aDay, aHour] = alex.getByText('Leave by').parentElement!.textContent!.match(when)!;
    expect(lDay).toBe('15');
    expect(aDay).toBe('16');
    expect(+aHour).toBeGreaterThanOrEqual(6);
  });

  it('a person with no flights reads as dark, and no raw ISO date is shown anywhere (B2)', async () => {
    await mount('Brittany', crew);
    for (const p of ['Antek', 'Saulie']) expect(within(screen.getByRole('listitem', { name: p })).getByText(/dark/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('shows Not saved yet, then Saved once the queue clears the app error (INT3)', () => {
    const onSave = vi.fn(async () => false);
    const p = { me: 'Alex' as const, travellers: {}, startDate: null, days: null, onSave };
    const { rerender } = render(<Flights {...p} appError={null} />);
    const mine = () => within(screen.getByRole('listitem', { name: 'Alex' }));
    fireEvent.click(mine().getByRole('button', { name: 'Save' }));
    return waitFor(() => expect(mine().getByRole('status')).toHaveTextContent(SAVE_COPY.unsaved)).then(async () => {
      rerender(<Flights {...p} appError="Couldn't save" />);
      rerender(<Flights {...p} appError={null} />);
      await waitFor(() => expect(mine().getByRole('status')).toHaveTextContent(SAVE_COPY.saved));
    });
  });

  it('editing after a save clears Saved, so the old verdict never sits beside an unsaved form', async () => {
    const { user } = await mount('Alex');
    const mine = within(screen.getByRole('listitem', { name: 'Alex' }));
    await user.type(mine.getByLabelText('Arrival flight'), 'UL 504');
    await user.click(mine.getByRole('button', { name: 'Save' }));
    expect(await mine.findByRole('status')).toHaveTextContent(SAVE_COPY.saved);
    await user.type(mine.getByLabelText('Departure flight'), 'Q');
    expect(mine.queryByRole('status')).toBeNull();
  });

  it('a person with only an arrival is dark like on the missions file, and still shows what they entered', async () => {
    await mount('Brittany', s => s.saveTraveller('Antek', { arriveLocal: '2026-12-08T06:40', arriveFlight: 'QR 664', departLocal: null }));
    const antek = screen.getByRole('listitem', { name: 'Antek' });
    expect(antek).toHaveClass('fx-dark');
    expect(within(antek).getByText('Dark')).toBeInTheDocument();
    expect(within(antek).getByText(/QR 664/)).toBeInTheDocument();
    expect(within(antek).getByText(/Tue 8 Dec 06:40/)).toBeInTheDocument();
  });

  it('flight numbers alone are shown, not hidden behind the no-flights-yet note', async () => {
    await mount('Brittany', s => s.saveTraveller('Antek', { arriveFlight: 'QR 664' }));
    const antek = within(screen.getByRole('listitem', { name: 'Antek' }));
    expect(antek.getByText(/QR 664/)).toBeInTheDocument();
    expect(antek.queryByText(/no flights yet/)).toBeNull();
  });

  it('my own editable row is never dimmed, even with no flights', async () => {
    await mount('Brittany', crew);
    expect(screen.getByRole('listitem', { name: 'Brittany' })).not.toHaveClass('fx-dark');
    expect(screen.getByRole('listitem', { name: 'Saulie' })).toHaveClass('fx-dark');
  });

  it('an impossible date such as 31 Feb stays as stored rather than rolling to 3 Mar', async () => {
    await mount('Alex', s => s.saveTraveller('Antek', { arriveLocal: '2026-02-31T06:40', departLocal: '2026-12-17T21:15' }));
    const antek = within(screen.getByRole('listitem', { name: 'Antek' }));
    expect(antek.getByText(/2026-02-31T06:40/)).toBeInTheDocument();
    expect(antek.queryByText(/3 Mar/)).toBeNull();
  });

  it('has a back control that calls onBack (B7)', () => {
    const onBack = vi.fn();
    render(<Flights me="Alex" travellers={{}} startDate={null} days={null} onSave={vi.fn(async () => true)} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('wears the spy shell only when told to, with the back control inside it', () => {
    const props = { me: 'Alex' as const, travellers: {}, startDate: null, days: null, onSave: vi.fn(async () => true), onBack: vi.fn() };
    const { rerender } = render(<Flights {...props} />);
    expect(document.querySelector('.spy')).toBeNull();
    rerender(<Flights {...props} spy />);
    expect(document.querySelector('.spy')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
