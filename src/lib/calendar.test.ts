import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { Day, DayEntry, Hub, Item, Leg, Plan } from '../types';
import { addDays, dateOf, hubArea, nightBlocks, nightHub, nightsFromBlocks } from './calendar';
import { groupResult } from './group';
import { RELEASE } from './release';
import { nightsByArea } from './stays';

const plan = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legs as Leg[], [], RELEASE).final!;
const START = '2026-12-08';

const drive = (from: Hub, to: Hub, label = `Drive from ${from} to ${to}`): DayEntry => ({ kind: 'drive', label, hours: 2, from, to });
const free: DayEntry = { kind: 'free', label: 'Check in and fly', hours: 1 };
const day = (n: number, area: Day['area'], entries: DayEntry[]): Day => ({ n, area, entries, spare: 0, rainSlack: false });
// Day 2 ends with the planner's "Drive towards the airport" (planner.ts:466-472); day 3 is the last day.
const towardsAirport = (area2: Day['area']): Plan => ({
  route: ['AIR', 'Kandy', 'AIR'], areas: ['Kandy and Knuckles'], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: [day(1, 'Kandy and Knuckles', [drive('AIR', 'Kandy')]), day(2, area2, [drive('Kandy', 'AIR', 'Drive towards the airport')]), day(3, 'Kandy and Knuckles', [free])],
});

describe('dates', () => {
  it('adds days on UTC dates across month, year and leap boundaries', () => {
    expect(addDays('2026-12-08', 1)).toBe('2026-12-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2026-12-08', -8)).toBe('2026-11-30');
  });
  it('makes day 1 the start date, and null without one', () => {
    expect(dateOf(1, START)).toBe(START);
    expect(dateOf(9, START)).toBe('2026-12-16');
    expect(dateOf(3, null)).toBeNull();
  });
});

describe('malformed dates', () => {
  it('give null from addDays and dateOf instead of throwing', () => {
    for (const bad of ['', 'soon', '8/12/2026', '2026-12', '12-08-2026']) {
      expect(addDays(bad, 1), bad).toBeNull();
      expect(dateOf(2, bad), bad).toBeNull();
    }
    expect(addDays('2026-12-08', Number.NaN)).toBeNull();
  });
  it('leave the night blocks without dates rather than throwing', () => {
    expect(nightBlocks(towardsAirport('Kandy and Knuckles'), 'soon').every(b => b.checkIn === null && b.checkOut === null)).toBe(true);
  });
});

describe('hubArea', () => {
  it('reverses AREA_HUB, covers the Tissa safari hub, and gives AIR nothing', () => {
    expect(hubArea('Sigiriya')).toBe('Cultural Triangle');
    expect(hubArea('Weligama')).toBe('South coast');
    expect(hubArea('Tissa')).toBe('Wild south');
    expect(hubArea('AIR')).toBeNull();
  });
});

describe('the real released plan from 2026-12-08', () => {
  const blocks = nightBlocks(plan, START);
  it('has 8 nights in 5 blocks: Sigiriya x2, Kandy x2, Nuwara Eliya x1, Weligama x2, Colombo x1', () => {
    expect(plan.days).toHaveLength(9);
    expect(blocks.map(b => [b.hub, b.nights])).toEqual([['Sigiriya', 2], ['Kandy', 2], ['Nuwara Eliya', 1], ['Weligama', 2], ['Colombo', 1]]);
    expect(blocks.reduce((s, b) => s + b.nights, 0)).toBe(8);
  });
  it('chains: each check-out is the next check-in, and the nights tile days 1 to 8', () => {
    expect(blocks[0].checkIn).toBe(START);
    blocks.slice(1).forEach((b, i) => expect(b.checkIn).toBe(blocks[i].checkOut));
    expect(blocks[4].checkOut).toBe('2026-12-16');
    expect(blocks.map(b => [b.fromDay, b.toDay])).toEqual([[1, 2], [3, 4], [5, 5], [6, 7], [8, 8]]);
  });
  it('gives each block the area of its hub, and counts nights per area', () => {
    expect(blocks.map(b => b.area)).toEqual(['Cultural Triangle', 'Kandy and Knuckles', 'Hill country', 'South coast', 'Colombo']);
    expect(nightsFromBlocks(blocks)).toEqual({ 'Cultural Triangle': 2, 'Kandy and Knuckles': 2, 'Hill country': 1, 'South coast': 2, 'Colombo': 1 });
  });
  it('has no night after the last day', () => {
    expect(nightHub(plan, 9)).toBeNull();
  });
  it('keeps the nights right with no start date, and the dates null', () => {
    const undated = nightBlocks(plan, null);
    expect(undated.map(b => [b.hub, b.nights, b.checkIn, b.checkOut])).toEqual(blocks.map(b => [b.hub, b.nights, null, null]));
  });
});

describe('the night after "Drive towards the airport"', () => {
  it('is at the day\'s area hub, not the airport', () => {
    expect(nightHub(towardsAirport('Kandy and Knuckles'), 2)).toBe('Kandy');
    const blocks = nightBlocks(towardsAirport('Kandy and Knuckles'), START);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ hub: 'Kandy', nights: 2, fromDay: 1, toDay: 2, checkIn: START, checkOut: '2026-12-10' });
  });
  it('is the previous night\'s hub when that day has no area', () => {
    expect(nightHub(towardsAirport(null), 2)).toBe('Kandy');
  });
  it('is no night at all on the last day', () => {
    expect(nightHub(towardsAirport('Kandy and Knuckles'), 3)).toBeNull();
  });
});

describe('nightHub', () => {
  it('uses the LAST drive or train entry that has a destination', () => {
    const p = towardsAirport('Kandy and Knuckles');
    p.days[1] = day(2, 'Kandy and Knuckles', [drive('Kandy', 'Nuwara Eliya'), { kind: 'train', label: 'Train', hours: 3, from: 'Nuwara Eliya', to: 'Ella' }, { kind: 'activity', label: 'Walk', hours: 1 }]);
    expect(nightHub(p, 2)).toBe('Ella');
  });
  it('falls back to the day\'s area hub when there is no drive', () => {
    const p = towardsAirport('Kandy and Knuckles');
    p.days[1] = day(2, 'Ella', [{ kind: 'free', label: 'Free day', hours: 0 }]);
    expect(nightHub(p, 2)).toBe('Ella');
  });
});

describe('nightBlocks on a plan with no hub for a night', () => {
  const lone = (route: Hub[], area: Day['area']): Plan => ({ ...towardsAirport('Kandy and Knuckles'), route, days: [day(1, area, [free]), day(2, null, [free])] });
  it('throws instead of making a block with a null hub when day 1 has no area and the route is too short', () => {
    expect(() => nightBlocks(lone(['AIR'], null), START)).toThrow(RangeError);
  });
  it('throws instead of making a block with a null area when the night lands on AIR', () => {
    expect(() => nightBlocks(lone(['AIR', 'AIR'], null), START)).toThrow(RangeError);
  });
});

describe('nights per area against the stays screen count', () => {
  it('drops exactly the last day from the final area, the one night the stays count over-reports', () => {
    const byBlocks = nightsFromBlocks(nightBlocks(plan, START));
    const byDays = nightsByArea(plan);
    expect(byDays).toEqual({ ...byBlocks, Colombo: 2 });
    expect(byBlocks.Colombo).toBe(1);
  });
});
