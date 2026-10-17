import { describe, expect, it } from 'vitest';
import type { CrewStays, PlaceSuggestion, Player, StayPin } from '../types';
import { canCloseRanking, isAdmin, pinnedId, unlockable, withPin } from './override';

const crew = (name: Player, locked: boolean): CrewStays => ({ name, prefs: [], quizDone: true, locked, ranks: {}, bingo: [], updatedAt: '' });
const live = (id: string): PlaceSuggestion => ({ id, name: 'Alex', area: 'Ella', kind: 'stay', title: id, status: 'live', createdAt: '' });
const pin = (suggestionId: string | null, at: string, area: StayPin['area'] = 'Ella'): StayPin => ({ area, suggestionId, at });

describe('admin gate', () => {
  it('only Brittany', () => {
    expect(isAdmin('Brittany')).toBe(true);
    expect(isAdmin('Alex')).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe('pins', () => {
  it('pinning replaces the area pin and leaves other areas alone', () => {
    const base = [pin('a1', '1'), pin('k1', '1', 'Kandy and Knuckles')];
    const next = withPin(base, 'Ella', 'a2', '2');
    expect(next).toEqual([pin('k1', '1', 'Kandy and Knuckles'), pin('a2', '2')]);
    expect(pinnedId(next, 'Ella', [live('a2')])).toBe('a2');
  });
  it('unpinning drops the area pin so the vote decides again', () => {
    const next = withPin([pin('a1', '1')], 'Ella', null, '2');
    expect(next).toEqual([]);
    expect(pinnedId(next, 'Ella', [live('a2')])).toBeNull();
  });
  it('a stored null pin reads as unpinned', () => {
    expect(pinnedId([pin('a1', '1'), pin(null, '2')], 'Ella', [live('a1')])).toBeNull();
  });
  it('a pin on a withdrawn or missing stay reads as unpinned', () => {
    expect(pinnedId([pin('a1', '1')], 'Ella', [{ ...live('a1'), status: 'withdrawn' }])).toBeNull();
    expect(pinnedId([pin('a1', '1')], 'Ella', [])).toBeNull();
  });
});

describe('unlock list', () => {
  const crewOf = { Alex: crew('Alex', true), Brittany: crew('Brittany', false), Antek: crew('Antek', true) } as Partial<Record<Player, CrewStays>>;
  const people = ['Alex', 'Brittany', 'Antek', 'Lazza'] as Player[];
  it('Brittany sees exactly the people who are locked', () => {
    expect(unlockable('Brittany', crewOf, people)).toEqual(['Alex', 'Antek']);
  });
  it('Brittany is offered her own unlock when she has locked (admin is not exempt from the lock)', () => {
    expect(unlockable('Brittany', { Brittany: crew('Brittany', true) }, ['Brittany'] as Player[])).toEqual(['Brittany']);
  });
  it('nobody else sees anyone', () => {
    expect(unlockable('Alex', crewOf, people)).toEqual([]);
  });
});

describe('close ranking rule', () => {
  it('needs Brittany, 3+ stays, someone still to rank, and not already closed', () => {
    expect(canCloseRanking('Brittany', 3, 4, 6, [], 'Ella')).toBe(true);
    expect(canCloseRanking('Alex', 3, 4, 6, [], 'Ella')).toBe(false);
    expect(canCloseRanking('Brittany', 2, 4, 6, [], 'Ella')).toBe(false);
    expect(canCloseRanking('Brittany', 3, 6, 6, [], 'Ella')).toBe(false);
    expect(canCloseRanking('Brittany', 3, 4, 6, ['Ella'], 'Ella')).toBe(false);
  });
});
