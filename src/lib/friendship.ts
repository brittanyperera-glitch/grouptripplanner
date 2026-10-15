import { tierOf } from './ranking';
import { PEOPLE, TIERS } from '../types';
import type { Person, Ranking, Response } from '../types';

export interface Agreement { agree: number; both: number; pct: number | null }
export interface PairScore { a: Person; b: Person; pct: number }
export interface Divisive { id: string; musts: number; skips: number; label: string }
export interface FriendStats {
  pairs: PairScore[];
  twin: { name: Person; pct: number } | null;
  clash: { name: Person; pct: number } | null;
}

const rank = (r: Ranking, id: string) => {
  const t = tierOf(r, id);
  return t === null ? null : TIERS.indexOf(t);
};

const ALL_IDS = (a: Ranking, b: Ranking) => new Set(TIERS.flatMap(t => [...a[t], ...b[t]].flat()));

/**
 * Agreement % for a pair: of the places BOTH rated, the share where their tiers are at most one step apart
 * (Must/Keen/Meh/Skip are steps 0-3). Places only one of them rated are ignored. null when they share none.
 */
export function agreement(a: Ranking, b: Ranking): Agreement {
  let agree = 0, both = 0;
  for (const id of ALL_IDS(a, b)) {
    const x = rank(a, id), y = rank(b, id);
    if (x === null || y === null) continue;
    both++;
    if (Math.abs(x - y) <= 1) agree++;
  }
  return { agree, both, pct: both ? Math.round((100 * agree) / both) : null };
}

/** All ten pairs, plus the viewer's closest match (twin) and furthest (clash). Ties go to the earlier name. */
export function friendStats(responses: Partial<Record<Person, Response>>, viewer: Person): FriendStats {
  const pairs: PairScore[] = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    for (let j = i + 1; j < PEOPLE.length; j++) {
      const ra = responses[PEOPLE[i]], rb = responses[PEOPLE[j]];
      if (!ra || !rb) continue;
      const { pct } = agreement(ra.ranking, rb.ranking);
      if (pct !== null) pairs.push({ a: PEOPLE[i], b: PEOPLE[j], pct });
    }
  }
  const mine = pairs
    .filter(p => p.a === viewer || p.b === viewer)
    .map(p => ({ name: p.a === viewer ? p.b : p.a, pct: p.pct }));
  let twin: FriendStats['twin'] = null, clash: FriendStats['clash'] = null;
  for (const m of mine) {
    if (!twin || m.pct > twin.pct) twin = m;
    if (!clash || m.pct < clash.pct) clash = m;
  }
  if (twin && clash && twin.name === clash.name) clash = null;
  return { pairs, twin, clash };
}

/** The place with the widest tier spread across the group; ties go to more Musts plus Skips, then id. */
export function divisive(rs: Response[], ids: string[]): Divisive | null {
  let best: (Divisive & { spread: number }) | null = null;
  for (const id of ids) {
    const ranks = rs.map(r => rank(r.ranking, id)).filter((x): x is number => x !== null);
    if (ranks.length < 2) continue;
    const spread = Math.max(...ranks) - Math.min(...ranks);
    if (spread === 0) continue;
    const musts = ranks.filter(x => x === 0).length, skips = ranks.filter(x => x === 3).length;
    const better = !best || spread > best.spread
      || (spread === best.spread && (musts + skips > best.musts + best.skips
        || (musts + skips === best.musts + best.skips && id < best.id)));
    if (better) best = { id, spread, musts, skips, label: [musts && `${musts} Must`, skips && `${skips} Skip`].filter(Boolean).join(', ') };
  }
  if (!best) return null;
  const { spread: _s, ...out } = best;
  return out;
}
