import { PEOPLE, type AppState, type Category, type Genre, type Item, type Person, type Slot, type Tier } from '../types';
import { tierOf } from './ranking';

export interface Award { id: string; winners: Person[]; value: number; unit: string }

interface Rule { id: string; unit: [string, string]; tiers: Tier[]; ids: Set<string> }

const WATER = /whale|boat|snorkel|dive|scuba/i;
const byCategory = (items: Item[], cats: Category[]) => items.filter(i => i.category && cats.includes(i.category)).map(i => i.id);
const byGenre = (genres: Genre[], gids: string[]) => genres.filter(g => gids.includes(g.id)).flatMap(g => g.items);
const bySlot = (items: Item[], slot: Slot) => items.filter(i => i.slot === slot).map(i => i.id);

/** Sea items: category Beach, genre beach or surf, or a name containing whale/boat/snorkel/dive/scuba (those listed in byName). */
export function seaItemIds(items: Item[], genres: Genre[]): { ids: Set<string>; byName: string[] } {
  const base = new Set([...byCategory(items, ['Beach']), ...byGenre(genres, ['beach', 'surf'])]);
  const byName = items.filter(i => WATER.test(i.name) && !base.has(i.id)).map(i => i.id);
  return { ids: new Set([...base, ...byName]), byName };
}

export interface Fork { forkId: string; a: string[]; b: string[] }

/** Own Must/Keen places each person voted away in the group rounds (the side they did not pick, or a genre 'drop'). */
export function favesGivenUp(state: AppState, forks: Fork[]): number[] {
  const byId = new Map(forks.map(f => [f.forkId, f]));
  return PEOPLE.map(p => {
    const ranking = state.responses[p]?.ranking;
    if (!ranking) return 0;
    const fave = (id: string) => { const t = tierOf(ranking, id); return t === 'must' || t === 'keen'; };
    const latest = new Map<string, 'a' | 'b'>();
    for (const v of state.votes) if (v.name === p) latest.set(v.forkId, v.choice);
    let n = 0;
    for (const [forkId, choice] of latest) {
      // Genre keep votes are one place per vote: 'b' drops it.
      const g = /^genre:[^:#]+:(.+)$/.exec(forkId);
      if (g) { if (choice === 'b' && fave(g[1])) n++; continue; }
      const f = byId.get(forkId);
      if (f) n += (choice === 'a' ? f.b : f.a).filter(fave).length;
    }
    return n;
  });
}

export function groupAwards(state: AppState, items: Item[], genres: Genre[], forks: Fork[] = []): Award[] {
  const all = new Set(items.map(i => i.id));
  const S = (...lists: string[][]) => new Set(lists.flat().filter(id => all.has(id)));
  const MK: Tier[] = ['must', 'keen'];
  const rules: Rule[] = [
    // Items rated Keen.
    { id: 'most-enthusiastic', unit: ['Keen', 'Keens'], tiers: ['keen'], ids: all },
    // Items rated Meh.
    { id: 'most-indifferent', unit: ['Meh', 'Mehs'], tiers: ['meh'], ids: all },
    // Must or Keen on category Wildlife or genre safari.
    { id: 'attenborough', unit: ['wildlife pick', 'wildlife picks'], tiers: MK, ids: S(byCategory(items, ['Wildlife']), byGenre(genres, ['safari'])) },
    // Must or Keen on sea items (seaItemIds).
    { id: 'poseidon', unit: ['sea pick', 'sea picks'], tiers: MK, ids: S([...seaItemIds(items, genres).ids]) },
    // Must or Keen on category Temple, History or Culture, or genre temple or ancient.
    { id: 'culture-vulture', unit: ['culture pick', 'culture picks'], tiers: MK, ids: S(byCategory(items, ['Temple', 'History', 'Culture']), byGenre(genres, ['temple', 'ancient'])) },
    // Must or Keen on category Hike, or genre longhike or viewpoint.
    { id: 'mountain-goat', unit: ['hike', 'hikes'], tiers: MK, ids: S(byCategory(items, ['Hike']), byGenre(genres, ['longhike', 'viewpoint'])) },
    // Must or Keen on items with slot sunrise.
    { id: 'early-bird', unit: ['sunrise pick', 'sunrise picks'], tiers: MK, ids: S(bySlot(items, 'sunrise')) },
    // Items rated Skip.
    { id: 'skipper', unit: ['Skip', 'Skips'], tiers: ['skip'], ids: all },
    // Must or Keen on category Food.
    { id: 'foodie', unit: ['food pick', 'food picks'], tiers: MK, ids: S(byCategory(items, ['Food'])) },
    // Must or Keen on category Train, or genre trainviews.
    { id: 'train-spotter', unit: ['train pick', 'train picks'], tiers: MK, ids: S(byCategory(items, ['Train']), byGenre(genres, ['trainviews'])) },
  ];
  const out: Award[] = [];
  for (const r of rules) {
    const scores = PEOPLE.map(p => {
      const ranking = state.responses[p]?.ranking;
      if (!ranking) return 0;
      let n = 0;
      for (const id of r.ids) { const t = tierOf(ranking, id); if (t && r.tiers.includes(t)) n++; }
      return n;
    });
    const top = Math.max(...scores);
    const winners = PEOPLE.filter((_, i) => scores[i] === top);
    // An award all five share says nothing about anyone, so it is left out like an all-zero one.
    if (top > 0 && winners.length < PEOPLE.length) out.push({ id: r.id, winners, value: top, unit: r.unit[top === 1 ? 0 : 1] });
  }
  // Brittany 2026-10-16: "biggest wetwipe = biggest pushover: gave up the most of their own faves for the group rounds".
  const given = favesGivenUp(state, forks);
  const topGiven = Math.max(...given);
  const wipes = PEOPLE.filter((_, i) => given[i] === topGiven);
  if (topGiven > 0 && wipes.length < PEOPLE.length) out.push({ id: 'wetwipe', winners: wipes, value: topGiven, unit: topGiven === 1 ? 'fave given up' : 'faves given up' });
  return out;
}
