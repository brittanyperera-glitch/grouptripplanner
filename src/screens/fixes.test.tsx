import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import { emptyRanking, PEOPLE } from '../types';
import type { GroupResult, Item, Person, Plan, Response } from '../types';
import Knockouts from './Knockouts';
import { DayRows } from './MyTrip';
import Waiting from './Waiting';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const ids = ITEMS.slice(0, 8).map(i => i.id);
const nm = (id: string) => ITEMS.find(i => i.id === id)!.name;
// Unrated sides tie on score, so the tiebreak is id order.
const byIdOrder = (xs: string[]) => [...xs].sort().map(nm).join(', ');

const resp = (name: Person, must: string[], keen: string[] = []): Response => {
  const r = emptyRanking();
  r.must = must.map(id => [id]);
  r.keen = keen.map(id => [id]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: [...must, ...keen], submitted: true, updatedAt: '' };
};
const seedResp = (r: Response) => localStorage.setItem(`tp:resp:${r.name}`, JSON.stringify(r));
beforeEach(() => localStorage.clear());

const group = (over: Partial<GroupResult>): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, final: null, extras: [], results: [], knockouts: [], ...over,
});
const show = (g: GroupResult) => render(<AppProvider store={new LocalStore()}><Knockouts group={g} /></AppProvider>);

describe('U1 knockout sides', () => {
  it('shows at most 2 names, liked items first, then "and N more"', async () => {
    seedResp(resp('Alex', [ids[5]], [ids[3]]));
    show(group({ knockouts: [{ forkId: 'k', a: [ids[0]], b: [ids[1], ids[2], ids[3], ids[4], ids[5]], votes: { a: [], b: [] } }] }));
    const card = await screen.findByRole('group', { name: /Knockout/ });
    expect(within(card).getByText(`${nm(ids[5])}, ${nm(ids[3])} and 3 more`)).toBeInTheDocument();
    expect(within(card).queryByText(new RegExp(nm(ids[4])))).toBeNull();
  });
  it('shows a short side in full', async () => {
    show(group({ knockouts: [{ forkId: 'k', a: [ids[0], ids[1]], b: [ids[2]], votes: { a: [], b: [] } }] }));
    const card = await screen.findByRole('group', { name: /Knockout/ });
    expect(within(card).getByText(byIdOrder([ids[0], ids[1]]))).toBeInTheDocument();
  });
});

describe('U2 decided list', () => {
  it('has one Decided heading and plain left-aligned lines', async () => {
    show(group({ results: [
      { forkId: 'r1', a: [ids[0]], b: [ids[1], ids[2], ids[3]], winner: 'a' },
      { forkId: 'r2', a: [ids[4]], b: [ids[5]], winner: 'b' },
      { forkId: 'r3', a: [ids[6]], b: [], winner: 'displaced' },
    ] }));
    await screen.findByText(`${nm(ids[0])} beat ${byIdOrder([ids[1], ids[2], ids[3]].sort().slice(0, 2))} and 1 more`);
    expect(screen.getByText(`${nm(ids[5])} beat ${nm(ids[4])}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${nm(ids[6])} dropped out`))).toBeInTheDocument();
    expect(screen.getAllByText('Decided')).toHaveLength(1);
    expect(screen.queryByText(/Decided:/)).toBeNull();
  });
});

const planWith = (entries: Plan['days'][number]['entries'][]): Plan => ({
  route: [], areas: [], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: entries.map((e, i) => ({ n: i + 1, area: null, spare: 0, rainSlack: false, entries: e })),
});
const dr = (to: string, hours: number) => ({ kind: 'drive' as const, label: `Drive from A to ${to}`, hours });

describe('U3 on-site hours', () => {
  it('shows on-site hours and a muted round-trip line', () => {
    render(<DayRows plan={planWith([[
      { kind: 'activity', label: 'Knuckles day hike', hours: 11.1, onSite: 6, roundTrip: 5.1 },
      { kind: 'activity', label: 'Temple', hours: 2.5, onSite: 2.5, roundTrip: 0 },
      { kind: 'activity', label: 'Old style', hours: 3 },
    ]])} />);
    expect(screen.getByText('Knuckles day hike, 6 h')).toBeInTheDocument();
    expect(screen.getByText('plus about 5.1 h there and back')).toBeInTheDocument();
    expect(screen.getByText('Temple, 2.5 h')).toBeInTheDocument();
    expect(screen.getByText('Old style, 3 h')).toBeInTheDocument();
    expect(screen.getAllByText(/there and back/)).toHaveLength(1);
  });
});

describe('U5 long driving day', () => {
  it('flags days with 5 h or more of driving only', () => {
    render(<DayRows plan={planWith([[dr('Ella', 4), dr('Tissa', 2.1)], [dr('Kandy', 4.9)]])} />);
    expect(screen.getAllByText('Long driving day')).toHaveLength(1);
    const day1 = screen.getAllByRole('listitem')[0];
    expect(within(day1).getByText('Long driving day')).toBeInTheDocument();
  });
});

describe('waiting screen', () => {
  it('shows all five avatars, a tick on who has submitted, muted for the rest, and no nudge', async () => {
    localStorage.setItem('tp:me', 'Brittany');
    seedResp(resp('Alex', [ids[0]]));
    render(<AppProvider store={new LocalStore()}><Waiting /></AppProvider>);
    await screen.findByText('1 of 5 done');
    const tiles = document.querySelectorAll('.wait-person');
    expect(tiles).toHaveLength(5);
    expect(document.querySelectorAll('.wait-person svg.avatar-art')).toHaveLength(5);
    for (const p of PEOPLE) {
      const tile = screen.getByRole('listitem', { name: new RegExp(`^${p}`) });
      const done = p === 'Alex';
      expect(tile).toHaveAttribute('data-done', String(done));
      expect(within(tile).queryAllByLabelText('Submitted')).toHaveLength(done ? 1 : 0);
    }
    expect(screen.queryByRole('button', { name: /nudge|remind/i })).toBeNull();
  });
});

describe('local demo votes', () => {
  it('fills the other four, never overwriting a submitted one, and keeps me untouched', async () => {
    localStorage.setItem('tp:me', 'Brittany');
    seedResp(resp('Alex', [ids[0]]));
    const user = userEvent.setup();
    render(<AppProvider store={new LocalStore()}><Waiting /></AppProvider>);
    await screen.findByText('1 of 5 done');
    await user.click(screen.getByRole('button', { name: 'Fill the other four with sample votes' }));
    await screen.findByText('4 of 5 done');
    expect(localStorage.getItem('tp:resp:Brittany')).toBeNull();
    const alex = JSON.parse(localStorage.getItem('tp:resp:Alex')!) as Response;
    expect(alex.ranking.must).toEqual([[ids[0]]]);
    const others = PEOPLE.filter(p => p !== 'Brittany' && p !== 'Alex');
    const rows = others.map(p => JSON.parse(localStorage.getItem(`tp:resp:${p}`)!) as Response);
    for (const r of rows) {
      expect(r.submitted).toBe(true);
      expect(r.pace).toBe(1);
      expect(r.ranking.must.length).toBeGreaterThan(0);
      expect(r.ranking.keen.length).toBeGreaterThan(0);
      for (const id of [...r.ranking.must.flat(), ...r.ranking.keen.flat()]) expect(ITEMS.some(i => i.id === id)).toBe(true);
    }
    expect(new Set(rows.map(r => r.ranking.must.flat().join())).size).toBe(rows.length);
    expect(new Set(rows.map(r => `${r.days}${r.flex}`)).size).toBeGreaterThan(1);
  });
});
