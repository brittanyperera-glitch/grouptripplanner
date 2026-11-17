import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { Day, Hub, Item, Leg, Plan } from '../types';
import { nightBlocks, nightsFromBlocks } from './calendar';
import { groupResult } from './group';
import { RELEASE } from './release';
import { effectiveNights, nightsNote, stayCtx } from './stayflow';

const plan = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legs as Leg[], [], RELEASE).final!;
const state = { responses: {}, suggestions: [], votes: [] };

describe('stayCtx nights come from the calendar', () => {
  it('derives per-area nights from the night blocks, and the final area loses the departure day', () => {
    const ctx = stayCtx(state, 'Alex', plan);
    expect(ctx.derivedNights).toEqual(nightsFromBlocks(nightBlocks(plan, null)));
    expect(ctx.derivedNights?.Colombo).toBe(1);
    expect(ctx.nights).toEqual(ctx.derivedNights);
  });

  it('an organiser override still wins, and the note still names the itinerary count', () => {
    const ctx = stayCtx({ ...state, stays: { crew: {}, suggestions: [], admin: { pins: [], scouts: {}, closed: [], nights: { 'South coast': 4 } } } }, 'Alex', plan);
    expect(ctx.nights['South coast']).toBe(4);
    expect(effectiveNights(ctx.derivedNights!, { 'South coast': 4 })['South coast']).toBe(4);
    expect(nightsNote(ctx, 'South coast')).toContain('2');
  });
});

describe('stayCtx areas are where the group sleeps', () => {
  const drive = (from: Hub, to: Hub) => ({ kind: 'drive' as const, label: `Drive from ${from} to ${to}`, hours: 2, from, to });
  const day = (n: number, area: Day['area'], entries: Day['entries'] = []): Day => ({ n, area, entries, spare: 0, rainSlack: false });

  it('on the real released plan are the areas of its night blocks, route order, none only on the departure day', () => {
    const ctx = stayCtx(state, 'Alex', plan);
    expect(ctx.areas).toEqual([...new Set(nightBlocks(plan, null).map(b => b.area))]);
    expect(ctx.areas).toEqual(['Cultural Triangle', 'Kandy and Knuckles', 'Hill country', 'South coast', 'Colombo']);
    expect(ctx.areas).toEqual(Object.keys(ctx.derivedNights ?? {}));
  });

  it('keep route order, skip travel days, and list a revisited area once', () => {
    const p = { route: ['Colombo', 'Ella', 'Colombo'], days: [day(1, 'Colombo'), day(2, null, [drive('Colombo', 'Ella')]), day(3, 'Ella'), day(4, null, [drive('Ella', 'Colombo')]), day(5, 'Colombo'), day(6, 'Colombo')] } as Plan;
    expect(stayCtx(state, 'Alex', p).areas).toEqual(['Colombo', 'Ella']);
  });

  it('leave out an area that is only on the last day, where nobody sleeps', () => {
    const p = { route: ['Colombo', 'Ella', 'Kandy'], days: [day(1, 'Colombo'), day(2, null, [drive('Colombo', 'Ella')]), day(3, 'Ella'), day(4, 'Kandy and Knuckles', [drive('Ella', 'Kandy')])] } as Plan;
    expect(stayCtx(state, 'Alex', p).areas).toEqual(['Colombo', 'Ella']);
  });

  it('are empty with no plan', () => {
    expect(stayCtx(state, 'Alex', null).areas).toEqual([]);
  });
});

describe('stayCtx on an organiser-edited plan', () => {
  // Night 1 has no hub: day 1 has no area and no drive, and the route names no second stop.
  const broken = { ...plan, days: [null, 'Ella', 'Ella'].map((area, i) => ({ ...plan.days[i], area, entries: [] })), route: ['AIR'] } as unknown as typeof plan;

  it('falls back to counting nights, not days, when a night has no area hub, instead of throwing', () => {
    expect(() => nightBlocks(broken, null)).toThrow(RangeError);
    const ctx = stayCtx(state, 'Alex', broken);
    expect(ctx.derivedNights).toEqual({ Ella: 1 });
    expect(ctx.nights).toEqual({ Ella: 1 });
  });

  it('lets any other error through rather than hiding it', () => {
    const malformed = { ...plan, days: [{ area: null }, { area: null }] } as unknown as typeof plan;
    expect(() => stayCtx(state, 'Alex', malformed)).toThrow(TypeError);
  });
});
