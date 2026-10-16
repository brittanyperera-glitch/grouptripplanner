import { describe, it, expect } from 'vitest';
import { PEOPLE, stayForkId } from '../types';
import type { Area, CrewStays, Day, Plan, PlaceSuggestion, Player, PrefAnswer, StayPin, StayRank, Vote } from '../types';
import { VOTES_TO_RESOLVE } from './group';
import { BUDGET_CAP_GBP, eligible, finalStay, finalists, groupSummary, hardNos, rankPoints, scoutAssignments, stayAreas, stayParticipants, stayResult, voteOpen } from './stays';

const AREAS: Area[] = ['Colombo', 'Ella', 'Kitulgala', 'Hill country'];
const TYPES = ['hostel', 'guesthouse', 'boutique', 'hotel', 'villa', 'other'] as const;
const ROOMS = ['dorm', 'shared', 'private'] as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const pref = (topic: PrefAnswer['topic'], picks: PrefAnswer['picks'], o: Partial<PrefAnswer> = {}): PrefAnswer => ({ topic, picks, noPreference: false, skipped: false, ...o });
const person = (name: Player, prefs: PrefAnswer[] = [], o: Partial<CrewStays> = {}): CrewStays => ({ name, prefs, quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '', ...o });
const stay = (id: string, o: Partial<PlaceSuggestion> = {}): PlaceSuggestion => ({ id, name: 'Alex', area: 'Ella', kind: 'stay', title: `Stay ${id}`, status: 'live', createdAt: `2026-10-${String(10 + Number(id.replace(/\D/g, '') || 0)).padStart(2, '0')}`, ...o });

function randomCrew(r: () => number, withNoPref: boolean): CrewStays[] {
  return PEOPLE.map(n => {
    const prefs: PrefAnswer[] = [];
    const flag = withNoPref && r() < 0.4 ? { noPreference: r() < 0.5, skipped: true } : {};
    if (r() < 0.6) prefs.push(pref('stayType', { [pick(r, TYPES)]: 'noway' }, flag));
    if (r() < 0.5) prefs.push(pref('rooms', { [pick(r, ROOMS)]: 'noway' }, flag));
    if (r() < 0.4) prefs.push(pref('budget', { [pick(r, Object.keys(BUDGET_CAP_GBP))]: 'noway' }, flag));
    return person(n, prefs);
  });
}
function randomStays(r: () => number): PlaceSuggestion[] {
  const n = Math.floor(r() * 7);
  return Array.from({ length: n }, (_, i) => stay(`s${i}`, {
    stayType: r() < 0.8 ? pick(r, TYPES) : undefined, rooms: r() < 0.7 ? pick(r, ROOMS) : undefined,
    priceGbp: r() < 0.8 ? Math.floor(r() * 150) : undefined, title: `Place ${i}`, createdAt: `2026-10-${String(10 + i).padStart(2, '0')}`,
    status: r() < 0.15 ? 'withdrawn' : 'live',
  }));
}
function randomRanks(r: () => number, stays: PlaceSuggestion[]) {
  const ranks: Partial<Record<Player, Partial<Record<Area, StayRank>>>> = {};
  for (const n of PEOPLE) if (stays.length && r() < 0.8) ranks[n] = { Ella: { first: pick(r, stays).id, second: r() < 0.7 ? pick(r, stays).id : undefined } };
  return ranks;
}
const idsOf = (f: ReturnType<typeof finalists>): string[] => ('finalists' in f ? f.finalists : 'auto' in f ? [f.auto] : []);

describe('hardNos and eligible', () => {
  it('maps stay type, rooms and budget to a group exclusion naming who and what', () => {
    const crew = [person('Lazza', [pref('rooms', { dorm: 'noway' })]), person('Alex', [pref('stayType', { hostel: 'noway' })]), person('Antek', [pref('budget', { '30to60': 'noway' })])];
    expect(eligible(stay('s1', { rooms: 'dorm' }), crew)).toEqual({ ok: false, reasons: ["Lazza won't do dorms"] });
    expect(eligible(stay('s2', { stayType: 'hostel' }), crew).reasons).toEqual(["Alex won't do hostels"]);
    expect(eligible(stay('s3', { priceGbp: 61 }), crew).reasons).toEqual(["Antek won't pay over £60"]);
    expect(eligible(stay('s4', { priceGbp: 60, rooms: 'private', stayType: 'villa' }), crew).ok).toBe(true);
  });
  it('a hard NO applies only to the decision it concerns', () => {
    const crew = [person('Lazza', [pref('rooms', { dorm: 'noway' })])];
    expect(eligible(stay('s1', { stayType: 'hostel', rooms: 'private', priceGbp: 500 }), crew).ok).toBe(true);
    expect(eligible(stay('s2'), crew).ok).toBe(true);
  });
  it('budget bands map to caps and 100plus excludes nothing', () => {
    expect(BUDGET_CAP_GBP).toEqual({ under30: 30, '30to60': 60, '60to100': 100, '100plus': Infinity });
    expect(eligible(stay('s1', { priceGbp: 9999 }), [person('Alex', [pref('budget', { '100plus': 'noway' })])]).ok).toBe(true);
  });
  it('happy picks are not hard NOs', () => {
    expect([...hardNos([pref('stayType', { hostel: 'happy', villa: 'noway' })])]).toEqual(['stayType:villa']);
  });
  it('property (a): an ineligible stay is never a finalist', () => {
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
      const crew = randomCrew(r, true), stays = randomStays(r), ranks = randomRanks(r, stays);
      const bad = new Set(stays.filter(s => !eligible(s, crew).ok).map(s => s.id));
      // A merged duplicate may be represented by a different id, so check eligibility of the representative.
      for (const id of idsOf(finalists(stays, ranks, 'Ella', crew))) expect(bad.has(id)).toBe(false);
    }
  });
  it('property (b): noPreference and skipped never change eligibility or points', () => {
    const r = rng(22);
    for (let i = 0; i < 200; i++) {
      const crew = randomCrew(r, false), stays = randomStays(r), ranks = randomRanks(r, stays);
      const muted = crew.map(c => ({ ...c, prefs: [...c.prefs, pref('stayType', Object.fromEntries(TYPES.map(t => [t, 'noway' as const])), { noPreference: true }), pref('rooms', Object.fromEntries(ROOMS.map(t => [t, 'noway' as const])), { skipped: true })] }));
      for (const s of stays) expect(eligible(s, muted)).toEqual(eligible(s, crew));
      expect(finalists(stays, ranks, 'Ella', muted)).toEqual(finalists(stays, ranks, 'Ella', crew));
    }
  });
});

describe('participants and the vote gate', () => {
  it('property (d): voteOpen is false until every participant locked; a guest adds themselves', () => {
    expect(stayParticipants('Brittany')).toEqual(PEOPLE);
    expect(stayParticipants(null)).toEqual(PEOPLE);
    expect(stayParticipants('Tuktuk')).toEqual([...PEOPLE, 'Tuktuk']);
    const r = rng(33);
    for (let i = 0; i < 200; i++) {
      const me = pick(r, [null, 'Alex', 'Aunty', 'Groom'] as (Player | null)[]);
      const parts = stayParticipants(me);
      const crew: Partial<Record<Player, CrewStays>> = {};
      const missing = Math.floor(r() * (parts.length + 1));
      parts.forEach((p, j) => { if (j !== missing) crew[p] = person(p, [], { locked: true }); });
      const complete = missing >= parts.length;
      expect(voteOpen(crew, parts)).toBe(complete);
      expect(voteOpen(crew, parts, true)).toBe(true);
    }
  });
  it('a locked crew without the guest is not open once the guest is a participant', () => {
    const crew = Object.fromEntries(PEOPLE.map(p => [p, person(p, [], { locked: true })]));
    expect(voteOpen(crew, PEOPLE)).toBe(true);
    expect(voteOpen(crew, stayParticipants('Aunty'))).toBe(false);
  });
});

describe('ranking and finalists', () => {
  const crew: CrewStays[] = [];
  const ranks = (m: Record<string, StayRank>) => Object.fromEntries(Object.entries(m).map(([n, r]) => [n, { Ella: r }])) as Record<Player, never>;
  it('first = 2, second = 1, you may rank your own stay, withdrawn never scores', () => {
    const stays = [stay('s1', { name: 'Alex' }), stay('s2'), stay('s3', { status: 'withdrawn' })];
    const pts = rankPoints(stays, ranks({ Alex: { first: 's1', second: 's2' }, Antek: { first: 's2', second: 's3' } }), 'Ella');
    expect(pts.map(p => [p.id, p.points])).toEqual([['s2', 3], ['s1', 2]]);
  });
  it('merges duplicates by hostelId, else by normalised title, before counting', () => {
    const stays = [stay('s1', { hostelId: 'h1', title: 'A' }), stay('s2', { hostelId: 'h1', title: 'B' }), stay('s3', { title: '  Sea  View ' }), stay('s4', { title: 'sea view' }), stay('s5', { hostelId: 'h2', title: 'A' })];
    const pts = rankPoints(stays, ranks({ Alex: { first: 's2', second: 's4' }, Antek: { first: 's1', second: 's3' } }), 'Ella');
    const by = Object.fromEntries(pts.map(p => [p.id, p]));
    expect(by.s1.points).toBe(4);
    expect(by.s1.merged).toEqual(['s1', 's2']);
    expect(by.s3.points).toBe(2);
    expect(by.s2).toBeUndefined();
    expect(by.s5.points).toBe(0);
  });
  it('a person ranking two copies of the same stay counts it once', () => {
    const stays = [stay('s1', { title: 'X' }), stay('s2', { title: 'x' })];
    expect(rankPoints(stays, ranks({ Alex: { first: 's1', second: 's2' } }), 'Ella')[0].points).toBe(2);
  });
  it('0 stays is empty, 1 is auto, 2 skip ranking, ineligible stays do not count', () => {
    expect(finalists([], {}, 'Ella', crew)).toEqual({ empty: true });
    expect(finalists([stay('s1')], {}, 'Ella', crew)).toEqual({ auto: 's1' });
    expect(finalists([stay('s1'), stay('s2')], {}, 'Ella', crew)).toEqual({ finalists: ['s1', 's2'], tieBreak: null });
    const nodorm = [person('Lazza', [pref('rooms', { dorm: 'noway' })])];
    expect(finalists([stay('s1', { rooms: 'dorm' }), stay('s2')], {}, 'Ella', nodorm)).toEqual({ auto: 's2' });
    expect(finalists([stay('s1', { rooms: 'dorm' })], {}, 'Ella', nodorm)).toEqual({ empty: true });
  });
  it('a tie for the second finalist is broken by earliest createdAt then id, and said out loud', () => {
    const stays = [stay('s1'), stay('s2'), stay('s3'), stay('s4', { createdAt: stay('s3').createdAt })];
    const f = finalists(stays, ranks({ Alex: { first: 's1', second: 's4' }, Antek: { first: 's1', second: 's3' } }), 'Ella', crew);
    expect(f).toMatchObject({ finalists: ['s1', 's3'] });
    expect('finalists' in f && f.tieBreak).toMatch(/Tied on 1 points/);
    const clean = finalists(stays, ranks({ Alex: { first: 's1', second: 's2' }, Antek: { first: 's1', second: 's2' } }), 'Ella', crew);
    expect(clean).toEqual({ finalists: ['s1', 's2'], tieBreak: null });
  });
  it('property (c): finalists are the top two by points and deterministic', () => {
    const r = rng(44);
    for (let i = 0; i < 200; i++) {
      const stays = randomStays(r), rk = randomRanks(r, stays), c = randomCrew(r, true);
      const f = finalists(stays, rk, 'Ella', c);
      expect(finalists([...stays].reverse(), rk, 'Ella', c)).toEqual(f);
      const pts = rankPoints(stays.filter(s => eligible(s, c).ok), rk, 'Ella');
      if (pts.length >= 3 && 'finalists' in f) {
        const top = pts.slice(0, 2).map(p => p.id).sort();
        expect([...f.finalists].sort()).toEqual(top);
        expect(pts[1].points).toBeGreaterThanOrEqual(pts[2].points);
      }
    }
  });
});

describe('head to head, pin and final', () => {
  const pair: [string, string] = ['s1', 's2'];
  const fork = stayForkId('Ella', 's1', 's2');
  const v = (name: Player, choice: 'a' | 'b'): Vote => ({ forkId: fork, name, choice });
  it('wins at VOTES_TO_RESOLVE, latest vote per person counts', () => {
    expect(VOTES_TO_RESOLVE).toBe(3);
    const votes = [v('Alex', 'b'), v('Alex', 'a'), v('Antek', 'a'), v('Lazza', 'b')];
    expect(stayResult('Ella', pair, votes, PEOPLE)).toEqual({ winner: null, a: ['Alex', 'Antek'], b: ['Lazza'] });
    expect(stayResult('Ella', pair, [...votes, v('Saulie', 'a')], PEOPLE).winner).toBe('s1');
    expect(stayResult('Ella', pair, [v('Alex', 'b'), v('Antek', 'b'), v('Lazza', 'b')], PEOPLE).winner).toBe('s2');
  });
  it('ignores other forks and non-participants', () => {
    const other: Vote = { forkId: stayForkId('Ella', 's1', 's3'), name: 'Alex', choice: 'a' };
    const votes = [other, v('Tuktuk', 'a'), v('Aunty', 'a'), v('Groom', 'a')];
    expect(stayResult('Ella', pair, votes, PEOPLE)).toEqual({ winner: null, a: [], b: [] });
    expect(stayResult('Ella', pair, votes, [...PEOPLE, 'Tuktuk', 'Aunty', 'Groom']).winner).toBe('s1');
  });
  it('property (e): a pin overrides the vote, a null pin does not', () => {
    const r = rng(55);
    for (let i = 0; i < 200; i++) {
      const winner = r() < 0.3 ? null : pick(r, ['s1', 's2']);
      const pins: StayPin[] = [{ area: 'Ella', suggestionId: 'sPin', at: '2026-10-20T10:00' }];
      expect(finalStay('Ella', pins, winner)).toEqual({ id: 'sPin', pinned: true });
      const unpinned = [...pins, { area: 'Ella' as Area, suggestionId: null, at: '2026-10-20T11:00' }];
      expect(finalStay('Ella', unpinned, winner)).toEqual({ id: winner, pinned: false });
      expect(finalStay('Colombo', pins, winner)).toEqual({ id: winner, pinned: false });
    }
  });
  it('re-pinning after an unpin wins again', () => {
    const pins: StayPin[] = [{ area: 'Ella', suggestionId: 'x', at: '1' }, { area: 'Ella', suggestionId: null, at: '2' }, { area: 'Ella', suggestionId: 'y', at: '3' }];
    expect(finalStay('Ella', pins, 's1')).toEqual({ id: 'y', pinned: true });
  });
});

describe('scouts and areas', () => {
  it('property (f): deterministic and covers every area once when participants >= areas', () => {
    const r = rng(66);
    for (let i = 0; i < 200; i++) {
      const areas = AREAS.slice(0, 1 + Math.floor(r() * AREAS.length));
      const parts = [...PEOPLE].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * PEOPLE.length));
      const out = scoutAssignments(areas, parts);
      expect(scoutAssignments(areas, [...parts].reverse())).toEqual(out);
      expect(Object.keys(out).sort()).toEqual([...areas].sort());
      if (parts.length >= areas.length) expect(new Set(Object.values(out)).size).toBe(areas.length);
    }
  });
  it('wraps when there are more areas than people, and handles nobody', () => {
    const out = scoutAssignments(['Colombo', 'Ella', 'Kitulgala'], ['Saulie', 'Alex']);
    expect(out).toEqual({ Colombo: 'Alex', Ella: 'Saulie', Kitulgala: 'Alex' });
    expect(scoutAssignments(['Ella'], [])).toEqual({});
  });
  it('stayAreas keeps route order, skips null travel days and repeated areas', () => {
    const day = (n: number, area: Area | null): Day => ({ n, area, entries: [], spare: 0, rainSlack: false });
    const plan = { days: [day(1, 'Colombo'), day(2, null), day(3, 'Ella'), day(4, null), day(5, 'Colombo'), day(6, 'Ella')] } as Plan;
    expect(stayAreas(plan)).toEqual(['Colombo', 'Ella']);
  });
});

describe('groupSummary', () => {
  it('counts happy and hard NOs and flags a NO against what the majority likes', () => {
    const crew = [
      person('Brittany', [pref('stayType', { guesthouse: 'happy' })]), person('Alex', [pref('stayType', { guesthouse: 'happy' })]),
      person('Antek', [pref('stayType', { guesthouse: 'happy' })]), person('Lazza', [pref('stayType', { guesthouse: 'noway' }), pref('rooms', { dorm: 'noway' })]),
      person('Saulie', [pref('stayType', { guesthouse: 'happy' })], { prefs: [pref('stayType', { guesthouse: 'happy' }, { skipped: true })] }),
    ];
    const s = groupSummary(crew);
    expect(s.total).toBe(5);
    expect(s.happy['stayType:guesthouse']).toEqual(['Brittany', 'Alex', 'Antek']);
    expect(s.hardNos).toEqual({ 'stayType:guesthouse': ['Lazza'], 'rooms:dorm': ['Lazza'] });
    expect(s.conflicts).toEqual([{ key: 'stayType:guesthouse', no: ['Lazza'], happy: ['Brittany', 'Alex', 'Antek'] }]);
  });
  it('no conflict when the NO is against something only a minority likes', () => {
    const crew = [person('Alex', [pref('rooms', { dorm: 'happy' })]), person('Lazza', [pref('rooms', { dorm: 'noway' })]), person('Antek'), person('Saulie')];
    expect(groupSummary(crew).conflicts).toEqual([]);
  });
});
