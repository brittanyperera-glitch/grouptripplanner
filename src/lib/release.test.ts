import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import { PEOPLE, type Item, type Leg } from '../types';
import { compromises } from './compromises';
import { groupResult } from './group';
import { routePlan } from './openItems';
import { RELEASE } from './release';

const ALL = (catalogue as unknown as { items: Item[] }).items;
const L = legs as Leg[];
// Brittany's 2026-10-19 calls: no second safari, and these lost their head to head.
const RULED_OUT = ['yala', 'udawalawe', 'ellarock', 'anuradhapura', 'polonnaruwa', 'horton', 'scuba'];
const SAFARIS = ['elephants', 'yala', 'udawalawe'];

describe('the released group plan', () => {
  it('is on, and every released place is a real catalogue item that is not a late vote', () => {
    expect(RELEASE).not.toBeNull();
    const byId = new Map(ALL.map(i => [i.id, i]));
    for (const id of RELEASE!.items) expect(byId.get(id)?.late, id).not.toBe(true);
    expect(RELEASE!.items.every(id => byId.has(id))).toBe(true);
    expect(new Set(RELEASE!.items).size).toBe(RELEASE!.items.length);
  });

  const g = groupResult(seedState(), ALL, L, [], RELEASE);

  it('is a locked, final plan with nothing left to vote on, and it opens Stays', () => {
    expect(g.locked).toBe(true);
    expect(g.knockouts).toEqual([]);
    expect(g.finalized).toEqual([...PEOPLE]);
    expect(routePlan(g, seedState())).toBe(g.final);
  });

  it('holds exactly the released places over the released number of days', () => {
    expect([...g.final!.chosen].sort()).toEqual([...RELEASE!.items].sort());
    expect(g.final!.days).toHaveLength(RELEASE!.days);
  });

  it('leaves out everything the group ruled out, and has one safari', () => {
    for (const id of RULED_OUT) expect(g.final!.chosen, id).not.toContain(id);
    expect(SAFARIS.filter(id => g.final!.chosen.includes(id))).toEqual(['elephants']);
  });

  it('does not offer a ruled-out place back as "you would also get", and the list is not empty', () => {
    expect(RELEASE!.ruledOut).toEqual(expect.arrayContaining(RULED_OUT));
    expect(g.extras.length).toBeGreaterThan(0);
    for (const e of g.extras) expect(RELEASE!.ruledOut, e.id).not.toContain(e.id);
  });

  it('stays released when one member starts over: the other four keep the plan', () => {
    const s = seedState();
    s.responses.Lazza = { ...s.responses.Lazza!, submitted: false };
    const one = groupResult(s, ALL, L, [], RELEASE);
    expect(one.locked).toBe(true);
    expect([...one.final!.chosen].sort()).toEqual([...RELEASE!.items].sort());
    expect(routePlan(one, s)).toBe(one.final);
  });

  it('is marked released and carries no invented "missed out" explanations', () => {
    expect(g.released).toBe(true);
    expect(compromises(g, seedState(), ALL)).toEqual([]);
  });

  it('does nothing without a release: the vote path still runs', () => {
    expect(groupResult(seedState(), ALL, L, [], null).locked).toBe(false);
  });
});
