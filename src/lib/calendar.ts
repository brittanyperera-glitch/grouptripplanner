import { AREA_HUB, AREAS } from '../types';
import type { Area, Hub, NightBlock, Plan } from '../types';

const DAY_MS = 86_400_000;

/** `date` ('YYYY-MM-DD') plus n days, on UTC dates so no timezone or daylight-saving shift can move it; null for a malformed date. */
export function addDays(date: string, n: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + n * DAY_MS;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/** Day n's date, with day 1 the start; null while no start date is set or it is malformed. */
export const dateOf = (n: number, start: string | null): string | null => (start ? addDays(start, n - 1) : null);

/** The area a hub belongs to. Tissa is Wild south's second hub, which AREA_HUB does not name; AIR belongs to none. */
export const hubArea = (h: Hub): Area | null => AREAS.find(a => AREA_HUB[a] === h) ?? (h === 'Tissa' ? 'Wild south' : null);

/** Where the night after day d is spent; null after the last day, which has no night. */
export function nightHub(plan: Plan, d: number): Hub | null {
  if (d >= plan.days.length) return null;
  const day = plan.days[d - 1];
  const to = [...day.entries].reverse().find(e => (e.kind === 'drive' || e.kind === 'train') && e.to)?.to;
  if (to && to !== 'AIR') return to;
  // "Drive towards the airport" ends a day that is not the last; the night is still at the day's own hub (Tissa is in the route, not in AREA_HUB).
  if (day.area) return plan.route.find(h => hubArea(h) === day.area) ?? AREA_HUB[day.area];
  return d > 1 ? nightHub(plan, d - 1) : plan.route[1] ?? null;
}

/** Consecutive nights at one hub merge into one block; dates are null while there is no start date. */
export function nightBlocks(plan: Plan, start: string | null): NightBlock[] {
  const blocks: NightBlock[] = [];
  for (let n = 1; n < plan.days.length; n++) {
    const hub = nightHub(plan, n);
    const area = hub && hubArea(hub);
    if (!hub || !area) throw new RangeError(`nightBlocks: night ${n} has no hub in an area (${hub ?? 'no hub'})`);
    const last = blocks[blocks.length - 1];
    if (last && last.hub === hub) { last.toDay = n; last.nights++; last.checkOut = dateOf(n + 1, start); continue; }
    blocks.push({ area, hub, checkIn: dateOf(n, start), checkOut: dateOf(n + 1, start), nights: 1, fromDay: n, toDay: n });
  }
  return blocks;
}

/** Real nights per area, in route order: the last day has none, so an area only on the last day is absent. */
export function nightsFromBlocks(blocks: NightBlock[]): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {};
  for (const b of blocks) out[b.area] = (out[b.area] ?? 0) + b.nights;
  return out;
}
