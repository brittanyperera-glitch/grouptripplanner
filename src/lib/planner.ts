import { AREAS, AREA_HUB, PACE_HOURS } from '../types';
import type { Area, Day, DayEntry, Hub, Item, Plan, PlanInput, Slot } from '../types';
import { shortest } from './paths';

// "any" fills daytime; ordering it last put e.g. a temple visit after late-night kottu.
const SLOT_ORDER: Record<Slot, number> = { sunrise: 0, morning: 1, any: 2, afternoon: 3, sunset: 4, evening: 5, late: 6 };
const RAIN_AREAS: Area[] = ['Hill country', 'Ella'];
const NIGHT_SLOTS: Slot[] = ['sunset', 'evening', 'late'];
const CHECKIN = 3;
const TRAIN = 'train';
const EPS = 1e-9;
const place = (h: Hub) => (h === 'AIR' ? 'the airport' : h);

type Dist = (a: Hub, b: Hub) => number;

interface Cand {
  set: Area[]; order: Area[]; route: Hub[]; routeKey: string; wsHub: Hub; train: boolean;
  travel: number; cap: number; ub: number; pool: Item[]; forced: Item[];
}

// dark: a sunset, evening or late activity has happened, so no more driving today.
interface WorkDay { area: Area | null; entries: DayEntry[]; used: number; cap: number; closed: boolean; dark?: boolean }

interface Ctx {
  input: PlanInput; H: number; budget: number; d: Dist; score: (id: string) => number;
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

// Row buffers shared by every Knapsack: thousands of rounds run per plan. Only one instance is live at a time.
let kVal = new Float64Array(0), kCnt = new Int32Array(0), kTake = new Uint8Array(0);

/**
 * 0/1 knapsack in quarter hours; ties prefer fewer items. Returns chosen optional ids.
 * Keeps one DP row per item so a later call that only adds exclusions re-runs the rows from the
 * first newly excluded item onward. Each row equals the in-place single-row DP at that step, so the
 * choice is the same as solving from scratch over the non-excluded items in order.
 */
class Knapsack {
  private valid = 0;
  private seen = new Set<string>();
  constructor(private opts: { id: string; w: number; v: number }[], private cap: number) {
    const size = (opts.length + 1) * (cap + 1);
    if (cap > 0 && kVal.length < size) { kVal = new Float64Array(size); kCnt = new Int32Array(size); kTake = new Uint8Array(size); }
    if (cap > 0) { kVal.fill(0, 0, cap + 1); kCnt.fill(0, 0, cap + 1); }
  }
  solve(excluded: Set<string>): string[] {
    const { opts, cap } = this;
    const n = opts.length;
    if (cap <= 0) return [];
    let from = this.valid;
    for (const id of excluded) if (!this.seen.has(id)) {
      this.seen.add(id);
      const j = opts.findIndex(o => o.id === id);
      if (j >= 0 && j < from) from = j;
    }
    const W = cap + 1;
    for (let j = from; j < n; j++) {
      const prev = j * W, next = prev + W;
      kVal.copyWithin(next, prev, next); kCnt.copyWithin(next, prev, next); kTake.fill(0, prev, next);
      if (excluded.has(opts[j].id)) continue;
      const { w, v } = opts[j];
      for (let c = cap; c >= w; c--) {
        const pv = kVal[prev + c], nv = kVal[prev + c - w] + v, nc = kCnt[prev + c - w] + 1;
        if (nv > pv + EPS || (Math.abs(nv - pv) <= EPS && nc < kCnt[prev + c])) {
          kVal[next + c] = nv; kCnt[next + c] = nc; kTake[prev + c] = 1;
        }
      }
    }
    this.valid = n;
    const out: string[] = [];
    let c = cap;
    for (let j = n - 1; j >= 0; j--) if (kTake[j * W + c]) { out.push(opts[j].id); c -= opts[j].w; }
    return out;
  }
}

const q = (h: number) => Math.ceil(h * 4 - EPS);

function candidates(ctx: Ctx, forceIn: Set<string>): Cand[] {
  const { input, d, budget, score, forceOut } = ctx;
  const pool = input.items
    .filter(i => forceIn.has(i.id) || (score(i.id) > 0 && !forceOut.has(i.id)))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const eligible = AREAS.filter(a => pool.some(i => i.area === a));
  const mandatory = new Set(pool.filter(i => forceIn.has(i.id)).map(i => i.area));
  if (forceIn.has(TRAIN)) { mandatory.add('Hill country'); mandatory.add('Ella'); }
  const trainItem = pool.find(i => i.id === TRAIN);
  const trainOpts = forceIn.has(TRAIN) ? [true] : trainItem ? [false, true] : [false];
  const wsHubs = [...new Set(pool.filter(i => i.area === 'Wild south').map(i => i.hub ?? AREA_HUB[i.area]))].sort();
  const out: Cand[] = [];
  const seen = new Set<string>();
  for (let mask = 0; mask < 1 << eligible.length; mask++) {
    const base = eligible.filter((_, i) => mask & (1 << i));
    for (const train of trainOpts) {
      const set = AREAS.filter(a => base.includes(a) || (train && RAIN_AREAS.includes(a)));
      if ([...mandatory].some(a => !set.includes(a))) continue;
      const key = `${set.join('|')}#${train}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const variants: Hub[] = set.includes('Wild south') && wsHubs.length ? wsHubs : [AREA_HUB['Wild south']];
      for (const wsHub of variants) {
        // Direction and Colombo position change only travel, so keep the cheapest order (B.10).
        const core = set.filter(a => a !== 'Colombo');
        const orders = [core, [...core].reverse()].flatMap(o => (set.includes('Colombo') ? [['Colombo' as Area, ...o], [...o, 'Colombo' as Area]] : [o]));
        let best: (ReturnType<typeof routeFor> & { order: Area[] }) | null = null;
        for (const order of orders) {
          const r = routeFor(order, wsHub, train, d);
          if (!best || r.travel < best.travel - EPS || (Math.abs(r.travel - best.travel) <= EPS && r.routeKey < best.routeKey)) best = { ...r, order };
        }
        if (!best || best.travel > budget + EPS) continue;
        const inSet = pool.filter(i => set.includes(i.area) && (train || i.id !== TRAIN));
        const forced = inSet.filter(i => forceIn.has(i.id) || (train && i.id === TRAIN));
        const cap = Math.floor((budget - best.travel) * 4 + EPS);
        if (forced.reduce((s, i) => s + q(weightOf(i, wsHub, d)), 0) > cap) continue;
        const ub = inSet.reduce((s, i) => s + Math.max(0, score(i.id)), 0);
        out.push({ set, order: best.order, route: best.route, routeKey: best.routeKey, wsHub, train, travel: best.travel, cap, ub, pool: inSet, forced });
      }
    }
  }
  return out.sort((a, b) => b.ub - a.ub || a.travel - b.travel || (a.routeKey < b.routeKey ? -1 : a.routeKey > b.routeKey ? 1 : 0));
}

/** Per-candidate data, built once rather than on every overflow round. */
interface Step { hours: number; move: boolean; slot: Slot | undefined; night: boolean; at: number }
interface Prep {
  reserved: number; opts: { id: string; w: number; v: number }[]; forcedScore: number; knap: Knapsack;
  byRatio: { id: string; w: number; v: number }[];
  at: Map<string, number>; forced: Uint8Array; must: Uint8Array; rank: Float64Array; steps: Step[];
}

function prep(ctx: Ctx, c: Cand): Prep {
  const { d } = ctx;
  const forcedIds = new Set(c.forced.map(i => i.id));
  const reserved = c.forced.reduce((s, i) => s + q(weightOf(i, c.wsHub, d)), 0);
  const opts = c.pool
    .filter(i => !forcedIds.has(i.id) && ctx.score(i.id) > 0)
    .map(i => ({ id: i.id, w: q(weightOf(i, c.wsHub, d)), v: ctx.score(i.id) }));
  const forcedScore = c.pool.reduce((s, i) => s + (forcedIds.has(i.id) ? ctx.score(i.id) : 0), 0);
  const byRatio = opts.filter(o => o.w > 0).sort((a, b) => b.v / b.w - a.v / a.w);
  const at = new Map(c.pool.map((i, k) => [i.id, k]));
  const forced = Uint8Array.from(c.pool, i => Number(forcedIds.has(i.id)));
  const must = Uint8Array.from(c.pool, i => Number(ctx.musts.has(i.id)));
  const rank = Float64Array.from(c.pool, i => ctx.score(i.id) / Math.max(EPS, weightOf(i, c.wsHub, d)));
  // The entries schedule() would put for the whole pool, in its order; `at` < 0 marks an arrival.
  const steps: Step[] = [];
  const train = c.pool.find(i => i.id === TRAIN);
  let prevHub: Hub = 'AIR', prevArea: Area | null = null;
  for (const area of c.order) {
    const hub = hubOf(area, c.wsHub);
    // A train candidate always carries the train item (it is forced), so this matches schedule().
    if (c.train && train && isTrainPair(prevArea, area)) steps.push({ hours: weightOf(train, c.wsHub, d), move: true, slot: train.slot, night: false, at: -1 });
    else steps.push({ hours: d(prevHub, hub), move: true, slot: undefined, night: false, at: -1 });
    c.pool
      .filter(i => i.area === area && !(c.train && i.id === TRAIN))
      .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || (a.id < b.id ? -1 : 1))
      .forEach(i => steps.push({ hours: weightOf(i, c.wsHub, d), move: false, slot: i.slot, night: NIGHT_SLOTS.includes(i.slot), at: at.get(i.id)! }));
    prevHub = hub; prevArea = area;
  }
  return { reserved, opts, forcedScore, knap: new Knapsack(opts, c.cap - reserved), byRatio, at, forced, must, rank, steps };
}

/** Marks the chosen pool items: every forced one plus the knapsack's picks. */
function choose(p: Prep, excluded: Set<string>): Uint8Array {
  const on = Uint8Array.from(p.forced);
  for (const id of p.knap.solve(excluded)) on[p.at.get(id)!] = 1;
  return on;
}

/** Packs the content days (everything before the departure tail). */
function schedule(ctx: Ctx, c: Cand, chosen: Item[]): WorkDay[] {
  const { H, d } = ctx;
  let here: Area | null = null;
  let cur: WorkDay = { area: null, entries: [], used: 0, cap: H / 2, closed: false };
  const days: WorkDay[] = [cur];
  const newDay = () => { cur = { area: here, entries: [], used: 0, cap: H, closed: false }; days.push(cur); };
  const put = (e: DayEntry, slot?: Slot) => {
    if (cur.entries.length > 0) {
      if (e.hours > H + EPS || cur.closed) newDay();
      else if (cur.dark && (e.kind === 'drive' || e.kind === 'train')) newDay(); // no night drives on hill roads
      else if (slot === 'sunrise') newDay(); // one sunrise per day, never after another entry (B.5)
      else if (slot === 'morning' && cur.used > 3 + EPS) newDay();
      else if (e.hours > cur.cap - cur.used + EPS) newDay();
    }
    cur.entries.push(e); cur.used += e.hours;
    if (e.hours > H + EPS) cur.closed = true; // a long entry owns its whole day (B.3)
    if (e.kind === 'activity' && slot && NIGHT_SLOTS.includes(slot)) cur.dark = true;
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
    for (const i of acts) {
      const hours = w(i);
      put({ kind: 'activity', label: i.name, hours, itemId: i.id, onSite: i.hours, roundTrip: hours - i.hours }, i.slot);
    }
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

interface Eval { c: Cand; chosen: Item[]; days: WorkDay[]; score: number; overflow: boolean }

// Margin over float noise in the bounds below, so pruning can only skip a candidate that strictly loses.
const SLACK = 1e-6;

/** True when no plan for c scoring at most `bound` can beat `bar` under `better`. */
function beaten(c: Cand, bound: number, bar: Eval): boolean {
  if (bound + SLACK < bar.score - EPS) return true;
  if (bound + SLACK > bar.score + EPS) return false;
  return c.travel > bar.c.travel + EPS || (Math.abs(c.travel - bar.c.travel) <= EPS && c.routeKey >= bar.c.routeKey);
}

/** Fractional-knapsack upper bound on choose()'s score for these exclusions. */
function fractionalBound(c: Cand, p: Prep, excluded: Set<string>): number {
  let total = p.forcedScore, room = c.cap - p.reserved;
  for (const o of p.opts) if (o.w <= 0 && !excluded.has(o.id)) total += o.v;
  if (room <= 0) return total;
  for (const o of p.byRatio) {
    if (excluded.has(o.id)) continue;
    if (o.w <= room) { total += o.v; room -= o.w; } else { total += (o.v * room) / o.w; break; }
  }
  return total;
}

/**
 * Day count of assemble(ctx, c, schedule(ctx, c, chosen), 0, true) without building the days.
 * Mirrors put() and the departure tail step for step; the snapshot test pins the two together.
 */
function minDays(ctx: Ctx, c: Cand, p: Prep, on: Uint8Array): number {
  const { H, d } = ctx;
  let n = 1, count = 0, used = 0, cap = H / 2, closed = false, dark = false;
  for (const { hours, move, slot, night, at } of p.steps) {
    if (at >= 0 && !on[at]) continue;
    if (count > 0) {
      const fresh = hours > H + EPS || closed || (dark && move) || slot === 'sunrise' || (slot === 'morning' && used > 3 + EPS) || hours > cap - used + EPS;
      if (fresh) { n++; count = 0; used = 0; cap = H; closed = false; dark = false; }
    }
    count++; used += hours;
    if (hours > H + EPS) closed = true;
    if (night) dark = true;
  }
  const fd = d(c.route[c.route.length - 2], 'AIR');
  const capN = H / 2 - fd - CHECKIN;
  if (fd <= EPS) return n + 1;
  if (capN >= -EPS) return n >= 2 && !dark && used <= capN + EPS ? n : n + 1;
  return !closed && !dark && n >= 2 && cap - used >= fd - EPS ? n + 1 : n + 2;
}

/**
 * Each overflow round only adds an exclusion, so the score never rises; once it cannot beat `bar`
 * the candidate is abandoned (returns null). With no bar this is the full evaluation.
 */
function evaluate(ctx: Ctx, c: Cand, bar: Eval | null = null): Eval | null {
  const N = ctx.input.days;
  const excluded = new Set<string>();
  const p = prep(ctx, c);
  const { pool } = c;
  // Drop order (B.6): non-Musts first, then lowest score per hour, then id.
  const before = (k: number, j: number) => {
    const m = p.must[k] - p.must[j];
    if (m) return m < 0;
    const r = p.rank[k] - p.rank[j];
    return r ? r < 0 : pool[k].id < pool[j].id;
  };
  for (;;) {
    if (bar && beaten(c, fractionalBound(c, p, excluded), bar)) return null;
    const on = choose(p, excluded);
    let score = 0;
    for (let k = 0; k < pool.length; k++) if (on[k]) score += ctx.score(pool[k].id);
    if (bar && beaten(c, score, bar)) return null;
    // minDays is the cheap fit test; the real days are only built for the round that fits.
    if (minDays(ctx, c, p, on) <= N) {
      const chosen = pool.filter((_, k) => on[k]);
      return { c, chosen, days: fitTo(ctx, c, schedule(ctx, c, chosen), N)!, score, overflow: false };
    }
    // Overflow: drop one removable (non-forced) item and re-solve.
    let drop = -1;
    for (let k = 0; k < pool.length; k++) if (on[k] && !p.forced[k] && (drop < 0 || before(k, drop))) drop = k;
    if (drop < 0) {
      const chosen = pool.filter((_, k) => on[k]);
      return { c, chosen, days: assemble(ctx, c, schedule(ctx, c, chosen), 0, true), score, overflow: true };
    }
    excluded.add(pool[drop].id);
  }
}

const better = (a: Eval, b: Eval) => {
  if (a.overflow !== b.overflow) return !a.overflow;
  if (Math.abs(a.score - b.score) > EPS) return a.score > b.score;
  if (Math.abs(a.c.travel - b.c.travel) > EPS) return a.c.travel < b.c.travel;
  return a.c.routeKey < b.c.routeKey;
};

function search(ctx: Ctx, forceIn: Set<string>): Eval | null {
  let best: Eval | null = null;
  for (const c of candidates(ctx, forceIn)) {
    if (best && !best.overflow) {
      // Branch and bound: c's value can never exceed its upper bound (B.10).
      if (c.ub < best.score - EPS) break;
      if (Math.abs(c.ub - best.score) <= EPS && (c.travel > best.c.travel + EPS || (Math.abs(c.travel - best.c.travel) <= EPS && c.routeKey >= best.c.routeKey))) continue;
    }
    const e = evaluate(ctx, c, best && !best.overflow ? best : null);
    if (e && (!best || better(e, best))) best = e;
  }
  return best;
}

function toPlan(ctx: Ctx, e: Eval, forceFailed: boolean): Plan {
  const { input } = ctx;
  const chosenIds = e.chosen.map(i => i.id).sort();
  const chosenSet = new Set(chosenIds);
  const days: Day[] = e.days.map((x, i) => {
    const spare = x.closed ? 0 : Math.max(0, Math.round((x.cap - x.used) * 100) / 100);
    return { n: i + 1, area: x.area, entries: x.entries, spare, rainSlack: spare >= 3 && x.area !== null && RAIN_AREAS.includes(x.area) };
  });
  const missingMusts = (input.mustIds ?? []).filter(id => !chosenSet.has(id));
  const out: Plan = {
    route: e.c.route, areas: e.c.order, days, chosen: chosenIds,
    dropped: input.items.filter(i => ctx.score(i.id) > 0 && !chosenSet.has(i.id)).map(i => i.id).sort(),
    travelHours: e.c.travel, fits: missingMusts.length === 0 && !e.overflow, missingMusts, score: e.score,
  };
  if (e.overflow) out.overflow = true;
  if (forceFailed) out.forceFailed = true;
  return out;
}

const memo = new Map<string, Plan>();
const MEMO_MAX = 200;

export function plan(input: PlanInput): Plan {
  const key = JSON.stringify({
    ...input, legs: undefined,
    items: input.items.map(i => [i.id, i.area, i.hours, i.sideTrip, i.slot, i.hub ?? '', i.name]),
    legsKey: input.legs.map(l => [l.a, l.b, l.hours]),
  });
  const hit = memo.get(key);
  if (hit) return structuredClone(hit);
  const H = PACE_HOURS[input.pace];
  const ctx: Ctx = {
    input, H, budget: H * (input.days - 1) - CHECKIN, d: shortest(input.legs),
    score: id => input.scores[id] ?? 0,
    musts: new Set(input.mustIds ?? []), forceIn: new Set(input.forceIn ?? []), forceOut: new Set(input.forceOut ?? []),
  };
  const known = new Set(input.items.map(i => i.id));
  const forceIn = new Set([...ctx.forceIn].filter(id => known.has(id)));
  let result: Plan;
  const withForce = forceIn.size ? search(ctx, forceIn) : null;
  if (withForce && !withForce.overflow) result = toPlan(ctx, withForce, false);
  else {
    const free = search(ctx, new Set())!;
    // B.8: when no candidate can hold every forceIn item, ignore forceIn and say so.
    result = forceIn.size && withForce && free.overflow ? toPlan(ctx, withForce, false) : toPlan(ctx, free, forceIn.size > 0);
  }
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
  memo.set(key, result);
  return structuredClone(result);
}

/** Smallest trip length (from days+1, or 5, up to 21) at which every Must fits (B.9). */
export function mustFitDays(input: Omit<PlanInput, 'days'> & { days?: number }): number | null {
  const start = input.days !== undefined ? input.days + 1 : 5;
  for (let n = Math.max(5, start); n <= 21; n++) if (plan({ ...input, days: n }).fits) return n;
  return null;
}
