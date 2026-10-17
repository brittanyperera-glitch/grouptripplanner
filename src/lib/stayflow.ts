import hostelData from '../content/hostels.json';
import { AREAS, AREA_HUB, EMPTY_STAYS, stayForkId } from '../types';
import type { AppState, Area, CrewStays, PlaceKind, PlaceSuggestion, Plan, Player, RoomType, StayType, StaysAdmin, Vote } from '../types';
import { finalists, livePin, maxNightsOf, nightsByArea, nightsWarnings, rankPoints, scoutAssignments, stayAreas, stayParticipants, stayResult, voteOpen, warnings } from './stays';
import type { RanksByPerson } from './stays';

export const STEPS = ['quiz', 'suggest', 'lock', 'rank', 'final'] as const;
export type Step = (typeof STEPS)[number];

export interface FlowInput { quizDone: boolean; mine: number; locked: boolean; voteOpen: boolean; ranked: boolean }

/** The step I am on is the first one not finished, so it can never skip ahead; `done` is always the steps before it. */
export function flow(i: FlowInput): { current: Step; done: Step[] } {
  const current: Step = !i.quizDone ? 'quiz'
    : !i.locked ? (i.mine > 0 ? 'lock' : 'suggest')
      : !i.voteOpen ? 'lock'
        : !i.ranked ? 'rank'
          : 'final';
  return { current, done: STEPS.slice(0, STEPS.indexOf(current)) };
}

export interface Hostel {
  id: string; name: string; hub: string; bookUrl: string; bunkGbp: number | null; roomGbp: number | null; roomFor: number | null;
  photo: { file: string };
}
export const HOSTELS = (hostelData as unknown as { hostels: Hostel[] }).hostels;

// The guide's hubs are not all areas. Tissa and Yala sit in the same area as Udawalawe (AREA_HUB names only Udawalawe), the
// airport night at Negombo hangs off the Colombo end of the route, and Arugam Bay is off the route entirely.
export const HUB_AREA: Record<string, Area | null> = {
  ...Object.fromEntries(AREAS.map(a => [AREA_HUB[a], a])),
  Tissa: 'Wild south', AIR: 'Colombo', 'Off route': null,
};
export const hostelsFor = (area: Area): Hostel[] => HOSTELS.filter(h => HUB_AREA[h.hub] === area);
export const hostelOf = (id?: string): Hostel | undefined => (id ? HOSTELS.find(h => h.id === id) : undefined);

/** A bunk if there is one, else the room price shared out; null when the guide has no price. */
export const hostelPrice = (h: Hostel): number | null =>
  h.bunkGbp ?? (h.roomGbp !== null && h.roomFor ? Math.round((h.roomGbp / h.roomFor) * 100) / 100 : null);

export const photoOf = (s: PlaceSuggestion): string | undefined => {
  if (s.photo) return s.photo;
  const h = hostelOf(s.hostelId);
  return h ? `/img/hostels/${h.photo.file}` : undefined;
};

export const gbp = (n: number) => `£${n.toFixed(2).replace(/\.00$/, '')}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Only web links ever reach an href or an img src. A missing scheme is added; anything else is rejected. */
export function parseUrl(raw: string): { ok: true; url?: string } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true };
  const full = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(full);
    return u.protocol === 'https:' || u.protocol === 'http:' ? { ok: true, url: u.toString() } : { ok: false };
  } catch { return { ok: false }; }
}

export const KIND_LABEL: Record<PlaceKind, string> = { stay: 'Stay', eat: 'Eat', do: 'Do', gem: 'Gems' };
export const TYPE_LABEL: Record<StayType, string> = { hostel: 'Hostel', guesthouse: 'Guesthouse', boutique: 'Boutique', hotel: 'Hotel', villa: 'Villa', other: 'Other' };
export const ROOM_LABEL: Record<RoomType, string> = { dorm: 'Dorm', shared: 'Shared room', private: 'Private room' };

export interface StayCtx {
  me: Player; participants: Player[]; crew: CrewStays[]; crewOf: Partial<Record<Player, CrewStays>>;
  suggestions: PlaceSuggestion[]; admin: StaysAdmin; votes: Vote[];
  areas: Area[]; nights: Partial<Record<Area, number>>; derivedNights?: Partial<Record<Area, number>>; maxNights: Record<string, Record<string, number>>;
}

/** Accommodation nights: Brittany's override where she set one, else the itinerary's count. The day plan itself is never changed. */
export const effectiveNights = (derived: Partial<Record<Area, number>>, override: StaysAdmin['nights']): Partial<Record<Area, number>> =>
  Object.fromEntries(Object.entries(derived).map(([a, n]) => [a, override?.[a as Area] ?? n])) as Partial<Record<Area, number>>;

/** One short line when the stay nights differ from the itinerary, else null. */
export const nightsNote = (ctx: StayCtx, area: Area): string | null => {
  const d = ctx.derivedNights?.[area];
  const n = ctx.nights[area];
  return d !== undefined && n !== undefined && n !== d ? STAY_COPY.nightsNote(d) : null;
};

export function stayCtx(state: AppState, me: Player, plan: Plan | null): StayCtx {
  const stays = state.stays ?? EMPTY_STAYS;
  const participants = stayParticipants(me);
  const crew = participants.flatMap(p => stays.crew[p] ?? []);
  return {
    me, participants, crew, crewOf: stays.crew, suggestions: stays.suggestions, admin: stays.admin, votes: state.votes,
    areas: plan ? stayAreas(plan) : [], nights: plan ? effectiveNights(nightsByArea(plan), stays.admin.nightsOff ? undefined : stays.admin.nights) : {}, derivedNights: plan ? nightsByArea(plan) : {},
    maxNights: Object.fromEntries(crew.map(c => [c.name, maxNightsOf(c.prefs)])),
  };
}

export const liveStays = (ctx: StayCtx, area: Area): PlaceSuggestion[] =>
  ctx.suggestions.filter(s => s.kind === 'stay' && s.area === area && s.status === 'live')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));

/** Plain counts only, never who: the engine's messages already carry no names. */
export function warnLines(ctx: StayCtx, s: PlaceSuggestion): string[] {
  return [
    ...warnings(s, ctx.crew).messages,
    ...nightsWarnings(s, ctx.nights[s.area] ?? 0, ctx.maxNights).messages,
  ];
}

export const scoutOf = (ctx: StayCtx, area: Area): Player | undefined => ctx.admin.scouts[area] ?? scoutAssignments(ctx.areas, ctx.participants)[area];

const ranksOf = (ctx: StayCtx): RanksByPerson => Object.fromEntries(ctx.participants.map(p => [p, ctx.crewOf[p]?.ranks ?? {}]));
export const rankedBy = (ctx: StayCtx, p: Player, area: Area): boolean => {
  const r = ctx.crewOf[p]?.ranks[area];
  return !!r?.first && !!r?.second;
};
/** Areas with three or more distinct stays are ranked; fewer skip straight on, and so do a pinned and a closed area. */
export const rankAreas = (ctx: StayCtx): Area[] => ctx.areas.filter(a => !livePin(a, ctx.admin.pins, ctx.suggestions, null).pinned && !ctx.admin.closed.includes(a) && rankPoints(ctx.suggestions, {}, a).length >= 3);

export type Outcome =
  | { kind: 'empty' }
  | { kind: 'wait'; ranked: number }
  | { kind: 'vote'; pair: [string, string]; tieBreak: string | null; a: Player[]; b: Player[]; warns: Record<string, string[]> }
  | { kind: 'decided'; id: string; via: 'vote' | 'only' | 'pin' };

/** Where a destination stands once voting is open. A pin beats everything; 3+ stays wait for everyone's top 2 unless Brittany closed ranking, then the ranks in are used. */
export function outcome(ctx: StayCtx, area: Area): Outcome {
  const pin = livePin(area, ctx.admin.pins, ctx.suggestions, null);
  if (pin.pinned && pin.id) return { kind: 'decided', id: pin.id, via: 'pin' };
  const scored = rankPoints(ctx.suggestions, {}, area).length;
  if (scored >= 3) {
    const ranked = ctx.participants.filter(p => rankedBy(ctx, p, area)).length;
    if (ranked < ctx.participants.length && !ctx.admin.closed.includes(area)) return { kind: 'wait', ranked };
  }
  const f = finalists(ctx.suggestions, ranksOf(ctx), area, ctx.crew);
  if ('empty' in f) return { kind: 'empty' };
  if ('auto' in f) return { kind: 'decided', id: f.auto, via: 'only' };
  const res = stayResult(area, f.finalists, ctx.votes, ctx.participants);
  if (res.winner) return { kind: 'decided', id: res.winner, via: 'vote' };
  const warns: Record<string, string[]> = {};
  for (const id of f.finalists) { const s = ctx.suggestions.find(x => x.id === id); warns[id] = s ? warnLines(ctx, s) : []; }
  return { kind: 'vote', pair: f.finalists, tieBreak: f.tieBreak, a: res.a, b: res.b, warns };
}

export const forkOf = (area: Area, pair: [string, string]) => stayForkId(area, pair[0], pair[1]);

export interface StayStatus {
  quizDone: boolean; locked: boolean; open: boolean; mine: PlaceSuggestion[]; lockedCount: number;
  rankAreas: Area[]; ranked: boolean; current: Step; done: Step[];
}

export function stayStatus(ctx: StayCtx): StayStatus {
  const me = ctx.crewOf[ctx.me];
  const quizDone = me?.quizDone === true, locked = me?.locked === true;
  const mine = ctx.suggestions.filter(s => s.kind === 'stay' && s.name === ctx.me && s.status === 'live' && ctx.areas.includes(s.area));
  const open = voteOpen(ctx.crewOf, ctx.participants);
  const need = rankAreas(ctx);
  const ranked = need.every(a => rankedBy(ctx, ctx.me, a));
  return {
    quizDone, locked, open, mine, lockedCount: ctx.participants.filter(p => ctx.crewOf[p]?.locked).length,
    rankAreas: need, ranked, ...flow({ quizDone, mine: mine.length, locked, voteOpen: open, ranked }),
  };
}

/** All the words the Stays screens print, in one place so a test can hold every string to the length ceiling. */
export const STAY_COPY = {
  steps: { quiz: 'Quiz', suggest: 'Suggest', lock: 'Lock in', rank: 'Rank', final: 'Final' } as Record<Step, string>,
  stepsLabel: 'Stays steps',
  back: 'Back',
  noRoute: 'Stays opens when the route locks.',
  loading: 'Working out the route.',
  quiz: { title: 'Your travel profile', sub: 'Eight quick questions. Only counts show, never who said what.', go: 'Start my travel profile' },
  suggest: { title: 'Where do we sleep?', sub: 'Add the stays you would back. Zero is fine.', go: 'Add a stay', none: 'I have none to add' },
  lock: { title: 'Ready to lock in?', sub: (n: number) => `${plural(n, 'stay')} from you. Edits stop after this.`, go: (n: number) => `Lock in my stays (${n})`, more: 'Add another stay' },
  waiting: { headline: 'Locked in', sub: 'Waiting on the others.', label: 'Who has locked in', done: 'locked in', wait: 'still to lock', caption: (n: number, of: number) => `${n} of ${of} locked` },
  rank: { title: 'Pick your top 2', sub: 'First place gets 2 points, second gets 1.', go: 'Pick my top 2', waitHead: 'Top 2 is in', waitSub: 'Waiting on the others to pick.', caption: (n: number, of: number) => `${n} of ${of} picked`, label: 'Who has picked', done: 'picked', wait: 'still to pick' },
  final: { title: 'Head to head', sub: 'Two finalists per place. Three votes settle it.', go: 'Head to head', waiting: 'Waiting on the others to pick their top 2.', set: 'Your stays are set', setSub: 'One stay per place.' },
  closeRank: { go: (area: string) => `Close ranking for ${area}`, hint: 'Goes ahead with the top 2s already in.' },
  scout: (names: string) => `You scout ${names}`,
  scoutTag: 'You scout',
  destinations: 'Where we stay',
  nightsNote: (itinerary: number) => `Brittany set these stay nights. The itinerary still has ${itinerary} ${itinerary === 1 ? 'night' : 'nights'}.`,
  nightsStep: { label: (area: string) => `Stay nights in ${area}`, less: 'Fewer nights', more: 'More nights', unit: (n: number) => (n === 1 ? 'night' : 'nights') },
  row: (area: string, nights: number, stays: number) => `${area}, ${plural(nights, 'night')}, ${plural(stays, 'stay')}`,
  board: { header: (area: string, nights: number) => `${area}, ${plural(nights, 'night')}`, add: '+ Add a stay', quizFirst: 'Do your travel profile first, 3 min', lockedLine: 'You locked in. Edits stop here.', none: 'No stays yet.', noneOther: 'Nothing here yet.', addIdea: '+ Add an idea', pin: 'Pin as final', unpin: 'Unpin', locked: 'Locked', edit: 'Edit', withdraw: 'Withdraw', book: 'See and book', night: 'per person per night', offRoute: 'Not on the route now.' },
  react: { yes: 'Interested', no: 'Not for me' },
  sheet: {
    title: 'Add a stay', edit: 'Edit your stay', close: 'Close', save: 'Add this stay', saveEdit: 'Save changes',
    guide: "Choose from the guide's hostels", guideNone: 'Pick one to fill it in', link: 'Link', name: 'Name', price: 'Price per person per night (GBP)', priceHint: 'Needed unless you chose a guide hostel.',
    rooms: 'Room setup', type: 'Stay type',
    kind: 'What are you adding?', titleIdea: 'Add an idea', cost: 'Rough cost per person (GBP, optional)', saveIdea: 'Add this idea', whyIdea: 'Why it is good (optional, one line)', why: 'Why (optional, one line)', photo: 'Photo link (optional)', where: 'Destination', badLink: 'Use a web link starting with https.',
  },
  admin: { unlockTitle: 'Reopen a stays list', unlock: (name: string) => `Unlock ${name}` },
  lockPage: { title: 'Lock in my stays', note: 'Edits stop after this.', go: 'Lock in my stays', empty: 'No stays from you yet.' },
  rankPage: { title: (area: string) => `Your top 2 in ${area}`, sub: 'Tap your first pick, then your second. Tap again to clear.', go: 'Submit my top 2', card: (t: string) => `Rank ${t}`, auto: 'Only one stay here, so it is picked.', two: 'Two stays here, so on to the head to head.', zero: 'Nobody suggested a stay here.' },
  vote: {
    title: 'Head to head', price: (p: string) => `${p} pp/night`, heads: (n: number) => (n === 1 ? '1 heads-up' : `${n} heads-ups`), vs: 'VS', vote: 'Vote', voteFor: 'Vote for this', voted: 'Voted', tally: (n: number, of: number) => `${n} of ${of} voted`, details: (t: string) => `Details of ${t}`,
    nothing: 'Nothing to vote on yet.', waitRank: 'Waiting on the others to pick their top 2.', empty: 'Nobody suggested a stay here.', decided: (n: number) => `Decided ${n}`,
    pinned: "Brittany's pick", only: 'the only stay suggested', byVote: 'won the vote', close: 'Close', yours: 'Your vote',
  },
};
