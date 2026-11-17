import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { AppProvider } from '../state';
import { LocalStore } from '../store/local';
import type { Area, GroupResult, Item, Leg, PlaceSuggestion } from '../types';
import Today, { TodayScreen } from './Today';
import { useTripModel } from './useTripModel';
import { useApp } from '../state';

const group: GroupResult = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const AT = '2026-11-02T00:00:00Z';
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const stay = (area: Area): PlaceSuggestion => ({ id: `s-${area}`, name: 'Alex', area, kind: 'stay', title: `House ${area}`, link: `https://x.test/${area}`, status: 'live', createdAt: AT });
const trip = (extra: Record<string, unknown> = {}) => {
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  for (const [k, v] of Object.entries(extra)) put(k, v);
};
const traveller = (name: string, arriveLocal: string | null, departLocal: string | null) => ({ name, arriveLocal, arriveFlight: null, departLocal, departFlight: null, updatedAt: AT });
const screenOn = (today: string) => {
  const onWholeTrip = vi.fn();
  return { onWholeTrip, ...render(<AppProvider store={new LocalStore()}><TodayScreen group={group} today={today} onWholeTrip={onWholeTrip} /></AppProvider>) };
};

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe('Today on the released plan from 2026-12-08', () => {
  it('on day 3 shows day 3, tonight\'s stay with its link, and the next leg', async () => {
    const area = group.final!.days[2].area!;
    trip({ 'tp:placesug': [stay(area)], 'tp:staysadmin': { pins: [{ area, suggestionId: `s-${area}`, at: AT }], scouts: {}, closed: [] } });
    screenOn('2026-12-10');
    const today = await screen.findByLabelText('Today');
    expect(within(today).getByLabelText('Day 3')).toBeInTheDocument();
    expect(within(today).getByText('Day 3 · Thu 10 Dec')).toBeInTheDocument();
    const tonight = within(today).getByLabelText('Tonight');
    expect(tonight).toHaveTextContent(`House ${area}`);
    expect(within(tonight).getByRole('link')).toHaveAttribute('href', `https://x.test/${area}`);
    expect(within(today).getByLabelText('Next leg')).toHaveTextContent(/Drive|Train/);
  });

  it('calls onWholeTrip with the day number', async () => {
    trip();
    const { onWholeTrip } = screenOn('2026-12-10');
    fireEvent.click(await screen.findByRole('button', { name: /See the whole trip/ }));
    expect(onWholeTrip).toHaveBeenCalledWith(3);
  });

  it('on the last day, with a traveller departing 14:30, says when to leave for the airport', async () => {
    trip({ 'tp:travellers': { Alex: traveller('Alex', '2026-12-08T09:00', '2026-12-16T14:30') } });
    screenOn('2026-12-16');
    const today = await screen.findByLabelText('Today');
    expect(within(today).getByLabelText(`Day ${group.final!.days.length}`)).toBeInTheDocument();
    expect(within(today).getByText(/Leave for the airport by/)).toHaveTextContent(/^Leave for the airport by (0\d|1[0-4]):\d\d$/);
    expect(within(today).queryByLabelText('Next leg')).toBeNull();
  });

  it('shows tonight once, in its own box, and Britt\'s line for a place on the day', async () => {
    const days = group.final!.days;
    const items = (catalogue as unknown as { items: Item[] }).items;
    const at = days.findIndex(d => d.entries.some(e => e.itemId && items.find(i => i.id === e.itemId)?.britt));
    const britt = items.find(i => i.id === days[at].entries.find(e => e.itemId && items.find(i => i.id === e.itemId)?.britt)!.itemId)!.britt!;
    const area = days[at].area!;
    trip({ 'tp:placesug': [stay(area)], 'tp:staysadmin': { pins: [{ area, suggestionId: `s-${area}`, at: AT }], scouts: {}, closed: [] } });
    screenOn(`2026-12-${String(8 + at).padStart(2, '0')}`);
    const today = await screen.findByLabelText('Today');
    expect(within(today).getByText('Britt says:').closest('p')).toHaveTextContent(britt);
    expect(within(today).getAllByText(new RegExp(`House ${area}`))).toHaveLength(1);
  });

  it('gives no leave-by line when the latest departure is before the last day', async () => {
    trip({ 'tp:travellers': { Alex: traveller('Alex', '2026-12-08T09:00', '2026-12-15T14:30') } });
    screenOn('2026-12-16');
    await screen.findByLabelText('Today');
    expect(screen.queryByText(/Leave for the airport/)).toBeNull();
  });

  it('on day 1 shows the last arrival', async () => {
    trip({ 'tp:travellers': { Alex: traveller('Alex', '2026-12-08T09:00', null), Lazza: traveller('Lazza', '2026-12-08T17:45', null) } });
    screenOn('2026-12-08');
    expect(await screen.findByText('Last arrival: 17:45')).toBeInTheDocument();
  });

  // A sibling in the window tells us the state has loaded, so the empty box is not just "not loaded yet".
  it.each(['2026-12-07', '2026-12-17'])('renders nothing on %s, outside the trip dates', async date => {
    trip();
    const onWholeTrip = vi.fn();
    render(<AppProvider store={new LocalStore()}>
      <div data-testid="out"><TodayScreen group={group} today={date} onWholeTrip={onWholeTrip} /></div>
      <div data-testid="in"><TodayScreen group={group} today="2026-12-10" onWholeTrip={onWholeTrip} /></div>
    </AppProvider>);
    await within(await screen.findByTestId('in')).findByLabelText('Today');
    expect(screen.getByTestId('out')).toBeEmptyDOMElement();
  });

  it('renders nothing while the trip has no start date', async () => {
    const { container } = screenOn('2026-12-10');
    await new Promise(r => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});

// The props-in component, on the real release and a real model, with leaveBy handed in as the container would.
function Props({ today, leaveBy, onWholeTrip }: { today: string; leaveBy: string | null; onWholeTrip(n: number): void }) {
  const { items, legs } = useApp();
  return <Today model={useTripModel(group, today)} items={items} legs={legs} leaveBy={leaveBy} onWholeTrip={onWholeTrip} />;
}
const props = (today: string, leaveBy: string | null) => {
  const onWholeTrip = vi.fn();
  trip();
  const out = render(<AppProvider store={new LocalStore()}><div data-testid="in"><Props today="2026-12-10" leaveBy={null} onWholeTrip={onWholeTrip} /></div><div data-testid="at"><Props today={today} leaveBy={leaveBy} onWholeTrip={onWholeTrip} /></div></AppProvider>);
  return { onWholeTrip, ...out };
};

describe('Today props-in', () => {
  it('shows the leave-by time it is given on the last day, and no line when it is null', async () => {
    props('2026-12-16', '10:30');
    await within(await screen.findByTestId('in')).findByLabelText('Today');
    expect(within(screen.getByTestId('at')).getByText('Leave for the airport by 10:30')).toBeInTheDocument();
    cleanup();
    props('2026-12-16', null);
    await within(await screen.findByTestId('in')).findByLabelText('Today');
    expect(within(screen.getByTestId('at')).getByLabelText('Today')).toBeInTheDocument();
    expect(within(screen.getByTestId('at')).queryByText(/Leave for the airport/)).toBeNull();
  });

  it('shows no leave-by line on a day that is not the last', async () => {
    props('2026-12-10', '10:30');
    await within(await screen.findByTestId('in')).findByLabelText('Today');
    expect(within(screen.getByTestId('at')).queryByText(/Leave for the airport/)).toBeNull();
  });

  it('stamps the postmark with the area and date, and tapping See the whole trip on day 3 calls onWholeTrip(3)', async () => {
    const { onWholeTrip } = props('2026-12-10', null);
    const at = within(await screen.findByTestId('at'));
    expect(await at.findByLabelText('Postmark')).toHaveTextContent(new RegExp(`${group.final!.days[2].area!}.*10 Dec.*2026`, 'i'));
    fireEvent.click(at.getByRole('button', { name: /See the whole trip/ }));
    expect(onWholeTrip).toHaveBeenCalledWith(3);
  });

  it.each(['2026-11-30', '2026-12-17'])('renders nothing on %s', async date => {
    props(date, '10:30');
    await within(await screen.findByTestId('in')).findByLabelText('Today');
    expect(screen.getByTestId('at')).toBeEmptyDOMElement();
  });
});
