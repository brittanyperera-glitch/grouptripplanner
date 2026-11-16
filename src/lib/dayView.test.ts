import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import type { Area, DayBooking, DayEdit, Item, Leg, Person, Plan, Traveller } from '../types';
import { nightBlocks } from './calendar';
import { dayView, type DayViewInput } from './dayView';
import { groupResult } from './group';
import { RELEASE } from './release';

const plan = groupResult(seedState(), (catalogue as unknown as { items: Item[] }).items, legs as Leg[], [], RELEASE).final!;
const START = '2026-12-08';
const stays: DayViewInput['stays'] = { 'Cultural Triangle': { id: 's1', title: 'Rock View', link: 'https://x.test/rock' }, 'Kandy and Knuckles': { id: 's2', title: 'Lake House', link: null } };

const input = (over: Partial<DayViewInput> = {}): DayViewInput => ({
  plan, start: START, blocks: nightBlocks(plan, START), stays, bookingsByDay: {}, travellers: {}, custom: [], paceHours: 11, ...over,
});
const traveller = (name: Person, over: Partial<Traveller>): Traveller => ({ name, arriveLocal: null, arriveFlight: null, departLocal: null, departFlight: null, updatedAt: '', ...over });
const numbered = (p: Plan) => p.days.map((_, i) => i + 1);

describe('legs on the real released plan', () => {
  const all = numbered(plan).map(n => dayView(input(), n).legs);
  it('are exactly 0..route.length-2, each once, ascending', () => {
    expect(all.flat()).toEqual(Array.from({ length: plan.route.length - 1 }, (_, k) => k));
  });
  it('are the indices of each day\'s own drive and train entries', () => {
    numbered(plan).forEach((n, i) => expect(all[i]).toHaveLength(plan.days[n - 1].entries.filter(e => e.kind === 'drive' || e.kind === 'train').length));
  });
  it('join the entry\'s own hubs, matched by index and not by hub pair', () => {
    for (const n of numbered(plan)) {
      const entries = plan.days[n - 1].entries.filter(e => e.kind === 'drive' || e.kind === 'train');
      dayView(input(), n).legs.forEach((k, j) => {
        expect(plan.route[k + 1]).toBe(entries[j].to);
      });
    }
  });
});

describe('a day with two drives', () => {
  it('returns two leg indices, after the legs of the days before', () => {
    const p: Plan = structuredClone(plan);
    const at = plan.days.findIndex((d, i) => i > 0 && d.entries.some(e => e.kind === 'drive'));
    p.days[at].entries.push({ kind: 'drive', label: 'Extra', hours: 1, from: 'Sigiriya', to: 'Sigiriya' });
    const before = p.days.slice(0, at).flatMap(d => d.entries).filter(e => e.kind === 'drive' || e.kind === 'train').length;
    expect(before).toBeGreaterThan(0);
    expect(dayView(input({ plan: p }), at + 1).legs).toEqual([before, before + 1]);
  });
});

describe('tonight and dates on the real plan', () => {
  it('puts day 1 at the first block with check-in, and day 2 as the same stay without it', () => {
    const d1 = dayView(input(), 1), d2 = dayView(input(), 2), d3 = dayView(input(), 3);
    expect(d1.date).toBe(START);
    expect(d1.tonight).toEqual({ area: 'Cultural Triangle', stayId: 's1', title: 'Rock View', link: 'https://x.test/rock', checkIn: true });
    expect(d2.tonight).toMatchObject({ area: 'Cultural Triangle', stayId: 's1', checkIn: false });
    expect(d3.tonight).toEqual({ area: 'Kandy and Knuckles', stayId: 's2', title: 'Lake House', link: null, checkIn: true });
  });
  it('has no stay yet for an area without one, and no tonight on day 9', () => {
    expect(dayView(input(), 5).tonight).toEqual({ area: 'Hill country', stayId: null, title: null, link: null, checkIn: true });
    expect(dayView(input(), 9).tonight).toBeNull();
    expect(dayView(input(), 9).date).toBe('2026-12-16');
  });
  it('keeps the nights but not the dates with no start', () => {
    const v = dayView(input({ start: null, blocks: nightBlocks(plan, null) }), 6);
    expect(v.date).toBeNull();
    expect(v.tonight).toMatchObject({ area: 'South coast', checkIn: true });
  });
  it('rejects a day the plan does not have', () => {
    expect(() => dayView(input(), 10)).toThrow(RangeError);
  });
});

describe('parkAt', () => {
  it('is where the previous day ended on a day with no leg, and the route start for day 1', () => {
    const p: Plan = structuredClone(plan);
    p.days[1].entries = [{ kind: 'free', label: 'Free day', hours: 0 }];
    expect(dayView(input({ plan: p }), 2).legs).toEqual([]);
    expect(dayView(input({ plan: p }), 2).parkAt).toBe('Sigiriya');
    p.days[0].entries = [{ kind: 'free', label: 'Free day', hours: 0 }];
    expect(dayView(input({ plan: p }), 1).parkAt).toBe(p.route[0]);
  });
});

describe('flights, custom stops and spare', () => {
  it('lists travellers whose arrival or departure date is the day', () => {
    const travellers = {
      Alex: traveller('Alex', { arriveLocal: '2026-12-08T06:30', arriveFlight: 'UL504', departLocal: '2026-12-16T22:10', departFlight: null }),
      Lazza: traveller('Lazza', { arriveLocal: '2026-12-07T23:00' }),
    };
    expect(dayView(input({ travellers }), 1).flights).toEqual([{ name: 'Alex', kind: 'arrive', time: '2026-12-08T06:30', flight: 'UL504' }]);
    expect(dayView(input({ travellers }), 9).flights).toEqual([{ name: 'Alex', kind: 'depart', time: '2026-12-16T22:10', flight: null }]);
    expect(dayView(input({ travellers, start: null }), 1).flights).toEqual([]);
  });
  it('keeps only the custom stops for this day, and passes bookings through', () => {
    const custom: DayEdit[] = [{ kind: 'custom', id: 'c:1', day: 3, title: 'Cinnamon', hours: 1 }, { kind: 'custom', id: 'c:2', day: 4 }, { kind: 'hide', id: 'x', day: 3 }];
    const booking: DayBooking = { id: 'train', label: 'Train', status: 'open', opensOn: null, bookBy: null, owner: null };
    const v = dayView(input({ custom, bookingsByDay: { 3: [booking] } }), 3);
    expect(v.custom).toEqual([custom[0]]);
    expect(v.bookings).toEqual([booking]);
    expect(dayView(input(), 3).bookings).toEqual([]);
  });
  it('uses the plan\'s own spare without custom stops, and subtracts custom hours from the pace when there are some', () => {
    const base = dayView(input(), 3);
    expect(base.spare).toBe(plan.days[2].spare);
    expect(base.overBudget).toBe(false);
    const used = plan.days[2].entries.reduce((s, e) => s + e.hours, 0);
    const custom: DayEdit[] = [{ kind: 'custom', id: 'c:1', day: 3, hours: 2 }, { kind: 'custom', id: 'c:2', day: 3 }];
    expect(dayView(input({ custom }), 3).spare).toBeCloseTo(11 - used - 2);
    const big: DayEdit[] = [{ kind: 'custom', id: 'c:1', day: 3, hours: 20 }];
    expect(dayView(input({ custom: big }), 3).overBudget).toBe(true);
  });
  it('caps the first and last day at half the pace once a stop is added, as the planner does', () => {
    const lastN = plan.days.length;
    for (const n of [1, lastN]) {
      const used = plan.days[n - 1].entries.reduce((s, e) => s + e.hours, 0);
      const v = dayView(input({ custom: [{ kind: 'custom', id: 'c:1', day: n, hours: 1 }] }), n);
      expect(v.spare).toBeCloseTo(11 / 2 - used - 1);
      // The plan's own spare for the day, less the stop, is what the planner would leave.
      expect(v.spare).toBeCloseTo(plan.days[n - 1].spare - 1);
    }
    const tight = dayView(input({ custom: [{ kind: 'custom', id: 'c:1', day: lastN, hours: plan.days[lastN - 1].spare + 0.5 }] }), lastN);
    expect(tight.overBudget).toBe(true);
  });
  it('is not over budget when a custom stop fills exactly what is left, despite float noise', () => {
    const p: Plan = structuredClone(plan);
    p.days[2].entries = [{ kind: 'activity', label: 'Long day', hours: 6.83 }];
    const v = dayView(input({ plan: p, paceHours: 7, custom: [{ kind: 'custom', id: 'c:1', day: 3, hours: 0.17 }] }), 3);
    expect(Math.abs(v.spare)).toBe(0);
    expect(v.overBudget).toBe(false);
  });
  it('carries the day\'s area and entries', () => {
    const v = dayView(input(), 4);
    expect(v.n).toBe(4);
    expect(v.area).toBe(plan.days[3].area as Area | null);
    expect(v.entries).toBe(plan.days[3].entries);
  });
});
