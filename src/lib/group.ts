import { PEOPLE, type AppState, type Genre, type GroupResult, type Item, type Knockout, type Leg, type Pace, type Player, type Plan, type Response } from '../types';
import { mustFitDays, plan } from './planner';
import { KNOCKED_MUST, score, scoresFor, tierOf } from './ranking';
import type { Release } from './release';
import { genreForkId, genreRoundForkId, NORTH_AREAS, REGION_FORK, tallySides } from './votes';

export const VOTES_TO_RESOLVE = 3; // majority of 5

/** All five have submitted. `draft` counts one person's unsent draft instead of their stored row. */
export const allSubmitted = (responses: AppState['responses'], draft?: { name: Player; submitted: boolean }): boolean =>
  PEOPLE.every(p => (draft && p === draft.name ? draft.submitted : responses[p]?.submitted));

// The plan the open questions were measured on, for tests: every drop side must be a subset of it.
export const measuredOn = new WeakMap<GroupResult, Plan>();

// "If added: day 4 in South coast, travel 18.2 h to 19.2 h." The day part is left out when the place has none.
export const fitLine = (f: NonNullable<Knockout['fit']>): string => {
  const where = f.day === null ? '' : `day ${f.day}${f.hub ? ` in ${f.hub}` : ''}, `;
  const before = f.travelBefore.toFixed(1), after = f.travelAfter.toFixed(1);
  // "18.2 h to 18.2 h" reads like a typo, so equal travel says so plainly.
  return `If added: ${where}${before === after ? 'no extra travel' : `travel ${before} h to ${after} h`}.`;
};
const MAX_CONTESTED = 5;
const EXTRAS_DAYS = 14;
const EPS = 1e-9;

// The Days screen offers 5 to 21 (src/screens/Days.tsx); anything stored outside that is clamped.
const daysOf = (r: Response) => (r.flex ? 14 : Math.min(21, Math.max(5, r.days ?? 9)));

export function personPlan(resp: Response, items: Item[], legs: Leg[]): Plan & { mustFit: number | null } {
  const ids = items.map(i => i.id);
  const scores = scoresFor(resp.ranking, ids);
  const mustIds = ids.filter(id => tierOf(resp.ranking, id) === 'must');
  const input = { items, scores, days: daysOf(resp), pace: (resp.pace ?? 1) as Pace, legs, mustIds };
  const p = plan(input);
  return { ...p, mustFit: p.fits ? null : mustFitDays(input) };
}

// Even counts round the middle pair toward the slower pace.
function medianPace(paces: Pace[]): Pace {
  if (!paces.length) return 1;
  const s = [...paces].sort();
  return Math.round((s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2) as Pace;
}

// genres: src/data/genres.json in the app; none means no same-type keep vote.
export function groupResult(state: AppState, allItems: Item[], legs: Leg[], genres: Genre[] = [], release: Release | null = null): GroupResult {
  const rs = PEOPLE.map(p => state.responses[p]).filter((r): r is Response => !!r);
  const open = allSubmitted(state.responses);
  const days = release?.days ?? (rs.length ? Math.min(...rs.map(daysOf)) : 9);
  const pace = release?.pace ?? medianPace(rs.flatMap(r => (r.pace === null ? [] : [r.pace])));
  // A released plan is already decided, so one member starting over must not take it away from the other four.
  if (!open && !release) return { open, days, pace, base: null, knockouts: [], results: [], final: null, extras: [], knocked: [], finalized: [], locked: false };

  const sealed = rs.length === PEOPLE.length && rs.every(r => r.final);
  // Late items never enter the rated stages, sealed or not, so the fifth Finalize list cannot change them (B1).
  const lateAll = allItems.filter(i => i.late === true);
  const items = lateAll.length ? allItems.filter(i => i.late !== true) : allItems;
  let pool = items;
  const ids = items.map(i => i.id);
  const scores: Record<string, number> = Object.fromEntries(ids.map(id => [id, rs.reduce((n, r) => n + score(r.ranking, id), 0)]));
  // No mustIds: a group plan never claims "doesn't fit" (plan C.5).
  const run = (F: Set<string>, O: Set<string>, d = days) => plan({ items: pool, scores, days: d, pace, legs, forceIn: [...F], forceOut: [...O] });
  // The plan's own items stay in, so "you'd also get" holds for the whole list at once.
  // A place the group skipped in a keep vote is not offered back as an extra.
  const extrasFor = (kept: Set<string>, skipped: Set<string>) => (days >= EXTRAS_DAYS ? [] : run(kept, skipped, EXTRAS_DAYS).chosen)
    .filter(id => !kept.has(id))
    .map(id => ({ id, who: rs.flatMap(r => { const t = tierOf(r.ranking, id); return t === 'must' || t === 'keen' ? [{ name: r.name, tier: t }] : []; }) }))
    .filter(e => e.who.length > 0)
    .sort((x, y) => scores[y.id] - scores[x.id] || (x.id < y.id ? -1 : 1));

  // Released (Brittany 2026-10-19): the group's decided list is the plan, so no vote or Finalize list is needed or faked.
  if (release) {
    const keep = new Set(release.items);
    const P = run(keep, new Set(ids.filter(id => !keep.has(id))));
    // Places the group ruled out are not offered back as "you'd also get" on a longer trip.
    return { open: true, days, pace, base: P, knockouts: [], results: [], final: P, extras: extrasFor(keep, new Set(release.ruledOut)), knocked: [], finalized: [...PEOPLE], locked: true, released: true };
  }

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
  const tallyFor = (forkId: string) => tallySides(state.votes, forkId, PEOPLE);
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
  // A vote that settles a question after an open one changes the plan that question was measured on
  // (it may even have knocked down a place the question offers to drop). So once the pass ends, the
  // questions left open are measured again, and only those: no other question opens and nothing else
  // settles, so every result and every stored vote keeps the meaning it had.
  const askItems = (cs: string[], later?: string[]) => {
    knockouts.length = 0; covered.clear();
    let asked = 0, settledLate = false, fitLate = false;
    for (const c of cs) {
      if (asked >= MAX_CONTESTED) break;
      if (skipNorth && northSet.has(c)) continue;
      if (P.chosen.includes(c)) continue;
      if (covered.has(c)) continue;
      // Knocked down by an earlier result and still out: no second question about it.
      if (knocked.has(c)) { results.push({ forkId: `ko:${c}:displaced`, a: [c], b: [], winner: 'displaced' }); continue; }
      const Q = run(new Set([...F, c]), O);
      if (Q.forceFailed) continue;
      const b = P.chosen.filter(id => !Q.chosen.includes(id) && !F.has(id));
      if (!b.length && later) { later.push(c); continue; }
      if (!b.length) { F.add(c); P = Q; fitLate ||= knockouts.length > 0; continue; }
      const added = Q.chosen.filter(id => !P.chosen.includes(id) && id !== c);
      if (added.some(id => covered.has(id))) continue; // overlaps an open fork: it rides on that one
      const a = [c, ...added];
      // Keyed on c alone: a vote for 'a' means "add c", which stays true when b shifts after an earlier result.
      const forkId = `ko:${c}`;
      asked++;
      const votes = tallyFor(forkId);
      if (votes.a.length >= VOTES_TO_RESOLVE) { F.add(c); b.forEach(knockDown); results.push({ forkId, a, b, winner: 'a' }); P = settle(Q); }
      else if (votes.b.length >= VOTES_TO_RESOLVE) { knockDown(c); results.push({ forkId, a, b, winner: 'b' }); P = settle(P); }
      else { knockouts.push({ forkId, a, b, votes }); a.forEach(id => covered.add(id)); continue; }
      settledLate ||= knockouts.length > 0;
    }
    return { settledLate, fitLate };
  };
  // A re-measured question cannot settle (its votes are unchanged); one that now fits for free moves the plan again.
  const openIds = () => knockouts.filter(k => !k.genre && !k.fit).map(k => k.a[0]);
  const reaskItems = (extra: string[] = []) => {
    let cs = [...openIds(), ...extra].sort((x, y) => contested.indexOf(x) - contested.indexOf(y));
    while (askItems(cs).fitLate) cs = openIds();
  };
  // With late items, nothing the re-measure frees (a question that now fits for free, or the keep vote,
  // Finalize lists and Must floor that wait for open questions) moves the plan until the late votes are
  // taken, so each late vote counts on the plan the group saw.
  const freeAfterLate: string[] = [];
  let waitForLate = false;
  if (!regionOpen && askItems(contested).settledLate) {
    if (lateAll.length) { waitForLate = true; askItems(openIds(), freeAfterLate); } else reaskItems();
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
  const genreStage = () => {
    if (knockouts.length || waitForLate || !genres.length) return;
    // Head to head winners are never re-asked; nor is a place decided by an earlier keep vote.
    const settledIn = new Set(results.flatMap(r => (r.forkId.startsWith('ko:') && r.winner === 'a' ? [r.a[0]] : [])));
    const rounds = new Map<string, number>(); // keep votes resolved per genre
    const tallyOf = (gid: string, id: string) => {
      const { a, b } = tallySides(state.votes, genreForkId(gid, id), PEOPLE);
      return { keep: a, drop: b };
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
        const n = rounds.get(g.id) ?? 0, forkId = genreRoundForkId(g.id, n);
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
  };
  genreStage();

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
  let finalized: Player[] = [];
  // A place a late vote knocks down counts as the lowest Keen even from a list saved before that vote.
  const lateKnocked = new Set<string>();
  const val = (r: Response, id: string) => {
    const t = r.final ? tierOf(r.final, id) : null;
    return t ? (t === 'must' && lateKnocked.has(id) ? KNOCKED_MUST : score(r.final!, id)) : rating(r, id);
  };
  const rescore = () => {
    finalized = knockouts.length || waitForLate ? [] : rs.filter(r => r.final).map(r => r.name);
    if (!finalized.length) return;
    for (const id of ids) scores[id] = rs.reduce((n, r) => n + val(r, id), 0);
    P = run(F, O);
  };
  rescore();

  // Late items (Brittany 2026-10-16) come last, sealed or not: one vote each against the plan as it stands; the rest stays.
  let held: Plan | null = null;
  if (lateAll.length && !regionOpen) {
    if (!knockouts.length && !waitForLate) floor();
    const southWon = results.some(r => r.forkId === REGION_FORK && r.winner === 'b');
    const won: Item[] = [];
    const lateKnock = (id: string) => { lateKnocked.add(id); knocked.add(id); scores[id] = rs.reduce((n, r) => n + val(r, id), 0); };
    const itemOpen = knockouts.some(k => !k.genre) || waitForLate;
    const anyItemOpen = () => knockouts.some(k => !k.genre);
    let open: Knockout[] = [];
    // As with item questions: a late vote that settles after an open question gets that question measured again.
    const askLate = (cs: Item[]) => {
      open = [];
      const taken = new Set<string>();
      let settledLate = false, fitLate = false;
      for (const c of cs) {
        pool = [...items, ...won.filter(w => w !== c), c];
        scores[c.id] = rs.reduce((n, r) => n + val(r, c.id), 0);
        const Q = run(new Set([...F, c.id]), O);
        // S7: never a silent drop; the Decided list says it does not fit. A South result rules out the north too.
        if (Q.forceFailed || (southWon && NORTH_AREAS.has(c.area))) { results.push({ forkId: `ko:${c.id}:nofit`, a: [c.id], b: [], winner: 'nofit' }); continue; }
        const b = P.chosen.filter(id => !Q.chosen.includes(id) && !F.has(id));
        if (!b.length) { F.add(c.id); P = Q; if (!won.includes(c)) won.push(c); fitLate ||= open.length > 0 || anyItemOpen(); continue; }
        const a = [c.id, ...Q.chosen.filter(id => !P.chosen.includes(id) && id !== c.id && !taken.has(id))];
        const forkId = `ko:${c.id}`;
        const votes = tallyFor(forkId);
        if (votes.a.length >= VOTES_TO_RESOLVE) { F.add(c.id); b.forEach(lateKnock); results.push({ forkId, a, b, winner: 'a' }); P = settle(Q); won.push(c); }
        else if (votes.b.length >= VOTES_TO_RESOLVE) { lateKnock(c.id); results.push({ forkId, a, b, winner: 'b' }); }
        else {
          const day = Q.days.findIndex(d => d.entries.some(e => e.itemId === c.id));
          open.push({ forkId, a, b, votes, fit: { day: day < 0 ? null : day + 1, hub: day < 0 ? null : Q.days[day].area, travelBefore: P.travelHours, travelAfter: Q.travelHours } });
          a.forEach(id => taken.add(id));
          continue;
        }
        settledLate ||= open.length > 0 || anyItemOpen();
      }
      return { settledLate, fitLate };
    };
    const byId = new Map(lateAll.map(i => [i.id, i]));
    const lateIds = () => open.map(k => byId.get(k.a[0])!);
    const settledLate = askLate([...lateAll].sort((x, y) => (x.id < y.id ? -1 : 1))).settledLate;
    // Held back above: the item questions are measured again only if the plan has to move.
    const release = waitForLate && (freeAfterLate.length > 0 || !anyItemOpen());
    waitForLate = false;
    if (settledLate || release) {
      for (let moved = itemOpen; moved;) { pool = [...items, ...won]; reaskItems(freeAfterLate.splice(0)); moved = askLate(lateIds()).fitLate && anyItemOpen(); }
      // The item questions that held back the keep vote and the Finalize lists may all have gone.
      if (itemOpen && !knockouts.length) { genreStage(); rescore(); if (!knockouts.length) floor(); }
      while (askLate(lateIds()).fitLate);
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
  const extras = extrasFor(kept, genreDropped);
  const out: GroupResult = { open, days, pace, base: baseP, knockouts, results, final, extras, knocked: [...knocked].sort(), finalized, locked: finalized.length === PEOPLE.length, ...(held ? { held } : {}) };
  measuredOn.set(out, P);
  return out;
}
