import type { Knockout } from '../types';
import { REGION_FORK } from './votes';

export { REGION_FORK };

export type KoEntry =
  | { kind: 'fork'; k: Knockout }
  | { kind: 'group'; loser: string; members: Knockout[] };

const plain = (k: Knockout) => !k.genre && k.forkId !== REGION_FORK;

// Open place forks that would drop the same place become one entry, so that place is asked about once
// (Brittany 2026-10-16). Nothing here touches stored votes: each member keeps its own fork id.
// A fork lands in one group only: under the first of its shared losers in `rank` order. A group left
// with one member goes back to being a normal card. Entries keep the order of each one's first fork.
export function groupByLoser(knockouts: Knockout[], rank: (ids: string[]) => string[] = ids => [...ids].sort()): KoEntry[] {
  const count = new Map<string, number>();
  for (const k of knockouts.filter(plain)) for (const id of new Set(k.b)) count.set(id, (count.get(id) ?? 0) + 1);
  const keyOf = (k: Knockout): string | undefined => plain(k) ? rank([...new Set(k.b)].filter(id => (count.get(id) ?? 0) > 1))[0] : undefined;

  const keys = new Map<string, string>();
  const members = new Map<string, Knockout[]>();
  for (const k of knockouts) {
    const key = keyOf(k);
    if (key === undefined) continue;
    keys.set(k.forkId, key);
    members.set(key, [...(members.get(key) ?? []), k]);
  }
  const out: KoEntry[] = [];
  const emitted = new Set<string>();
  for (const k of knockouts) {
    const key = keys.get(k.forkId);
    const group = key === undefined ? undefined : members.get(key);
    if (key === undefined || !group || group.length < 2) { out.push({ kind: 'fork', k }); continue; }
    if (emitted.has(key)) continue;
    emitted.add(key);
    out.push({ kind: 'group', loser: key, members: group });
  }
  return out;
}
