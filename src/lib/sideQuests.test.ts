import { describe, it, expect } from 'vitest';
import catalogue from './__fixtures__/catalogue-46.json';
import legs from '../data/legs.json';
import { plan } from './planner';
import { freeHalves, sideQuests } from './sideQuests';
import { emptyRanking, type AppState, type Area, type Day, type DayEntry, type Item, type Leg, type Person, type Plan, type Tier } from '../types';

const item = (id: string, o: Partial<Item> = {}): Item => ({ id, name: id.toUpperCase(), area: 'Ella', about: '', hours: 2, slot: 'any', fee: '', sideTrip: 0, ...o });
const act = (id: string, hours = 3): DayEntry => ({ kind: 'activity', label: id, hours, itemId: id, onSite: hours });
const drive: DayEntry = { kind: 'drive', label: 'Drive', hours: 2 };
const freeDay: DayEntry = { kind: 'free', label: 'Free day', hours: 0 };
const day = (n: number, area: Area | null, entries: DayEntry[], o: Partial<Day> = {}): Day => ({ n, area, entries, spare: 0, rainSlack: false, ...o });
const mkPlan = (days: Day[], chosen: string[] = []): Plan => ({ route: [], areas: [], days, chosen, dropped: [], travelHours: 0, fits: true, missingMusts: [], score: 0 });
const rate = (name: Person, tiers: Record<string, Tier>): AppState => {
  const ranking = emptyRanking();
  for (const [id, t] of Object.entries(tiers)) ranking[t].push([id]);
  return { responses: { [name]: { name, days: 9, flex: false, pace: 1, ranking, rated: Object.keys(tiers), submitted: true, updatedAt: '' } }, suggestions: [], votes: [] };
};
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

// Day 1 and the last day are never offered, so the day under test sits in the middle.
const ends = (mid: Day[]): Day[] => [day(1, 'Colombo', [drive]), ...mid, day(mid.length + 2, 'Colombo', [drive])];
const peak = item('peak', { hours: 2, sideTrip: 0.5, slot: 'afternoon' });
// An afternoon activity in the plan: its day has a free morning and no free afternoon.
const pm = item('pm', { slot: 'afternoon', hours: 2 });

describe('freeHalves', () => {
  const by = (...xs: Item[]) => new Map(xs.map(i => [i.id, i]));
  it('gives a whole free day both halves', () => { expect(freeHalves(day(3, 'Ella', [freeDay]), by())).toEqual(['morning', 'afternoon']); });
  it('gives a day that starts with a drive no free morning', () => { expect(freeHalves(day(3, 'Ella', [drive]), by())).toEqual(['afternoon']); });
  it('counts a train like a drive', () => { expect(freeHalves(day(3, 'Ella', [{ kind: 'train', label: 't', hours: 3, itemId: 'train' }]), by())).toEqual(['afternoon']); });
  it('reads sunrise and morning activities as the morning, afternoon and sunset as the afternoon', () => {
    expect(freeHalves(day(3, 'Ella', [act('a')]), by(item('a', { slot: 'sunrise' })))).toEqual(['afternoon']);
    expect(freeHalves(day(3, 'Ella', [act('a')]), by(item('a', { slot: 'morning' })))).toEqual(['afternoon']);
    expect(freeHalves(day(3, 'Ella', [act('a')]), by(item('a', { slot: 'afternoon' })))).toEqual(['morning']);
    expect(freeHalves(day(3, 'Ella', [act('a')]), by(item('a', { slot: 'sunset' })))).toEqual(['morning']);
  });
  it('lets an any-slot activity take the morning first, then the afternoon', () => {
    const a = item('a'), b = item('b');
    expect(freeHalves(day(3, 'Ella', [act('a')]), by(a))).toEqual(['afternoon']);
    expect(freeHalves(day(3, 'Ella', [act('a'), act('b')]), by(a, b))).toEqual([]);
    expect(freeHalves(day(3, 'Ella', [drive, act('a')]), by(a))).toEqual([]);
  });
  it('ignores evening and late activities, which sit outside the daytime', () => {
    expect(freeHalves(day(3, 'Ella', [freeDay, act('a')]), by(item('a', { slot: 'evening' })))).toEqual(['morning', 'afternoon']);
  });
  it('matches what the planner schedules: a drive day has no free morning, an afternoon activity no free afternoon', () => {
    const items = catalogue.items as Item[];
    const byId = new Map(items.map(i => [i.id, i]));
    const p = plan({ items, scores: Object.fromEntries(['sigiriya', 'galle', 'yala', 'tooth'].map(i => [i, 10])), days: 14, pace: 1, legs: legs as Leg[] });
    expect(p.days.some(d => freeHalves(d, byId).length > 0)).toBe(true);
    for (const d of p.days) {
      const f = freeHalves(d, byId);
      if (d.entries.some(e => e.kind === 'drive' || e.kind === 'train')) expect(f).not.toContain('morning');
      if (d.entries.some(e => e.kind === 'activity' && ['afternoon', 'sunset'].includes(byId.get(e.itemId!)?.slot ?? ''))) expect(f).not.toContain('afternoon');
      if (d.entries.some(e => e.label === 'Free day') && !d.entries.some(e => e.kind === 'drive' || e.kind === 'train')) expect(f).toEqual(['morning', 'afternoon']);
    }
  });
});

describe('sideQuests: free half-days', () => {
  const afternoonFree = (o: Partial<Day> = {}) => day(3, 'Ella', [drive], { spare: 5, ...o });
  const morningFree = (o: Partial<Day> = {}) => day(3, 'Ella', [act('pm', 2)], { spare: 5, ...o });
  it('finds a free afternoon with enough spare time', () => {
    const q = sideQuests(mkPlan(ends([afternoonFree()])), 'Lazza', rate('Lazza', { peak: 'keen' }), [peak]);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ itemId: 'peak', day: 3, area: 'Ella', mode: 'free', half: 'afternoon' });
    expect(q[0].what).toBe('free afternoon for PEAK (2 h)');
  });
  it('matches an any-slot place to a free morning', () => {
    const q = sideQuests(mkPlan(ends([morningFree()]), ['pm']), 'Lazza', rate('Lazza', { peak: 'must' }), [{ ...peak, slot: 'any' }, pm]);
    expect(q[0]).toMatchObject({ mode: 'free', half: 'morning' });
  });
  it('does not put a morning place in a free afternoon', () => {
    expect(sideQuests(mkPlan(ends([afternoonFree()])), 'Lazza', rate('Lazza', { peak: 'keen' }), [{ ...peak, slot: 'morning' }])).toEqual([]);
  });
  it('needs spare time for the place and the trip there', () => {
    expect(sideQuests(mkPlan(ends([afternoonFree({ spare: 2.4 })])), 'Lazza', rate('Lazza', { peak: 'keen' }), [peak])).toEqual([]);
    expect(sideQuests(mkPlan(ends([afternoonFree({ spare: 2.5 })])), 'Lazza', rate('Lazza', { peak: 'keen' }), [peak])).toHaveLength(1);
  });
  it('uses the hub area when the place area is another one', () => {
    const yala = item('yala', { area: 'Ella', hub: 'Tissa', slot: 'any' });
    expect(sideQuests(mkPlan(ends([day(3, 'Wild south', [freeDay], { spare: 5 })])), 'Lazza', rate('Lazza', { yala: 'must' }), [yala])).toHaveLength(1);
  });
});

describe('sideQuests: exclusions', () => {
  // Each exclusion is checked on a day that offers only a free half and on one that offers only a swap.
  const boring = item('boring', { slot: 'afternoon', hours: 3 });
  const freeOnly = (o: Partial<Day> = {}) => day(3, 'Ella', [drive], { spare: 5, ...o });
  const swapOnly = (o: Partial<Day> = {}) => day(3, 'Ella', [drive, act('boring', 3)], { spare: 1, ...o });
  const shapes = [['free', freeOnly], ['swap', swapOnly]] as const;
  const run = (d: Day, x: Item = peak, tiers: Record<string, Tier> = { peak: 'must' }, chosen: string[] = ['boring']) =>
    sideQuests(mkPlan(ends([d]), chosen), 'Lazza', rate('Lazza', tiers), [x, boring]);
  describe.each(shapes)('%s mode', (mode, mk) => {
    it('baseline: the setup does yield a quest', () => { expect(run(mk()).map(q => q.mode)).toEqual([mode]); });
    it('skips a sunrise place', () => { expect(run(mk(), { ...peak, slot: 'sunrise' })).toEqual([]); });
    it('skips a place that needs booking', () => { expect(run(mk(), { ...peak, book: 'Book ahead' })).toEqual([]); });
    it('skips a rain-slack day', () => { expect(run(mk({ rainSlack: true }))).toEqual([]); });
    it('skips a day in another area', () => { expect(run(mk({ area: 'Kandy and Knuckles' }))).toEqual([]); });
    it('skips a place already in the group plan', () => { expect(run(mk(), peak, { peak: 'must' }, ['boring', 'peak'])).toEqual([]); });
    it('skips a place the viewer rated Meh or Skip', () => {
      expect(run(mk(), peak, { peak: 'meh' })).toEqual([]);
      expect(run(mk(), peak, { peak: 'skip' })).toEqual([]);
    });
    it('skips day 1', () => {
      const p = mkPlan([mk({ n: 1 }), day(2, 'Colombo', [drive])], ['boring']);
      expect(sideQuests(p, 'Lazza', rate('Lazza', { peak: 'must' }), [peak, boring])).toEqual([]);
    });
    it('skips the last day', () => {
      const p = mkPlan([day(1, 'Colombo', [drive]), mk({ n: 2 })], ['boring']);
      expect(sideQuests(p, 'Lazza', rate('Lazza', { peak: 'must' }), [peak, boring])).toEqual([]);
    });
  });
  it('uses only the viewer ratings', () => {
    expect(sideQuests(mkPlan(ends([freeOnly()]), ['boring']), 'Alex', rate('Lazza', { peak: 'must' }), [peak, boring])).toEqual([]);
  });
  it('is empty without a viewer', () => { expect(sideQuests(mkPlan(ends([freeOnly()]), ['boring']), null, rate('Lazza', { peak: 'must' }), [peak, boring])).toEqual([]); });
});

describe('sideQuests: skip one group activity instead', () => {
  const x = item('beach', { name: 'Proper beach day', area: 'South coast', hours: 6, slot: 'any', sideTrip: 0 });
  const e = item('surf', { name: 'Hiriketiya beach and surf', area: 'South coast', hours: 5, slot: 'any' });
  const d7 = (entries: DayEntry[], o: Partial<Day> = {}) => day(3, 'South coast', entries, { spare: 1.5, ...o });
  const run = (tiers: Record<string, Tier>, entries = [drive, act('surf', 5)], its = [x, e], o: Partial<Day> = {}) =>
    sideQuests(mkPlan(ends([d7(entries, o)]), ['surf']), 'Lazza', rate('Lazza', tiers), its);
  it('finds a swap when the skipped activity is not my Must and the hours fit', () => {
    const q = run({ beach: 'keen' });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ mode: 'swap', itemId: 'beach', skipId: 'surf', day: 3 });
    expect(q[0].what).toBe('skip Hiriketiya beach and surf, do Proper beach day (6 h)');
  });
  it('does not offer a swap that costs one of my own Musts', () => { expect(run({ beach: 'keen', surf: 'must' })).toEqual([]); });
  it('does offer it when the skipped activity is only a Keen of mine', () => { expect(run({ beach: 'keen', surf: 'keen' })).toHaveLength(1); });
  it('does not offer a swap of a booked activity', () => { expect(run({ beach: 'keen' }, undefined, [x, { ...e, book: 'Book' }])).toEqual([]); });
  it('does not offer a swap when the freed hours do not cover the place', () => {
    expect(run({ beach: 'keen' }, [drive, act('surf', 3)], [x, { ...e, hours: 3 }], { spare: 1 })).toEqual([]);
  });
  it('does not swap across half-days: a morning place cannot replace an afternoon activity', () => {
    expect(run({ beach: 'keen' }, undefined, [{ ...x, slot: 'morning' }, { ...e, slot: 'afternoon' }])).toEqual([]);
  });
  it('does not swap an activity in another area, even on a day labelled with the place area', () => {
    expect(run({ beach: 'keen' }, undefined, [x, { ...e, area: 'Wild south' }])).toEqual([]);
  });
  it('does not swap away an evening activity', () => { expect(run({ beach: 'keen' }, undefined, [x, { ...e, slot: 'evening' }])).toEqual([]); });
  it('prefers a free half-day, even on a later day, over a swap', () => {
    const p = mkPlan([
      day(1, 'Colombo', [drive]), day(2, 'South coast', [drive, act('surf', 5)], { spare: 1.5 }),
      day(3, 'South coast', [freeDay], { spare: 7 }), day(4, 'Colombo', [drive]),
    ], ['surf']);
    const q = sideQuests(p, 'Lazza', rate('Lazza', { beach: 'must' }), [x, e]);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ mode: 'free', day: 3 });
  });
  it('gives the earliest day when two free half-days fit', () => {
    const p = mkPlan([
      day(1, 'Colombo', [drive]), day(2, 'South coast', [freeDay], { spare: 7 }),
      day(3, 'South coast', [freeDay], { spare: 7 }), day(4, 'Colombo', [drive]),
    ]);
    expect(sideQuests(p, 'Lazza', rate('Lazza', { beach: 'must' }), [x])[0].day).toBe(2);
  });
  it('does not hand one free half-day to two different places', () => {
    const y = item('lake', { area: 'South coast', hours: 2, slot: 'any' });
    const p = mkPlan(ends([day(3, 'South coast', [drive], { spare: 8 })]));
    const q = sideQuests(p, 'Lazza', rate('Lazza', { beach: 'must', lake: 'keen' }), [x, y]);
    expect(q).toHaveLength(1);
    expect(q[0].itemId).toBe('beach');
  });
});

describe('sideQuests: purity', () => {
  const x = item('beach', { area: 'South coast', hours: 2, slot: 'any' });
  const mk = () => mkPlan(ends([day(3, 'South coast', [drive, act('surf', 3)], { spare: 4 })]), ['surf']);
  const its = [x, item('surf', { area: 'South coast', hours: 3 })];
  it('is deterministic', () => {
    const s = rate('Lazza', { beach: 'must' });
    expect(sideQuests(mk(), 'Lazza', s, its)).toEqual(sideQuests(mk(), 'Lazza', s, [...its].reverse()));
  });
  it('never changes the plan, the items or the ratings', () => {
    const p = deepFreeze(mk()); const i = deepFreeze(structuredClone(its)); const s = deepFreeze(rate('Lazza', { beach: 'must' }));
    const before = JSON.stringify([p, i, s]);
    expect(sideQuests(p, 'Lazza', s, i).length).toBeGreaterThan(0);
    expect(JSON.stringify([p, i, s])).toBe(before);
  });
});
