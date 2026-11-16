import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { Item, Leg } from '../types';
import { nightBlocks, nightsFromBlocks } from './calendar';
import { groupResult } from './group';
import { RELEASE } from './release';
import { effectiveNights, nightsNote, stayCtx } from './stayflow';
import { nightsByArea } from './stays';

const plan = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legs as Leg[], [], RELEASE).final!;
const state = { responses: {}, suggestions: [], votes: [] };

describe('stayCtx nights come from the calendar', () => {
  it('derives per-area nights from the night blocks, one fewer than nightsByArea for the last area', () => {
    const ctx = stayCtx(state, 'Alex', plan);
    expect(ctx.derivedNights).toEqual(nightsFromBlocks(nightBlocks(plan, null)));
    expect(ctx.derivedNights?.Colombo).toBe((nightsByArea(plan).Colombo ?? 0) - 1);
    expect(ctx.nights).toEqual(ctx.derivedNights);
  });

  it('an organiser override still wins, and the note still names the itinerary count', () => {
    const ctx = stayCtx({ ...state, stays: { crew: {}, suggestions: [], admin: { pins: [], scouts: {}, closed: [], nights: { 'South coast': 4 } } } }, 'Alex', plan);
    expect(ctx.nights['South coast']).toBe(4);
    expect(effectiveNights(ctx.derivedNights!, { 'South coast': 4 })['South coast']).toBe(4);
    expect(nightsNote(ctx, 'South coast')).toContain('2');
  });
});

describe('stayCtx on an organiser-edited plan', () => {
  // Night 1 has no hub: day 1 has no area and no drive, and the route names no second stop.
  const broken = { ...plan, days: [null, 'Ella', 'Ella'].map((area, i) => ({ ...plan.days[i], area, entries: [] })), route: ['AIR'] } as unknown as typeof plan;

  it('falls back to counting nights, not days, when a night has no area hub, instead of throwing', () => {
    expect(() => nightBlocks(broken, null)).toThrow(RangeError);
    expect(nightsByArea(broken)).toEqual({ Ella: 2 });
    const ctx = stayCtx(state, 'Alex', broken);
    expect(ctx.derivedNights).toEqual({ Ella: 1 });
    expect(ctx.nights).toEqual({ Ella: 1 });
  });

  it('lets any other error through rather than hiding it', () => {
    const malformed = { ...plan, days: [{ area: null }, { area: null }] } as unknown as typeof plan;
    expect(() => stayCtx(state, 'Alex', malformed)).toThrow(TypeError);
  });
});
