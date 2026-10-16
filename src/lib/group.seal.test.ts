import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import genres from '../data/genres.json';
import legs from '../data/legs.json';
import { seedState } from '../guest/seed';
import { PEOPLE, type AppState, type Genre, type GroupResult, type Item, type Leg, type Pace, type Person } from '../types';
import { groupResult, VOTES_TO_RESOLVE } from './group';
import { finalListFrom } from './ranking';

// The catalogue as deployed, scuba (late: true) included: nothing is filtered out.
const ALL = (catalogue as unknown as { items: Item[] }).items;
const LATE_IDS = ALL.filter(i => i.late).map(i => i.id);
const BEFORE_APPROVAL = ALL.filter(i => !i.late);
const L = legs as Leg[];
const G = genres as unknown as Genre[];

const mulberry32 = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const tally = (s: AppState, forkId: string) => {
  const latest = new Map<string, 'a' | 'b'>();
  for (const v of s.votes) if (v.forkId === forkId) latest.set(v.name, v.choice);
  const n = (c: 'a' | 'b') => [...latest.values()].filter(x => x === c).length;
  return { a: n('a'), b: n('b') };
};
const sealed = (s: AppState) => PEOPLE.every(p => !!s.responses[p]?.final);
const isLateFork = (forkId: string) => LATE_IDS.some(id => forkId === `ko:${id}`);

// One random history: votes on open questions, Finalize lists saved when allowed, and scuba approved
// from the start, at a random step, or only after the plan has locked. Returns every invariant breach.
function history(seed: number, seen: Set<string>): string[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const s = seedState();
  for (const p of PEOPLE) { const r = s.responses[p]!; r.days = pick([5, 7, 9, 9, 12, 14, 21]); r.pace = pick([0, 1, 1, 2] as Pace[]); }
  const mode = seed % 3; // 0: approved from the start, 1: at a random step, 2: after the lock
  const approveAt = mode === 0 ? 0 : mode === 1 ? Math.floor(rnd() * 30) : Infinity;
  let approved = mode === 0;
  const bad: string[] = [];
  let prev: GroupResult | null = null, wasSealed = false;
  for (let step = 0; step < 120; step++) {
    const wasApproved = approved;
    if (!approved && step >= approveAt) approved = true;
    const items = approved ? ALL : BEFORE_APPROVAL;
    const g = groupResult(s, items, L, G);
    const tag = `seed ${seed} step ${step}`;
    if (sealed(s) && !wasSealed && prev?.final) {
      wasSealed = true;
      // An approval landing on the same step as the fifth list is a reopen, checked below.
      if (wasApproved === approved) {
        if (g.knockouts.length) bad.push(`${tag}: the fifth list opened ${g.knockouts.map(k => k.forkId).join(', ')}`);
        for (const id of LATE_IDS) if (g.final && prev.final.chosen.includes(id) !== g.final.chosen.includes(id)) bad.push(`${tag}: ${id} changed sides at the seal`);
        for (const r of g.results) if (isLateFork(r.forkId)) seen.add(`late '${r.winner}' settled before the seal`);
      }
    }
    if (sealed(s)) {
      if (g.knockouts.some(k => isLateFork(k.forkId)) && prev?.locked) seen.add('locked plan reopened for a late vote');
      for (const k of g.knockouts) if (!isLateFork(k.forkId)) bad.push(`${tag}: new non-late fork ${k.forkId} after all five finalized`);
      if (!g.locked && !g.knockouts.some(k => isLateFork(k.forkId))) bad.push(`${tag}: unlocked with no open late fork`);
      if (prev?.locked && !g.locked && !g.knockouts.every(k => isLateFork(k.forkId))) bad.push(`${tag}: locked flipped back without a late fork`);
    }
    if (g.final) for (const id of LATE_IDS) {
      if (!items.some(i => i.id === id)) continue;
      const t = tally(s, `ko:${id}`);
      const noFit = g.results.some(r => r.forkId === `ko:${id}:nofit`);
      if (noFit) seen.add('late item that does not fit');
      if (t.a >= VOTES_TO_RESOLVE && !g.final.chosen.includes(id) && !noFit) bad.push(`${tag}: ${id} won ${t.a}-${t.b} but is not in the plan`);
      if (t.b >= VOTES_TO_RESOLVE && g.final.chosen.includes(id)) bad.push(`${tag}: ${id} lost ${t.b}-${t.a} but is in the plan`);
    }
    prev = g;
    if (g.locked && !g.knockouts.length && approved) break;
    // Open questions: one to three new votes on one of them.
    if (g.knockouts.length) {
      const k = pick(g.knockouts);
      for (let n = 1 + Math.floor(rnd() * 3); n > 0; n--) {
        const has = (p: Person, forkId: string) => s.votes.some(v => v.name === p && v.forkId === forkId);
        const fresh = PEOPLE.filter(p => (k.genre ? !k.a.every(id => has(p, `genre:${k.genre!.id}:${id}`)) : !has(p, k.forkId)));
        if (!fresh.length) break;
        const name: Person = pick(fresh);
        if (k.genre) for (const id of k.a) s.votes.push({ forkId: `genre:${k.genre.id}:${id}`, name, choice: rnd() < 0.6 ? 'a' : 'b' });
        else s.votes.push({ forkId: k.forkId, name, choice: rnd() < 0.5 ? 'a' : 'b' });
      }
      continue;
    }
    // Nothing open: someone saves a Finalize list, as the Finalize screen allows.
    const todo = PEOPLE.filter(p => !s.responses[p]!.final);
    if (g.final && !g.locked && todo.length) { const p = pick(todo); s.responses[p]!.final = finalListFrom(s.responses[p]!.ranking, g.knocked); continue; }
    if (!approved) { approved = true; continue; }
    break;
  }
  return bad;
}

const HISTORIES = 200;
describe('the seal is stable with the catalogue as deployed (scuba included)', () => {
  it(`${HISTORIES} seeded vote histories keep every invariant`, () => {
    const failing: { seed: number; first: string }[] = [], seen = new Set<string>();
    for (let seed = 1; seed <= HISTORIES; seed++) { const b = history(seed, seen); if (b.length) failing.push({ seed, first: b[0] }); }
    if (failing.length) console.log(failing.slice(0, 12).map(f => f.first).join('\n'));
    console.log(`FAILING HISTORIES: ${failing.length} of ${HISTORIES}; shapes reached: ${[...seen].sort().join('; ')}`);
    expect(failing.length).toBe(0);
    // Not vacuous: the histories reach each shape B1 and S1 are about.
    expect([...seen].sort()).toEqual(expect.arrayContaining(["late 'a' settled before the seal", "late 'b' settled before the seal", 'locked plan reopened for a late vote']));
  }, 600_000);
});
