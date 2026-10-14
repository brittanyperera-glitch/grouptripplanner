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

/** 0/1 knapsack in quarter hours; ties prefer fewer items. Returns chosen optional ids. */
function knapsack(opts: { id: string; w: number; v: number }[], cap: number): string[] {
  const n = opts.length;
  if (n === 0 || cap <= 0) return [];
  const val = new Float64Array(cap + 1), cnt = new Int32Array(cap + 1);
  const take = new Uint8Array(n * (cap + 1));
  for (let i = 0; i < n; i++) {
    const { w, v } = opts[i];
    for (let c = cap; c >= w; c--) {
      const nv = val[c - w] + v, nc = cnt[c - w] + 1;
      if (nv > val[c] + EPS || (Math.abs(nv - val[c]) <= EPS && nc < cnt[c])) {
        val[c] = nv; cnt[c] = nc; take[i * (cap + 1) + c] = 1;
      }
    }
  }
  const out: string[] = [];
  let c = cap;
  for (let i = n - 1; i >= 0; i--) if (take[i * (cap + 1) + c]) { out.push(opts[i].id); c -= opts[i].w; }
  return out;
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

function choose(ctx: Ctx, c: Cand, excluded: Set<string>): Item[] {
  const forcedIds = new Set(c.forced.map(i => i.id));
  const reserved = c.forced.reduce((s, i) => s + q(weightOf(i, c.wsHub, ctx.d)), 0);
  const opts = c.pool
    .filter(i => !forcedIds.has(i.id) && !excluded.has(i.id) && ctx.score(i.id) > 0)
    .map(i => ({ id: i.id, w: q(weightOf(i, c.wsHub, ctx.d)), v: ctx.score(i.id) }));
  const picked = new Set(knapsack(opts, c.cap - reserved));
  return c.pool.filter(i => forcedIds.has(i.id) || picked.has(i.id));
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

function evaluate(ctx: Ctx, c: Cand): Eval {
  const N = ctx.input.days;
  const excluded = new Set<string>();
  const forcedIds = new Set(c.forced.map(i => i.id));
  for (;;) {
    const chosen = choose(ctx, c, excluded);
    const content = schedule(ctx, c, chosen);
    const days = fitTo(ctx, c, content, N);
    const score = chosen.reduce((s, i) => s + ctx.score(i.id), 0);
    if (days) return { c, chosen, days, score, overflow: false };
    // Overflow: drop the lowest score per hour, never forced, non-Musts first (B.6).
    const removable = chosen.filter(i => !forcedIds.has(i.id));
    if (!removable.length) return { c, chosen, days: assemble(ctx, c, content, 0, true), score, overflow: true };
    const rank = (i: Item) => ctx.score(i.id) / Math.max(EPS, weightOf(i, c.wsHub, ctx.d));
    removable.sort((a, b) => Number(ctx.musts.has(a.id)) - Number(ctx.musts.has(b.id)) || rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
    excluded.add(removable[0].id);
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
    const e = evaluate(ctx, c);
    if (!best || better(e, best)) best = e;
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
