import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import genres from '../data/genres.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import { PEOPLE, type AppState, type Genre, type GroupResult, type Item, type Knockout, type Leg, type Pace, type Person, type Plan, type Player, type Response, type Suggestion, type Vote } from '../types';
import { groupResult, measuredOn, VOTES_TO_RESOLVE } from './group';
import { plan } from './planner';
import { KNOCKED_MUST, score, tierOf } from './ranking';
import live from './__fixtures__/live-2026-10-16.json';

// Settled votes apply to a fixed point before open questions are measured (2026-10-16), so an open
// question never offers to drop a place a result already knocked down.

const CAT = (catalogue as unknown as { items: Item[] }).items;
const L = legs as Leg[];
const G = genres as unknown as Genre[];

// The live 2026-10-16 backup, loaded the way the app loads it: live suggestions become items, late
// unless someone rated them.
type LiveRow = { name: Player; days: number; flex: boolean; pace: Pace; ranking: Response['ranking']; rated: string[] };
const liveState = (): AppState => {
  const responses = Object.fromEntries((live.responses as unknown as LiveRow[]).map(r => [r.name, { ...structuredClone(r), submitted: true, updatedAt: 'x', final: null }]));
  const suggestions = live.suggestions.map(s => ({ ...s, note: '', createdAt: 'x' })) as Suggestion[];
  return { responses, suggestions, votes: structuredClone(live.votes) as Vote[] };
};
const liveItems = (): Item[] => {
  const rated = new Set((live.responses as unknown as LiveRow[]).flatMap(r => r.rated));
  const sugg = live.suggestions.filter(s => s.status === 'live').map(s => ({ id: `s:${s.id}`, name: s.title, area: s.area, about: '', hours: 2, sideTrip: 0, slot: 'any', fee: '', suggestedBy: s.name, late: !rated.has(`s:${s.id}`) }));
  return [...CAT, ...(sugg as unknown as Item[])];
};
const LIVE_ITEMS = liveItems();
const three = (forkId: string, choice: 'a' | 'b'): Vote[] => (['Antek', 'Lazza', 'Alex'] as Person[]).map(name => ({ forkId, name, choice }));
const side = (g: GroupResult, forkId: string) => g.knockouts.find(k => k.forkId === forkId);
const settled = (g: GroupResult) => Object.fromEntries(g.results.filter(r => r.winner === 'a' || r.winner === 'b').map(r => [r.forkId, r.winner]));

describe('live data, 2026-10-16', () => {
  it('(a) Horton is no longer asked against Yala, which Knuckles already knocked down; the rest are unchanged', () => {
    const g = groupResult(liveState(), LIVE_ITEMS, L, G);
    expect(g.knocked).toEqual(['yala']);
    expect(settled(g)).toEqual({ 'region:north': 'b', 'ko:knuckles': 'a' });
    expect(g.knockouts.map(k => k.forkId)).toEqual(['ko:scuba', 'ko:horton', 'ko:polonnaruwa', 'ko:anuradhapura', 'ko:diyaluma']);
    for (const k of g.knockouts) expect(k.b).not.toContain('yala');
    expect(staleOffers(g, measuredOn.get(g))).toEqual([]);
    expect(side(g, 'ko:polonnaruwa')).toMatchObject({ a: ['polonnaruwa'], b: ['pidurangala'] });
    expect(side(g, 'ko:anuradhapura')).toMatchObject({ a: ['anuradhapura', 'udawalawe'], b: ['galle', 'pettah', 'pidurangala', 'rafting'] });
    expect(side(g, 'ko:diyaluma')).toMatchObject({ a: ['diyaluma', 'hiriketiya'], b: ['coconut', 'pidurangala'] });
    expect(side(g, 'ko:scuba')).toMatchObject({ a: ['scuba', 'hiriketiya'], b: ['pidurangala', 'train'] });
    // Horton is asked against what it costs now that Yala is gone.
    expect(side(g, 'ko:horton')).toMatchObject({ a: ['horton'], b: ['pidurangala', 'rafting'] });
  });

  it('(c) a late winner leaves no open question offering to drop what it knocked down', () => {
    const s = liveState();
    s.votes.push(...three('ko:scuba', 'a'));
    const g = groupResult(s, LIVE_ITEMS, L, G);
    expect(settled(g)['ko:scuba']).toBe('a');
    expect(g.knocked).toEqual(expect.arrayContaining(['pidurangala', 'train', 'yala']));
    for (const k of g.knockouts) for (const id of k.b) expect(g.knocked, `${k.forkId} still offers to drop ${id}`).not.toContain(id);
    expect(staleOffers(g, measuredOn.get(g))).toEqual([]);
    // Same for a late loser: its questions stay as they were.
    const t = liveState();
    t.votes.push(...three('ko:scuba', 'b'));
    const h = groupResult(t, LIVE_ITEMS, L, G);
    expect(settled(h)['ko:scuba']).toBe('b');
    expect(h.knockouts.map(k => k.forkId)).toEqual(['ko:horton', 'ko:polonnaruwa', 'ko:anuradhapura', 'ko:diyaluma']);
  });

  it('(d) the same state gives the same result, whatever object it arrives in', () => {
    const s = liveState();
    s.votes.push(...three('ko:scuba', 'a'), ...three('ko:polonnaruwa', 'a'));
    const one = groupResult(s, LIVE_ITEMS, L, G);
    expect(JSON.parse(JSON.stringify(groupResult(structuredClone(s), LIVE_ITEMS, L, G)))).toEqual(JSON.parse(JSON.stringify(one)));
    expect(JSON.parse(JSON.stringify(groupResult(s, LIVE_ITEMS, L, G)))).toEqual(JSON.parse(JSON.stringify(one)));
  });
});

// ---- The planner as it was before the fixed point, kept as the oracle for (b). ----
// Its only changes are the lines marked `probe`: they record that a vote settled a question while an
// earlier one was open (the case where it left that question measured on a stale plan), and the plan it
// measured its open questions on.
const probe = { stale: false };
const oldMeasuredOn = new WeakMap<GroupResult, Plan>();
const MAX_CONTESTED = 5;
const EXTRAS_DAYS = 14;
const NORTH_AREAS = new Set<string>(['North', 'East coast']);
const REGION_FORK = 'region:north';
const EPS = 1e-9;

// The Days screen offers 5 to 21 (src/screens/Days.tsx); anything stored outside that is clamped.
const daysOf = (r: Response) => (r.flex ? 14 : Math.min(21, Math.max(5, r.days ?? 9)));

// Even counts round the middle pair toward the slower pace.
function medianPace(paces: Pace[]): Pace {
  if (!paces.length) return 1;
  const s = [...paces].sort();
  return Math.round((s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2) as Pace;
}

// genres: src/data/genres.json in the app; none means no same-type keep vote.
function oldGroupResult(state: AppState, allItems: Item[], legs: Leg[], genres: Genre[] = []): GroupResult {
  const rs = PEOPLE.map(p => state.responses[p]).filter((r): r is Response => !!r);
  const open = PEOPLE.every(p => state.responses[p]?.submitted);
  const days = rs.length ? Math.min(...rs.map(daysOf)) : 9;
  const pace = medianPace(rs.flatMap(r => (r.pace === null ? [] : [r.pace])));
  if (!open) return { open, days, pace, base: null, knockouts: [], results: [], final: null, extras: [], knocked: [], finalized: [], locked: false };

  const sealed = rs.length === PEOPLE.length && rs.every(r => r.final);
  // Late items never enter the rated stages, sealed or not, so the fifth Finalize list cannot change them (B1).
  const lateAll = allItems.filter(i => i.late === true);
  const items = lateAll.length ? allItems.filter(i => i.late !== true) : allItems;
  let pool = items;
  const ids = items.map(i => i.id);
  const scores: Record<string, number> = Object.fromEntries(ids.map(id => [id, rs.reduce((n, r) => n + score(r.ranking, id), 0)]));
  // No mustIds: a group plan never claims "doesn't fit" (plan C.5).
  const run = (F: Set<string>, O: Set<string>, d = days) => plan({ items: pool, scores, days: d, pace, legs, forceIn: [...F], forceOut: [...O] });

  const F = new Set<string>(), O = new Set<string>();
  // D5 (Brittany 2026-10-15): the losing side of an item head to head is knocked down, not out. Each
  // Must rating of it counts as the lowest Keen, so it comes back only if room opens, and never ahead
  // of a plain Keen on that rating. O is left to the region question, which stays decisive.
  const knocked = new Set<string>();
  const rating = (r: Response, id: string) => (knocked.has(id) && tierOf(r.ranking, id) === 'must' ? KNOCKED_MUST : score(r.ranking, id));
  const knockDown = (id: string) => {
    if (knocked.has(id)) return;
    knocked.add(id);
    scores[id] = rs.reduce((n, r) => n + rating(r, id), 0);
  };
  // The plan a vote picked holds none of the items it knocks down, so it stays valid at the same score.
  // A re-run replaces it only when it scores higher: the planner's search is budgeted, and without this
  // a lowered score could reshuffle it into a worse plan that happens to bring a knocked item back.
  const settle = (picked: Plan) => { const next = run(F, O); return next.score > picked.score + EPS ? next : picked; };
  const baseP = run(F, O);
  const rated = (id: string, t: 'must' | 'keen') => rs.filter(r => tierOf(r.ranking, id) === t).length;
  const tallyFor = (forkId: string) => {
    const latest = new Map<Player, 'a' | 'b'>();
    for (const v of state.votes) if (v.forkId === forkId) latest.set(v.name, v.choice);
    const who = (side: 'a' | 'b') => PEOPLE.filter(p => latest.get(p) === side);
    return { a: who('a'), b: who('b') };
  };
  const contested = ids
    .filter(id => !baseP.chosen.includes(id) && (rated(id, 'must') >= 1 || rated(id, 'keen') >= 2))
    .sort((x, y) => scores[y] - scores[x] || (x < y ? -1 : 1));

  const knockouts: Knockout[] = [];
  const results: GroupResult['results'] = [];
  let P = baseP;
  const covered = new Set<string>(); // a-sides of open forks: one question per item

  // "North or South?" is settled first, once, instead of one item knockout per northern item.
  const north = ids.filter(id => NORTH_AREAS.has(items.find(i => i.id === id)!.area));
  const northSet = new Set(north);
  const northLiked = north.filter(id => rated(id, 'must') + rated(id, 'keen') >= 1);
  const byScore = (x: string, y: string) => scores[y] - scores[x] || (x < y ? -1 : 1);
  let skipNorth = false;
  if (northLiked.length) {
    // Greedy: force in north Musts best-first, keeping each only if the plan can still hold them all.
    let forced = new Set(F), planNorth = baseP;
    const musts = northLiked.filter(id => rated(id, 'must') >= 1).sort(byScore);
    for (const m of musts.length ? musts : [[...northLiked].sort(byScore)[0]]) {
      const trial = new Set([...forced, m]), q = run(trial, O);
      if (!q.forceFailed) { forced = trial; planNorth = q; }
    }
    const planSouth = run(F, new Set([...O, ...north]));
    const mustBy = (id: string) => rated(id, 'must') >= 1;
    const a = planNorth.chosen.filter(id => northSet.has(id)).sort(byScore);
    const b = planSouth.chosen.filter(id => !northSet.has(id) && !planNorth.chosen.includes(id)).sort(byScore);
    const southMustLost = planNorth.dropped.some(id => !northSet.has(id) && mustBy(id) && planSouth.chosen.includes(id));
    const northMustLost = north.some(id => mustBy(id) && !planSouth.chosen.includes(id));
    // b empty: going north costs nobody anything, so there is nothing to vote on.
    if (!planNorth.forceFailed && a.length && b.length && (southMustLost || northMustLost)) {
      skipNorth = true;
      const votes = tallyFor(REGION_FORK);
      if (votes.a.length >= VOTES_TO_RESOLVE) { a.forEach(id => F.add(id)); north.filter(id => !a.includes(id)).forEach(id => O.add(id)); results.push({ forkId: REGION_FORK, a, b, winner: 'a' }); P = run(F, O); }
      else if (votes.b.length >= VOTES_TO_RESOLVE) { north.forEach(id => O.add(id)); results.push({ forkId: REGION_FORK, a, b, winner: 'b' }); P = run(F, O); }
      else { knockouts.push({ forkId: REGION_FORK, a, b, votes }); a.forEach(id => covered.add(id)); }
    }
  }

  // D6 (Brittany 2026-10-15): item questions wait until "North or South?" is settled, since its
  // result changes what each of them would cost.
  const regionOpen = knockouts.length > 0;
  // At most MAX_CONTESTED item questions. Items settled without one (north items behind the region
  // question, items that fit for free or ride on another question) do not use up a place.
  let asked = 0;
  for (const c of regionOpen ? [] : contested) {
    if (asked >= MAX_CONTESTED) break;
    if (skipNorth && northSet.has(c)) continue;
    if (P.chosen.includes(c)) continue;
    if (covered.has(c)) continue;
    // Knocked down by an earlier result and still out: no second question about it.
    if (knocked.has(c)) { results.push({ forkId: `ko:${c}:displaced`, a: [c], b: [], winner: 'displaced' }); continue; }
    const Q = run(new Set([...F, c]), O);
    if (Q.forceFailed) continue;
    const b = P.chosen.filter(id => !Q.chosen.includes(id) && !F.has(id));
    if (!b.length) { F.add(c); P = Q; continue; }
    const added = Q.chosen.filter(id => !P.chosen.includes(id) && id !== c);
    if (added.some(id => covered.has(id))) continue; // overlaps an open fork: it rides on that one
    const a = [c, ...added];
    // Keyed on c alone: a vote for 'a' means "add c", which stays true when b shifts after an earlier result.
    const forkId = `ko:${c}`;
    asked++;
    const votes = tallyFor(forkId);
    if (knockouts.length && Math.max(votes.a.length, votes.b.length) >= VOTES_TO_RESOLVE) probe.stale = true; // probe
    if (votes.a.length >= VOTES_TO_RESOLVE) { F.add(c); b.forEach(knockDown); results.push({ forkId, a, b, winner: 'a' }); P = settle(Q); }
    else if (votes.b.length >= VOTES_TO_RESOLVE) { knockDown(c); results.push({ forkId, a, b, winner: 'b' }); P = settle(P); }
    else { knockouts.push({ forkId, a, b, votes }); a.forEach(id => covered.add(id)); }
  }

  // Same-type keep vote (Brittany 2026-10-15): once the head to heads are done, two or more places of one
  // genre in the plan get one question. Each person ticks keep or skip per place (stored per place,
  // `genre:<id>:<item>`); a place is decided at 3 of either, or by majority (ties keep) once all five
  // ticked it. Kept places are forced in, dropped ones out so the planner refills the time. A resolved
  // genre that still has an undecided duplicate after a refill gets a second question (`genre:<id>#2`).
  // Only pairs someone wants open a question (Brittany 2026-10-16): two or more places of the type in the
  // plan rated Must or Keen by anyone, and one of them still to ask. Unwanted ones in the plan are listed
  // with them. A trip all five have finalized is never reopened, though votes already settled still count.
  const genreDropped = new Set<string>();
  const wanted = (id: string) => rated(id, 'must') + rated(id, 'keen') >= 1;
  const allFinal = sealed;
  if (!knockouts.length && genres.length) {
    // Head to head winners are never re-asked; nor is a place decided by an earlier keep vote.
    const settledIn = new Set(results.flatMap(r => (r.forkId.startsWith('ko:') && r.winner === 'a' ? [r.a[0]] : [])));
    const rounds = new Map<string, number>(); // keep votes resolved per genre
    const tallyOf = (gid: string, id: string) => {
      const latest = new Map<Player, 'a' | 'b'>();
      for (const v of state.votes) if (v.forkId === `genre:${gid}:${id}`) latest.set(v.name, v.choice);
      return { keep: PEOPLE.filter(p => latest.get(p) === 'a'), drop: PEOPLE.filter(p => latest.get(p) === 'b') };
    };
    for (let settled = true; settled;) {
      settled = false;
      const open: Knockout[] = [];
      const claimed = new Set<string>(); // one open question per place, as with `covered` above
      for (const g of genres) {
        const inPlan = g.items.filter(id => P.chosen.includes(id));
        const ask = inPlan.filter(id => !settledIn.has(id)).sort(byScore);
        if (inPlan.filter(wanted).length < 2 || !ask.some(wanted) || ask.some(id => claimed.has(id))) continue;
        const already = inPlan.filter(id => settledIn.has(id)).sort(byScore);
        const n = rounds.get(g.id) ?? 0, forkId = n ? `genre:${g.id}#${n + 1}` : `genre:${g.id}`;
        const tally = Object.fromEntries(ask.map(id => [id, tallyOf(g.id, id)]));
        const verdict = (id: string) => {
          const { keep, drop } = tally[id];
          if (keep.length >= VOTES_TO_RESOLVE) return 'keep';
          if (drop.length >= VOTES_TO_RESOLVE) return 'drop';
          return keep.length + drop.length === PEOPLE.length ? (keep.length >= drop.length ? 'keep' : 'drop') : null;
        };
        if (ask.some(id => verdict(id) === null)) {
          if (allFinal) continue;
          const voters = PEOPLE.filter(p => ask.every(id => tally[id].keep.includes(p) || tally[id].drop.includes(p)));
          open.push({ forkId, a: ask, b: already, votes: { a: voters, b: [] }, genre: { id: g.id, tally } });
          ask.forEach(id => claimed.add(id));
          continue;
        }
        let keep = ask.filter(id => verdict(id) === 'keep');
        // Never drop the whole type: the most-kept place stays (ask is already in group score order).
        if (!keep.length && !already.length) keep = [[...ask].sort((x, y) => tally[y].keep.length - tally[x].keep.length)[0]];
        const drop = ask.filter(id => !keep.includes(id));
        keep.forEach(id => { settledIn.add(id); F.add(id); });
        drop.forEach(id => { F.delete(id); O.add(id); genreDropped.add(id); });
        results.push({ forkId, a: keep, b: drop, winner: 'a' });
        rounds.set(g.id, n + 1);
        if (drop.length) P = run(F, O);
        settled = true;
        break; // the plan changed: look at every genre again
      }
      if (!settled) knockouts.push(...open);
    }
  }

  // Must floor (Brittany 2026-10-15): once nothing is open, anyone with none of their Musts in (from
  // their saved Finalize list, else as submitted) gets the one that costs the group least, never one
  // that lost a head to head or sits in the losing region. Two passes, so a place forced in for one
  // person cannot leave an earlier one at zero.
  const floor = () => {
    for (let pass = 0; pass < 2; pass++) for (const r of rs) {
      const musts = (r.final ?? r.ranking).must.flat();
      if (!musts.length || musts.some(id => P.chosen.includes(id))) continue;
      let best: Plan | null = null, pick = '';
      for (const m of musts) {
        if (knocked.has(m) || O.has(m)) continue;
        const q = run(new Set([...F, m]), O);
        if (!q.forceFailed && q.chosen.includes(m) && (!best || q.score > best.score + EPS)) { best = q; pick = m; }
      }
      if (best) { F.add(pick); P = best; }
    }
  };

  // After the head to heads, the plan is rebuilt from each saved Finalize list (Brittany 2026-10-15).
  // Winners stay forced in and the losing region stays out; anyone without a list counts as submitted,
  // knock-downs included. Their submitted ratings keep driving the head to heads above, so a saved
  // list never reopens or changes a question.
  let finalized = knockouts.length ? [] : rs.filter(r => r.final).map(r => r.name);
  // A place a late vote knocks down counts as the lowest Keen even from a list saved before that vote.
  const lateKnocked = new Set<string>();
  const val = (r: Response, id: string) => {
    const t = r.final ? tierOf(r.final, id) : null;
    return t ? (t === 'must' && lateKnocked.has(id) ? KNOCKED_MUST : score(r.final!, id)) : rating(r, id);
  };
  if (finalized.length) {
    for (const id of ids) scores[id] = rs.reduce((n, r) => n + val(r, id), 0);
    P = run(F, O);
  }

  // Late items (Brittany 2026-10-16) come last, sealed or not: one vote each against the plan as it stands; the rest stays.
  let held: Plan | null = null;
  if (lateAll.length && !regionOpen) {
    if (!knockouts.length) floor();
    const southWon = results.some(r => r.forkId === REGION_FORK && r.winner === 'b');
    const won: Item[] = [], taken = new Set<string>(), open: Knockout[] = [];
    const lateKnock = (id: string) => { lateKnocked.add(id); knocked.add(id); scores[id] = rs.reduce((n, r) => n + val(r, id), 0); };
    for (const c of [...lateAll].sort((x, y) => (x.id < y.id ? -1 : 1))) {
      pool = [...items, ...won, c];
      scores[c.id] = rs.reduce((n, r) => n + val(r, c.id), 0);
      const Q = run(new Set([...F, c.id]), O);
      // S7: never a silent drop; the Decided list says it does not fit. A South result rules out the north too.
      if (Q.forceFailed || (southWon && NORTH_AREAS.has(c.area))) { results.push({ forkId: `ko:${c.id}:nofit`, a: [c.id], b: [], winner: 'nofit' }); continue; }
      const b = P.chosen.filter(id => !Q.chosen.includes(id) && !F.has(id));
      if (!b.length) { F.add(c.id); P = Q; won.push(c); continue; }
      const a = [c.id, ...Q.chosen.filter(id => !P.chosen.includes(id) && id !== c.id && !taken.has(id))];
      const forkId = `ko:${c.id}`;
      const votes = tallyFor(forkId);
      if ((open.length || knockouts.some(k => !k.genre)) && Math.max(votes.a.length, votes.b.length) >= VOTES_TO_RESOLVE) probe.stale = true; // probe
      if (votes.a.length >= VOTES_TO_RESOLVE) { F.add(c.id); b.forEach(lateKnock); results.push({ forkId, a, b, winner: 'a' }); P = settle(Q); won.push(c); }
      else if (votes.b.length >= VOTES_TO_RESOLVE) { lateKnock(c.id); results.push({ forkId, a, b, winner: 'b' }); }
      else {
        const day = Q.days.findIndex(d => d.entries.some(e => e.itemId === c.id));
        open.push({ forkId, a, b, votes, fit: { day: day < 0 ? null : day + 1, hub: day < 0 ? null : Q.days[day].area, travelBefore: P.travelHours, travelAfter: Q.travelHours } });
        a.forEach(id => taken.add(id));
      }
    }
    pool = [...items, ...won];
    if (open.length) {
      // Late forks go first; same-type keep votes wait for them, as they wait for every head to head.
      const rest = knockouts.filter(k => !k.genre);
      knockouts.splice(0, knockouts.length, ...open, ...rest);
      if (!rest.length) held = P; // S1: Group trip keeps showing this plan while the vote is open
    }
    if (knockouts.length) finalized = [];
  }
  if (!knockouts.length) floor();
  const final = knockouts.length ? null : P;
  const kept = new Set((final ?? baseP).chosen);
  // The plan's own items stay in, so "you'd also get" holds for the whole list at once.
  // A place the group skipped in a keep vote is not offered back as an extra.
  const extras = (days >= EXTRAS_DAYS ? [] : run(kept, genreDropped, EXTRAS_DAYS).chosen)
    .filter(id => !kept.has(id))
    .map(id => ({ id, who: rs.flatMap(r => { const t = tierOf(r.ranking, id); return t === 'must' || t === 'keen' ? [{ name: r.name, tier: t }] : []; }) }))
    .filter(e => e.who.length > 0)
    .sort((x, y) => scores[y.id] - scores[x.id] || (x.id < y.id ? -1 : 1));
  const out: GroupResult = { open, days, pace, base: baseP, knockouts, results, final, extras, knocked: [...knocked].sort(), finalized, locked: finalized.length === PEOPLE.length, ...(held ? { held } : {}) };
  oldMeasuredOn.set(out, P); // probe
  return out;
}

const mulberry32 = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const forkIds = (g: GroupResult) => new Set([...g.knockouts.map(k => k.forkId), ...g.results.map(r => r.forkId)]);
// A genre vote is stored per place (`genre:<id>:<item>`) and belongs to any question of that genre listing the place.
const maps = (v: Vote, g: GroupResult) => {
  const m = /^genre:([^:]+):(.+)$/.exec(v.forkId);
  if (!m) return forkIds(g).has(v.forkId);
  const forks: { forkId: string; a: string[]; b: string[] }[] = [...g.knockouts, ...g.results];
  return forks.some(f => (f.forkId === `genre:${m[1]}` || f.forkId.startsWith(`genre:${m[1]}#`)) && [...f.a, ...f.b].includes(m[2]));
};
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

// Every way the new result differs from the old on one state, labelled. `stale` is the probe's verdict:
// the old planner measured an open question before a later result changed the plan. A difference on a
// state without that is 'ELSE'.
function differences(old: GroupResult, neu: GroupResult, stale: boolean): string[] {
  const out: string[] = [];
  if (!same(settled(old), settled(neu))) out.push(`ELSE settled ${JSON.stringify(settled(old))} -> ${JSON.stringify(settled(neu))}`);
  const tag = stale ? 'stale: ' : 'ELSE ';
  const o = new Map(old.knockouts.map(k => [k.forkId, k])), n = new Map(neu.knockouts.map(k => [k.forkId, k]));
  for (const [id, k] of o) {
    const m = n.get(id);
    if (!m) { out.push(`${tag}question removed${stale ? '' : ` ${id}`}`); continue; }
    if (same(k.a, m.a) && same(k.b, m.b)) continue;
    out.push(`${tag}question re-measured${stale ? '' : ` ${id}`}`);
  }
  for (const id of n.keys()) if (!o.has(id)) out.push(`${tag}question opened${stale ? '' : ` ${id}`}`);
  const won = (g: GroupResult) => g.results.filter(r => r.winner === 'a' || r.winner === 'b');
  if (!same(won(old).map(r => r.forkId), won(neu).map(r => r.forkId))) out.push('ELSE settled order changed');
  else for (const [i, r] of won(old).entries()) {
    const m = won(neu)[i];
    if (!same(r, m)) out.push(`ELSE settled sides changed ${r.forkId}`);
  }
  const other = (g: GroupResult) => g.results.filter(r => r.winner !== 'a' && r.winner !== 'b').map(r => r.forkId).sort();
  if (!same(other(old), other(neu))) out.push(`${tag}displaced or nofit changed`);
  if (!out.length && !same(old.final?.chosen ?? null, neu.final?.chosen ?? null)) out.push(`${tag}final plan changed`);
  return out;
}

// Open questions offering to drop a place that is not in the plan they were measured on: a place an
// earlier result already took out. (A knocked-down place may legitimately be back in that plan, D5.)
function staleOffers(g: GroupResult, on: Plan | undefined): string[] {
  if (!on) return ['no plan recorded'];
  return g.knockouts.filter(k => !k.genre).flatMap(k => k.b.filter(id => !on.chosen.includes(id)).map(id => `${k.forkId} offers to drop ${id}, not in the plan`));
}

// A stored vote may stop mapping only when its question was open before and its premise is now false.
function orphans(old: GroupResult, neu: GroupResult, s: AppState, stale: boolean) {
  const gone = new Set(old.knockouts.map(k => k.forkId).filter(id => !neu.knockouts.some(k => k.forkId === id)));
  let onStale = 0;
  const bad: string[] = [];
  for (const v of s.votes) {
    if (maps(v, old) === maps(v, neu)) continue;
    if (!maps(v, old)) bad.push(`vote ${v.forkId}/${v.name} revived`);
    else if (stale && gone.has(v.forkId)) onStale++;
    else bad.push(`vote ${v.forkId}/${v.name} orphaned`);
  }
  return { onStale, bad };
}

type Tally = { histories: number; steps: number; differingSteps: number; differingHistories: number; labels: Map<string, number>; examples: string[]; breaches: string[]; oldStaleOffers: number; orphanedOnStale: number; unmappedOld: number; unmappedNew: number };

function history(seed: number, t: Tally) {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  // Half the histories start from the live answers (and half of those from the live votes too), the rest from the guest crew.
  const fromLive = seed % 2 === 0;
  const s = fromLive ? liveState() : seedState();
  if (fromLive && seed % 4 === 0) s.votes = [];
  if (!fromLive) for (const p of PEOPLE) { const r = s.responses[p]!; r.days = pick([5, 7, 9, 9, 12, 14, 21]); r.pace = pick([0, 1, 1, 2] as Pace[]); }
  const items = fromLive ? LIVE_ITEMS : pick([CAT, CAT.filter(i => !i.late)]);
  // Votes go to the old planner's questions in some histories, so stale questions collect votes as they did live.
  const driveOld = seed % 3 === 0;
  let differs = false;
  for (let step = 0; step < 40; step++) {
    probe.stale = false;
    const old = oldGroupResult(s, items, L, G), neu = groupResult(s, items, L, G);
    t.steps++;
    const d = differences(old, neu, probe.stale);
    if (d.length) { t.differingSteps++; differs = true; for (const x of d) t.labels.set(x.startsWith('ELSE') ? 'something else' : x, (t.labels.get(x.startsWith('ELSE') ? 'something else' : x) ?? 0) + 1); }
    for (const x of d) if (x.startsWith('ELSE') && t.examples.length < 8) t.examples.push(`seed ${seed} step ${step}: ${x}`);
    // (d) again, across calls: nothing one call leaves behind may change the next.
    if (!same(groupResult(structuredClone(s), items, L, G), neu)) t.breaches.push(`seed ${seed} step ${step}: a second call gave a different result`);
    const o = orphans(old, neu, s, probe.stale);
    t.orphanedOnStale += o.onStale;
    t.unmappedOld += s.votes.filter(v => !maps(v, old)).length; t.unmappedNew += s.votes.filter(v => !maps(v, neu)).length;
    t.oldStaleOffers += staleOffers(old, oldMeasuredOn.get(old)).length;
    for (const b of [...staleOffers(neu, measuredOn.get(neu)), ...o.bad]) if (t.breaches.length < 8) t.breaches.push(`seed ${seed} step ${step}: ${b}`);
    const g = driveOld ? old : neu;
    if (!g.knockouts.length) break;
    const k = pick(g.knockouts);
    for (let n = 1 + Math.floor(rnd() * 3); n > 0; n--) {
      const has = (p: Person, forkId: string) => s.votes.some(v => v.name === p && v.forkId === forkId);
      const fresh = PEOPLE.filter(p => (k.genre ? !k.a.every(id => has(p, `genre:${k.genre!.id}:${id}`)) : !has(p, k.forkId)));
      if (!fresh.length) break;
      const name: Person = pick(fresh);
      if (k.genre) for (const id of k.a) s.votes.push({ forkId: `genre:${k.genre.id}:${id}`, name, choice: rnd() < 0.6 ? 'a' : 'b' });
      else s.votes.push({ forkId: k.forkId, name, choice: rnd() < 0.5 ? 'a' : 'b' });
    }
  }
  t.histories++;
  if (differs) t.differingHistories++;
}

const HISTORIES = 300;
describe('(b) seeded vote histories on the real catalogue, old planner as the oracle', () => {
  it(`${HISTORIES} histories: only stale questions move, and every invariant holds`, () => {
    const t: Tally = { histories: 0, steps: 0, differingSteps: 0, differingHistories: 0, labels: new Map(), examples: [], breaches: [], oldStaleOffers: 0, orphanedOnStale: 0, unmappedOld: 0, unmappedNew: 0 };
    for (let seed = 1; seed <= HISTORIES; seed++) history(seed, t);
    console.log(`FIXPOINT histories=${t.histories} steps=${t.steps} differingHistories=${t.differingHistories} differingSteps=${t.differingSteps} oldStaleOffers=${t.oldStaleOffers} orphanedOnStale=${t.orphanedOnStale} unmappedVoteSteps old=${t.unmappedOld} new=${t.unmappedNew} labels=${JSON.stringify([...t.labels].sort())}`);
    if (t.examples.length) console.log(t.examples.join('\n'));
    if (t.breaches.length) console.log(t.breaches.join('\n'));
    expect(t.breaches).toEqual([]);
    expect(t.labels.get('something else') ?? 0).toBe(0);
    // Not vacuous: the old planner showed the defect on these histories, and the new one moved those questions.
    expect(t.oldStaleOffers).toBeGreaterThan(0);
    expect(t.labels.get('stale: question re-measured') ?? 0).toBeGreaterThan(0);
  }, 900_000);
});
