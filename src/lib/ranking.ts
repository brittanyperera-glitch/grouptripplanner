import { emptyRanking, TIERS, type Ranking, type Tier } from '../types';

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

/** Swiping a card adds it to the end of its tier as its own spot (in-tier order is the person's to drag). */
export function setTier(r: Ranking, id: string, tier: Tier): void {
  removeId(r, id);
  r[tier] = [...r[tier].flat().map(x => [x]), [id]];
}

/** Puts id at flat position `index` of `tier` (counted without id). Landing inside a draw splits it in two. */
export function placeId(r: Ranking, id: string, tier: Tier, index: number): void {
  removeId(r, id);
  const levels = r[tier];
  let before = 0;
  for (let i = 0; i < levels.length; i++) {
    const n = levels[i].length;
    if (index <= before) { levels.splice(i, 0, [id]); return; }
    if (index < before + n) {
      const cut = index - before;
      levels.splice(i, 1, levels[i].slice(0, cut), [id], levels[i].slice(cut));
      return;
    }
    before += n;
  }
  levels.push([id]);
}

/** Before the head to heads there are no draws: every item is its own spot, in its current order. */
export function withoutDraws(r: Ranking): Ranking {
  const out = emptyRanking();
  for (const t of TIERS) out[t] = r[t].flat().map(id => [id]);
  return out;
}

export function isDrawn(r: Ranking, id: string): boolean {
  const t = tierOf(r, id);
  const lvl = t && r[t].find(l => l.includes(id));
  return !!lvl && lvl.indexOf(id) > 0;
}

/** Whether id can draw with the row above it: it has one, and the joined spot would hold at most MAX_TIE. */
export function canDraw(r: Ranking, id: string): boolean {
  const t = tierOf(r, id);
  if (!t) return false;
  const i = r[t].findIndex(l => l.includes(id));
  if (isDrawn(r, id)) return true;
  return i > 0 && r[t][i - 1].length + r[t][i].length <= MAX_TIE;
}

/** Draw with the row above (joins its spot), or, if already drawn, split off from it. */
export function toggleDraw(r: Ranking, id: string): void {
  if (!canDraw(r, id)) return;
  const t = tierOf(r, id)!;
  const levels = r[t];
  const i = levels.findIndex(l => l.includes(id));
  const lvl = levels[i];
  if (isDrawn(r, id)) {
    const cut = lvl.indexOf(id);
    levels.splice(i, 1, lvl.slice(0, cut), lvl.slice(cut));
  } else {
    levels.splice(i - 1, 2, [...levels[i - 1], ...lvl]);
  }
}

/**
 * The Finalize list as it opens: tier order, one spot each, and any knocked-down item this person
 * rated Must moved to the end of their Keens (it lost a head to head; moving it back up is theirs to do).
 */
export function finalListFrom(r: Ranking, knocked: string[]): Ranking {
  const out = emptyRanking();
  const down = r.must.flat().filter(id => knocked.includes(id));
  for (const t of TIERS) out[t] = r[t].flat().filter(id => !(t === 'must' && down.includes(id))).map(id => [id]);
  out.keen.push(...down.map(id => [id]));
  return out;
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

// Centred on the tier's points (Brittany 2026-10-15): summed over five people an uncentred bonus
// added about 2 points to every place, enough to pull in places someone Skipped.
export const ORDER_BONUS = 0.9;
// A Must that lost a head to head scores as the lowest a Keen can (D5: never ahead of a plain Keen).
export const KNOCKED_MUST = BASE.keen - ORDER_BONUS / 2;

export function score(r: Ranking, id: string): number {
  const t = tierOf(r, id);
  if (!t) return 0;
  const levels = r[t];
  if (levels.length < 2) return BASE[t];
  const i = levels.findIndex(l => l.includes(id));
  return BASE[t] + ORDER_BONUS * (0.5 - i / (levels.length - 1));
}

export function scoresFor(r: Ranking, ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map(id => [id, score(r, id)]));
}
