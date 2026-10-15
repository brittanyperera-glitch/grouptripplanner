import { TIERS, type Ranking, type Tier } from '../types';

// Draws exist only on the Finalize screen, up to 5 to a spot (Brittany 2026-10-15).
export const MAX_TIE = 5;
export const BASE: Record<Tier, number> = { must: 10, keen: 4, meh: 1, skip: -3 };

export function tierOf(r: Ranking, id: string): Tier | null {
  for (const t of TIERS) if (r[t].some(l => l.includes(id))) return t;
  return null;
}

export function removeId(r: Ranking, id: string): void {
  for (const t of TIERS) r[t] = r[t].map(l => l.filter(x => x !== id)).filter(l => l.length > 0);
}

/** Before the head to heads a tier is one unordered spot, so every item in it scores the same. */
export function setTier(r: Ranking, id: string, tier: Tier): void {
  removeId(r, id);
  r[tier] = [[...r[tier].flat(), id]];
}

export function move(r: Ranking, id: string, dir: -1 | 1): void {
  const t = tierOf(r, id);
  if (!t) return;
  const levels = r[t];
  const i = levels.findIndex(l => l.includes(id));
  const lvl = levels[i];
  if (lvl.length > 1) {
    lvl.splice(lvl.indexOf(id), 1);
    levels.splice(dir === -1 ? i : i + 1, 0, [id]);
    return;
  }
  const j = i + dir;
  if (j < 0 || j >= levels.length) return;
  if (levels[j].length < MAX_TIE) {
    levels[j].push(id);
    levels.splice(i, 1);
  } else {
    levels[i] = levels[j];
    levels[j] = lvl;
  }
}

export function labels(r: Ranking): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 1;
  for (const t of TIERS) for (const l of r[t]) {
    for (const id of l) out[id] = l.length > 1 ? `${n}=` : `${n}`;
    n += l.length;
  }
  return out;
}

export function score(r: Ranking, id: string): number {
  const t = tierOf(r, id);
  if (!t) return 0;
  const levels = r[t];
  const i = levels.findIndex(l => l.includes(id));
  return BASE[t] + 0.9 * (1 - i / Math.max(1, levels.length - 1));
}

export function scoresFor(r: Ranking, ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map(id => [id, score(r, id)]));
}
