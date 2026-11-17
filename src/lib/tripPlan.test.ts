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
    expect(releaseState(settings({ ...plan9, items: [] }))).toEqual({ state: 'absent' });
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
  route: [], areas: [], chosen: ['kottu', 'pettah', 'galleface', 'surf'], dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0,
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
    expect(out.plan.days.map(d => d.spare)).toEqual([1.5, 6, 99]);
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
    expect(out.plan.days[0].spare).toBe(2.5);
  });
  it('counts custom hours in the spare, and warns on a negative one', () => {
    const out = applyDayEdits(small(), [{ kind: 'custom', id: 'c:1', day: 2, title: 'Long lunch', hours: 9 }], 9);
    expect(out.plan.days[1].entries.map(e => e.itemId)).toEqual(['galleface']);
    expect(out.plan.days[1].spare).toBe(-1);
    expect(out.warnings.join()).toMatch(/day 2/i);
  });
  it('caps the first and last day at half the pace, so a move onto them can go over budget', () => {
    const out = applyDayEdits(small(), [{ kind: 'move', id: 'galleface', day: 3 }, { kind: 'hide', id: 'pettah' }], 9);
    expect(out.plan.days[0].spare).toBe(2.5);
    expect(out.plan.days[2].spare).toBe(-2.5);
    expect(out.warnings.join()).toMatch(/day 3 is over budget by 2.5/i);
  });
  it('turns fits off when the edits push a day over budget, and keeps the planner value otherwise', () => {
    const over = applyDayEdits(small(), [{ kind: 'custom', id: 'c:1', day: 2, title: 'Long lunch', hours: 9 }], 9);
    expect(over.plan.fits).toBe(false);
    expect(applyDayEdits(small(), [{ kind: 'hide', id: 'pettah' }], 9).plan.fits).toBe(true);
    expect(applyDayEdits({ ...small(), fits: false }, [{ kind: 'hide', id: 'pettah' }], 9).plan.fits).toBe(false);
  });
  it('recomputes rainSlack from the new spare', () => {
    const p = small();
    p.days[1].area = 'Ella';
    const out = applyDayEdits(p, [{ kind: 'hide', id: 'galleface' }], 9);
    expect(out.plan.days[1].spare).toBe(9);
    expect(out.plan.days[1].rainSlack).toBe(true);
    const full = applyDayEdits(p, [{ kind: 'move', id: 'pettah', day: 2 }, { kind: 'move', id: 'kottu', day: 2 }, { kind: 'custom', id: 'c:1', day: 2, hours: 1 }], 9);
    expect(full.plan.days[1].spare).toBe(2);
    expect(full.plan.days[1].rainSlack).toBe(false);
  });
  it('drops a hidden place from chosen, but keeps a moved one', () => {
    const out = applyDayEdits(small(), [{ kind: 'hide', id: 'pettah' }, { kind: 'move', id: 'kottu', day: 2 }], 9);
    expect(out.plan.chosen).toEqual(['kottu', 'galleface', 'surf']);
  });
  it('does not charge an evening place against the daytime spare', () => {
    const p = small();
    const eveItem = { id: 'kottu', slot: 'late' } as Item;
    const out = applyDayEdits(p, [{ kind: 'hide', id: 'pettah' }], 9, [eveItem]);
    expect(out.plan.days[0].spare).toBe(4.5);
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
  // Evening and late places have their own budget in the planner, so they cost the day no spare.
  const eve = new Set(ALL.filter(i => i.slot === 'evening' || i.slot === 'late').map(i => i.id));
  const hours = (d: Plan['days'][number]) => d.entries.reduce((s, e) => s + (e.itemId && eve.has(e.itemId) ? 0 : e.hours), 0);
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
    const cap = (n: number) => (n === 1 || n === days.length ? PACE_HOURS[RELEASE!.pace] / 2 : PACE_HOURS[RELEASE!.pace]);
    expect(days[to.n - 1].spare).toBeCloseTo(cap(to.n) - hours(days[to.n - 1]), 5);
    expect(days[from.n - 1].spare).toBeCloseTo(cap(from.n) - hours(days[from.n - 1]), 5);
  });
  it('a place moved to the last day lands before the airport drive, not after the flight', () => {
    const last = today.final!.days.length;
    const g = run({ ...RELEASE!, dayEdits: [{ kind: 'move', id: 'pidurangala', day: last }] });
    const labels = g.final!.days[last - 1].entries.map(e => e.itemId ?? e.label);
    const at = labels.indexOf('pidurangala');
    expect(at).toBeGreaterThan(-1);
    const tail = g.final!.days[last - 1].entries.findIndex(e => (e.kind === 'drive' && e.to === 'AIR') || e.label === 'Check in and fly');
    expect(tail).toBeGreaterThan(-1);
    expect(at).toBeLessThan(tail);
    expect(g.final!.days[last - 1].entries.at(-1)?.label).toBe('Check in and fly');
  });
  it('names the place, not its id, in a skipped-edit warning', () => {
    const g = run({ ...RELEASE!, dayEdits: [{ kind: 'hide', id: 'rooftop' }] });
    expect(g.warnings?.join()).toContain('Rooftop drinks or Lotus Tower');
    expect(g.warnings?.join()).not.toContain('"rooftop"');
  });
  it('a move onto the capped last day uses half the pace and reports the overrun through groupResult', () => {
    const last = today.final!.days.length;
    const movable = today.final!.days.slice(0, -1).flatMap(x => x.entries.filter(e => e.itemId && e.kind !== 'drive' && e.kind !== 'train'));
    const g = run({ ...RELEASE!, dayEdits: movable.map(e => ({ kind: 'move' as const, id: e.itemId!, day: last })) });
    const d = g.final!.days[last - 1];
    expect(d.spare).toBeCloseTo(PACE_HOURS[RELEASE!.pace] / 2 - hours(d), 5);
    expect(d.spare).toBeLessThan(PACE_HOURS[RELEASE!.pace] - hours(d));
    expect(g.warnings).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`Day ${last} is over budget`))]));
  });
  it('hiding an evening place leaves the planner\'s spare alone', () => {
    const from = today.final!.days.find(d => d.entries.some(e => e.itemId === 'kottu'))!;
    expect(eve.has('kottu')).toBe(true);
    const g = run({ ...RELEASE!, dayEdits: [{ kind: 'hide', id: 'kottu' }] });
    expect(g.final!.days[from.n - 1].spare).toBe(from.spare);
  });
  it('a hidden place leaves final.chosen, and warnings reach the result', () => {
    const g = run({ ...RELEASE!, dayEdits: [{ kind: 'hide', id: 'kottu' }, { kind: 'hide', id: 'nowhere' }] });
    expect(g.final!.chosen).not.toContain('kottu');
    expect(g.final!.days.some(d => d.entries.some(e => e.itemId === 'kottu'))).toBe(false);
    expect(g.warnings?.join()).toMatch(/nowhere/);
    expect(today.warnings).toBeUndefined();
  });
  it('a release with no items is off, so it falls back like no release at all', () => {
    expect(run({ ...RELEASE!, items: [], dayEdits: [] }).released).toBeUndefined();
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
