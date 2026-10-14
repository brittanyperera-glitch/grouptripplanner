import type { Hub, Leg } from '../types';

const HUBS: Hub[] = ['AIR', 'Colombo', 'Sigiriya', 'Kandy', 'Kitulgala', 'Nuwara Eliya', 'Ella', 'Tissa', 'Udawalawe', 'Weligama'];
const cache = new WeakMap<Leg[], (a: Hub, b: Hub) => number>();
// Also by content: a worker hands over a fresh copy of the legs on every call, and the planner's
// caches key on the returned function's identity.
const byContent = new Map<string, (a: Hub, b: Hub) => number>();

/** All-pairs shortest drive hours (Floyd-Warshall), memoised per legs array and per legs content. */
export function shortest(legs: Leg[]): (a: Hub, b: Hub) => number {
  const hit = cache.get(legs);
  if (hit) return hit;
  const key = JSON.stringify(legs.map(l => [l.a, l.b, l.hours]));
  const same = byContent.get(key);
  if (same) { cache.set(legs, same); return same; }
  const hubs = [...HUBS];
  for (const l of legs) for (const h of [l.a, l.b]) if (!hubs.includes(h)) hubs.push(h);
  const idx = new Map(hubs.map((h, i) => [h, i]));
  const n = hubs.length;
  const dist = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const l of legs) {
    const a = idx.get(l.a)!, b = idx.get(l.b)!;
    if (l.hours < dist[a][b]) dist[a][b] = dist[b][a] = l.hours;
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const via = dist[i][k] + dist[k][j];
    if (via < dist[i][j]) dist[i][j] = via;
  }
  const fn = (a: Hub, b: Hub) => {
    const i = idx.get(a), j = idx.get(b);
    if (i === undefined || j === undefined) throw new Error(`Unknown hub: ${i === undefined ? a : b}`);
    return dist[i][j];
  };
  cache.set(legs, fn);
  if (byContent.size >= 8) byContent.delete(byContent.keys().next().value!);
  byContent.set(key, fn);
  return fn;
}
