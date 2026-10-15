import { AREAS, AREA_HUB, PACE_HOURS } from '../types';
import type { Area, Day, DayEntry, Hub, Item, Plan, PlanInput, Slot } from '../types';
import { shortest } from './paths';

// "any" fills daytime; ordering it last put e.g. a temple visit after late-night kottu.
const SLOT_ORDER: Record<Slot, number> = { sunrise: 0, morning: 1, any: 2, afternoon: 3, sunset: 4, evening: 5, late: 6 };
const RAIN_AREAS: Area[] = ['Hill country', 'Ella'];
// Activities after which nobody drives that day. Afternoon ones (park safaris, a sunset beach) run until
// the parks close at 18:00 (research/google_listings.md: Kaudulla and Hurulu "Closes 6 PM").
const DUSK_SLOTS: Slot[] = ['afternoon', 'sunset', 'evening', 'late'];
const CHECKIN = 3;
const TRAIN = 'train';
const EPS = 1e-9;
const place = (h: Hub) => (h === 'AIR' ? 'the airport' : h);

type Dist = (a: Hub, b: Hub) => number;

// Everything about a candidate except its hour budget: shared by plans that differ only in days or pace.
interface Tmpl {
  set: Area[]; order: Area[]; route: Hub[]; routeKey: string; wsHub: Hub; train: boolean;
  travel: number; ub: number; pool: Item[]; forced: Item[]; forcedW: number; geo: Geo; grp: Grp;
}
// Orders of one area set (same train choice and Wild south hub) share their items, so they share
// the knapsack options and the knapsack table; they differ only in travel and day packing.
interface Grp { prep?: Prep; knap?: Knapsack; top?: number; travel: number; key: string }
interface Cand extends Tmpl { cap: number; tmpl: Tmpl }

// dark: an afternoon, sunset, evening or late activity has happened, so no more driving today.
interface WorkDay {
  area: Area | null; entries: DayEntry[]; used: number; cap: number; closed: boolean; dark?: boolean;
  slots?: SlotUse; // activities so far per slot, for the fixed-time rule
  eve?: number; // hours of evening and late activities, which sit outside the daytime cap
}

// Evening and late activities happen after the day's sightseeing (Brittany, 2026-10-15): they get
// their own budget each night instead of using the daytime hours. Sunset stays a daytime slot.
const EVE_SLOTS: Slot[] = ['evening', 'late'];
const EVE_HOURS = 3;
const isEve = (i: Item) => EVE_SLOTS.includes(i.slot);
/** Knapsack weight in quarter hours: evening items cost no daytime hours. */
const dayW = (i: Item, wsHub: Hub, d: Dist) => (isEve(i) ? 0 : q(weightOf(i, wsHub, d)));

// Fixed-time slots hold one activity per day. Morning and afternoon hold a second short one only
// if both fit that part of the day, in on-site hours (Brittany, 2026-10-15). 'any' is unconstrained.
const ONE_PER_DAY: Slot[] = ['sunrise', 'sunset', 'evening', 'late'];
const WINDOW: Partial<Record<Slot, number>> = { morning: 4.5, afternoon: 5 };
type SlotUse = Partial<Record<Slot, { n: number; site: number }>>;
const slotFull = (use: SlotUse, slot: Slot, site: number) => {
  const u = use[slot];
  if (!u) return false;
  if (ONE_PER_DAY.includes(slot)) return true;
  const win = WINDOW[slot];
  return win !== undefined && (u.n >= 2 || u.site + site > win + EPS);
};
const useSlot = (use: SlotUse, slot: Slot, site: number) => {
  const u = (use[slot] ??= { n: 0, site: 0 });
  u.n++; u.site += site;
};

interface Ctx {
  input: PlanInput; H: number; budget: number; d: Dist; score: (id: string) => number; raw: (id: string) => number;
  // Caches are keyed by content, not identity: a worker hands over fresh copies on every call.
  contentKey: string; itemsTag: object;
  idx: Map<string, number>; // position in input.items by id, which every per-item flag array uses
  musts: Set<string>; forceIn: Set<string>; forceOut: Set<string>;
}

const isTrainPair = (a: Area | null, b: Area) => (a === 'Hill country' && b === 'Ella') || (a === 'Ella' && b === 'Hill country');

function hubOf(area: Area, wsHub: Hub): Hub {
  return area === 'Wild south' ? wsHub : AREA_HUB[area];
}

/** Item weight in hours: its own time plus a round trip from the candidate's hub for that area (amendment B.1). */
function weightOf(item: Item, wsHub: Hub, d: Dist): number {
  const base = hubOf(item.area, wsHub);
  const own = item.hub ?? AREA_HUB[item.area];
  return item.hours + item.sideTrip + (own === base ? 0 : 2 * d(base, own));
}

function routeFor(order: Area[], wsHub: Hub, train: boolean, d: Dist) {
  const route: Hub[] = ['AIR', ...order.map(a => hubOf(a, wsHub)), 'AIR'];
  let travel = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = order[i - 1] ?? null, b = order[i];
    if (train && b && isTrainPair(a, b)) continue;
    travel += d(route[i], route[i + 1]);
  }
  return { route, travel, routeKey: route.join('>') };
}

// Row buffers shared by every Knapsack: one table per evaluated candidate. Only one instance is live at a time.
let kVal = new Float64Array(0), kCnt = new Int32Array(0), kTake = new Uint8Array(0);
let kOwner: object | null = null; // the Knapsack whose table the buffers hold

/**
 * 0/1 knapsack in quarter hours; ties prefer fewer items. The full table is kept, so the optimal
 * set for every capacity up to `cap` can be read back without solving again.
 */
class Knapsack {
  private W: number;
  constructor(private opts: { id: string; w: number; v: number }[], cap: number) {
    kOwner = this;
    const W = (this.W = Math.max(0, cap) + 1), n = opts.length, size = (n + 1) * W;
    if (kVal.length < size) { kVal = new Float64Array(size); kCnt = new Int32Array(size); kTake = new Uint8Array(size); }
    const val = kVal, cnt = kCnt, take = kTake;
    val.fill(0, 0, W); cnt.fill(0, 0, W);
    for (let j = 0; j < n; j++) {
      const prev = j * W, next = prev + W, { w, v } = opts[j];
      val.copyWithin(next, prev, next); cnt.copyWithin(next, prev, next); take.fill(0, prev, next);
      for (let c = W - 1; c >= w; c--) {
        const pv = val[prev + c], nv = val[prev + c - w] + v, nc = cnt[prev + c - w] + 1;
        if (nv > pv + EPS || (Math.abs(nv - pv) <= EPS && nc < cnt[prev + c])) { val[next + c] = nv; cnt[next + c] = nc; take[prev + c] = 1; }
      }
    }
  }
  /** Best total value within capacity c. */
  value(c: number): number { return kVal[this.opts.length * this.W + c]; }
  /** Option indices of the optimal set within capacity c. */
  pick(c: number): number[] {
    const out: number[] = [];
    for (let j = this.opts.length - 1; j >= 0; j--) if (kTake[j * this.W + c]) { out.push(j); c -= this.opts[j].w; }
    return out;
  }
}

const q = (h: number) => Math.ceil(h * 4 - EPS);

const tmplCache = new Map<string, Tmpl[]>();
const TMPL_MAX = 16;

function candidates(ctx: Ctx, forceIn: Set<string>): Cand[] {
  const key = `${ctx.contentKey}#${[...forceIn].sort().join(',')}`;
  let all = tmplCache.get(key);
  if (!all) {
    all = templates(ctx, forceIn);
    if (tmplCache.size >= TMPL_MAX) tmplCache.delete(tmplCache.keys().next().value!);
    tmplCache.set(key, all);
  }
  const { budget } = ctx;
  const out: Cand[] = [];
  for (const t of all) {
    if (t.travel > budget + EPS) continue;
    const cap = Math.floor((budget - t.travel) * 4 + EPS);
    if (t.forcedW > cap) continue;
    out.push({ ...t, cap, tmpl: t });
  }
  return out;
}

/** Every area set, train choice and Wild south hub with its cheapest order, best bound first. */
function templates(ctx: Ctx, forceIn: Set<string>): Tmpl[] {
  const { input, d, score, forceOut } = ctx;
  const pool = input.items
    .filter(i => forceIn.has(i.id) || (score(i.id) > 0 && !forceOut.has(i.id)))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const eligible = AREAS.filter(a => pool.some(i => i.area === a));
  const mandatory = new Set(pool.filter(i => forceIn.has(i.id)).map(i => i.area));
  if (forceIn.has(TRAIN)) { mandatory.add('Hill country'); mandatory.add('Ella'); }
  const trainItem = pool.find(i => i.id === TRAIN);
  const trainOpts = forceIn.has(TRAIN) ? [true] : trainItem ? [false, true] : [false];
  const wsHubs = [...new Set(pool.filter(i => i.area === 'Wild south').map(i => i.hub ?? AREA_HUB[i.area]))].sort();
  const out: Tmpl[] = [];
  const grps = new Map<string, Tmpl>();
  for (const g of geometry(d, eligible, trainOpts, wsHubs, [...mandatory])) {
    const { has, wsHub, train } = g;
    const key = `${g.set.join('|')}#${train}#${wsHub}`;
    const same = grps.get(key);
    if (same) {
      same.grp.travel = Math.min(same.grp.travel, g.travel);
      out.push({ ...same, order: g.order, route: g.route, routeKey: g.routeKey, travel: g.travel, geo: g });
      continue;
    }
    const inSet = pool.filter(i => has.has(i.area) && (train || i.id !== TRAIN));
    const forced = inSet.filter(i => forceIn.has(i.id) || (train && i.id === TRAIN));
    const forcedW = forced.reduce((s, i) => s + dayW(i, wsHub, d), 0);
    const ub = inSet.reduce((s, i) => s + Math.max(0, score(i.id)), 0);
    const t: Tmpl = { set: g.set, order: g.order, route: g.route, routeKey: g.routeKey, wsHub, train, travel: g.travel, ub, pool: inSet, forced, forcedW, geo: g, grp: { travel: g.travel, key } };
    grps.set(key, t);
    out.push(t);
  }
  // Best bound first; a set's orders stay together, cheapest first, so they reuse one knapsack table.
  // Travel compares within EPS: a route and its reverse sum the same legs in another order.
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const near = (x: number, y: number) => (Math.abs(x - y) <= EPS ? 0 : x - y);
  return out.sort((a, b) => b.ub - a.ub || near(a.grp.travel, b.grp.travel) || cmp(a.grp.key, b.grp.key) || near(a.travel, b.travel) || cmp(a.routeKey, b.routeKey));
}

interface Geo {
  set: Area[]; has: Set<Area>; order: Area[]; route: Hub[]; routeKey: string; wsHub: Hub; train: boolean; travel: number;
  steps?: { tag: object; steps: Steps };
}
const geoCache = new WeakMap<Dist, Map<string, Geo[]>>();

/** Area sets with their cheapest order and travel: depends only on the legs, not on any scores. */
function geometry(d: Dist, eligible: Area[], trainOpts: boolean[], wsHubs: Hub[], must: Area[]): Geo[] {
  const key = [eligible, trainOpts, wsHubs, [...must].sort()].map(x => x.join(',')).join('#');
  let byKey = geoCache.get(d);
  if (!byKey) geoCache.set(d, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const out: Geo[] = [];
  const seen = new Set<string>();
  for (let mask = 0; mask < 1 << eligible.length; mask++) {
    const base = new Set(eligible.filter((_, i) => mask & (1 << i)));
    for (const train of trainOpts) {
      const set = AREAS.filter(a => base.has(a) || (train && RAIN_AREAS.includes(a)));
      const has = new Set(set);
      if (must.some(a => !has.has(a))) continue;
      const k = `${set.join('|')}#${train}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const variants: Hub[] = has.has('Wild south') && wsHubs.length ? wsHubs : [AREA_HUB['Wild south']];
      for (const wsHub of variants) {
        // Every direction and Colombo position is its own candidate: besides travel they decide the
        // half arrival day, what shares the departure day and where sunrise breaks fall.
        const core = set.filter(a => a !== 'Colombo');
        const orders = [core, [...core].reverse()].flatMap(o => (has.has('Colombo') ? [['Colombo' as Area, ...o], [...o, 'Colombo' as Area]] : [o]));
        const keys = new Set<string>();
        for (const order of orders) {
          const r = routeFor(order, wsHub, train, d);
          if (keys.has(r.routeKey)) continue;
          keys.add(r.routeKey);
          out.push({ set, has, order, route: r.route, routeKey: r.routeKey, wsHub, train, travel: r.travel });
        }
      }
    }
  }
  if (byKey.size >= TMPL_MAX) byKey.delete(byKey.keys().next().value!);
  byKey.set(key, out);
  return out;
}

type Opt = { id: string; w: number; v: number; k: number; eve?: boolean }
/** Per-candidate data, in two parts so a candidate pruned by its bound skips the costly half. */
// core: the options the knapsack sees. A second fixed-time item for the same slot in the same area
// needs a day of its own, which hours cannot express, so only the best one per (area, slot) is in
// core; the others can still come back in evaluate()'s add-back pass when a day is free.
interface Prep { reserved: number; opts: Opt[]; core: Opt[]; forcedScore: number; byRatio: Opt[]; forced: Uint8Array; order?: Opt[] }
// Schedule entries packed for the fit test, which runs many times per candidate.
const MOVE = 1, SUNRISE = 2, MORNING = 4, NIGHT = 8, EVE = 16;
// pos: each item's step; block: the arrival step of each step's area.
interface Steps { hours: Float64Array; site: Float64Array; slot: Int8Array; at: Int32Array; flags: Uint8Array; fd: number; pos: Int32Array; block: Int32Array }
const SLOTS = Object.keys(SLOT_ORDER) as Slot[];
// slotFull() by slot index, for the packed fit test; slots with no window (any) are never full.
const SLOT_ONE = SLOTS.map(sl => ONE_PER_DAY.includes(sl));
const SLOT_WIN = SLOTS.map(sl => WINDOW[sl] ?? Infinity);
// Scratch counters for minDays, which runs thousands of times per plan and is not re-entrant.
const slotN = new Int32Array(SLOTS.length), slotSite = new Float64Array(SLOTS.length);
// The last recorded minDays pass: for each step, where its day began, that day's number, whether a
// day began at it and which step pulled it forward (-1 if none); and the pass's result. An add-back
// trial differs from that pass at one step, so it replays from the day its area began in and stops
// once a day begins with a drive where one did in the recorded pass.
let sDay = new Int32Array(0), sN = new Int32Array(0), sStart = new Uint8Array(0), sPull = new Int32Array(0), sFinal = 0;
let doneBuf = new Uint8Array(0);
function snapRoom(len: number) {
  if (sN.length < len) { sDay = new Int32Array(len); sN = new Int32Array(len); sStart = new Uint8Array(len); sPull = new Int32Array(len); doneBuf = new Uint8Array(len); }
}
// Slots that can fill the rest of a day before it closes: they need no particular start time.
const FILL_SLOTS: Slot[] = ['any', 'afternoon', 'sunset'];
const SLOT_FILL = SLOTS.map(sl => FILL_SLOTS.includes(sl));
// Scratch flags for the capacity search, whose picks are thrown away.
let chooseBuf = new Uint8Array(0);

function prep(ctx: Ctx, c: Cand): Prep {
  return (c.tmpl.grp.prep ??= buildPrep(ctx, c));
}

function buildPrep(ctx: Ctx, c: Cand): Prep {
  const { d, idx } = ctx;
  const forced = new Uint8Array(ctx.input.items.length);
  for (const i of c.forced) forced[idx.get(i.id)!] = 1;
  let reserved = 0, forcedScore = 0;
  const opts: Opt[] = [];
  for (const i of c.pool) {
    const v = ctx.score(i.id), k = idx.get(i.id)!;
    if (forced[k]) { reserved += dayW(i, c.wsHub, d); forcedScore += v; } else if (v > 0) opts.push({ id: i.id, w: dayW(i, c.wsHub, d), v, k, eve: isEve(i) });
  }
  const byRatio = opts.filter(o => o.w > 0).sort((a, b) => b.v / b.w - a.v / a.w);
  const taken = new Set(c.forced.filter(i => ONE_PER_DAY.includes(i.slot)).map(i => `${i.area}|${i.slot}`));
  const slotKey = (o: Opt) => { const i = ctx.input.items[o.k]; return ONE_PER_DAY.includes(i.slot) ? `${i.area}|${i.slot}` : null; };
  const extra = new Set<string>();
  for (const o of [...opts].sort((a, b) => b.v / Math.max(1, b.w) - a.v / Math.max(1, a.w) || (a.id < b.id ? -1 : 1))) {
    const key = slotKey(o);
    if (key === null) continue;
    if (taken.has(key)) extra.add(o.id); else taken.add(key);
  }
  return { reserved, opts, core: opts.filter(o => !extra.has(o.id) && !o.eve), forcedScore, byRatio, forced };
}

/**
 * The entries schedule() would put if every item were chosen, in its order; `at` < 0 marks an
 * arrival. Depends only on the route and the items, so it is shared by every plan on that route.
 */
function layout(ctx: Ctx, c: Cand): Steps {
  const { d, idx, itemsTag, input: { items } } = ctx;
  if (c.geo.steps?.tag === itemsTag) return c.geo.steps.steps;
  const hours: number[] = [], site: number[] = [], slot: number[] = [], at: number[] = [], flags: number[] = [];
  const slotFlags = (slot?: Slot) => (slot === 'sunrise' ? SUNRISE : slot === 'morning' ? MORNING : 0);
  // slot is -1 for arrivals: only activities count towards the fixed-time rule.
  const push = (h: number, k: number, f: number, it?: Item) => { hours.push(h); at.push(k); flags.push(f); site.push(it?.hours ?? 0); slot.push(it ? SLOTS.indexOf(it.slot) : -1); };
  const train = items.find(i => i.id === TRAIN);
  let prevHub: Hub = 'AIR', prevArea: Area | null = null;
  for (const area of c.order) {
    const hub = hubOf(area, c.wsHub);
    // A train candidate always carries the train item (it is forced), so this matches schedule().
    if (c.train && train && isTrainPair(prevArea, area)) push(weightOf(train, c.wsHub, d), -1, MOVE | slotFlags(train.slot));
    else push(d(prevHub, hub), -1, MOVE);
    items
      .filter(i => i.area === area && !(c.train && i.id === TRAIN))
      .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || (a.id < b.id ? -1 : 1))
      .forEach(i => push(weightOf(i, c.wsHub, d), idx.get(i.id)!, slotFlags(i.slot) | (DUSK_SLOTS.includes(i.slot) ? NIGHT : 0) | (isEve(i) ? EVE : 0), i));
    prevHub = hub; prevArea = area;
  }
  const pos = new Int32Array(items.length).fill(-1);
  at.forEach((k, s) => { if (k >= 0) pos[k] = s; });
  const block = new Int32Array(at.length);
  flags.forEach((f, s) => { block[s] = f & MOVE ? s : block[s - 1]; });
  const steps: Steps = { hours: Float64Array.from(hours), site: Float64Array.from(site), slot: Int8Array.from(slot), at: Int32Array.from(at), flags: Uint8Array.from(flags), fd: d(c.route[c.route.length - 2], 'AIR'), pos, block };
  c.geo.steps = { tag: itemsTag, steps };
  return steps;
}

/** Marks the chosen items: every forced one plus the knapsack's picks at capacity x. */
function choose(p: Prep, knap: Knapsack, x: number, scratch = false): Uint8Array {
  let on: Uint8Array;
  if (scratch) {
    if (chooseBuf.length !== p.forced.length) chooseBuf = new Uint8Array(p.forced.length);
    (on = chooseBuf).set(p.forced);
  } else on = Uint8Array.from(p.forced);
  for (const j of knap.pick(x)) on[p.core[j].k] = 1;
  return on;
}

/** Packs the content days (everything before the departure tail). */
function schedule(ctx: Ctx, c: Cand, chosen: Item[]): WorkDay[] {
  const { H, d } = ctx;
  let here: Area | null = null;
  let cur: WorkDay = { area: null, entries: [], used: 0, cap: H / 2, closed: false };
  const days: WorkDay[] = [cur];
  const newDay = () => { cur = { area: here, entries: [], used: 0, cap: H, closed: false }; days.push(cur); };
  // True when e cannot join the current day.
  const opens = (e: DayEntry, slot?: Slot) => {
    if (cur.entries.length === 0) return false;
    if (e.kind === 'activity' && !!slot && EVE_SLOTS.includes(slot)) return slotFull(cur.slots ?? {}, slot, e.onSite!) || ((cur.eve ?? 0) > 0 && (cur.eve ?? 0) + e.hours > EVE_HOURS + EPS);
    return e.hours > H + EPS || cur.closed
      || (!!cur.dark && (e.kind === 'drive' || e.kind === 'train')) // no night drives on hill roads
      || slot === 'sunrise' // one sunrise per day, never after another entry (B.5)
      || (slot === 'morning' && cur.used > 3 + EPS)
      || (e.kind === 'activity' && !!slot && slotFull(cur.slots ?? {}, slot, e.onSite!)) // one per fixed-time slot
      || e.hours > cur.cap - cur.used + EPS;
  };
  const put = (e: DayEntry, slot?: Slot) => {
    const eve = e.kind === 'activity' && !!slot && EVE_SLOTS.includes(slot);
    if (opens(e, slot)) newDay();
    cur.entries.push(e);
    if (eve) cur.eve = (cur.eve ?? 0) + e.hours; else cur.used += e.hours;
    if (e.kind === 'activity' && slot) useSlot((cur.slots ??= {}), slot, e.onSite!);
    if (!eve && e.hours > H + EPS) cur.closed = true; // a long entry owns its whole day (B.3)
    if (e.kind === 'activity' && slot && DUSK_SLOTS.includes(slot)) cur.dark = true;
  };
  const w = (i: Item) => weightOf(i, c.wsHub, d);
  const train = chosen.find(i => i.id === TRAIN);
  let prevHub: Hub = 'AIR', prevArea: Area | null = null;
  for (const area of c.order) {
    const hub = hubOf(area, c.wsHub);
    if (c.train && train && isTrainPair(prevArea, area)) {
      put({ kind: 'train', label: train.name, hours: w(train), itemId: TRAIN, from: prevHub, to: hub }, train.slot);
    } else {
      put({ kind: 'drive', label: `Drive from ${place(prevHub)} to ${place(hub)}`, hours: d(prevHub, hub), from: prevHub, to: hub });
    }
    here = area; cur.area = area;
    const acts = chosen
      .filter(i => i.area === area && !(c.train && i.id === TRAIN))
      .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || (a.id < b.id ? -1 : 1));
    const entry = (i: Item): DayEntry => { const hours = w(i); return { kind: 'activity', label: i.name, hours, itemId: i.id, onSite: i.hours, roundTrip: hours - i.hours }; };
    const pulled = new Set<number>();
    acts.forEach((i, at) => {
      if (pulled.has(at)) return;
      const e = entry(i);
      // Before a daytime activity closes the day, later ones of this area that fit fill it.
      if (!isEve(i) && !cur.closed && opens(e, i.slot)) {
        for (let j = at + 1; j < acts.length && !cur.dark; j++) {
          const x = acts[j], ex = entry(x);
          if (pulled.has(j) || isEve(x) || !FILL_SLOTS.includes(x.slot) || opens(ex, x.slot)) continue;
          put(ex, x.slot); pulled.add(j);
        }
      }
      put(e, i.slot);
    });
    prevHub = hub; prevArea = area;
  }
  return days;
}

/** Adds f free days and the departure tail (B.4, B.7). */
function assemble(ctx: Ctx, c: Cand, content: WorkDay[], f: number, merge: boolean): WorkDay[] {
  const { H, d } = ctx;
  const days = content.map(x => ({ ...x, entries: [...x.entries] }));
  const lastHub = c.route[c.route.length - 2];
  const fd = d(lastHub, 'AIR');
  const here = c.order.length ? c.order[c.order.length - 1] : null;
  const free = (area: Area | null): WorkDay => ({ area, entries: [{ kind: 'free', label: 'Free day', hours: 0 }], used: 0, cap: H, closed: false });
  let left = f;
  const rainArea = c.order.includes('Ella') ? 'Ella' : c.order.includes('Hill country') ? 'Hill country' : null;
  if (left > 0 && rainArea) {
    let at = -1;
    days.forEach((x, i) => { if (x.area === rainArea) at = i; });
    if (at >= 0) { days.splice(at + 1, 0, free(rainArea)); left--; }
  }
  for (; left > 0; left--) days.push(free(here));
  const driveE: DayEntry = { kind: 'drive', label: `Drive from ${place(lastHub)} to the airport`, hours: fd, from: lastHub, to: 'AIR' };
  const checkin: DayEntry = { kind: 'free', label: 'Check in and fly', hours: CHECKIN };
  const capN = H / 2 - fd - CHECKIN;
  const last = days[days.length - 1];
  const finalDay = (entries: DayEntry[]): WorkDay => ({ area: here, entries, used: entries.reduce((s, e) => s + e.hours, 0), cap: H / 2, closed: false });
  if (fd <= EPS) {
    days.push(finalDay([checkin]));
  } else if (capN >= -EPS) {
    if (merge && days.length >= 2 && !last.dark && last.used <= capN + EPS) {
      last.entries.push(driveE, checkin); last.used += fd + CHECKIN; last.cap = H / 2;
    } else days.push(finalDay([driveE, checkin]));
  } else {
    const towards = { ...driveE, label: 'Drive towards the airport' };
    if (!last.closed && !last.dark && days.length >= 2 && last.cap - last.used >= fd - EPS) { last.entries.push(towards); last.used += fd; }
    else days.push({ area: here, entries: [towards], used: fd, cap: H, closed: false });
    days.push(finalDay([checkin]));
  }
  return days;
}

function fitTo(ctx: Ctx, c: Cand, content: WorkDay[], N: number): WorkDay[] | null {
  const min = assemble(ctx, c, content, 0, true);
  if (min.length > N) return null;
  if (min.length === N) return min;
  for (let f = Math.max(0, N - content.length - 1); f >= 0; f--) {
    const ds = assemble(ctx, c, content, f, false);
    if (ds.length <= N) return ds;
  }
  return min;
}

// days is a thunk: only the winning candidate's days are ever built. on: the chosen-item flags.
interface Eval { c: Cand; chosen: Item[]; days: () => WorkDay[]; score: number; overflow: boolean; on?: Uint8Array }

// Margin over float noise in the bounds below, so pruning can only skip a candidate that strictly loses.
const SLACK = 1e-6;

/** True when no plan for c scoring at most `bound` can beat `bar` under `better`. */
function beaten(c: Cand, bound: number, bar: Eval): boolean {
  if (bound + SLACK < bar.score - EPS) return true;
  if (bound + SLACK > bar.score + EPS) return false;
  return c.travel > bar.c.travel + EPS || (Math.abs(c.travel - bar.c.travel) <= EPS && c.routeKey >= bar.c.routeKey);
}

/** Fractional-knapsack upper bound on the candidate's score. */
function fractionalBound(c: Cand, p: Prep): number {
  let total = p.forcedScore, room = c.cap - p.reserved;
  for (const o of p.opts) if (o.w <= 0) total += o.v;
  if (room <= 0) return total;
  for (const o of p.byRatio) {
    if (o.w <= room) { total += o.v; room -= o.w; } else { total += (o.v * room) / o.w; break; }
  }
  return total;
}

/**
 * Day count of assemble(ctx, c, schedule(ctx, c, chosen), 0, true) without building the days.
 * Mirrors put() and the departure tail step for step; the snapshot test pins the two together.
 * Stops early once more than `stop` days are used, when only "does it fit" matters.
 * With `from` >= 0, `on` must match the last recorded pass at every step but `from`: the scan starts
 * at the day that held the arrival in `from`'s area there. `record` records this pass (from there on).
 */
function minDays(ctx: Ctx, steps: Steps, on: Uint8Array, stop = Infinity, from = -1, record = false): number {
  const { H } = ctx;
  const { hours: hs, at, flags, fd, slot: sl, site, block } = steps;
  const len = hs.length;
  snapRoom(len);
  let n = 1, count = 0, used = 0, eve = 0, cap = H / 2, closed = false, dark = false, day = 0, b = -1;
  const nUse = slotN, siteUse = slotSite, done = doneBuf;
  nUse.fill(0); siteUse.fill(0);
  // A day other than the first starts fresh: its first step is placed without a check.
  if (from >= 0) { b = block[from]; if (sDay[b] > 0) { day = sDay[b]; n = sN[b]; cap = H; } }
  // Steps pulled forward into a day before `day` (by the step that opened it, at the latest) stay done.
  for (let t = day; t < len; t++) {
    const kept = from >= 0 && sPull[t] >= 0 && sPull[t] <= day;
    done[t] = kept ? 1 : 0;
    if (record && !kept) sPull[t] = -1;
  }
  for (let s = day; s < len; s++) {
    if (record) { sDay[s] = day; sN[s] = n; sStart[s] = 0; }
    if (done[s] || (at[s] >= 0 && !on[at[s]])) continue;
    const hours = hs[s], f = flags[s], k = sl[s], night = (f & EVE) !== 0;
    const slotTaken = k >= 0 && nUse[k] > 0 && (SLOT_ONE[k] || (SLOT_WIN[k] < Infinity && (nUse[k] >= 2 || siteUse[k] + site[s] > SLOT_WIN[k] + EPS)));
    if (count > 0) {
      const fresh = night ? slotTaken || (eve > 0 && eve + hours > EVE_HOURS + EPS) : hours > H + EPS || closed || (dark && (f & MOVE) !== 0) || (f & SUNRISE) !== 0 || ((f & MORNING) !== 0 && used > 3 + EPS) || slotTaken || hours > cap - used + EPS;
      if (fresh) {
        // Before a daytime activity closes the day, later ones of the same area that fit fill it.
        if (!night && (f & MOVE) === 0 && !closed) {
          for (let t = s + 1; t < len && (flags[t] & MOVE) === 0 && !dark; t++) {
            const kt = sl[t];
            if (done[t] || !on[at[t]] || (flags[t] & EVE) !== 0 || !SLOT_FILL[kt] || hs[t] > H + EPS || hs[t] > cap - used + EPS) continue;
            if (nUse[kt] > 0 && (SLOT_ONE[kt] || (SLOT_WIN[kt] < Infinity && (nUse[kt] >= 2 || siteUse[kt] + site[t] > SLOT_WIN[kt] + EPS)))) continue;
            done[t] = 1; if (record) sPull[t] = s;
            count++; used += hs[t]; nUse[kt]++; siteUse[kt] += site[t];
            if (flags[t] & NIGHT) dark = true;
          }
        }
        ++n;
        // A day that begins with the drive into a later area is in step with the recorded pass.
        if (from >= 0 && !record && (f & MOVE) !== 0 && s > b && sStart[s]) return sFinal + n - sN[s] - 1;
        if (n > stop) return n;
        count = 0; used = 0; eve = 0; cap = H; closed = false; dark = false; nUse.fill(0); siteUse.fill(0); day = s;
        if (record) sStart[s] = 1;
      }
    }
    count++;
    if (night) eve += hours; else used += hours;
    if (k >= 0) { nUse[k]++; siteUse[k] += site[s]; }
    if (!night && hours > H + EPS) closed = true;
    if (f & NIGHT) dark = true;
  }
  const capN = H / 2 - fd - CHECKIN;
  const total = fd <= EPS ? n + 1
    : capN >= -EPS ? (n >= 2 && !dark && used <= capN + EPS ? n : n + 1)
    : !closed && !dark && n >= 2 && cap - used >= fd - EPS ? n + 1 : n + 2;
  if (record) sFinal = total;
  return total;
}

/**
 * Overflow (B.6): when the best set for the hours does not fit the days, cut the knapsack's
 * capacity by the overflow (overflow days x H) in one batch and re-pick, instead of dropping one
 * item per round; once a capacity fits, a binary search towards the last failing one takes back as
 * much as still fits. Forced items are never dropped. Returns null once `bar` cannot be beaten.
 */
function evaluate(ctx: Ctx, c: Cand, p: Prep, bar: Eval | null): Eval | null {
  const N = ctx.input.days;
  const { pool } = c;
  const top = Math.max(0, c.cap - p.reserved);
  // The table answers every capacity up to the one it was built for, so a set's later (dearer)
  // orders reuse it while no other set has overwritten the shared buffers.
  const g = c.tmpl.grp;
  if (!g.knap || kOwner !== g.knap || g.top! < top) { g.knap = new Knapsack(p.core, top); g.top = top; }
  const knap = g.knap;
  const steps = layout(ctx, c);
  const over = (x: number) => minDays(ctx, steps, choose(p, knap, x, true)) - N;
  let x = top, hi = -1;
  for (;;) {
    const o = over(x);
    if (o <= 0) break;
    if (x === 0) {
      const chosen = pool.filter(i => p.forced[ctx.idx.get(i.id)!]);
      const score = chosen.reduce((s, i) => s + ctx.score(i.id), 0);
      return { c, chosen, days: () => assemble(ctx, c, schedule(ctx, c, chosen), 0, true), score, overflow: true };
    }
    hi = x;
    x = Math.max(0, x - Math.ceil(o * ctx.H * 4));
  }
  if (hi > 0) {
    let lo = x;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (minDays(ctx, steps, choose(p, knap, mid, true), N) <= N) lo = mid; else hi = mid; }
    x = lo;
  }
  const on = choose(p, knap, x);
  // Use the days well: the cut capacity is coarse, so add back any left-out item that still fits
  // the hours and the days, Musts first, then best value per hour, until none does.
  let room = top;
  for (const o of p.opts) if (on[o.k]) room -= o.w;
  if (bar) {
    // Adding back can at most fill the spare hours at the best remaining value per hour.
    let bound = p.forcedScore + knap.value(x), left = room;
    for (const o of p.opts) if (o.eve && !on[o.k]) bound += o.v; // evenings cost no daytime hours
    for (const o of p.byRatio) {
      if (on[o.k]) continue;
      if (o.w <= left) { bound += o.v; left -= o.w; } else { bound += (o.v * left) / o.w; break; }
    }
    if (beaten(c, bound, bar)) return null;
  }
  // One pass is enough: the day count never falls when an item is added (each day is packed
  // greedily and any part of a day that fits still fits), so an item that failed cannot fit later.
  fill(ctx, steps, on, refillOrder(ctx, p), room);
  return result(ctx, c, on);
}

/** Musts first, then daytime items by value per hour, then evenings best first (to fill the nights). */
function refillOrder(ctx: Ctx, p: Prep): Opt[] {
  if (p.order) return p.order;
  const evenings = p.opts.filter(o => o.eve).sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  return (p.order = [...p.byRatio, ...evenings].sort((a, b) => Number(ctx.musts.has(b.id)) - Number(ctx.musts.has(a.id))));
}

/** Adds each item of `order` that still fits the hours and the days; returns the hours left. */
function fill(ctx: Ctx, steps: Steps, on: Uint8Array, order: Opt[], room: number, skip = -1): number {
  const N = ctx.input.days;
  snapRoom(steps.hours.length);
  minDays(ctx, steps, on, Infinity, -1, true);
  for (const o of order) {
    const k = o.k;
    if (on[k] || k === skip || o.w > room) continue;
    on[k] = 1;
    const s = steps.pos[k];
    if (minDays(ctx, steps, on, N, s) <= N) { room -= o.w; minDays(ctx, steps, on, Infinity, s, true); } else on[k] = 0;
  }
  return room;
}

function result(ctx: Ctx, c: Cand, on: Uint8Array): Eval {
  const chosen = c.pool.filter(i => on[ctx.idx.get(i.id)!]);
  const score = chosen.reduce((s, i) => s + ctx.score(i.id), 0);
  return { c, chosen, days: () => fitTo(ctx, c, schedule(ctx, c, chosen), ctx.input.days)!, score, overflow: false, on };
}

/**
 * Swap pass for the leading plans: take one chosen item out, refill (Musts first, daytime by value
 * per hour, then evenings), and keep the change when the total rises. Reaches sets the capacity
 * cut never does, often an evening for a daytime item. Too slow to run on every candidate.
 */
function polish(ctx: Ctx, e: Eval): Eval {
  const { c } = e, p = prep(ctx, c), steps = layout(ctx, c), order = refillOrder(ctx, p);
  const on = Uint8Array.from(e.on!);
  let room = Math.max(0, c.cap - p.reserved);
  for (const o of p.opts) if (on[o.k]) room -= o.w;
  const val = (a: Uint8Array) => p.opts.reduce((s, o) => s + (a[o.k] ? o.v : 0), 0);
  for (let improved = true; improved; ) {
    improved = false;
    for (const r of p.opts) {
      if (!on[r.k]) continue;
      const trial = Uint8Array.from(on); trial[r.k] = 0;
      const rm = fill(ctx, steps, trial, order, room + r.w, r.k);
      if (val(trial) > val(on) + EPS) { on.set(trial); room = rm; improved = true; }
    }
  }
  return result(ctx, c, on);
}

const better = (a: Eval, b: Eval) => {
  if (a.overflow !== b.overflow) return !a.overflow;
  if (Math.abs(a.score - b.score) > EPS) return a.score > b.score;
  if (Math.abs(a.c.travel - b.c.travel) > EPS) return a.c.travel < b.c.travel;
  return a.c.routeKey < b.c.routeKey;
};

const POLISH = 3;
// A set's other orders (direction, Colombo first or last) are tried best-scoring sets first, for up
// to half as many evaluations as the sets' cheapest orders took: a compute budget. Measured on 726
// test plans it keeps 9 in 10 of the extra Musts that trying every order finds, at the old speed.
const ORDER_BUDGET = 0.5;

function search(ctx: Ctx, forceIn: Set<string>): Eval | null {
  let best: Eval | null = null;
  const leaders: Eval[] = [];
  const firsts: Cand[] = [], rest = new Map<Grp, Cand[]>();
  for (const c of candidates(ctx, forceIn)) {
    const r = rest.get(c.tmpl.grp);
    if (r) r.push(c); else { rest.set(c.tmpl.grp, []); firsts.push(c); }
  }
  const tried = new Map<Grp, number>();
  const visit = (c: Cand): boolean => {
    const bar = best && !best.overflow ? best : null;
    if (bar) {
      // Branch and bound: c's value can never exceed its upper bound (B.10).
      if (c.ub < bar.score - EPS) return false;
      if (Math.abs(c.ub - bar.score) <= EPS && (c.travel > bar.c.travel + EPS || (Math.abs(c.travel - bar.c.travel) <= EPS && c.routeKey >= bar.c.routeKey))) return true;
    }
    const p = prep(ctx, c);
    if (bar && beaten(c, fractionalBound(c, p), bar)) return true;
    const e = evaluate(ctx, c, p, bar);
    if (e && !tried.has(c.tmpl.grp)) tried.set(c.tmpl.grp, e.overflow ? -Infinity : e.score);
    if (e && !e.overflow) leaders.push(e);
    if (e && (!best || better(e, best))) best = e;
    return true;
  };
  for (const c of firsts) if (!visit(c)) break;
  // A set whose cheapest order was pruned by its bound has dearer orders with lower bounds. While
  // nothing fits, every order is tried: an order that fits keeps fitting with more days, which
  // mustFitDays relies on.
  const found = best as Eval | null; // set inside visit(), which the compiler cannot see
  let budget = found && !found.overflow ? ORDER_BUDGET * tried.size : Infinity;
  for (const [g] of [...tried].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0) || (a[0].key < b[0].key ? -1 : 1))) {
    for (const c of rest.get(g)!) { if (budget-- <= 0) break; visit(c); }
    if (budget <= 0) break;
  }
  // Polish the highest-scoring few and keep the best; polishing never lowers a score.
  leaders.sort((a, b) => b.score - a.score);
  for (const e of leaders.slice(0, POLISH)) if (e.on) { const q2 = polish(ctx, e); if (best && better(q2, best)) best = q2; }
  return best;
}

function toPlan(ctx: Ctx, e: Eval, forceFailed: boolean): Plan {
  const { input } = ctx;
  const chosenIds = e.chosen.map(i => i.id).sort();
  const chosenSet = new Set(chosenIds);
  const days: Day[] = e.days().map((x, i) => {
    const spare = x.closed ? 0 : Math.max(0, Math.round((x.cap - x.used) * 100) / 100);
    return { n: i + 1, area: x.area, entries: x.entries, spare, rainSlack: spare >= 3 && x.area !== null && RAIN_AREAS.includes(x.area) };
  });
  const missingMusts = (input.mustIds ?? []).filter(id => !chosenSet.has(id));
  const out: Plan = {
    route: e.c.route, areas: e.c.order, days, chosen: chosenIds,
    dropped: input.items.filter(i => ctx.score(i.id) > 0 && !chosenSet.has(i.id)).map(i => i.id).sort(),
    travelHours: e.c.travel, fits: missingMusts.length === 0 && !e.overflow, missingMusts,
    score: e.chosen.reduce((s, i) => s + ctx.raw(i.id), 0),
  };
  if (e.overflow) out.overflow = true;
  if (forceFailed) out.forceFailed = true;
  return out;
}

// Above any total of non-Must scores in a plan (46 items at most 10.9 each, times five people).
const MUST_WEIGHT = 1e4;

const memo = new Map<string, Plan>();
const MEMO_MAX = 200;

const tags = new Map<string, object>();
/** One object per distinct catalogue, so caches can compare catalogues by identity. */
function tagOf(itemsKey: string): object {
  let t = tags.get(itemsKey);
  if (!t) {
    if (tags.size >= TMPL_MAX) tags.delete(tags.keys().next().value!);
    tags.set(itemsKey, (t = {}));
  }
  return t;
}

export function plan(input: PlanInput): Plan {
  const key = JSON.stringify({
    ...input, legs: undefined,
    items: input.items.map(i => [i.id, i.area, i.hours, i.sideTrip, i.slot, i.hub ?? '', i.name]),
    legsKey: input.legs.map(l => [l.a, l.b, l.hours]),
  });
  const hit = memo.get(key);
  if (hit) return structuredClone(hit);
  const H = PACE_HOURS[input.pace];
  // What the candidates and their item weights depend on: not days, pace or Musts.
  const itemsKey = JSON.stringify(input.items.map(i => [i.id, i.area, i.hours, i.sideTrip, i.slot, i.hub ?? '', i.name]));
  const musts = new Set(input.mustIds ?? []);
  const contentKey = JSON.stringify([itemsKey, input.scores, input.legs.map(l => [l.a, l.b, l.hours]), [...(input.forceOut ?? [])].sort(), [...musts].sort()]);
  const raw = (id: string) => input.scores[id] ?? 0;
  const ctx: Ctx = {
    input, H, budget: H * (input.days - 1) - CHECKIN, d: shortest(input.legs), contentKey, itemsTag: tagOf(itemsKey), idx: new Map(input.items.map((i, k) => [i.id, k])),
    // With Musts, every rated Must outweighs all other items together, so a personal plan never
    // trades a Must for Keens (Brittany, 2026-10-15). Plan.score still reports the plain total.
    score: musts.size ? id => raw(id) + (musts.has(id) && raw(id) > 0 ? MUST_WEIGHT : 0) : raw, raw,
    musts, forceIn: new Set(input.forceIn ?? []), forceOut: new Set(input.forceOut ?? []),
  };
  const known = new Set(input.items.map(i => i.id));
  const forceIn = new Set([...ctx.forceIn].filter(id => known.has(id)));
  let result: Plan;
  // A personal plan first looks for the best plan holding every Must. Forcing them in means a
  // longer trip can always keep a set that fitted a shorter one, so "every Must fits" never
  // flips back to false as days are added (mustFitDays relies on that).
  const allMusts = new Set([...forceIn, ...[...ctx.musts].filter(id => known.has(id) && !ctx.forceOut.has(id))]);
  const withMusts = ctx.musts.size ? search(ctx, allMusts) : null;
  const withForce = withMusts && !withMusts.overflow ? null : forceIn.size ? search(ctx, forceIn) : null;
  if (withMusts && !withMusts.overflow) result = toPlan(ctx, withMusts, false);
  else if (withForce && !withForce.overflow) result = toPlan(ctx, withForce, false);
  else {
    const free = search(ctx, new Set())!;
    // B.8: when no candidate can hold every forceIn item, ignore forceIn and say so.
    result = forceIn.size && withForce && free.overflow ? toPlan(ctx, withForce, false) : toPlan(ctx, free, forceIn.size > 0);
  }
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
  memo.set(key, result);
  return structuredClone(result);
}

/** Test-only switch: linearMustFit scans every length, the reference the binary search must match. */
export const planner = { linearMustFit: false };

/**
 * Smallest trip length (from days+1, or 5, up to 21) at which every Must fits (B.9). Binary search:
 * plan() searches with every Must forced in first, so once they fit, a longer trip fits them too.
 */
export function mustFitDays(input: Omit<PlanInput, 'days'> & { days?: number }): number | null {
  const start = input.days !== undefined ? input.days + 1 : 5;
  const fits = (n: number) => plan({ ...input, days: n }).fits;
  let lo = Math.max(5, start);
  if (planner.linearMustFit) {
    for (let n = lo; n <= 21; n++) if (fits(n)) return n;
    return null;
  }
  if (lo > 21) return null;
  if (fits(lo)) return lo;
  let hi = 21;
  if (!fits(hi)) return null;
  // Invariant: lo does not fit, hi fits.
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}
