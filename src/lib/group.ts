import { PEOPLE, type AppState, type GroupResult, type Item, type Knockout, type Leg, type Pace, type Person, type Plan, type Response } from '../types';
import { mustFitDays, plan } from './planner';
import { score, scoresFor, tierOf } from './ranking';

const VOTES_TO_RESOLVE = 3; // majority of 5
const MAX_CONTESTED = 5;
const EXTRAS_DAYS = 14;

const daysOf = (r: Response) => (r.flex ? 14 : r.days ?? 9);

export function personPlan(resp: Response, items: Item[], legs: Leg[]): Plan & { mustFit: number | null } {
  const ids = items.map(i => i.id);
  const scores = scoresFor(resp.ranking, ids);
  const mustIds = ids.filter(id => tierOf(resp.ranking, id) === 'must');
  const input = { items, scores, days: daysOf(resp), pace: (resp.pace ?? 1) as Pace, legs, mustIds };
  const p = plan(input);
  return { ...p, mustFit: p.fits ? null : mustFitDays(input) };
}

// Even counts round the middle pair toward the slower pace.
function medianPace(paces: Pace[]): Pace {
  if (!paces.length) return 1;
  const s = [...paces].sort();
  return Math.round((s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2) as Pace;
}

export function groupResult(state: AppState, items: Item[], legs: Leg[]): GroupResult {
  const rs = PEOPLE.map(p => state.responses[p]).filter((r): r is Response => !!r);
  const open = PEOPLE.every(p => state.responses[p]?.submitted);
  const days = rs.length ? Math.min(...rs.map(daysOf)) : 9;
  const pace = medianPace(rs.flatMap(r => (r.pace === null ? [] : [r.pace])));
  if (!open) return { open, days, pace, base: null, knockouts: [], results: [], final: null, extras: [] };

  const ids = items.map(i => i.id);
  const scores: Record<string, number> = Object.fromEntries(ids.map(id => [id, rs.reduce((n, r) => n + score(r.ranking, id), 0)]));
  // No mustIds: a group plan never claims "doesn't fit" (plan C.5).
  const run = (F: Set<string>, O: Set<string>, d = days) => plan({ items, scores, days: d, pace, legs, forceIn: [...F], forceOut: [...O] });

  const F = new Set<string>(), O = new Set<string>();
  const baseP = run(F, O);
  const rated = (id: string, t: 'must' | 'keen') => rs.filter(r => tierOf(r.ranking, id) === t).length;
  const contested = ids
    .filter(id => !baseP.chosen.includes(id) && (rated(id, 'must') >= 1 || rated(id, 'keen') >= 2))
    .sort((x, y) => scores[y] - scores[x] || (x < y ? -1 : 1))
    .slice(0, MAX_CONTESTED);

  const knockouts: Knockout[] = [];
  const results: GroupResult['results'] = [];
  let P = baseP;
  for (const c of contested) {
    if (P.chosen.includes(c)) continue;
    if (O.has(c)) { results.push({ forkId: `ko:${c}:displaced`, a: [c], b: [], winner: 'displaced' }); continue; }
    const Q = run(new Set([...F, c]), O);
    if (Q.forceFailed) continue;
    const b = P.chosen.filter(id => !Q.chosen.includes(id) && !F.has(id));
    if (!b.length) { F.add(c); P = Q; continue; }
    const a = [c, ...Q.chosen.filter(id => !P.chosen.includes(id) && id !== c)];
    const forkId = `ko:${c}:${[...b].sort().join(',')}`;
    const latest = new Map<Person, 'a' | 'b'>();
    for (const v of state.votes) if (v.forkId === forkId) latest.set(v.name, v.choice);
    const who = (side: 'a' | 'b') => PEOPLE.filter(p => latest.get(p) === side);
    const votes = { a: who('a'), b: who('b') };
    if (votes.a.length >= VOTES_TO_RESOLVE) { F.add(c); b.forEach(id => O.add(id)); results.push({ forkId, a, b, winner: 'a' }); P = run(F, O); }
    else if (votes.b.length >= VOTES_TO_RESOLVE) { O.add(c); results.push({ forkId, a, b, winner: 'b' }); P = run(F, O); }
    else knockouts.push({ forkId, a, b, votes });
  }

  const final = knockouts.length ? null : P;
  const kept = new Set((final ?? baseP).chosen);
  const extras = run(new Set(), new Set(), EXTRAS_DAYS).chosen
    .filter(id => !kept.has(id))
    .map(id => ({ id, who: rs.flatMap(r => { const t = tierOf(r.ranking, id); return t === 'must' || t === 'keen' ? [{ name: r.name, tier: t }] : []; }) }))
    .filter(e => e.who.length > 0)
    .sort((x, y) => scores[y.id] - scores[x.id] || (x.id < y.id ? -1 : 1));
  return { open, days, pace, base: baseP, knockouts, results, final, extras };
}
