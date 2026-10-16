import { AREAS, AREA_HUB } from '../types';
import type { AppState, Area, Day, DayEntry, Hub, Item, Plan, Player, Slot } from '../types';
import { tierOf } from './ranking';

type Half = 'morning' | 'afternoon';
export interface SideQuest {
  itemId: string; name: string; day: number; area: Area; mode: 'free' | 'swap'; half?: Half;
  skipId?: string; hours: number; what: string;
}

const DAYTIME: Slot[] = ['any', 'morning', 'afternoon'];
// Wild south has two hubs; AREA_HUB only names the default one.
const hubArea = (h: Hub): Area | undefined => AREAS.find(a => AREA_HUB[a] === h) ?? (h === 'Tissa' ? 'Wild south' : undefined);
const hrs = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
const halvesOf = (slot: Slot): Half[] => (slot === 'morning' ? ['morning'] : slot === 'afternoon' ? ['afternoon'] : ['morning', 'afternoon']);
// The half an activity sits in; null for evening and late, which sit outside the daytime.
const halfOf = (slot: Slot): Half | 'either' | null =>
  slot === 'sunrise' || slot === 'morning' ? 'morning' : slot === 'afternoon' || slot === 'sunset' ? 'afternoon' : slot === 'any' ? 'either' : null;

/** Half-days with no drive and no activity, read from the day's entries; the same rule the planner packs by. */
export function freeHalves(d: Day, byId: Map<string, Item>): Half[] {
  let am = d.entries.some(e => e.kind === 'drive' || e.kind === 'train');
  let pm = false;
  let any = 0;
  for (const e of d.entries) {
    const h = e.kind === 'activity' && e.itemId ? halfOf(byId.get(e.itemId)?.slot ?? 'any') : null;
    if (h === 'morning') am = true; else if (h === 'afternoon') pm = true; else if (h === 'either') any++;
  }
  for (; any > 0; any--) { if (!am) am = true; else pm = true; }
  return [...(am ? [] : ['morning' as const]), ...(pm ? [] : ['afternoon' as const])];
}

export const sideQuestLine = (q: SideQuest) => `Day ${q.day}, ${q.area}: ${q.what}`;

/**
 * Optional things the viewer could do alone: a Must or Keen the group plan dropped, in a free half-day
 * of the same area, or in place of one group activity they choose to miss. Reads the plan, never changes it.
 */
export function sideQuests(plan: Plan, me: Player | null, state: AppState, items: Item[]): SideQuest[] {
  const r = me ? state.responses[me] : undefined;
  if (!r) return [];
  const byId = new Map(items.map(i => [i.id, i]));
  const wanted = (id: string) => { const t = tierOf(r.final ?? r.ranking, id); return t === 'must' || t === 'keen' ? t : null; };
  // A Must in either list is protected: the Finalize list can demote a knocked Must to Keen.
  const isMust = (id: string) => tierOf(r.ranking, id) === 'must' || (!!r.final && tierOf(r.final, id) === 'must');
  const chosen = new Set(plan.chosen);
  const cands = items
    .filter(i => !chosen.has(i.id) && !i.book && DAYTIME.includes(i.slot) && wanted(i.id))
    .sort((a, b) => Number(isMust(b.id)) - Number(isMust(a.id)) || (a.id < b.id ? -1 : 1));
  const days = [...plan.days].sort((a, b) => a.n - b.n).filter((d, k, all) => d.area !== null && k > 0 && k < all.length - 1 && !d.rainSlack);
  const spare = new Map(days.map(d => [d.n, d.spare]));
  const taken = new Set<string>();
  const out: SideQuest[] = [];
  const placeOf = (i: Item) => (i.hub && hubArea(i.hub)) || i.area;
  const there = (d: Day, x: Item) => d.area === x.area || placeOf(x) === d.area;

  for (const x of cands) {
    const cost = x.hours + x.sideTrip;
    const quest = (d: Day, rest: Pick<SideQuest, 'mode' | 'what'> & Partial<SideQuest>): SideQuest => ({ itemId: x.id, name: x.name, hours: x.hours, day: d.n, area: d.area!, ...rest });
    const found = ((): SideQuest | null => {
      for (const d of days) {
        if (!there(d, x)) continue;
        const half = freeHalves(d, byId).find(h => halvesOf(x.slot).includes(h) && !taken.has(`${d.n}:${h}`));
        if (!half || (spare.get(d.n) ?? 0) < cost) continue;
        taken.add(`${d.n}:${half}`); spare.set(d.n, (spare.get(d.n) ?? 0) - cost);
        return quest(d, { mode: 'free', half, what: `free ${half} for ${x.name} (${hrs(x.hours)} h)` });
      }
      for (const d of days) {
        if (!there(d, x)) continue;
        const e = d.entries.find((en: DayEntry) => {
          const it = en.kind === 'activity' && en.itemId ? byId.get(en.itemId) : undefined;
          // A day can start in one area and end in the next, so the skipped activity must be where the place is.
          if (!it || it.book || isMust(it.id) || taken.has(`${d.n}:${it.id}`) || placeOf(it) !== placeOf(x)) return false;
          const h = halfOf(it.slot);
          return !!h && (x.slot === 'any' || h === 'either' || h === x.slot) && en.hours + (spare.get(d.n) ?? 0) >= cost;
        });
        if (!e) continue;
        const it = byId.get(e.itemId!)!;
        taken.add(`${d.n}:${it.id}`); spare.set(d.n, (spare.get(d.n) ?? 0) + e.hours - cost);
        return quest(d, { mode: 'swap', skipId: it.id, what: `skip ${it.name}, do ${x.name} (${hrs(x.hours)} h)` });
      }
      return null;
    })();
    if (found) out.push(found);
  }
  return out.sort((a, b) => a.day - b.day || (a.itemId < b.itemId ? -1 : 1));
}
