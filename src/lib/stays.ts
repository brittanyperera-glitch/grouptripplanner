import { PEOPLE, isGuest, stayForkId } from '../types';
import type { Area, CrewStays, Plan, PlaceSuggestion, Player, PrefAnswer, StayPin, StayRank, StayType, Vote } from '../types';
import { VOTES_TO_RESOLVE } from './group';

// A 'noway' on a budget band caps the price at that band's upper edge; 100plus caps nothing.
export const BUDGET_CAP_GBP: Record<string, number> = { under30: 30, '30to60': 60, '60to100': 100, '100plus': Infinity };

const ROOM_WORDS: Record<string, string> = { dorm: 'dorms', shared: 'shared rooms', private: 'private rooms' };
const TYPE_WORDS: Record<StayType, string> = { hostel: 'hostels', guesthouse: 'guesthouses', boutique: 'boutique stays', hotel: 'hotels', villa: 'villas', other: 'other stays' };

// noPreference and skipped never speak, so their picks are ignored even if stale.
const speaks = (p: PrefAnswer) => !p.noPreference && !p.skipped;
const noways = (prefs: PrefAnswer[], topic: PrefAnswer['topic']): string[] =>
  prefs.filter(p => p.topic === topic && speaks(p)).flatMap(p => Object.entries(p.picks).filter(([, s]) => s === 'noway').map(([k]) => k));
const happies = (prefs: PrefAnswer[], topic: PrefAnswer['topic']): string[] =>
  prefs.filter(p => p.topic === topic && speaks(p)).flatMap(p => Object.entries(p.picks).filter(([, s]) => s === 'happy').map(([k]) => k));

/** Keys like `rooms:dorm`, `stayType:hostel`, `budget:under30`. */
export function hardNos(prefs: PrefAnswer[]): Set<string> {
  const out = new Set<string>();
  for (const t of ['stayType', 'rooms', 'budget'] as const) for (const k of noways(prefs, t)) out.add(`${t}:${k}`);
  return out;
}

const budgetCap = (prefs: PrefAnswer[]) => Math.min(Infinity, ...noways(prefs, 'budget').map(k => BUDGET_CAP_GBP[k] ?? Infinity));

export function eligible(stay: PlaceSuggestion, crew: CrewStays[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const c of crew) {
    if (stay.stayType && noways(c.prefs, 'stayType').includes(stay.stayType)) reasons.push(`${c.name} won't do ${TYPE_WORDS[stay.stayType]}`);
    if (stay.rooms && noways(c.prefs, 'rooms').includes(stay.rooms)) reasons.push(`${c.name} won't do ${ROOM_WORDS[stay.rooms]}`);
    const cap = budgetCap(c.prefs);
    if (stay.priceGbp !== undefined && stay.priceGbp > cap) reasons.push(`${c.name} won't pay over £${cap}`);
  }
  return { ok: reasons.length === 0, reasons };
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

export type Finalists = { empty: true } | { auto: string } | { finalists: [string, string]; tieBreak: string | null };

export function finalists(suggestions: PlaceSuggestion[], ranks: RanksByPerson, area: Area, crew: CrewStays[]): Finalists {
  const ok = suggestions.filter(s => eligible(s, crew).ok);
  const scored = rankPoints(ok, ranks, area);
  if (scored.length === 0) return { empty: true };
  if (scored.length === 1) return { auto: scored[0].id };
  if (scored.length === 2) {
    const [a, b] = [...scored].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : x.id < y.id ? -1 : 1));
    return { finalists: [a.id, b.id], tieBreak: null };
  }
  const [a, b, c] = scored;
  const tieBreak = b.points === c.points ? `Tied on ${b.points} points, "${b.title}" goes through because it was suggested first` : null;
  return { finalists: [a.id, b.id], tieBreak };
}

export function stayResult(area: Area, pair: [string, string], votes: Vote[], participants: Player[]): { winner: string | null; a: Player[]; b: Player[] } {
  const fork = stayForkId(area, pair[0], pair[1]);
  const latest = new Map<Player, 'a' | 'b'>();
  for (const v of votes) if (v.forkId === fork && participants.includes(v.name)) latest.set(v.name, v.choice);
  const side = (c: 'a' | 'b') => participants.filter(p => latest.get(p) === c);
  const a = side('a'), b = side('b');
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
