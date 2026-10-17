import { describe, expect, it } from 'vitest';
import { AREAS, PEOPLE } from '../types';
import type { Area, CrewStays, PlaceSuggestion, Player } from '../types';
import { flow, HOSTELS, HUB_AREA, hostelPrice, hostelsFor, outcome, parseUrl, rankAreas, STAY_COPY, STEPS, stayCtx } from './stayflow';
import type { FlowInput, StayCtx } from './stayflow';

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
  it('no stays is empty, one is picked for us, two go straight to the head to head', () => {
    expect(outcome(ctxOf([], locked), 'Ella')).toEqual({ kind: 'empty' });
    expect(outcome(ctxOf([stay('a1', 'Ella')], locked), 'Ella')).toEqual({ kind: 'decided', id: 'a1', via: 'only' });
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
    expect(outcome(ctxOf(two, locked, { admin }), 'Ella')).toEqual({ kind: 'decided', id: 'a1', via: 'only' });
    const three = [stay('a1', 'Ella'), stay('a2', 'Ella', { status: 'withdrawn' }), stay('a3', 'Ella'), stay('a4', 'Ella')];
    expect(rankAreas(ctxOf(three, locked, { admin }))).toEqual(['Ella']);
  });
  it('three votes settle it', () => {
    const two = [stay('a1', 'Ella'), stay('a2', 'Ella')];
    const votes = (['Alex', 'Antek', 'Lazza'] as const).map(name => ({ forkId: 'stay:Ella:a1:a2', name, choice: 'b' as const }));
    expect(outcome(ctxOf(two, locked, { votes }), 'Ella')).toEqual({ kind: 'decided', id: 'a2', via: 'vote' });
  });
});
