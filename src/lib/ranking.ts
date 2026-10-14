import { TIERS, type Pending, type Ranking, type Tier } from '../types';

const MAX_TIE = 3;
const BASE: Record<Tier, number> = { must: 10, keen: 4, meh: 1, skip: -3 };

export function tierOf(r: Ranking, id: string): Tier | null {
  for (const t of TIERS) if (r[t].some(l => l.includes(id))) return t;
  return null;
}

export function removeId(r: Ranking, id: string): void {
  for (const t of TIERS) r[t] = r[t].map(l => l.filter(x => x !== id)).filter(l => l.length > 0);
}

export function startPlace(r: Ranking, id: string, tier: Tier): Pending | null {
  if (r[tier].length === 0) { r[tier] = [[id]]; return null; }
  return { id, tier, lo: 0, hi: r[tier].length, steps: 0 };
}

const mid = (p: Pending) => Math.floor((p.lo + p.hi) / 2);

export function compareTarget(r: Ranking, p: Pending): string {
  return r[p.tier][mid(p)][0];
}

export function canTie(r: Ranking, p: Pending): boolean {
  return r[p.tier][mid(p)].length < MAX_TIE;
}

export function answer(r: Ranking, p: Pending, a: 'new' | 'old' | 'same'): Pending | null {
  const m = mid(p);
  const levels = r[p.tier];
  if (a === 'same') {
    if (levels[m].length >= MAX_TIE) throw new Error('tie full');
    levels[m].push(p.id);
    return null;
  }
  const next: Pending = { ...p, steps: p.steps + 1, lo: a === 'old' ? m + 1 : p.lo, hi: a === 'new' ? m : p.hi };
  if (next.lo === next.hi) { levels.splice(next.lo, 0, [p.id]); return null; }
  return next;
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

export function retier(r: Ranking, id: string, tier: Tier): Pending | null {
  removeId(r, id);
  return startPlace(r, id, tier);
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
