import { PEOPLE, isGuest, stayForkId } from '../types';
import type { Area, CrewStays, Hub, Leg, Plan, PlaceSuggestion, Player, PrefAnswer, StayPin, StayRank, StayType, Vote } from '../types';
import { VOTES_TO_RESOLVE } from './group';
import { isExtraKey, parseNights, stretchLevel } from './prefs';
import { tallySides } from './votes';

// A 'noway' on a budget band caps the price at that band's upper edge; 85plus caps nothing. Keys from the retired
// four-band quiz (under30...) are absent on purpose: they are ignored, never remapped.
export const BUDGET_CAP_GBP: Record<string, number> = { under10: 10, '10to20': 20, '20to35': 35, '35to55': 55, '55to85': 85, '85plus': Infinity };

const ROOM_WORDS: Record<string, string> = { dorm: 'dorms', shared: 'shared rooms', private: 'private rooms' };
const TYPE_WORDS: Record<StayType, string> = { hostel: 'hostels', guesthouse: 'guesthouses', boutique: 'boutique stays', hotel: 'hotels', villa: 'villas', other: 'other stays' };

// noPreference and skipped never speak, so their picks are ignored even if stale.
const speaks = (p: PrefAnswer) => !p.noPreference && !p.skipped;
// The quiz's extra pick keys (see prefs.ts) are not options, so the generic readers skip them.
const noways = (prefs: PrefAnswer[], topic: PrefAnswer['topic']): string[] =>
  prefs.filter(p => p.topic === topic && speaks(p)).flatMap(p => Object.entries(p.picks).filter(([k, s]) => s === 'noway' && !isExtraKey(k)).map(([k]) => k));
const happies = (prefs: PrefAnswer[], topic: PrefAnswer['topic']): string[] =>
  prefs.filter(p => p.topic === topic && speaks(p)).flatMap(p => Object.entries(p.picks).filter(([k, s]) => s === 'happy' && !isExtraKey(k)).map(([k]) => k));
const rawKeys = (prefs: PrefAnswer[], topic: PrefAnswer['topic']): string[] =>
  prefs.filter(p => p.topic === topic && speaks(p)).flatMap(p => Object.keys(p.picks));

const STRETCH_GBP: Record<string, number> = { same: 0, plus20: 20, plus50: 50, anything: Infinity };

/** Most nights this person wants per stay type, from the quiz's `nights:<type>:<n>` picks. */
export function maxNightsOf(prefs: PrefAnswer[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of rawKeys(prefs, 'stayType')) {
    const nights = parseNights(k);
    if (nights) out[nights.type] = nights.n;
  }
  return out;
}

/** The longest-journey answer ('under2h' | '2to3h' | '3to4h' | 'bigday'), for journeyFlags limits. */
export const journeyLimitOf = (prefs: PrefAnswer[]): string | undefined => happies(prefs, 'journey')[0];

/** Keys like `rooms:dorm`, `stayType:hostel`, `budget:under10`. */
export function hardNos(prefs: PrefAnswer[]): Set<string> {
  const out = new Set<string>();
  for (const t of ['stayType', 'rooms', 'budget'] as const) for (const k of noways(prefs, t)) out.add(`${t}:${k}`);
  return out;
}

// The quiz asks a band (a happy pick) and how far they would stretch; the price they can take is band + stretch.
// A 'noway' band still caps as before.
export const budgetCap = (prefs: PrefAnswer[]): number => {
  const band = happies(prefs, 'budget').find(k => k in BUDGET_CAP_GBP);
  const stretchKey = rawKeys(prefs, 'budget').map(stretchLevel).find(l => l !== undefined);
  const fromBand = band === undefined ? Infinity : (BUDGET_CAP_GBP[band] ?? Infinity) + (STRETCH_GBP[stretchKey ?? 'same'] ?? 0);
  return Math.min(fromBand, ...noways(prefs, 'budget').map(k => BUDGET_CAP_GBP[k] ?? Infinity));
};

export interface StayWarnings { count: number; messages: string[] }

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`);

/** Dealbreakers warn, never exclude, and counts only: no message may identify who objected. */
export function warnings(stay: PlaceSuggestion, crew: CrewStays[]): StayWarnings {
  let type = 0, room = 0, budget = 0;
  for (const c of crew) {
    if (stay.stayType && noways(c.prefs, 'stayType').includes(stay.stayType)) type++;
    if (stay.rooms && noways(c.prefs, 'rooms').includes(stay.rooms)) room++;
    if (stay.priceGbp !== undefined && stay.priceGbp > budgetCap(c.prefs)) budget++;
  }
  const messages: string[] = [];
  if (type) messages.push(`${people(type)} won't do ${TYPE_WORDS[stay.stayType!]}`);
  if (room) messages.push(`${people(room)} won't do ${ROOM_WORDS[stay.rooms!]}`);
  if (budget) messages.push(budget === 1 ? "1 person's budget is under this" : `${budget} people's budgets are under this`);
  return { count: type + room + budget, messages };
}

const TYPE_SINGULAR: Record<StayType, string> = { hostel: 'a hostel', guesthouse: 'a guesthouse', boutique: 'a boutique stay', hotel: 'a hotel', villa: 'a villa', other: 'another kind of stay' };

/** maxNightsByPerson is person -> stay type -> most nights they want there; nights over it warn. */
export function nightsWarnings(stay: PlaceSuggestion, nightsInArea: number, maxNightsByPerson: Record<string, Record<string, number>>): StayWarnings {
  if (!stay.stayType) return { count: 0, messages: [] };
  const byLimit = new Map<number, number>();
  for (const limits of Object.values(maxNightsByPerson)) {
    const max = limits[stay.stayType];
    if (max !== undefined && nightsInArea > max) byLimit.set(max, (byLimit.get(max) ?? 0) + 1);
  }
  const messages = [...byLimit].sort((x, y) => x[0] - y[0]).map(([max, n]) => `${people(n)} ${n === 1 ? 'wants' : 'want'} max ${max} ${max === 1 ? 'night' : 'nights'} in ${TYPE_SINGULAR[stay.stayType!]}`);
  return { count: [...byLimit.values()].reduce((a, b) => a + b, 0), messages };
}

/** The five crew, plus the guest using the sandbox. */
export const stayParticipants = (me: Player | null): Player[] => (isGuest(me) ? [...PEOPLE, me] : [...PEOPLE]);

export const voteOpen = (crew: Partial<Record<Player, CrewStays>>, participants: Player[], forceOpen = false): boolean =>
  forceOpen || participants.every(p => crew[p]?.locked === true);

// Prior art: ideaKey in openItems.ts keys on title+area; the area is already fixed here so only the title is needed.
const titleKey = (s: { title: string }) => s.title.trim().toLowerCase().replace(/\s+/g, ' ');
const sameStay = (a: PlaceSuggestion, b: PlaceSuggestion) => (a.hostelId && b.hostelId ? a.hostelId === b.hostelId : titleKey(a) === titleKey(b));
const earliest = (a: PlaceSuggestion, b: PlaceSuggestion) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export type RanksByPerson = Partial<Record<Player, Partial<Record<Area, StayRank>>>>;
export interface StayScore { id: string; title: string; createdAt: string; points: number; merged: string[] }

/** Live stays in the area, duplicates merged; the earliest suggestion represents each group. */
function candidates(suggestions: PlaceSuggestion[], area: Area): { rep: PlaceSuggestion; ids: string[] }[] {
  const live = suggestions.filter(s => s.kind === 'stay' && s.area === area && s.status === 'live').sort(earliest);
  const groups: PlaceSuggestion[][] = [];
  for (const s of live) {
    const hit = groups.find(g => g.some(m => sameStay(m, s)));
    if (hit) hit.push(s); else groups.push([s]);
  }
  return groups.map(g => ({ rep: g[0], ids: g.map(m => m.id) }));
}

export function rankPoints(suggestions: PlaceSuggestion[], ranks: RanksByPerson, area: Area): StayScore[] {
  const cands = candidates(suggestions, area);
  const repOf = new Map(cands.flatMap(c => c.ids.map(id => [id, c.rep.id] as const)));
  const points = new Map(cands.map(c => [c.rep.id, 0]));
  for (const byArea of Object.values(ranks)) {
    const r = byArea?.[area];
    if (!r) continue;
    const first = r.first ? repOf.get(r.first) : undefined;
    const second = r.second ? repOf.get(r.second) : undefined;
    if (first) points.set(first, points.get(first)! + 2);
    if (second && second !== first) points.set(second, points.get(second)! + 1);
  }
  return cands
    .map(c => ({ id: c.rep.id, title: c.rep.title, createdAt: c.rep.createdAt, points: points.get(c.rep.id)!, merged: c.ids }))
    .sort((a, b) => b.points - a.points || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
}

// `warnings` holds only finalists that carry at least one; absent means none do.
type Warned = { warnings?: Record<string, StayWarnings> };
export type Finalists = { empty: true } | ({ auto: string } & Warned) | ({ finalists: [string, string]; tieBreak: string | null } & Warned);

export function finalists(suggestions: PlaceSuggestion[], ranks: RanksByPerson, area: Area, crew: CrewStays[]): Finalists {
  const scored = rankPoints(suggestions, ranks, area);
  const attach = (ids: string[]): Warned => {
    const w: Record<string, StayWarnings> = {};
    for (const id of ids) {
      const found = warnings(suggestions.find(s => s.id === id)!, crew);
      if (found.count > 0) w[id] = found;
    }
    return Object.keys(w).length ? { warnings: w } : {};
  };
  if (scored.length === 0) return { empty: true };
  if (scored.length === 1) return { auto: scored[0].id, ...attach([scored[0].id]) };
  if (scored.length === 2) {
    const [a, b] = [...scored].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : x.id < y.id ? -1 : 1));
    return { finalists: [a.id, b.id], tieBreak: null, ...attach([a.id, b.id]) };
  }
  const [a, b, c] = scored;
  const tieBreak = b.points === c.points ? `Tied on ${b.points} points, "${b.title}" goes through because it was suggested first` : null;
  return { finalists: [a.id, b.id], tieBreak, ...attach([a.id, b.id]) };
}

export function stayResult(area: Area, pair: [string, string], votes: Vote[], participants: Player[]): { winner: string | null; a: Player[]; b: Player[] } {
  const fork = stayForkId(area, pair[0], pair[1]);
  const { a, b } = tallySides(votes, fork, participants);
  const winner = a.length >= VOTES_TO_RESOLVE ? pair[0] : b.length >= VOTES_TO_RESOLVE ? pair[1] : null;
  return { winner, a, b };
}

/** Pin beats the vote; the latest pin per area wins and a null suggestionId is an unpin. */
export function finalStay(area: Area, pins: StayPin[], winner: string | null): { id: string | null; pinned: boolean } {
  const mine = pins.filter(p => p.area === area);
  const pin = mine.reduce<StayPin | null>((best, p) => (!best || p.at >= best.at ? p : best), null);
  if (pin && pin.suggestionId !== null) return { id: pin.suggestionId, pinned: true };
  return { id: winner, pinned: false };
}

export function scoutAssignments(areas: Area[], participants: Player[]): Partial<Record<Area, Player>> {
  const people = [...new Set(participants)].sort();
  const out: Partial<Record<Area, Player>> = {};
  if (people.length === 0) return out;
  [...new Set(areas)].forEach((a, i) => { out[a] = people[i % people.length]; });
  return out;
}

export const stayAreas = (plan: Plan): Area[] => [...new Set(plan.days.map(d => d.area).filter((a): a is Area => a !== null))];

export interface StayConflict { key: string; no: string[]; happy: string[] }
export interface GroupSummary { total: number; happy: Record<string, string[]>; hardNos: Record<string, string[]>; conflicts: StayConflict[] }

export function groupSummary(crew: CrewStays[]): GroupSummary {
  const happy: Record<string, string[]> = {}, nos: Record<string, string[]> = {};
  const add = (m: Record<string, string[]>, key: string, who: string) => { (m[key] ??= []).push(who); };
  for (const c of crew) for (const t of ['stayType', 'rooms'] as const) {
    happies(c.prefs, t).forEach(k => add(happy, `${t}:${k}`, c.name));
    noways(c.prefs, t).forEach(k => add(nos, `${t}:${k}`, c.name));
  }
  const conflicts = Object.keys(nos)
    .filter(k => (happy[k]?.length ?? 0) * 2 > crew.length)
    .map(k => ({ key: k, no: nos[k], happy: happy[k] }));
  return { total: crew.length, happy, hardNos: nos, conflicts };
}

/** Nights spent per area: each day counts once, travel days (null area) count nowhere. */
export function nightsByArea(plan: Plan): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {};
  for (const d of plan.days) if (d.area !== null) out[d.area] = (out[d.area] ?? 0) + 1;
  return out;
}

const DRIVE_CAP_H: Record<string, number> = { under2h: 2, '2to3h': 3, '3to4h': 4 };

/** Drives longer than someone's cap, as counts of people; bigday and unknown answers cap nothing. */
export function journeyFlags(plan: Plan, legs: Leg[], limits: Partial<Record<Player, string>>): { from: Hub; to: Hub; hours: number; over: number }[] {
  const caps = Object.values(limits).map(a => DRIVE_CAP_H[a ?? ''] ?? Infinity);
  const out: { from: Hub; to: Hub; hours: number; over: number }[] = [];
  for (let i = 0; i + 1 < plan.route.length; i++) {
    const from = plan.route[i], to = plan.route[i + 1];
    const leg = legs.find(l => (l.a === from && l.b === to) || (l.a === to && l.b === from));
    if (!leg) continue;
    const over = caps.filter(c => leg.hours > c).length;
    if (over > 0) out.push({ from, to, hours: leg.hours, over });
  }
  return out;
}
