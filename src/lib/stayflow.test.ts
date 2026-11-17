import { describe, expect, it } from 'vitest';
import { AREAS, PEOPLE } from '../types';
import type { Area, CrewStays, Hub, PlaceSuggestion, Player } from '../types';
import { hubArea } from './calendar';
import { finalSub, flow, HOSTELS, HUB_AREA, hostelPrice, hostelsFor, outcome, parseUrl, rankAreas, STAY_COPY, STEPS, stayCtx } from './stayflow';
import type { FlowInput, Outcome, StayCtx } from './stayflow';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const idx = (s: (typeof STEPS)[number]) => STEPS.indexOf(s);

describe('flow: the current step is always one of five and never skips', () => {
  it('holds over seeded states, judged by what each finished step requires', () => {
    const r = rng(7);
    for (let n = 0; n < 600; n++) {
      const i: FlowInput = { quizDone: r() < 0.7, mine: Math.floor(r() * 4), locked: r() < 0.5, voteOpen: r() < 0.5, ranked: r() < 0.5 };
      const { current, done } = flow(i);
      expect(STEPS).toContain(current);
      expect(done).toEqual(STEPS.slice(0, idx(current)));
      // Each finished step needs its own gate; the current step's gate is not yet met.
      if (done.includes('quiz')) expect(i.quizDone).toBe(true);
      if (done.includes('suggest')) expect(i.quizDone && (i.mine > 0 || i.locked)).toBe(true);
      if (done.includes('lock')) expect(i.locked && i.voteOpen).toBe(true);
      if (done.includes('rank')) expect(i.ranked && i.voteOpen).toBe(true);
      if (current === 'rank' || current === 'final') expect(i.voteOpen && i.locked && i.quizDone).toBe(true);
      if (current === 'final') expect(i.ranked).toBe(true);
      if (!i.quizDone) expect(current).toBe('quiz');
    }
  });

  it('moves forward only as each thing is done', () => {
    const steps: FlowInput[] = [
      { quizDone: false, mine: 0, locked: false, voteOpen: false, ranked: false },
      { quizDone: true, mine: 0, locked: false, voteOpen: false, ranked: false },
      { quizDone: true, mine: 2, locked: false, voteOpen: false, ranked: false },
      { quizDone: true, mine: 2, locked: true, voteOpen: false, ranked: false },
      { quizDone: true, mine: 2, locked: true, voteOpen: true, ranked: false },
      { quizDone: true, mine: 2, locked: true, voteOpen: true, ranked: true },
    ];
    expect(steps.map(s => flow(s).current)).toEqual(['quiz', 'suggest', 'lock', 'lock', 'rank', 'final']);
  });
});

describe('guide hostels', () => {
  it('every hub maps to an area, except the one off the route', () => {
    for (const h of HOSTELS) expect(h.hub in HUB_AREA, h.hub).toBe(true);
    const off = HOSTELS.filter(h => HUB_AREA[h.hub] === null).map(h => h.hub);
    expect(new Set(off)).toEqual(new Set(['Off route']));
    expect(AREAS.every(a => Object.values(HUB_AREA).includes(a))).toBe(true);
  });
  it('each hostel is offered in exactly one area, and Tissa lands with the Wild south', () => {
    const offered = AREAS.flatMap(a => hostelsFor(a).map(h => h.id));
    expect(new Set(offered).size).toBe(offered.length);
    expect(offered.length).toBe(HOSTELS.filter(h => HUB_AREA[h.hub] !== null).length);
    expect(hostelsFor('Wild south').some(h => h.hub === 'Tissa')).toBe(true);
  });
  it('agrees with calendar hubArea everywhere except the airport and the off-route hub', () => {
    for (const [hub, area] of Object.entries(HUB_AREA)) if (hub !== 'AIR' && hub !== 'Off route') expect(area, hub).toBe(hubArea(hub as Hub));
    expect(HUB_AREA.AIR).toBe('Colombo');
  });
  it('a price is the bunk, else the room shared out, else none', () => {
    const base = { id: 'x', name: 'x', hub: 'Ella', bookUrl: '', photo: { file: 'x.jpg' } };
    expect(hostelPrice({ ...base, bunkGbp: 8.83, roomGbp: 16.3, roomFor: 2 })).toBe(8.83);
    expect(hostelPrice({ ...base, bunkGbp: null, roomGbp: 21.13, roomFor: 2 })).toBe(10.57);
    expect(hostelPrice({ ...base, bunkGbp: null, roomGbp: null, roomFor: null })).toBeNull();
  });
});

describe('parseUrl: only web links get through', () => {
  it('adds https, keeps http(s), and rejects script and data links', () => {
    expect(parseUrl('')).toEqual({ ok: true });
    expect(parseUrl('example.com/stay')).toEqual({ ok: true, url: 'https://example.com/stay' });
    expect(parseUrl('http://example.com/')).toEqual({ ok: true, url: 'http://example.com/' });
    expect(parseUrl('javascript:alert(1)')).toEqual({ ok: false });
    expect(parseUrl('data:text/html,hi')).toEqual({ ok: false });
  });
});

describe('copy ceiling', () => {
  const strings = (v: unknown): string[] => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') return strings((v as (...a: unknown[]) => unknown)(3, 5, 'Sigiriya'));
    return v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
  };
  const all = strings(STAY_COPY);
  it('is non-trivial', () => expect(all.length).toBeGreaterThan(60));
  it('every string is under 25 words, with no em dash, curly quote or the word beta', () => {
    for (const s of all) {
      expect(s.trim().split(/\s+/).length, s).toBeLessThan(25);
      expect(s, s).not.toMatch(/[—–‘’“”]/);
      expect(s, s).not.toMatch(/\bbeta\b/i);
    }
  });
});

const crewRow = (name: Player, o: Partial<CrewStays> = {}): CrewStays => ({ name, prefs: [], quizDone: true, locked: true, ranks: {}, bingo: [], updatedAt: '', ...o });
const stay = (id: string, area: Area, o: Partial<PlaceSuggestion> = {}): PlaceSuggestion => ({ id, name: 'Alex', area, kind: 'stay', title: `Stay ${id}`, status: 'live', createdAt: `2026-10-1${id.slice(-1)}`, ...o });
const ctxOf = (suggestions: PlaceSuggestion[], crew: Partial<Record<Player, CrewStays>>, extra: Partial<StayCtx> = {}): StayCtx => ({
  ...stayCtx({ responses: {}, suggestions: [], votes: [], stays: { crew, suggestions, admin: { pins: [], scouts: {}, closed: [] } } }, 'Alex', null),
  areas: ['Ella'], ...extra,
});

describe('outcome per destination', () => {
  const locked = Object.fromEntries(PEOPLE.map(p => [p, crewRow(p)])) as Record<Player, CrewStays>;
  it('no stays is empty, one is short of an option, two go straight to the head to head', () => {
    expect(outcome(ctxOf([], locked), 'Ella')).toEqual({ kind: 'empty' });
    // Changed deliberately (her 17 Nov decision: 2+ options then a vote): one stay used to decide the area alone.
    expect(outcome(ctxOf([stay('a1', 'Ella')], locked), 'Ella')).toEqual({ kind: 'short', have: 1 });
    const two = outcome(ctxOf([stay('a1', 'Ella'), stay('a2', 'Ella')], locked), 'Ella');
    expect(two).toMatchObject({ kind: 'vote', pair: ['a1', 'a2'] });
  });
  it('three or more wait until everyone has picked a top 2', () => {
    const three = ['a1', 'a2', 'a3'].map(id => stay(id, 'Ella'));
    expect(outcome(ctxOf(three, locked), 'Ella')).toEqual({ kind: 'wait', ranked: 0 });
    const ranked = Object.fromEntries(PEOPLE.map(p => [p, crewRow(p, { ranks: { Ella: { first: 'a1', second: 'a2' } } })])) as Record<Player, CrewStays>;
    expect(outcome(ctxOf(three, ranked), 'Ella')).toMatchObject({ kind: 'vote', pair: ['a1', 'a2'] });
  });
  it('a closed destination uses the ranks already in, and a person with none is not waited on', () => {
    const three = ['a1', 'a2', 'a3'].map(id => stay(id, 'Ella'));
    const one = { ...locked, Brittany: crewRow('Brittany', { ranks: { Ella: { first: 'a3', second: 'a2' } } }) };
    const closed = ctxOf(three, one, { admin: { pins: [], scouts: {}, closed: ['Ella'] } });
    expect(outcome(ctxOf(three, one), 'Ella')).toEqual({ kind: 'wait', ranked: 1 });
    expect(outcome(closed, 'Ella')).toMatchObject({ kind: 'vote', pair: ['a3', 'a2'] });
    expect(outcome(ctxOf(three, locked, { admin: { pins: [], scouts: {}, closed: ['Ella'] } }), 'Ella')).toMatchObject({ kind: 'vote', pair: ['a1', 'a2'] });
    expect(rankAreas(closed)).toEqual([]);
    expect(rankAreas(ctxOf(three, one))).toEqual(['Ella']);
  });
  it('a pin from Brittany beats the vote, a null pin does not', () => {
    const two = [stay('a1', 'Ella'), stay('a2', 'Ella')];
    const pinned = ctxOf(two, locked, { admin: { pins: [{ area: 'Ella', suggestionId: 'a2', at: 't' }], scouts: {}, closed: [] } });
    expect(outcome(pinned, 'Ella')).toEqual({ kind: 'decided', id: 'a2', via: 'pin' });
    const unpinned = ctxOf(two, locked, { admin: { pins: [{ area: 'Ella', suggestionId: 'a2', at: 't1' }, { area: 'Ella', suggestionId: null, at: 't2' }], scouts: {}, closed: [] } });
    expect(outcome(unpinned, 'Ella').kind).toBe('vote');
  });
  it('a pin on a withdrawn stay stops counting, in outcome and rankAreas', () => {
    const admin = { pins: [{ area: 'Ella' as Area, suggestionId: 'a2', at: 't' }], scouts: {}, closed: [] };
    const two = [stay('a1', 'Ella'), stay('a2', 'Ella', { status: 'withdrawn' })];
    // Changed deliberately (her 17 Nov decision: 2+ options then a vote): the one live stay left is short, not decided.
    expect(outcome(ctxOf(two, locked, { admin }), 'Ella')).toEqual({ kind: 'short', have: 1 });
    const three = [stay('a1', 'Ella'), stay('a2', 'Ella', { status: 'withdrawn' }), stay('a3', 'Ella'), stay('a4', 'Ella')];
    expect(rankAreas(ctxOf(three, locked, { admin }))).toEqual(['Ella']);
  });
  it('three votes settle it', () => {
    const two = [stay('a1', 'Ella'), stay('a2', 'Ella')];
    const votes = (['Alex', 'Antek', 'Lazza'] as const).map(name => ({ forkId: 'stay:Ella:a1:a2', name, choice: 'b' as const }));
    expect(outcome(ctxOf(two, locked, { votes }), 'Ella')).toEqual({ kind: 'decided', id: 'a2', via: 'vote' });
  });
});

describe('short areas: 2+ options, then a vote (her 17 Nov decision)', () => {
  const locked = Object.fromEntries(PEOPLE.map(p => [p, crewRow(p)])) as Record<Player, CrewStays>;
  const pin = (id: string) => ({ pins: [{ area: 'Ella' as Area, suggestionId: id, at: 't' }], scouts: {}, closed: [] });
  it('one live stay, no pin, not fallen is short, and a withdrawn second one does not count', () => {
    expect(outcome(ctxOf([stay('a1', 'Ella')], locked), 'Ella')).toEqual({ kind: 'short', have: 1 });
    expect(outcome(ctxOf([stay('a1', 'Ella'), stay('a2', 'Ella', { status: 'withdrawn' })], locked), 'Ella')).toEqual({ kind: 'short', have: 1 });
  });
  it('two live stays are the head to head pair, and 3 of 5 votes decide it', () => {
    const two = [stay('a1', 'Ella'), stay('a2', 'Ella')];
    expect(outcome(ctxOf(two, locked), 'Ella')).toMatchObject({ kind: 'vote', pair: ['a1', 'a2'] });
    const votes = (['Alex', 'Antek', 'Lazza'] as const).map(name => ({ forkId: 'stay:Ella:a1:a2', name, choice: 'a' as const }));
    expect(outcome(ctxOf(two, locked, { votes }), 'Ella')).toEqual({ kind: 'decided', id: 'a1', via: 'vote' });
  });
  it('her pin on the single stay decides it, and a pin on a fallen one is replacing, not short', () => {
    expect(outcome(ctxOf([stay('a1', 'Ella')], locked, { admin: pin('a1') }), 'Ella')).toEqual({ kind: 'decided', id: 'a1', via: 'pin' });
    const fell = { ...pin('a1'), fallen: [{ id: 'a1', area: 'Ella' as Area, at: '2026-11-02T10:00:00.000Z' }] };
    expect(outcome(ctxOf([stay('a1', 'Ella')], locked, { admin: { ...fell, pins: [{ area: 'Ella', suggestionId: 'a1', at: '2026-11-01T10:00:00.000Z' }] } }), 'Ella')).toEqual({ kind: 'replacing' });
  });
});

describe('the Stays header when nothing is votable', () => {
  const decided: Outcome = { kind: 'decided', id: 'a1', via: 'pin' };
  const C = STAY_COPY.final;
  it('names a replacement to pin for Brittany and says Brittany is sorting it for a friend', () => {
    const outs: Outcome[] = [decided, { kind: 'replacing' }];
    expect(finalSub(outs, ['Ella', 'Kandy and Knuckles'], true)).toBe('Pin a Kandy and Knuckles replacement');
    expect(finalSub(outs, ['Ella', 'Kandy and Knuckles'], false)).toBe('Brittany is sorting Kandy and Knuckles');
    for (const s of [finalSub(outs, ['Ella', 'Kandy and Knuckles'], true), finalSub(outs, ['Ella', 'Kandy and Knuckles'], false)]) expect(s).not.toBe(C.waiting);
  });
  it('lists several areas with commas, since an area name can hold "and"', () => {
    const outs: Outcome[] = [{ kind: 'short', have: 1 }, { kind: 'short', have: 1 }, { kind: 'short', have: 1 }];
    expect(finalSub(outs, ['Ella', 'Kandy and Knuckles', 'Colombo'], false)).toBe('Waiting on a 2nd stay for Ella, Kandy and Knuckles and Colombo');
  });
  it('a short area asks for a 2nd stay, a waiting one keeps the old line, a vote keeps its line', () => {
    expect(finalSub([decided, { kind: 'short', have: 1 }], ['Ella', 'Kandy and Knuckles'], false)).toBe('Waiting on a 2nd stay for Kandy and Knuckles');
    expect(finalSub([{ kind: 'wait', ranked: 1 }, { kind: 'replacing' }], ['Ella', 'Kandy and Knuckles'], true)).toBe(C.waiting);
    expect(finalSub([{ kind: 'vote', pair: ['a', 'b'], tieBreak: null, a: [], b: [], warns: {} }, { kind: 'replacing' }], ['Ella', 'Kandy and Knuckles'], true)).toBe(C.sub);
  });
});

describe('a stay that fell through', () => {
  const locked = Object.fromEntries(PEOPLE.map(p => [p, crewRow(p)])) as Record<Player, CrewStays>;
  const four = ['a1', 'a2', 'a3', 'a4'].map(id => stay(id, 'Ella'));
  const adminOf = (o: Partial<StayCtx['admin']>): StayCtx['admin'] => ({ pins: [], scouts: {}, closed: [], ...o });
  const fell = (id: string, area: Area = 'Ella', at = '2026-11-01T10:00') => ({ id, area, at });
  it('with no pin the area is replacing, never a vote or a wait, even with ranked suggestions', () => {
    const admin = adminOf({ fallen: [fell('a1')] });
    expect(outcome(ctxOf(four, locked, { admin }), 'Ella')).toEqual({ kind: 'replacing' });
    expect(outcome(ctxOf(four.slice(0, 2), locked, { admin }), 'Ella')).toEqual({ kind: 'replacing' });
    const ranked = Object.fromEntries(PEOPLE.map(p => [p, crewRow(p, { ranks: { Ella: { first: 'a2', second: 'a3' } } })])) as Record<Player, CrewStays>;
    expect(outcome(ctxOf(four, ranked, { admin }), 'Ella')).toEqual({ kind: 'replacing' });
  });
  it('a pin on a different live stay decides the area again', () => {
    const admin = adminOf({ fallen: [fell('a1')], pins: [{ area: 'Ella', suggestionId: 'a1', at: 't1' }, { area: 'Ella', suggestionId: 'a3', at: 't2' }] });
    expect(outcome(ctxOf(four, locked, { admin }), 'Ella')).toEqual({ kind: 'decided', id: 'a3', via: 'pin' });
  });
  it('a pin still on the fallen stay does not count', () => {
    const admin = adminOf({ fallen: [fell('a1')], pins: [{ area: 'Ella', suggestionId: 'a1', at: 't1' }] });
    expect(outcome(ctxOf(four, locked, { admin }), 'Ella')).toEqual({ kind: 'replacing' });
  });
  it('a pin on the same stay made after it fell decides the area again, and one made before does not', () => {
    const later = adminOf({ fallen: [fell('a1', 'Ella', '2026-11-01T10:00')], pins: [{ area: 'Ella', suggestionId: 'a1', at: '2026-11-02T09:00' }] });
    expect(outcome(ctxOf(four, locked, { admin: later }), 'Ella')).toEqual({ kind: 'decided', id: 'a1', via: 'pin' });
    const earlier = adminOf({ fallen: [fell('a1', 'Ella', '2026-11-03T10:00')], pins: [{ area: 'Ella', suggestionId: 'a1', at: '2026-11-02T09:00' }] });
    expect(outcome(ctxOf(four, locked, { admin: earlier }), 'Ella')).toEqual({ kind: 'replacing' });
  });
  it('compares a local stamp with a UTC one as instants, so a later pin counts across the two formats', () => {
    const fellLocal = adminOf({ fallen: [fell('a1', 'Ella', '2026-11-01T10:00')], pins: [{ area: 'Ella', suggestionId: 'a1', at: '2026-11-01T04:31:00.000Z' }] });
    expect(outcome(ctxOf(four, locked, { admin: fellLocal }), 'Ella')).toEqual({ kind: 'decided', id: 'a1', via: 'pin' });
    const sameInstant = adminOf({ fallen: [fell('a1', 'Ella', '2026-11-01T10:00')], pins: [{ area: 'Ella', suggestionId: 'a1', at: '2026-11-01T04:30:00.000Z' }] });
    expect(outcome(ctxOf(four, locked, { admin: sameInstant }), 'Ella')).toEqual({ kind: 'replacing' });
  });
  it('a fall in another destination leaves this one alone', () => {
    const admin = adminOf({ fallen: [fell('b1', 'Kandy and Knuckles')] });
    expect(outcome(ctxOf(four, locked, { admin }), 'Ella')).toEqual(outcome(ctxOf(four, locked), 'Ella'));
  });
  it('a fallen area is not asked to rank, whether or not its pin is still on the fallen stay', () => {
    const fallen = [fell('a1')];
    const stale = adminOf({ fallen, pins: [{ area: 'Ella', suggestionId: 'a1', at: 't1' }] });
    expect(rankAreas(ctxOf(four, locked, { admin: stale }))).toEqual([]);
    expect(rankAreas(ctxOf(four, locked, { admin: adminOf({ fallen }) }))).toEqual([]);
    expect(rankAreas(ctxOf(four, locked, { admin: adminOf({ fallen: [fell('b1', 'Kandy and Knuckles')] }) }))).toEqual(['Ella']);
  });
  it('no fallen data changes nothing', () => {
    expect(outcome(ctxOf(four, locked, { admin: adminOf({ fallen: [] }) }), 'Ella')).toEqual(outcome(ctxOf(four, locked), 'Ella'));
  });
});
