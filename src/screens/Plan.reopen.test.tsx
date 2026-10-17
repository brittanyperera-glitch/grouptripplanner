import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import { LocalStore } from '../store/local';
import { AppProvider } from '../state';
import { emptyRanking, PEOPLE } from '../types';
import type { GroupResult, Item, Person, Plan as PlanT, Response } from '../types';
import Knockouts from './Knockouts';
import Plan from './Plan';

const ITEMS = (catalogue as unknown as { items: Item[] }).items;
const [A, B] = [ITEMS[0], ITEMS[1]];
const SCUBA = ITEMS.find(i => i.id === 'scuba')!;

const resp = (name: Person, final: boolean): Response => {
  const r = emptyRanking(); r.must = [[A.id]];
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: [A.id], submitted: true, updatedAt: '', final: final ? r : null };
};
const onePlace = (it: Item): PlanT => ({
  route: ['AIR', 'AIR'], areas: [], chosen: [it.id], dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [{ n: 1, area: null, spare: 0, rainSlack: false, entries: [{ kind: 'activity', label: it.name, hours: 2, onSite: 2, itemId: it.id }] }],
});
// A reopened plan: the scuba vote is the only open question, final is null, held is the locked plan.
const reopened = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: onePlace(B), final: null, held: onePlace(A), extras: [], results: [], knocked: [], finalized: [], locked: false,
  knockouts: [{ forkId: 'ko:scuba', a: ['scuba'], b: [A.id], votes: { a: [], b: [] } }], ...over,
});
const seed = (finals: number) => PEOPLE.forEach((p, i) => localStorage.setItem(`tp:resp:${p}`, JSON.stringify(resp(p, i < finals))));
beforeEach(() => localStorage.clear());

describe('S1: Group trip while a late vote is open', () => {
  it('shows the locked plan, not the pre-vote base, and says the vote is pending', async () => {
    seed(5);
    render(<AppProvider store={new LocalStore()}><Plan group={reopened()} /></AppProvider>);
    expect(await screen.findByText(`Locked plan. New vote open: ${SCUBA.name}`)).toBeInTheDocument();
    expect(screen.getAllByText(A.name, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText(B.name, { exact: false })).toBeNull();
  });
  it('before all five have finalized it stays provisional but still shows the held plan', async () => {
    seed(4);
    render(<AppProvider store={new LocalStore()}><Plan group={reopened()} /></AppProvider>);
    expect(await screen.findByText('Provisional until the knockouts are done')).toBeInTheDocument();
    expect(screen.queryByText(B.name, { exact: false })).toBeNull();
  });
});

describe('Trip admin link on a reopened route', () => {
  const BOOKABLE = ITEMS.find(i => i.book)!;
  const link = async (finals: number) => {
    seed(finals);
    localStorage.setItem('tp:me', 'Alex');
    render(<AppProvider store={new LocalStore()}><Plan group={reopened({ held: onePlace(BOOKABLE) })} /></AppProvider>);
    return (await screen.findByRole('button', { name: /Trip admin/ })).textContent;
  };
  it('counts the held plan\'s bookings once all five lists are saved', async () => {
    expect(await link(5)).toMatch(/7 to do/);
  });
  it('counts only personal items while lists are still being saved', async () => {
    expect(await link(4)).toMatch(/6 to do/);
  });
});

describe('S7: a late item that does not fit', () => {
  it('is listed in Decided, in plain words', async () => {
    const g = reopened({ held: undefined, knockouts: [], final: onePlace(A), results: [{ forkId: 'ko:scuba:nofit', a: ['scuba'], b: [], winner: 'nofit' }] });
    render(<AppProvider store={new LocalStore()}><Knockouts group={g} /></AppProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'Decided 1' }));
    const line = `${SCUBA.name} doesn't fit the 9-day plan`;
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(line.split(' ').length).toBeLessThan(15);
  });
});
