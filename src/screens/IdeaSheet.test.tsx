import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { motion } from '../components/motion';
import { MemoryStore } from '../guest/MemoryStore';
import { seedState } from '../guest/seed';
import { groupResult } from '../lib/group';
import { RELEASE } from '../lib/release';
import { AppProvider, useApp } from '../state';
import App from '../App';
import { seenWalkToday, submittedResp } from '../__fixtures__/seed';
import { ADMIN_IDS } from '../lib/tripadmin';
import { SEEN_KEY } from './MissionComplete';
import { ADMIN_KEY } from '../store/tripKey';
import { PEOPLE } from '../types';
import type { GroupResult, Item, Leg, Player, ReleasePlan, TripSettings } from '../types';
import MeTab from './MeTab';
import Organiser from './Organiser';
import { dayNote, parseIdea } from './IdeaSheet';
import RouteTab from './RouteTab';

vi.mock('../components/sound', async orig => ({ ...(await orig<typeof import('../components/sound')>()), thud: vi.fn(), jingle: vi.fn() }));
vi.mock('../components/motion', async orig => ({ ...(await orig<typeof import('../components/motion')>()), motion: vi.fn(() => 'still') }));

const items = (catalogue as unknown as { items: Item[] }).items;
const group: GroupResult = groupResult(seedState(), items, legsData as Leg[], [], RELEASE);
const plan: ReleasePlan = { ...RELEASE!, dayEdits: [] };
const settings: TripSettings = { startDate: '2026-12-08', lastDayStart: null, plan, bookingDates: {}, overrides: [], updatedAt: '2026-11-01T00:00:00.000Z' };

// The real seed and the in-memory store the guest demo uses; only the writes are watched.
class Spy extends MemoryStore {
  added: Parameters<MemoryStore['addSuggestion']>[0][] = [];
  statuses: [string, string][] = [];
  saves: Parameters<MemoryStore['saveTripSettings']>[0][] = [];
  addSuggestion(s: Parameters<MemoryStore['addSuggestion']>[0]) { this.added.push(s); return super.addSuggestion(s); }
  setSuggestionStatus(id: string, status: Parameters<MemoryStore['setSuggestionStatus']>[1]) { this.statuses.push([id, status]); return super.setSuggestionStatus(id, status); }
  saveTripSettings(p: Parameters<MemoryStore['saveTripSettings']>[0]) { this.saves.push(p); return super.saveTripSettings(p); }
}
const fresh = () => new Spy({ ...seedState(), tripSettings: settings });
const as = (who: Player) => { localStorage.setItem('tp:me', who); if (who === 'Brittany') localStorage.setItem('tp-admin-key', 'k'); };
const route = async (store: Spy) => {
  render(<AppProvider store={store}><RouteTab group={group} next={null} onOpen={vi.fn()} today="2026-12-01" /></AppProvider>);
  await screen.findByRole('group', { name: 'Days' });
};
const chip = (n: number) => screen.getByRole('button', { name: new RegExp(`^Day ${n}\\b`) });
const send = async (user: ReturnType<typeof userEvent.setup>, store: Spy, title: string, note = '') => {
  await route(store);
  await user.click(chip(3));
  await user.click(screen.getByRole('button', { name: 'Add an idea for this day' }));
  await user.type(screen.getByLabelText('Title'), title);
  if (note) await user.type(screen.getByLabelText('Note (optional)'), note);
  await user.click(screen.getByRole('button', { name: 'Save idea' }));
};
const organiser = async (store: Spy) => {
  as('Brittany');
  render(<AppProvider store={store}><Organiser target="ideas" /></AppProvider>);
  await screen.findByRole('button', { name: /^Ideas/ });
};

beforeEach(() => { localStorage.clear(); window.location.hash = ''; window.history.replaceState(null, ''); vi.mocked(motion).mockReturnValue('still'); });
afterEach(cleanup);

describe('the day tag in an idea note', () => {
  it('writes "Day N: " in front of what the friend typed', () => {
    expect(dayNote(3, 'go early')).toBe('Day 3: go early');
    expect(dayNote(3, '')).toBe('Day 3: ');
  });

  it('reads back only a tag the sheet wrote', () => {
    expect(parseIdea('Day 3: go early')).toEqual({ day: 3, text: 'go early' });
    expect(parseIdea('Day 12: ')).toEqual({ day: 12, text: '' });
    expect(parseIdea('Day trip to Ella')).toEqual({ day: null, text: 'Day trip to Ella' });
    for (const bad of ['', 'Day 0: x', 'Day 03: x', 'Day 3:x', 'day 3: x', 'Day 2.5: x', 'Day -1: x', 'A Day 3: x']) expect(parseIdea(bad)).toEqual({ day: null, text: bad });
  });
});

describe('an idea on a day, through the Route tab', () => {
  it('Lazza saves an idea from day 3: the note is "Day 3: go early" and the day card says it waits on Brittany', async () => {
    as('Lazza');
    const store = fresh(), user = userEvent.setup();
    await send(user, store, 'Tea factory', 'go early');
    const area = within(screen.getByRole('region', { name: 'Day 3' })).getByText(/^(Hill country|Kandy and Knuckles|Cultural Triangle|South coast|Colombo)$/).textContent;
    await waitFor(() => expect(store.added).toEqual([{ name: 'Lazza', title: 'Tea factory', area, note: 'Day 3: go early' }]));
    const card = screen.getByRole('region', { name: 'Day 3' });
    expect(await within(card).findByText('Idea · Lazza · waiting on Brittany')).toBeInTheDocument();
    expect(card).toHaveTextContent('Tea factory');
    expect(card).toHaveTextContent('go early');
    expect(card).not.toHaveTextContent('Day 3: go early');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(chip(4));
    expect(screen.queryByText(/waiting on Brittany/)).toBeNull();
  });

  it('keeps Save idea off until there is a title, and a note is optional', async () => {
    as('Lazza');
    const store = fresh(), user = userEvent.setup();
    await route(store);
    await user.click(chip(3));
    await user.click(screen.getByRole('button', { name: 'Add an idea for this day' }));
    expect(screen.getByRole('button', { name: 'Save idea' })).toBeDisabled();
    await user.type(screen.getByLabelText('Title'), 'Waterfall');
    await user.click(screen.getByRole('button', { name: 'Save idea' }));
    await waitFor(() => expect(store.added[0].note).toBe('Day 3: '));
  });

  it('signed out gets no door', async () => {
    await route(fresh());
    expect(screen.queryByRole('button', { name: 'Add an idea for this day' })).toBeNull();
  });

  it('a demo guest gets no door', async () => {
    const Guest = () => { const { me, setMe } = useApp(); useEffect(() => { setMe('Tuktuk'); }, [setMe]); return me === 'Tuktuk' ? <RouteTab group={group} next={null} onOpen={vi.fn()} today="2026-12-01" /> : null; };
    render(<AppProvider store={fresh()} sandbox={{ onFinish: () => {} }}><Guest /></AppProvider>);
    await screen.findByRole('group', { name: 'Days' });
    expect(screen.queryByRole('button', { name: 'Add an idea for this day' })).toBeNull();
  });
});

describe('ideas in the Organiser', () => {
  it('Add to the day on that idea adds exactly one custom stop on day 3 and the idea becomes live', async () => {
    const store = fresh(), user = userEvent.setup();
    await store.addSuggestion({ name: 'Lazza', title: 'Tea factory', area: 'Hill country', note: dayNote(3, 'go early') });
    await organiser(store);
    expect(screen.getByRole('button', { name: /^Ideas/ })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: /^Add to the day/ }));
    await waitFor(() => expect(store.statuses).toEqual([[expect.any(String), 'live']]));
    expect(store.saves).toHaveLength(1);
    const stops = store.saves[0].plan!.dayEdits.filter(e => e.kind === 'custom');
    expect(stops).toEqual([expect.objectContaining({ id: 'c:1', day: 3, title: 'Tea factory', area: 'Hill country', note: 'go early' })]);
    expect((await store.load()).suggestions.map(s => s.status)).toEqual(['live']);
    expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
  });

  it('an idea whose note is "Day trip to Ella" and an old idea with no note sit under No day with no Add to the day', async () => {
    const store = fresh();
    await store.addSuggestion({ name: 'Saulie', title: 'Ella rock', area: 'Hill country', note: 'Day trip to Ella' });
    await store.addSuggestion({ name: 'Alex', title: 'Old idea', area: 'Colombo', note: '' });
    await organiser(store);
    const none = screen.getByRole('group', { name: 'No day' });
    expect(within(none).getByText('Ella rock')).toBeInTheDocument();
    expect(within(none).getByText('Old idea')).toBeInTheDocument();
    expect(within(none).getByText('Day trip to Ella')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add to the day/ })).toBeNull();
    expect(within(none).getAllByRole('button', { name: /^Not this time/ })).toHaveLength(2);
  });

  it('a friend gets no Organiser and so no Ideas section', async () => {
    const store = fresh();
    await store.addSuggestion({ name: 'Lazza', title: 'Tea factory', area: 'Hill country', note: dayNote(3, '') });
    as('Alex');
    const { container } = render(<AppProvider store={store}><Organiser target="ideas" /></AppProvider>);
    await new Promise(r => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });
});

describe('the old door to Suggest', () => {
  it('Me has no Suggest an idea row', async () => {
    as('Alex');
    render(<AppProvider store={fresh()}><MeTab me="Alex" onOpen={vi.fn()} onQuiz={() => {}} onBingo={() => {}} onNotYou={() => {}} /></AppProvider>);
    await screen.findByRole('button', { name: /Not you/ });
    expect(screen.queryByRole('button', { name: /Suggest an idea/ })).toBeNull();
    expect(screen.getByRole('button', { name: /What would you change/ })).toBeInTheDocument();
  });
});

describe('Ideas waiting, through the whole app', () => {
  it('opens the Organiser with the Ideas section already open, and the idea is there', async () => {
    localStorage.setItem('tp:me', 'Brittany');
    for (const p of PEOPLE) localStorage.setItem(`tp:resp:${p}`, JSON.stringify(submittedResp(p)));
    localStorage.setItem('tp:reveal-seen', `${RELEASE!.days}:${RELEASE!.items.join(',')}`);
    seenWalkToday();
    localStorage.setItem('tp:settings', JSON.stringify({ startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: '2026-11-02T00:00:00Z' }));
    // Everything else is done, so the idea is the one thing Brittany still owes and the To do tab leads with it.
    const AT = '2026-11-02T00:00:00Z', put = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
    const areas = [...new Set(group.final!.days.flatMap(d => (d.area ? [d.area] : [])))];
    put('tp:placesug', areas.map(a => ({ id: `s-${a}`, name: 'Alex', area: a, kind: 'stay', title: `${a} stay`, status: 'live', createdAt: AT })));
    put('tp:staysadmin', { pins: areas.map(a => ({ area: a, suggestionId: `s-${a}`, at: AT })), scouts: {}, closed: [] });
    put('tp:travellers', Object.fromEntries(PEOPLE.map(p => [p, { name: p, arriveLocal: '2026-12-08T09:00', arriveFlight: null, departLocal: '2026-12-16T09:00', departFlight: null, updatedAt: AT }])));
    put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ADMIN_IDS.map(id => [id, { done: true, doneAt: AT }])), updatedAt: AT });
    localStorage.setItem(SEEN_KEY, '1');
    localStorage.setItem(ADMIN_KEY, 'k');
    localStorage.setItem('tp:sugg', JSON.stringify([{ id: 'i1', name: 'Lazza', title: 'Tea factory', area: 'Hill country', note: dayNote(3, 'go early'), status: 'pending', createdAt: '2026-11-20T00:00:00Z' }]));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: /^To do/ }));
    expect(await screen.findByText(/Ideas waiting \(1\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: /^Ideas/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Add to the day: Tea factory' })).toBeInTheDocument();
  });
});
