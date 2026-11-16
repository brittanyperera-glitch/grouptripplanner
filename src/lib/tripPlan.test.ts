import { describe, expect, it, vi } from 'vitest';

vi.unmock('./release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import { PACE_HOURS, type DayEntry, type Item, type Leg, type Plan, type ReleasePlan, type TripSettings } from '../types';
import { groupResult } from './group';
import { RELEASE, releaseFor } from './release';
import { applyDayEdits, effectiveRelease, releaseState } from './tripPlan';

const ALL = (catalogue as unknown as { items: Item[] }).items;
const L = legs as Leg[];
const plan9: ReleasePlan = { days: 9, pace: 1, items: ['a'], ruledOut: [], dayEdits: [] };
const settings = (plan: ReleasePlan | null): TripSettings => ({ startDate: null, plan, bookingDates: {}, overrides: [], updatedAt: 'x' });

describe('releaseState and effectiveRelease', () => {
  it('maps undefined to loading, null and an empty plan to absent, a plan to value', () => {
    expect(releaseState(undefined)).toEqual({ state: 'loading' });
    expect(releaseState(null)).toEqual({ state: 'absent' });
    expect(releaseState(settings(null))).toEqual({ state: 'absent' });
    expect(releaseState(settings(plan9))).toEqual({ state: 'value', plan: plan9 });
  });
  it('never yields the seed while loading', () => {
    expect(effectiveRelease({ state: 'loading' }, RELEASE, null)).toBeNull();
    const snap = { ...plan9, items: ['snap'] };
    expect(effectiveRelease({ state: 'loading' }, RELEASE, snap)).toBe(snap);
  });
  it('yields the seed with no day edits when absent, and null with no seed', () => {
    expect(effectiveRelease({ state: 'absent' }, RELEASE, null)).toEqual({ ...RELEASE!, dayEdits: [] });
    expect(effectiveRelease({ state: 'absent' }, null, null)).toBeNull();
  });
  it('yields the stored plan when there is one', () => {
    expect(effectiveRelease({ state: 'value', plan: plan9 }, RELEASE, null)).toBe(plan9);
  });
  it('a guest still gets no release', () => {
    expect(releaseFor('Tuktuk')).toBeNull();
  });
});

const act = (itemId: string, hours: number): DayEntry => ({ kind: 'activity', label: itemId, hours, itemId });
const day = (n: number, area: Plan['days'][number]['area'], entries: DayEntry[]) => ({ n, area, entries, spare: 99, rainSlack: false });
const small = (): Plan => ({
  route: [], areas: [], chosen: [], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
  days: [
    day(1, 'Colombo', [act('kottu', 2), act('pettah', 3)]),
    day(2, 'Colombo', [act('galleface', 1)]),
    day(3, 'South coast', [{ kind: 'train', label: 'Train', hours: 4, itemId: 'train', from: 'Kandy', to: 'Ella' }, act('surf', 2)]),
  ],
});

describe('applyDayEdits', () => {
  it('moves an entry to the end of the target day and recomputes both spares', () => {
    const p = small();
    const out = applyDayEdits(p, [{ kind: 'move', id: 'kottu', day: 2 }], 9);
    expect(out.plan.days[0].entries.map(e => e.itemId)).toEqual(['pettah']);
    expect(out.plan.days[1].entries.map(e => e.itemId)).toEqual(['galleface', 'kottu']);
    expect(out.plan.days.map(d => d.spare)).toEqual([6, 6, 99]);
    expect(out.warnings).toEqual([]);
  });
  it('warns when the move crosses areas, and does not mutate the input', () => {
    const p = small();
    const before = JSON.stringify(p);
    const out = applyDayEdits(p, [{ kind: 'move', id: 'kottu', day: 3 }], 9);
    expect(out.warnings.join()).toMatch(/kottu.*South coast/);
    expect(JSON.stringify(p)).toBe(before);
    expect(out.plan).not.toBe(p);
  });
  it('hides an entry', () => {
    const out = applyDayEdits(small(), [{ kind: 'hide', id: 'pettah' }], 9);
    expect(out.plan.days[0].entries.map(e => e.itemId)).toEqual(['kottu']);
    expect(out.plan.days[0].spare).toBe(7);
  });
  it('counts custom hours in the spare, and warns on a negative one', () => {
    const out = applyDayEdits(small(), [{ kind: 'custom', id: 'c:1', day: 2, title: 'Long lunch', hours: 9 }], 9);
    expect(out.plan.days[1].entries.map(e => e.itemId)).toEqual(['galleface']);
    expect(out.plan.days[1].spare).toBe(-1);
    expect(out.warnings.join()).toMatch(/day 2/i);
  });
  it('refuses to move or hide a train entry', () => {
    const out = applyDayEdits(small(), [{ kind: 'move', id: 'train', day: 1 }, { kind: 'hide', id: 'train' }], 9);
    expect(out.plan.days[2].entries.map(e => e.itemId)).toEqual(['train', 'surf']);
    expect(out.warnings).toHaveLength(2);
  });
  it('skips an edit whose item is gone, naming it', () => {
    const out = applyDayEdits(small(), [{ kind: 'hide', id: 'vanished' }, { kind: 'move', id: 'gone', day: 1 }], 9);
    expect(out.warnings.join()).toMatch(/vanished/);
    expect(out.warnings.join()).toMatch(/gone/);
    expect(out.plan.days.map(d => d.entries.length)).toEqual([2, 1, 2]);
  });
  it('skips a move to a day that does not exist', () => {
    const out = applyDayEdits(small(), [{ kind: 'move', id: 'kottu', day: 9 }], 9);
    expect(out.plan.days[0].entries).toHaveLength(2);
    expect(out.warnings).toHaveLength(1);
  });
});

describe('the released plan through groupResult', () => {
  const run = (release: ReleasePlan | typeof RELEASE, items: Item[] = ALL) => groupResult(seedState(), items, L, [], release);
  const today = run(RELEASE);

  it('empty day edits give exactly today\'s released plan', () => {
    expect(run({ ...RELEASE!, dayEdits: [] }).final).toEqual(today.final);
  });
  it('a day edit moving kottu moves it and recomputes spare', () => {
    const from = today.final!.days.find(d => d.entries.some(e => e.itemId === 'kottu'))!;
    const to = today.final!.days.find(d => d.n !== from.n && d.area !== null)!;
    const g = run({ ...RELEASE!, dayEdits: [{ kind: 'move', id: 'kottu', day: to.n }] });
    const days = g.final!.days;
    expect(days[from.n - 1].entries.some(e => e.itemId === 'kottu')).toBe(false);
    expect(days[to.n - 1].entries.at(-1)?.itemId).toBe('kottu');
    const hours = (d: Plan['days'][number]) => d.entries.reduce((s, e) => s + e.hours, 0);
    expect(days[to.n - 1].spare).toBeCloseTo(PACE_HOURS[RELEASE!.pace] - hours(days[to.n - 1]), 5);
    expect(days[from.n - 1].spare).toBeCloseTo(PACE_HOURS[RELEASE!.pace] - hours(days[from.n - 1]), 5);
  });
  it('a late live suggestion listed in the release items lands in the final plan', () => {
    const beach = ALL.find(i => i.id === 'beachday')!;
    const live: Item = { ...beach, id: 's:cafe', name: 'Cafe', about: '', hours: 1, slot: 'any', suggestedBy: 'Lazza', late: true };
    const items = [...ALL, live];
    expect(run(RELEASE, items).final!.chosen).not.toContain('s:cafe');
    const g = run({ ...RELEASE!, items: [...RELEASE!.items, 's:cafe'], dayEdits: [] }, items);
    expect(g.final!.chosen).toContain('s:cafe');
  });
});
