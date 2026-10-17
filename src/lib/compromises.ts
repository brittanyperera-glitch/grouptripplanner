import { AREA_HUB, PEOPLE } from '../types';
import type { AppState, GroupResult, Hub, Item } from '../types';
import { routePlan } from './openItems';
import { tierOf } from './ranking';
import { latestVotes, NORTH_AREAS, REGION_FORK } from './votes';

export const MAX_CARDS = 5;
const MAX_CHARS = 48; // "about 45": the two-name skipped line is 47

export type CompromiseKind = 'region' | 'headToHead' | 'skipped' | 'back' | 'missed';
export interface Compromise { kind: CompromiseKind; text: string; stop: Hub }

/** Each hub once, in the order the route first reaches it. */
export const routeStops = (route: Hub[]): Hub[] => [...new Set(route)];

// First variant that fits the line; the last is the shortest and is used as is.
const fit = (...variants: string[]) => variants.find(v => v.length <= MAX_CHARS) ?? variants[variants.length - 1];

/** One-line cards for the route reveal, biggest first, at most MAX_CARDS. Reads only; nothing here changes the plan. */
export function compromises(group: GroupResult, state: Pick<AppState, 'responses' | 'votes'>, items: Item[]): Compromise[] {
  // A reopened route still shows the last locked plan, not the pre-vote base (Brittany 2026-10-17).
  const plan = group.final ?? routePlan(group, state) ?? group.base;
  if (!plan) return [];
  const byId = new Map(items.map(i => [i.id, i]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const stops: Hub[] = routeStops(plan.route).filter(h => h !== 'AIR');
  const last = stops[stops.length - 1] ?? 'AIR';
  const stopOf = (id: string): Hub => {
    const area = byId.get(id)?.area;
    const hub = area ? AREA_HUB[area] : undefined;
    return hub && stops.includes(hub) ? hub : last;
  };
  const rated = (id: string, tier: 'must' | 'skip') =>
    PEOPLE.filter(p => { const r = state.responses[p]; return !!r && tierOf(r.ranking, id) === tier; });

  // Latest vote per person on a fork, as counts for each side.
  const tally = (forkId: string) => {
    // The five crew only, as in group.ts: a guest vote never moves what the real group sees (Brittany 2026-10-17).
    const n = { a: 0, b: 0 };
    latestVotes(state.votes, forkId, PEOPLE).forEach(c => { n[c]++; });
    return n;
  };

  const cards: Compromise[] = [];

  // (a) North or South.
  const region = group.results.find(r => r.forkId === REGION_FORK && r.winner !== 'displaced');
  if (region) {
    const n = tally(REGION_FORK);
    const northIn = region.winner === 'a';
    const hi = Math.max(n.a, n.b), lo = Math.min(n.a, n.b);
    cards.push({
      kind: 'region',
      text: `${northIn ? 'North in: North' : 'North out: South'} won ${hi} to ${lo}`,
      stop: stops.includes(AREA_HUB.North) ? AREA_HUB.North : last,
    });
  }

  // (b) Item head to heads, closest margin first.
  const h2h = group.results
    .filter(r => r.forkId.startsWith('ko:') && (r.winner === 'a' || r.winner === 'b'))
    .map(r => { const n = tally(r.forkId); return { r, n, margin: Math.abs(n.a - n.b) }; })
    .sort((x, y) => x.margin - y.margin || (x.r.forkId < y.r.forkId ? -1 : 1));
  for (const { r, n } of h2h) {
    const c = r.a[0];
    const won = r.winner === 'a';
    const score = `${Math.max(n.a, n.b)} to ${Math.min(n.a, n.b)}`;
    const text = won
      ? fit(`Added ${name(c)} over ${name(r.b[0] ?? '')}: ${score}`, `Added ${name(c)}: ${score}`)
      : fit(`Kept the plan over ${name(c)}: ${score}`, `Kept the plan, not ${name(c)}: ${score}`);
    cards.push({ kind: 'headToHead', text, stop: stopOf(c) });
  }

  // (c) Planned places someone skipped, most skippers first.
  const skipped = plan.chosen
    .map(id => ({ id, who: rated(id, 'skip') }))
    .filter(x => x.who.length > 0)
    .sort((x, y) => y.who.length - x.who.length || (x.id < y.id ? -1 : 1));
  for (const { id, who } of skipped) {
    const names = who.length === 1 ? who[0] : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`;
    cards.push({
      kind: 'skipped',
      text: fit(`${name(id)} stays though ${names} skipped it`, `${name(id)} stays, ${names} skipped it`, `${name(id)} stays, ${who.length} skipped it`),
      stop: stopOf(id),
    });
  }

  // (d) Knocked down by a head to head, then brought back by room in the plan.
  for (const id of group.knocked) {
    if (!plan.chosen.includes(id) || rated(id, 'must').length === 0) continue;
    cards.push({ kind: 'back', text: fit(`${name(id)} is back: there was room`, `${name(id)} is back`), stop: stopOf(id) });
  }

  // (e) Musts that did not fit. Skips anything a head to head or the region vote already explains.
  const explained = new Set(group.results.flatMap(r => [...r.a, ...r.b]));
  const northOut = region?.winner === 'b';
  const missed = items
    .filter(i => !plan.chosen.includes(i.id) && !explained.has(i.id) && !group.knocked.includes(i.id) && !(northOut && NORTH_AREAS.has(i.area)))
    .map(i => ({ id: i.id, n: rated(i.id, 'must').length }))
    .filter(x => x.n > 0)
    .sort((x, y) => y.n - x.n || (x.id < y.id ? -1 : 1));
  for (const { id } of missed) {
    cards.push({ kind: 'missed', text: fit(`${name(id)} missed out: not enough days`, `${name(id)} missed out`), stop: stopOf(id) });
  }

  return cards.slice(0, MAX_CARDS);
}
