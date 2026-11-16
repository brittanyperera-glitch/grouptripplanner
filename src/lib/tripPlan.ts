import type { DayEdit, Plan, ReleasePlan, ReleaseState, TripSettings } from '../types';
import type { Release } from './release';

export const releaseState = (settings: TripSettings | null | undefined): ReleaseState =>
  settings === undefined ? { state: 'loading' } : settings?.plan ? { state: 'value', plan: settings.plan } : { state: 'absent' };

/** Loading must not fall back to the seed: an organiser's edited plan would flash the old one first. */
export const effectiveRelease = (rs: ReleaseState, seed: Release | null, snapshot: ReleasePlan | null): ReleasePlan | null =>
  rs.state === 'value' ? rs.plan : rs.state === 'loading' ? snapshot : seed && { ...seed, dayEdits: [] };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Organiser edits laid over a plan. Pure. Drive and train entries are never moved or hidden: the map's legs depend on them. */
export function applyDayEdits(plan: Plan, edits: DayEdit[], paceHours: number): { plan: Plan; warnings: string[] } {
  const days = plan.days.map(d => ({ ...d, entries: [...d.entries] }));
  const warnings: string[] = [];
  const touched = new Set<number>();
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
    if (!at) { warnings.push(`"${e.id}" is not in the plan any more, so its ${e.kind} edit was skipped.`); continue; }
    const entry = at.d.entries[at.k];
    if (entry.kind === 'drive' || entry.kind === 'train') { warnings.push(`"${entry.label}" is travel and cannot be ${e.kind === 'move' ? 'moved' : 'hidden'}.`); continue; }
    if (e.kind === 'hide') { at.d.entries.splice(at.k, 1); touched.add(at.d.n); continue; }
    const to = days[(e.day ?? 0) - 1];
    if (!to) { warnings.push(`"${entry.label}" cannot move to day ${e.day}, which is not in the plan.`); continue; }
    if (to.area !== at.d.area) warnings.push(`"${entry.label}" moves from ${at.d.area ?? 'travel'} to day ${to.n} in ${to.area ?? 'travel'}.`);
    at.d.entries.splice(at.k, 1);
    to.entries.push(entry);
    touched.add(at.d.n).add(to.n);
  }
  for (const d of days) {
    if (!touched.has(d.n)) continue;
    d.spare = round2(paceHours - d.entries.reduce((s, x) => s + x.hours, 0) - (customHours.get(d.n) ?? 0));
    if (d.spare < 0) warnings.push(`Day ${d.n} is over budget by ${-d.spare} h.`);
  }
  return { plan: { ...plan, days }, warnings };
}
