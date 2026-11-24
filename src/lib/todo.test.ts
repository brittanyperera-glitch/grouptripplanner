import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legsData from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { TripModel } from '../screens/useTripModel';
import { PEOPLE } from '../types';
import type { AppState, Area, DayBooking, Item, Leg, Person, PlaceSuggestion, Plan } from '../types';
import { groupResult } from './group';
import type { MissionInput } from './missions';
import { RELEASE } from './release';
import { nextTask, owedCount, tasksFor, youLine } from './todo';

// State is built the way missions.test.ts builds it: the seed's locked plan, then stays, bookings and flights written by hand.
const plan = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legsData as Leg[], [], RELEASE).final as Plan;
const AREAS5: Area[] = ['Cultural Triangle', 'Kandy and Knuckles', 'Hill country', 'South coast', 'Colombo'];
const AT = '2026-11-02T00:00:00Z';
const EXTRA = { bingoMade: true, awardsUnseen: false, ideasPending: 0 };
const stay = (area: Area, n = 1, name: Person = 'Alex'): PlaceSuggestion[] =>
  Array.from({ length: n }, (_, k) => ({ id: `s-${area}-${k}`, name, area, kind: 'stay' as const, title: `House ${area} ${k}`, status: 'live' as const, createdAt: AT }));
const crewOf = (names: readonly Person[], over: { quizDone?: boolean; locked?: boolean } = {}) =>
  Object.fromEntries(names.map(name => [name, { name, prefs: [], quizDone: over.quizDone ?? true, locked: over.locked ?? true, ranks: {}, bingo: [], updatedAt: AT }]));
// Every area scouted by Alex, so no one else is handed a scout duty by the automatic split.
const ALEX_SCOUTS = Object.fromEntries(AREAS5.map(a => [a, 'Alex'])) as Partial<Record<Area, Person>>;
const state = (o: { suggestions?: PlaceSuggestion[]; crew?: NonNullable<AppState['stays']>['crew']; pins?: Area[]; scouts?: Partial<Record<Area, Person>> } = {}): AppState => {
  const suggestions = o.suggestions ?? [];
  return {
    responses: {}, suggestions: [], votes: [],
    stays: { crew: o.crew ?? {}, suggestions, admin: { pins: (o.pins ?? []).map(a => ({ area: a, suggestionId: `s-${a}-0`, at: AT })), scouts: o.scouts ?? ALEX_SCOUTS, closed: [] } },
  };
};
const decided = (): AppState => state({ suggestions: AREAS5.flatMap(a => stay(a)), pins: AREAS5 });
const booking = (id: string, over: Partial<DayBooking> = {}): DayBooking => ({ id, label: id, status: 'open', opensOn: null, bookBy: null, owner: null, ...over });
const input = (s: AppState, bookings: DayBooking[] = [], flights: readonly Person[] = []): MissionInput =>
  ({ state: s, plan, model: { bookings, missing: { flights: [...flights], stays: [], bookings: 0, startDate: false } } as Pick<TripModel, 'bookings' | 'missing'> });

describe('tasksFor: bookings', () => {
  it('an unclaimed dated booking is a Claim task first, and the only thing owed', () => {
    const t = tasksFor('Lazza', input(decided(), [booking('Sigiriya', { bookBy: '2026-12-01' })]), EXTRA);
    expect(t[0]).toEqual({ id: 'booking:Sigiriya', kind: 'booking', file: 'supply', label: 'Claim Sigiriya', owed: true, deadline: '2026-12-01', open: { sub: 'bookings', target: 'Sigiriya' } });
    expect(owedCount(t)).toBe(1);
  });

  it('two unclaimed bookings give one Claim task, the earlier deadline', () => {
    const t = tasksFor('Lazza', input(decided(), [booking('Late', { bookBy: '2026-12-20' }), booking('Soon', { bookBy: '2026-12-01' })]), EXTRA);
    expect(t.map(x => x.label)).toEqual(['Claim Soon']);
  });

  it('a booking I own is a Book task, and a booking someone else owns is not mine', () => {
    const t = tasksFor('Lazza', input(decided(), [booking('Train', { owner: 'Lazza' }), booking('Tour', { owner: 'Alex' })]), EXTRA);
    expect(t.map(x => x.label)).toEqual(['Book Train']);
  });

  it('my bookings and the one unclaimed booking are sorted together by deadline', () => {
    const t = tasksFor('Lazza', input(decided(), [booking('Mine late', { owner: 'Lazza', bookBy: '2026-12-20' }), booking('Free soon', { bookBy: '2026-12-01' }), booking('Free later', { bookBy: '2026-12-05' })]), EXTRA);
    expect(t.map(x => x.label)).toEqual(['Claim Free soon', 'Book Mine late']);
  });

  it('a booking that is not open yet or is done is not owed', () => {
    const t = tasksFor('Lazza', input(decided(), [booking('Later', { status: 'not-open' }), booking('Done', { status: 'done', owner: 'Lazza' })]), EXTRA);
    expect(t).toEqual([]);
  });
});

describe('tasksFor: my stays step', () => {
  it('quiz done, locked, voting open and a rank area not ranked: Pick your top 2, aimed at that area', () => {
    const s = state({ suggestions: [...stay('Hill country', 3), ...AREAS5.filter(a => a !== 'Hill country').flatMap(a => stay(a))], crew: crewOf(PEOPLE) });
    const t = tasksFor('Lazza', input(s), EXTRA);
    expect(t[0]).toMatchObject({ id: 'stay:rank', kind: 'stay', file: 'stays', label: 'Pick your top 2', owed: true, open: { sub: 'stays', target: 'Hill country' } });
    expect(youLine('stays', t)).toBe('You: Pick your top 2');
  });

  it('locked while the others have not locked: no stays task, and the line says nothing to do', () => {
    const s = state({ suggestions: AREAS5.flatMap(a => stay(a)), crew: crewOf(['Lazza']) });
    const t = tasksFor('Lazza', input(s), EXTRA);
    expect(t).toEqual([]);
    expect(youLine('stays', t)).toBe('You: nothing to do');
  });

  it('no travel profile while an area is undecided: Do your travel profile, opening the quiz', () => {
    const t = tasksFor('Lazza', input(state({ suggestions: AREAS5.flatMap(a => stay(a)) })), EXTRA);
    expect(t[0]).toMatchObject({ id: 'stay:quiz', kind: 'stay', file: 'stays', label: 'Do your travel profile', owed: true, open: { overlay: 'quiz' } });
  });

  it('every area decided: no stays task even without the travel profile', () => {
    expect(tasksFor('Lazza', input(decided()), EXTRA)).toEqual([]);
  });

  it('profile done but not locked: Add a stay with none, Lock in my stays (2) with two', () => {
    const base = { crew: crewOf(['Lazza'], { locked: false }) };
    const none = tasksFor('Lazza', input(state({ ...base, suggestions: AREAS5.flatMap(a => stay(a)) })), EXTRA);
    expect(none[0]).toMatchObject({ label: 'Add a stay', open: { sub: 'stays' } });
    const two = tasksFor('Lazza', input(state({ ...base, suggestions: [...stay('Colombo', 1, 'Lazza'), ...stay('Hill country', 1, 'Lazza'), ...AREAS5.flatMap(a => stay(a))] })), EXTRA);
    expect(two[0]).toMatchObject({ label: 'Lock in my stays (2)', open: { sub: 'stays' } });
  });

  it('ranked and voting open with two stays in an area: Head to head for that area', () => {
    const s = state({ suggestions: [...stay('Colombo', 2), ...AREAS5.filter(a => a !== 'Colombo').flatMap(a => stay(a))], crew: crewOf(PEOPLE) });
    const t = tasksFor('Lazza', input(s), EXTRA);
    expect(t[0]).toMatchObject({ id: 'stay:vote:Colombo', kind: 'stay', file: 'stays', label: 'Head to head: Colombo', owed: true, open: { sub: 'stays', target: 'Colombo' } });
  });

  it('a Head to head I have already voted in is not a task; one I have not is', () => {
    const s = state({ suggestions: [...stay('Colombo', 2), ...AREAS5.filter(a => a !== 'Colombo').flatMap(a => stay(a))], crew: crewOf(PEOPLE) });
    const voted = { ...s, votes: [{ forkId: 'stay:Colombo:s-Colombo-0:s-Colombo-1', name: 'Lazza' as const, choice: 'a' as const }] };
    expect(tasksFor('Lazza', input(voted), EXTRA).map(x => x.id)).not.toContain('stay:vote:Colombo');
    expect(tasksFor('Antek', input(voted), EXTRA).map(x => x.id)).toContain('stay:vote:Colombo');
  });

  it('with no route there is no stays task, even without the travel profile', () => {
    const i = { ...input(state({ suggestions: AREAS5.flatMap(a => stay(a)) })), plan: null };
    expect(tasksFor('Lazza', i, EXTRA).filter(x => x.kind === 'stay')).toEqual([]);
  });
});

describe('tasksFor: scout, flights, ideas, fun', () => {
  it('a scout with an area short of a stay is asked to find one', () => {
    const s = state({ suggestions: AREAS5.flatMap(a => stay(a)), crew: crewOf(['Alex']) });
    const t = tasksFor('Alex', input(s), EXTRA);
    expect(t.map(x => x.label)).toEqual(['Find a 2nd stay for Cultural Triangle', 'Find a 2nd stay for Kandy and Knuckles', 'Find a 2nd stay for Hill country', 'Find a 2nd stay for South coast', 'Find a 2nd stay for Colombo']);
    expect(t[0]).toMatchObject({ id: 'scout:Cultural Triangle', kind: 'stay', file: 'stays', open: { sub: 'stays', target: 'Cultural Triangle' } });
  });

  it('missing flights is an Add your flights task', () => {
    const t = tasksFor('Antek', input(decided(), [], ['Antek']), EXTRA);
    expect(t).toEqual([{ id: 'flights', kind: 'flights', file: 'touchdown', label: 'Add your flights', owed: true, open: { sub: 'flights' } }]);
  });

  it('Brittany with 2 pending ideas gets Ideas waiting (2), and a friend never does', () => {
    const extra = { ...EXTRA, ideasPending: 2 };
    // Changed deliberately (C4): Ideas waiting opens the Organiser's Ideas section, no longer the Suggest screen.
    expect(tasksFor('Brittany', input(decided()), extra)).toEqual([{ id: 'ideas', kind: 'ideas', label: 'Ideas waiting (2)', owed: true, open: { sub: 'organiser', target: 'ideas' } }]);
    expect(tasksFor('Lazza', input(decided()), extra)).toEqual([]);
  });

  it('bingo and awards come last, are not owed and are not counted', () => {
    const t = tasksFor('Antek', input(decided(), [], ['Antek']), { bingoMade: false, awardsUnseen: true, ideasPending: 0 });
    expect(t.map(x => [x.label, x.owed])).toEqual([['Add your flights', true], ['Make your travel bingo card', false], ['See the group awards', false]]);
    expect(t.slice(1).map(x => x.open)).toEqual([{ overlay: 'bingo' }, { overlay: 'awards' }]);
    expect(owedCount(t)).toBe(1);
    expect(nextTask(t)?.label).toBe('Add your flights');
  });

  it('only bingo and awards left: nextTask is null and owedCount is 0', () => {
    const t = tasksFor('Lazza', input(decided()), { bingoMade: false, awardsUnseen: true, ideasPending: 0 });
    expect(nextTask(t)).toBeNull();
    expect(owedCount(t)).toBe(0);
  });

  it('order is bookings, stays step, scout, flights, ideas', () => {
    const s = state({ suggestions: AREAS5.flatMap(a => stay(a)), scouts: { ...ALEX_SCOUTS, Colombo: 'Brittany' } });
    const t = tasksFor('Brittany', input(s, [booking('Train', { owner: 'Brittany' })], ['Brittany']), { ...EXTRA, ideasPending: 1 });
    expect(t.map(x => x.id)).toEqual(['booking:Train', 'stay:quiz', 'scout:Colombo', 'flights', 'ideas']);
  });
});

describe('youLine', () => {
  it('names the first owed task for that file, and says nothing to do when there is none', () => {
    const t = tasksFor('Antek', input(decided(), [booking('Train', { owner: 'Antek' })], ['Antek']), EXTRA);
    expect(youLine('supply', t)).toBe('You: Book Train');
    expect(youLine('touchdown', t)).toBe('You: Add your flights');
    expect(youLine('stays', t)).toBe('You: nothing to do');
  });
});
