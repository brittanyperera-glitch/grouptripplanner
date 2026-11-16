import type { DayEdit, DayEntry, Item, Plan, ReleasePlan, ReleaseState, TripSettings } from '../types';
import { isEve, RAIN_AREAS } from './planner';
import type { Release } from './release';

export const releaseState = (settings: TripSettings | null | undefined): ReleaseState =>
  settings === undefined ? { state: 'loading' } : settings?.plan?.items.length ? { state: 'value', plan: settings.plan } : { state: 'absent' };

/** Loading must not fall back to the seed: an organiser's edited plan would flash the old one first. */
export const effectiveRelease = (rs: ReleaseState, seed: Release | null, snapshot: ReleasePlan | null): ReleasePlan | null =>
  rs.state === 'value' ? rs.plan : rs.state === 'loading' ? snapshot : seed && { ...seed, dayEdits: [] };

// The planner's departure tail (planner.ts assemble): the drive to the airport and the 'Check in and fly' entry.
const isTail = (e: DayEntry) => (e.kind === 'drive' && e.to === 'AIR') || (e.kind === 'free' && e.label === 'Check in and fly');
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Organiser edits laid over a plan. Pure. Drive and train entries are never moved or hidden: the map's legs depend on them. */
export function applyDayEdits(plan: Plan, edits: DayEdit[], paceHours: number, items: Item[] = []): { plan: Plan; warnings: string[] } {
  const days = plan.days.map(d => ({ ...d, entries: [...d.entries] }));
  const warnings: string[] = [];
  const touched = new Set<number>();
  const hidden = new Set<string>();
  // Evening and late places sit outside the daytime cap in the planner, so they must not eat the spare here either.
  const evening = new Set(items.filter(isEve).map(i => i.id));
  const customHours = new Map<number, number>();
  const find = (id: string) => {
    for (const d of days) { const k = d.entries.findIndex(e => e.itemId === id); if (k >= 0) return { d, k }; }
    return null;
  };
  for (const e of edits) {
    if (e.kind === 'custom') {
      const d = days[(e.day ?? 0) - 1];
      if (!d) { warnings.push(`Custom stop "${e.title ?? e.id}" is on day ${e.day}, which is not in the plan.`); continue; }
      customHours.set(d.n, (customHours.get(d.n) ?? 0) + (e.hours ?? 0));
      touched.add(d.n);
      continue;
    }
    const at = find(e.id);
    if (!at) { warnings.push(`"${items.find(i => i.id === e.id)?.name ?? e.id}" is not in the plan any more, so its ${e.kind} edit was skipped.`); continue; }
    const entry = at.d.entries[at.k];
    if (entry.kind === 'drive' || entry.kind === 'train') { warnings.push(`"${entry.label}" is travel and cannot be ${e.kind === 'move' ? 'moved' : 'hidden'}.`); continue; }
    if (e.kind === 'hide') { at.d.entries.splice(at.k, 1); touched.add(at.d.n); hidden.add(e.id); continue; }
    const to = days[(e.day ?? 0) - 1];
    if (!to) { warnings.push(`"${entry.label}" cannot move to day ${e.day}, which is not in the plan.`); continue; }
    if (to.area !== at.d.area) warnings.push(`"${entry.label}" moves from ${at.d.area ?? 'travel'} to day ${to.n} in ${to.area ?? 'travel'}.`);
    at.d.entries.splice(at.k, 1);
    const tail = to.entries.findIndex(isTail);
    to.entries.splice(tail < 0 ? to.entries.length : tail, 0, entry);
    touched.add(at.d.n).add(to.n);
  }
  for (const d of days) {
    if (!touched.has(d.n)) continue;
    // The planner caps the first and last day at half the pace, and clamps its own spare at 0; this one may go negative.
    const cap = d.n === 1 || d.n === days.length ? paceHours / 2 : paceHours;
    d.spare = round2(cap - d.entries.reduce((s, x) => s + (x.itemId && evening.has(x.itemId) ? 0 : x.hours), 0) - (customHours.get(d.n) ?? 0));
    d.rainSlack = d.spare >= 3 && d.area !== null && RAIN_AREAS.includes(d.area);
    if (d.spare < 0) warnings.push(`Day ${d.n} is over budget by ${-d.spare} h.`);
  }
  // A hidden place must leave the print's book-ahead and tips too, which read plan.chosen.
  const gone = new Set([...hidden].filter(id => !days.some(d => d.entries.some(x => x.itemId === id))));
  return { plan: { ...plan, days, chosen: plan.chosen.filter(id => !gone.has(id)) }, warnings };
}
