import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { seedState } from '../guest/seed';
import { useTripModel } from '../screens/useTripModel';
import type { TripModel } from '../screens/useTripModel';
import { AppProvider, useApp } from '../state';
import { LocalStore } from '../store/local';
import { PEOPLE } from '../types';
import type { AppState, Area, DayBooking, Item, Leg, Person, PlaceSuggestion, Plan } from '../types';
import { groupResult } from './group';
import { RELEASE } from './release';
import * as stayflow from './stayflow';
import { crewReadiness, levelOf, LEVEL_AT, missionFiles, nextMove, spyActive, toNextLevel } from './missions';
import type { MissionInput } from './missions';

const group = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE);
const plan = group.final as Plan;
const AREAS5: Area[] = ['Cultural Triangle', 'Kandy and Knuckles', 'Hill country', 'South coast', 'Colombo'];
const AT = '2026-11-02T00:00:00Z';
const stayOf = (area: Area): PlaceSuggestion => ({ id: `s-${area}`, name: 'Alex', area, kind: 'stay', title: `House ${area}`, status: 'live', createdAt: AT });
const pins = (areas: Area[], scouts: Partial<Record<Area, Person>> = {}): AppState => ({
  responses: {}, suggestions: [], votes: [],
  stays: { crew: {}, suggestions: areas.map(stayOf), admin: { pins: areas.map(a => ({ area: a, suggestionId: `s-${a}`, at: AT })), scouts, closed: [] } },
});
// Lazza scouts one area and Alex the rest, so nothing is left to the automatic split.
const lazzaOnly = (area: Area): Partial<Record<Area, Person>> => Object.fromEntries(AREAS5.map(a => [a, a === area ? 'Lazza' : 'Alex']));
const lone = (areas: Area[], over: { locked?: boolean; scouts?: Partial<Record<Area, Person>>; fallen?: { id: string; area: Area; at: string }[]; pins?: Area[] } = {}): AppState => {
  const base = pins(over.pins ?? [], over.scouts);
  const crew = over.locked ? Object.fromEntries(PEOPLE.map(name => [name, { name, prefs: [], quizDone: true, locked: true, ranks: {}, bingo: [], updatedAt: AT }])) : {};
  return { ...base, stays: { ...base.stays!, crew, suggestions: areas.map(stayOf), admin: { ...base.stays!.admin, ...(over.fallen ? { fallen: over.fallen } : {}) } } };
};
const booking = (id: string, over: Partial<DayBooking> = {}): DayBooking => ({ id, label: id, status: 'open', opensOn: null, bookBy: null, owner: null, ...over });
const model = (bookings: DayBooking[] = [], flights: typeof PEOPLE = []): Pick<TripModel, 'bookings' | 'missing'> =>
  ({ bookings, missing: { flights, stays: [], bookings: 0, startDate: false } });
const input = (state: AppState, m = model()): MissionInput => ({ state, plan, model: m });

// A failed assertion must not leave a stubbed outcome() behind for the next test.
afterEach(() => { vi.restoreAllMocks(); });

describe('missionFiles', () => {
  it('is Stays, Supply runs, Touchdown in that order', () => {
    expect(missionFiles(input(pins([]))).map(f => f.title)).toEqual(['Stays', 'Supply runs', 'Touchdown']);
  });

  it('Stays counts decided areas of the areas that need a stay', () => {
    const [stays] = missionFiles(input(pins(AREAS5.slice(0, 2))));
    expect(stays).toMatchObject({ done: 2, total: 5, complete: false, status: '2 of 5 decided' });
  });

  it('an area with no option is not decided, and neither is a short one', () => {
    expect(missionFiles(input(pins([])))[0].done).toBe(0);
    vi.spyOn(stayflow, 'outcome').mockReturnValue({ kind: 'short' } as unknown as stayflow.Outcome);
    expect(missionFiles(input(pins(AREAS5)))[0].done).toBe(0);
  });

  it('Supply runs counts done bookings, the unclaimed ones, and the earliest deadline still to meet', () => {
    const bookings = [
      booking('a', { status: 'done', bookBy: '2026-11-01' }),
      booking('b', { bookBy: '2026-12-01' }),
      booking('c', { bookBy: '2026-11-25', owner: 'Alex' }),
      booking('d'),
    ];
    const [, supply] = missionFiles(input(pins([]), model(bookings)));
    expect(supply).toMatchObject({ done: 1, total: 4, unclaimed: 2, status: '1 of 4 secured · 2 unclaimed', tag: { text: 'Book by 25 Nov', tone: 'warn' } });
  });

  it('Supply runs has no tag and no unclaimed wording when nothing is open', () => {
    const [, supply] = missionFiles(input(pins([]), model([booking('a', { status: 'done' })])));
    expect(supply).toMatchObject({ complete: true, unclaimed: 0, status: '1 of 1 secured' });
    expect(supply.tag).toBeUndefined();
  });

  it('Touchdown counts travellers with both flights and names who is missing', () => {
    const [, , td] = missionFiles(input(pins([]), model([], ['Antek', 'Saulie'])));
    expect(td).toMatchObject({ done: 3, total: 5, missing: ['Antek', 'Saulie'], status: 'Antek and Saulie still dark', tag: { text: '3 of 5 in', tone: 'dim' } });
  });
});

describe('a stay nobody has voted on', () => {
  it('a lone suggestion is not decided while people are still locking, and is once voting opens', () => {
    expect(missionFiles(input(lone(AREAS5)))[0]).toMatchObject({ done: 0, complete: false, status: '0 of 5 decided' });
    expect(spyActive(input(lone(AREAS5), model()))).toBe(true);
    expect(missionFiles(input(lone(AREAS5, { locked: true })))[0]).toMatchObject({ done: 5, complete: true });
  });

  it('a pin is decided without waiting for the vote', () => {
    expect(missionFiles(input(lone(AREAS5, { pins: AREAS5.slice(0, 2) })))[0].done).toBe(2);
  });

  it('a scout with one stay so far is asked for a 2nd and gets no credit yet', () => {
    const state = lone(AREAS5, { scouts: lazzaOnly('Colombo') });
    expect(nextMove('Lazza', input(state))).toMatchObject({ file: 'stays', id: 'Colombo', label: 'Find a 2nd stay for Colombo' });
    expect(crewReadiness(input(state)).people.find(p => p.name === 'Lazza')).toMatchObject({ done: 1, total: 2 });
  });

  it('a scout whose stay fell through is asked for a replacement and gets no credit', () => {
    const state = lone(AREAS5, { locked: true, scouts: lazzaOnly('Colombo'), pins: ['Colombo'], fallen: [{ id: 's-Colombo', area: 'Colombo', at: '2026-11-03T00:00:00Z' }] });
    expect(nextMove('Lazza', input(state))).toMatchObject({ file: 'stays', label: 'Find a replacement stay for Colombo' });
    expect(crewReadiness(input(state)).people.find(p => p.name === 'Lazza')).toMatchObject({ done: 1, total: 2 });
  });
});

describe('the Book by tag', () => {
  it('ignores a booking that is not open yet or has no date, like the next move does', () => {
    const bookings = [booking('later', { bookBy: '2026-12-01' }), booking('closed', { bookBy: '2026-11-10', status: 'not-open' })];
    expect(missionFiles(input(pins([]), model(bookings)))[1].tag).toMatchObject({ text: 'Book by 1 Dec' });
    expect(missionFiles(input(pins([]), model([bookings[1]])))[1].tag).toBeUndefined();
  });
});

describe('levelOf', () => {
  it('is Level 1 with nothing done and Level 4 with everything done, whatever the total', () => {
    for (const total of [1, 2, 3, 7]) { expect(levelOf(0, total)).toBe(1); expect(levelOf(total, total)).toBe(4); }
    expect(LEVEL_AT).toHaveLength(3);
  });

  it('never promises a level that cannot be reached', () => {
    for (let total = 1; total <= 12; total++) for (let done = 0; done <= total; done++) {
      const more = toNextLevel(done, total);
      if (more === null) { expect(levelOf(done, total)).toBe(4); continue; }
      expect(more).toBeGreaterThan(0);
      expect(done + more).toBeLessThanOrEqual(total);
      expect(levelOf(done + more, total)).toBeGreaterThan(levelOf(done, total));
    }
  });

  it('a person with one task goes straight from Level 1 to Level 4', () => {
    expect(toNextLevel(0, 1)).toBe(1);
    expect(levelOf(1, 1)).toBe(4);
  });
});

describe('crewReadiness', () => {
  it('counts a person flights, their scouted areas and the bookings they own', () => {
    const bookings = [booking('a', { owner: 'Alex', status: 'done' }), booking('b', { owner: 'Alex' }), booking('c')];
    const r = crewReadiness(input(pins(AREAS5.slice(0, 2), { Colombo: 'Lazza' }), model(bookings, ['Alex'])));
    const of = (n: string) => r.people.find(p => p.name === n)!;
    expect(of('Alex')).toMatchObject({ done: 2, total: 4 });
    expect(of('Brittany')).toMatchObject({ done: 1, total: 2 });
    expect(of('Lazza')).toMatchObject({ total: 3 });
    expect(r.percent).toBe(58);
  });
});

describe('nextMove', () => {
  const DEADLINE = booking('book:train', { label: 'Train', bookBy: '2026-11-25' });

  it('puts a booking deadline before a scout duty before flights', () => {
    const state = pins([], { Colombo: 'Lazza' });
    expect(nextMove('Lazza', input(state, model([DEADLINE], ['Lazza'])))).toMatchObject({ file: 'supply', id: 'book:train', deadline: '2026-11-25' });
    expect(nextMove('Lazza', input(state, model([], ['Lazza'])))).toMatchObject({ file: 'stays' });
    expect(nextMove('Lazza', input(pins(AREAS5), model([], ['Lazza'])))).toMatchObject({ file: 'touchdown' });
  });

  it('picks the earliest deadline, skips one that is not open yet and one someone else owns', () => {
    const bookings = [
      booking('later', { bookBy: '2026-12-01' }), booking('early', { bookBy: '2026-11-20' }),
      booking('closed', { bookBy: '2026-11-10', status: 'not-open' }), booking('theirs', { bookBy: '2026-11-05', owner: 'Alex' }),
    ];
    expect(nextMove('Lazza', input(pins(AREAS5), model(bookings)))?.id).toBe('early');
    expect(nextMove('Alex', input(pins(AREAS5), model(bookings)))?.id).toBe('theirs');
  });

  it('an open booking with no deadline is a move: dated first, then the train, then the rest, mine before unclaimed', () => {
    const undated = [booking('rafting'), booking('book:train'), booking('mine', { owner: 'Lazza' })];
    const at = (b: DayBooking[]) => nextMove('Lazza', input(pins(AREAS5), model(b)))?.id;
    expect(at(undated)).toBe('book:train');
    expect(at(undated.filter(b => b.id !== 'book:train'))).toBe('mine');
    expect(at([...undated, booking('dated', { bookBy: '2026-12-09' })])).toBe('dated');
    expect(at([booking('wait', { status: 'not-open' }), booking('theirs', { owner: 'Alex' })])).toBeUndefined();
  });

  it('is null for someone with nothing open', () => {
    expect(nextMove('Alex', input(pins(AREAS5), model([booking('x', { owner: 'Lazza', bookBy: '2026-11-25' })])))).toBeNull();
  });

  it('a scout is only on duty while their area has none or one option', () => {
    expect(nextMove('Lazza', input(pins(AREAS5, { Colombo: 'Lazza' })))).toBeNull();
    vi.spyOn(stayflow, 'outcome').mockImplementation((_c, a) => ({ kind: a === 'Colombo' ? 'short' : 'decided', id: 'x', via: 'pin' }) as unknown as stayflow.Outcome);
    expect(nextMove('Lazza', input(pins(AREAS5, { Colombo: 'Lazza' })))).toMatchObject({ file: 'stays', label: 'Find a 2nd stay for Colombo' });
  });
});

describe('an empty file', () => {
  it('is not complete, so it has no Done stamp, but it never holds spy mode on by itself', () => {
    const [stays, supply] = missionFiles({ state: pins([]), plan: null, model: model([]) });
    expect(stays).toMatchObject({ total: 0, complete: false });
    expect(supply).toMatchObject({ total: 0, complete: false });
    expect(spyActive(input(pins(AREAS5), model([])))).toBe(false);
    expect(spyActive(input(pins(AREAS5), model([], ['Antek'])))).toBe(true);
  });
});

describe('spyActive', () => {
  it('is true while any file is incomplete and false when all three are done', () => {
    expect(spyActive(input(pins(AREAS5), model([], ['Antek'])))).toBe(true);
    expect(spyActive(input(pins(AREAS5.slice(1)), model()))).toBe(true);
    expect(spyActive(input(pins(AREAS5), model([booking('a')])))).toBe(true);
    expect(spyActive(input(pins(AREAS5), model([booking('a', { status: 'done' })])))).toBe(false);
  });
});

// The real release, the real store and the real trip model: no hand-made bookings.
const put = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const wrapper = ({ children }: { children: ReactNode }) => createElement(AppProvider, { store: new LocalStore(), children });
const live = async () => {
  const r = renderHook(() => ({ m: useTripModel(group, '2026-12-01'), state: useApp().state }), { wrapper });
  await waitFor(() => expect(r.result.current.m.plan).not.toBeNull());
  return { m: r.result.current.m, state: r.result.current.state };
};
const allIn = (except: string[] = []) => {
  put('tp:placesug', AREAS5.map(stayOf));
  put('tp:staysadmin', { pins: AREAS5.map(a => ({ area: a, suggestionId: `s-${a}`, at: AT })), scouts: {}, closed: [] });
  put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: {}, overrides: [], updatedAt: AT });
  put('tp:travellers', Object.fromEntries(PEOPLE.filter(n => !except.includes(n)).map(name => [name, { name, arriveLocal: '2026-12-08T09:00', arriveFlight: 'UL 1', departLocal: '2026-12-16T20:00', departFlight: 'UL 2', updatedAt: AT }])));
};
const tickAll = async (owner: string) => {
  const ids = (await live()).m.bookings.map(b => b.id);
  put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ids.map(id => [id, { done: true, doneAt: '2026-11-20T00:00:00Z' }])), updatedAt: AT });
  put('tp:claims', Object.fromEntries(ids.map(id => [id, { itemId: id, owner, updatedAt: AT }])));
};

describe('on the real release', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(cleanup);

  it('a booking the catalogue gives no book-by date is still Lazza\'s move, and spy mode is on', async () => {
    allIn();
    const ids = (await live()).m.bookings.map(b => b.id);
    put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ids.filter(id => id !== 'book:train').map(id => [id, { done: true, doneAt: '2026-11-20T00:00:00Z' }])), updatedAt: AT });
    const { m, state } = await live();
    const i = { state, plan, model: m };
    expect(m.bookings.find(b => b.id === 'book:train')).toMatchObject({ bookBy: null, status: 'open' });
    expect(spyActive(i)).toBe(true);
    expect(nextMove('Lazza', i)).toMatchObject({ file: 'supply', id: 'book:train' });
  });

  it('everyone landed, every stay decided, every booking done: spy mode is over and the crew is 100', async () => {
    allIn(); await tickAll('Alex');
    const { m, state } = await live();
    const i = { state, plan, model: m };
    expect(m.bookings.length).toBeGreaterThan(AREAS5.length);
    expect(spyActive(i)).toBe(false);
    expect(crewReadiness(i).percent).toBe(100);
  });

  it('Antek with no flights: Touchdown is 4 of 5 naming him, spy mode stays on, his next move is his flights', async () => {
    allIn(['Antek']); await tickAll('Alex');
    const { m, state } = await live();
    const i = { state, plan, model: m };
    expect(missionFiles(i)[2]).toMatchObject({ done: 4, total: 5, missing: ['Antek'] });
    expect(spyActive(i)).toBe(true);
    expect(nextMove('Antek', i)).toMatchObject({ file: 'touchdown', label: 'Add your flights' });
  });

  it('an unclaimed booking with a deadline outranks Lazza scouting an area; a friend with nothing open gets null', async () => {
    allIn();
    const ids = (await live()).m.bookings.map(b => b.id);
    const tick = (skip: string[]) => put('tp:tripadmin:Brittany', { name: 'Brittany', items: Object.fromEntries(ids.filter(id => !skip.includes(id)).map(id => [id, { done: true, doneAt: '2026-11-20T00:00:00Z' }])), updatedAt: AT });
    tick(['book:train']);
    put('tp:settings', { startDate: '2026-12-08', plan: null, bookingDates: { 'book:train': { bookBy: '2026-12-05' } }, overrides: [], updatedAt: AT });
    put('tp:staysadmin', { pins: AREAS5.slice(1).map(a => ({ area: a, suggestionId: `s-${a}`, at: AT })), scouts: { 'Cultural Triangle': 'Lazza' }, closed: [] });
    const { m, state } = await live();
    const i = { state, plan, model: m };
    const move = nextMove('Lazza', i);
    expect(move).toMatchObject({ file: 'supply', id: 'book:train', deadline: '2026-12-05' });

    put('tp:claims', { 'book:train': { itemId: 'book:train', owner: 'Lazza', updatedAt: AT } });
    const claimed = await live();
    const j = { state: claimed.state, plan, model: claimed.m };
    expect(nextMove('Lazza', j)).toMatchObject({ id: 'book:train' });
    expect(nextMove('Alex', j)).toBeNull();

    tick([]);
    const quiet = await live();
    expect(nextMove('Lazza', { state: quiet.state, plan, model: quiet.m })).toMatchObject({ file: 'stays', id: 'Cultural Triangle', label: 'Find a 2nd stay for Cultural Triangle' });
  });
});
