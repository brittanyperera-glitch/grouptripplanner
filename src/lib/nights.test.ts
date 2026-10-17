import { describe, expect, it } from 'vitest';
import type { AppState, PlaceSuggestion, Plan } from '../types';
import { applyAdmin, cleanNights, EMPTY_STAYS } from '../types';
import { chosenStays } from '../screens/Itinerary';
import { withNights } from './override';
import { effectiveNights, nightsNote, stayCtx, STAY_COPY } from './stayflow';

const day = (n: number, area: Plan['days'][number]['area']) => ({ n, area, entries: [], spare: 0, rainSlack: false });
const plan = { route: [], areas: [], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0, days: [day(1, 'Ella'), day(2, 'Ella'), day(3, 'Colombo')] } as unknown as Plan;
const stay: PlaceSuggestion = { id: 's1', name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut', status: 'live', createdAt: '2026-10-16T00:00:00Z' };
const state = (nights?: Record<string, number>): AppState => ({
  responses: {}, suggestions: [], votes: [],
  stays: { ...EMPTY_STAYS, suggestions: [stay], admin: { pins: [{ area: 'Ella', suggestionId: 's1', at: 't' }], scouts: {}, closed: [], ...(nights ? { nights } : {}) } },
});

describe('stay nights override', () => {
  it('the stay context uses the override where set and the itinerary count elsewhere', () => {
    const ctx = stayCtx(state({ Ella: 4 }), 'Brittany', plan);
    expect(ctx.nights).toEqual({ Ella: 4, Colombo: 1 });
    expect(ctx.derivedNights).toEqual({ Ella: 2, Colombo: 1 });
  });

  it('falls back to the derived count when no override is stored', () => {
    expect(stayCtx(state(), 'Brittany', plan).nights).toEqual({ Ella: 2, Colombo: 1 });
    expect(effectiveNights({ Ella: 2 }, undefined)).toEqual({ Ella: 2 });
  });

  it('the itinerary stay list shows the override, flags the difference, and stays plain without one', () => {
    expect(chosenStays(state({ Ella: 4 }), 'Brittany', plan)).toEqual([{ area: 'Ella', title: 'Hill hut', nights: 4, itineraryNights: 2 }]);
    expect(chosenStays(state(), 'Brittany', plan)).toEqual([{ area: 'Ella', title: 'Hill hut', nights: 2 }]);
  });

  it('the note appears only when the override differs, in under 25 words and with no em dash', () => {
    expect(nightsNote(stayCtx(state({ Ella: 4 }), 'Brittany', plan), 'Ella')).toBe(STAY_COPY.nightsNote(2));
    expect(nightsNote(stayCtx(state({ Ella: 2 }), 'Brittany', plan), 'Ella')).toBeNull();
    expect(nightsNote(stayCtx(state(), 'Brittany', plan), 'Ella')).toBeNull();
    const text = STAY_COPY.nightsNote(2);
    expect(text.split(/\s+/).length).toBeLessThan(25);
    expect(text).not.toContain('—');
  });

  it('withNights clamps to 1..14, rounds, and drops the override when it equals the itinerary', () => {
    expect(withNights({}, 'Ella', 0, 2)).toEqual({ Ella: 1 });
    expect(withNights({}, 'Ella', 99, 2)).toEqual({ Ella: 14 });
    expect(withNights({}, 'Ella', 3.6, 2)).toEqual({ Ella: 4 });
    expect(withNights({}, 'Ella', Number.NaN, 2)).toEqual({ Ella: 1 });
    expect(withNights({ Ella: 5, Colombo: 3 }, 'Ella', 2, 2)).toEqual({ Colombo: 3 });
  });

  it('a stored map keeps only whole numbers from 1 to 14, and applyAdmin cleans a patch', () => {
    expect(cleanNights({ Ella: 0, Colombo: 15, Kandy: 2.5, Galle: '3', North: 14, Yala: 1 })).toEqual({ North: 14, Yala: 1 });
    expect(cleanNights(null)).toEqual({});
    expect(cleanNights([3])).toEqual({});
    expect(applyAdmin({ pins: [], scouts: {}, closed: [] }, { nights: { Ella: 40 } }).nights).toBeUndefined();
    expect(applyAdmin({ pins: [], scouts: {}, closed: [] }, { nights: { Ella: 3 } }).nights).toEqual({ Ella: 3 });
  });
});
