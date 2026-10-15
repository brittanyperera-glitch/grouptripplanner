import { describe, expect, it } from 'vitest';
import catalogue from '../data/catalogue.json';
import genresJson from '../data/genres.json';
import legs from '../data/legs.json';
import { groupResult } from './group';
import { score } from './ranking';
import { PEOPLE, emptyRanking, type AppState, type Genre, type Item, type Leg, type Person, type Response, type Tier } from '../types';

const LIVE = catalogue.items as Item[];
const L = legs as Leg[];
const GENRES = genresJson.genres as Genre[];
const nameOf = (id: string) => LIVE.find(i => i.id === id)?.name;

// Brittany 2026-10-15: these exact groups, matched to the catalogue by name.
const SPEC: Record<string, string[]> = {
  Safari: ['Elephant safari', 'Yala leopard safari', 'Udawalawe elephants and Transit Home'],
  'Ancient city': ['Polonnaruwa by bike', 'Anuradhapura sacred city'],
  'Long hike': ['Knuckles day hike', "Horton Plains and World's End"],
  'Viewpoint climb': ['Pidurangala sunrise', 'Ella Rock hike'],
  Temple: ['Dambulla cave temple', 'Temple of the Tooth, evening puja', 'Nainativu (Nagadeepa) island temples', 'Aukana Buddha at dawn'],
  'Beach day': ['Hiriketiya beach and surf', 'Jungle Beach snorkel', 'Proper beach day', 'Coconut Tree Hill'],
  Surf: ['Weligama surf lesson', 'Hiriketiya beach and surf'],
  'Sunset spot': ['Galle Face Green at sunset', 'Galle Fort and sunset', 'Rooftop drinks or Lotus Tower'],
  'Jaffna island trip': ['Delft Island day trip', 'Nainativu (Nagadeepa) island temples'],
  'Train views': ['Nanu Oya to Ella train', 'Nine Arch Bridge'],
};

describe('genres.json', () => {
  it('every id is a catalogue place and the groups are the agreed ones', () => {
    const ids = new Set(LIVE.map(i => i.id));
    for (const g of GENRES) for (const id of g.items) expect(ids.has(id), `${g.id}: ${id}`).toBe(true);
    expect(Object.fromEntries(GENRES.map(g => [g.label, g.items.map(nameOf)]))).toEqual(SPEC);
    expect(new Set(GENRES.map(g => g.id)).size).toBe(GENRES.length);
  });
});

// Everyone rates `must` Must, every other place with a genre Skip (so only these can pair up) and the
// rest Meh, which the planner uses to fill spare time. 9 days, balanced pace.
const allMust = (must: string[], days = 9, keen: string[] = []): AppState => {
  const responses: AppState['responses'] = {};
  const skip = GENRES.flatMap(g => g.items).filter(id => !must.includes(id) && !keen.includes(id));
  for (const name of PEOPLE) {
    const r = emptyRanking(); r.must = must.map(id => [id]); r.keen = keen.map(id => [id]); r.skip = [...new Set(skip)].map(id => [id]);
    r.meh = LIVE.filter(i => !must.includes(i.id) && !skip.includes(i.id) && !keen.includes(i.id)).map(i => [i.id]);
    responses[name] = { name, days, flex: false, pace: 1, ranking: r, rated: LIVE.map(i => i.id), submitted: true, updatedAt: '' };
  }
  return { responses, suggestions: [], votes: [] };
};
const tick = (s: AppState, gid: string, id: string, who: readonly Person[], choice: 'a' | 'b') => {
  for (const name of who) s.votes.push({ forkId: `genre:${gid}:${id}`, name, choice });
};
const run = (s: AppState) => groupResult(s, LIVE, L, GENRES);
const SAFARIS = ['yala', 'udawalawe'];
const THREE = ['Brittany', 'Alex', 'Antek'] as const;

describe('same-type keep vote', () => {
  it('opens a fork for two safaris in the plan, and none for one', () => {
    const g = run(allMust(SAFARIS));
    expect(g.base!.chosen).toEqual(expect.arrayContaining(SAFARIS));
    const k = g.knockouts.find(x => x.forkId === 'genre:safari');
    expect(k).toBeDefined();
    expect([...k!.a].sort()).toEqual([...SAFARIS].sort());
    expect(k!.a).not.toContain('elephants'); // not in the plan
    expect(k!.b).toEqual([]);
    expect(g.final).toBeNull();
    expect(run(allMust(['yala'])).knockouts.some(x => x.forkId.startsWith('genre:safari'))).toBe(false);
  });
  it('without genre data there is no genre fork', () => {
    expect(groupResult(allMust(SAFARIS), LIVE, L).knockouts.some(k => k.genre)).toBe(false);
  });
  it('keeps with 3 keeps, drops with 3 drops, and waits until every place is decided', () => {
    const s = allMust(SAFARIS);
    tick(s, 'safari', 'yala', THREE, 'a');
    tick(s, 'safari', 'udawalawe', ['Brittany', 'Alex'], 'b');
    let g = run(s);
    const open = g.knockouts.find(k => k.forkId === 'genre:safari')!;
    expect(open.genre!.tally.yala.keep).toEqual([...THREE]);
    expect(open.genre!.tally.udawalawe.drop).toEqual(['Brittany', 'Alex']);
    expect(g.final).toBeNull();
    tick(s, 'safari', 'udawalawe', ['Antek'], 'b');
    g = run(s);
    expect(g.knockouts.filter(k => k.genre)).toEqual([]);
    expect(g.results.find(r => r.forkId === 'genre:safari')).toMatchObject({ a: ['yala'], b: ['udawalawe'] });
    expect(g.final).not.toBeNull();
    expect(g.final!.chosen).toContain('yala');
    expect(g.final!.chosen).not.toContain('udawalawe');
    expect(g.final!.days.length).toBe(9);
  });
  it('if every place would be dropped, the most kept one stays', () => {
    const s = allMust(SAFARIS);
    tick(s, 'safari', 'yala', ['Lazza', 'Saulie'], 'a');
    tick(s, 'safari', 'yala', THREE, 'b');
    tick(s, 'safari', 'udawalawe', ['Lazza'], 'a');
    tick(s, 'safari', 'udawalawe', THREE, 'b');
    const g = run(s);
    expect(g.results.find(r => r.forkId === 'genre:safari')).toMatchObject({ a: ['yala'], b: ['udawalawe'] });
    expect(g.final!.chosen).toContain('yala');
    expect(g.final!.chosen).not.toContain('udawalawe');
  });
  it('an all-drop tie on keeps goes to the higher group score', () => {
    const s = allMust(SAFARIS);
    // Two people Keen Udawalawe over Yala for a higher group score.
    for (const p of ['Lazza', 'Saulie'] as const) { const r = s.responses[p]!.ranking; r.must = r.must.filter(l => l[0] !== 'yala'); r.keen = [['yala']]; }
    const sc = (id: string) => PEOPLE.reduce((n, p) => n + score(s.responses[p]!.ranking, id), 0);
    expect(sc('udawalawe')).toBeGreaterThan(sc('yala'));
    expect(run(s).knockouts.some(k => k.forkId === 'genre:safari')).toBe(true);
    for (const id of SAFARIS) tick(s, 'safari', id, THREE, 'b');
    const g = run(s);
    expect(g.results.find(r => r.forkId === 'genre:safari')).toMatchObject({ a: ['udawalawe'], b: ['yala'] });
  });
  it('a dropped place frees its time for the planner to refill', () => {
    const s = allMust(SAFARIS);
    const before = run(s).base!.chosen;
    tick(s, 'safari', 'yala', THREE, 'a');
    tick(s, 'safari', 'udawalawe', THREE, 'b');
    const g = run(s);
    expect(g.final!.chosen).not.toContain('udawalawe');
    expect(g.final!.chosen.filter(id => !before.includes(id)).length).toBeGreaterThan(0);
  });
  it('three places of one type: the reminder side lists them all and kept ones are never asked again', () => {
    const s = allMust(['yala', 'udawalawe', 'elephants'], 14);
    const g = run(s);
    const k = g.knockouts.find(x => x.forkId === 'genre:safari')!;
    expect([...k.a].sort()).toEqual(['elephants', 'udawalawe', 'yala']);
    tick(s, 'safari', 'yala', THREE, 'a'); tick(s, 'safari', 'udawalawe', THREE, 'a'); tick(s, 'safari', 'elephants', THREE, 'b');
    const g2 = run(s);
    expect(g2.results.find(r => r.forkId === 'genre:safari')).toMatchObject({ b: ['elephants'] });
    expect(g2.knockouts.filter(x => x.forkId.startsWith('genre:safari'))).toEqual([]);
    expect(g2.final!.chosen).toEqual(expect.arrayContaining(['yala', 'udawalawe']));
  });
  // 5 days, Elephant safari Keen for all: it gets a head to head, which it wins, so it is in for good.
  it('a place that won a head to head is shown as already in, not asked again', () => {
    const s = allMust(SAFARIS, 5, ['elephants']);
    const ko = run(s).knockouts;
    expect(ko.map(k => k.forkId)).toEqual(['ko:elephants']);
    for (const name of THREE) s.votes.push({ forkId: 'ko:elephants', name, choice: 'a' });
    const k = run(s).knockouts.find(x => x.forkId === 'genre:safari')!;
    expect(k.b).toEqual(['elephants']);
    expect(k.a).not.toContain('elephants');
    // Dropping every asked place is allowed here, since a safari is already in. The freed time brings
    // the knocked-down Udawalawe back, which is asked about in turn.
    expect(k.a).toEqual(['yala']);
    tick(s, 'safari', 'yala', THREE, 'b');
    let g = run(s);
    expect(g.knockouts.map(x => [x.forkId, x.a, x.b])).toEqual([['genre:safari#2', ['udawalawe'], ['elephants']]]);
    tick(s, 'safari', 'udawalawe', THREE, 'b');
    g = run(s);
    expect(g.final).not.toBeNull();
    expect(g.final!.chosen).toContain('elephants');
    for (const id of SAFARIS) expect(g.final!.chosen).not.toContain(id);
  });
  // 6 days: Elephant safari loses its head to head, so it is knocked down. Dropping Udawalawe frees the
  // time, the refill brings it back, and that new pair gets its own question with Yala shown as kept.
  it('a refill that brings in a new duplicate opens a second question with the kept place shown', () => {
    const s = allMust(SAFARIS, 6, ['elephants']);
    for (const name of THREE) s.votes.push({ forkId: 'ko:elephants', name, choice: 'b' });
    expect(run(s).knockouts.find(k => k.forkId === 'genre:safari')!.a).toEqual(['yala', 'udawalawe']);
    tick(s, 'safari', 'yala', THREE, 'a'); tick(s, 'safari', 'udawalawe', THREE, 'b');
    let g = run(s);
    expect(g.knockouts.map(k => [k.forkId, k.a, k.b])).toEqual([['genre:safari#2', ['elephants'], ['yala']]]);
    expect(g.final).toBeNull();
    tick(s, 'safari', 'elephants', THREE, 'b');
    g = run(s);
    expect(g.knockouts).toEqual([]);
    expect(g.results.find(r => r.forkId === 'genre:safari#2')).toMatchObject({ a: [], b: ['elephants'] });
    expect(g.final!.chosen).toContain('yala');
    expect(g.final!.chosen).not.toContain('elephants');
  });
  // The Must floor treats a skipped place like a knocked-out one: it never forces it back in, even for
  // someone whose only Must it was.
  it('the Must floor does not bring back a place the group skipped', () => {
    const s = allMust(SAFARIS);
    const sa = s.responses.Saulie!.ranking; sa.must = [['udawalawe']]; sa.keen = [['yala']];
    tick(s, 'safari', 'yala', THREE, 'a'); tick(s, 'safari', 'udawalawe', THREE, 'b');
    const g = run(s);
    expect(g.final).not.toBeNull();
    expect(g.final!.chosen).not.toContain('udawalawe');
  });
  it('a skipped place is not offered back as a 14 day extra', () => {
    const s = allMust(SAFARIS);
    tick(s, 'safari', 'yala', THREE, 'a'); tick(s, 'safari', 'udawalawe', THREE, 'b');
    expect(run(s).extras.map(e => e.id)).not.toContain('udawalawe');
  });
});

// Votes every open question, head to heads by each person's own scores and every tick as Keep unless
// `drop` says otherwise, until nothing is open.
const voteAll = (s: AppState, drop: (id: string) => boolean = () => false) => {
  let g = run(s);
  const seen: (typeof g)[] = [g];
  for (let round = 0; round < 20 && g.knockouts.length; round++) {
    for (const k of g.knockouts) {
      if (k.genre) { for (const id of k.a) tick(s, k.genre.id, id, PEOPLE.slice(0, 3), drop(id) ? 'b' : 'a'); continue; }
      const sum = (p: Person, ids: string[]) => ids.reduce((n, id) => n + score(s.responses[p]!.ranking, id), 0);
      const choice = PEOPLE.filter(p => sum(p, k.a) >= sum(p, k.b)).length >= 3 ? 'a' : 'b';
      for (const name of PEOPLE.slice(0, 3)) s.votes.push({ forkId: k.forkId, name, choice });
    }
    g = run(s); seen.push(g);
  }
  return { g, seen };
};
const seeded = (seed: number): AppState => {
  let x = seed * 7919;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const responses: AppState['responses'] = {};
  for (const name of PEOPLE) {
    const r = emptyRanking();
    for (const i of LIVE) { const u = rand(); const t: Tier = u < 0.15 ? 'must' : u < 0.45 ? 'keen' : u < 0.75 ? 'meh' : 'skip'; r[t].push([i.id]); }
    responses[name] = { name, days: 9, flex: false, pace: 1, ranking: r, rated: LIVE.map(i => i.id), submitted: true, updatedAt: '' } as Response;
  }
  return { responses, suggestions: [], votes: [] };
};

// Brittany 2026-10-16: a keep vote opens only when two or more places of the type in the plan are
// wanted (rated Must or Keen by anyone, in their submitted ranking). Fillers are listed but never open one.
// Dispatcher 2026-10-16: never once everyone has saved a Finalize list.
const wantedBy = (s: AppState, id: string) => PEOPLE.filter(p => { const r = s.responses[p]!.ranking; return r.must.flat().includes(id) || r.keen.flat().includes(id); }).length;
// Everyone Musts `must`; everything else, safaris included, is Meh, so the planner fills with them.
const mehFill = (must: string[]): AppState => {
  const responses: AppState['responses'] = {};
  for (const name of PEOPLE) {
    const r = emptyRanking(); r.must = must.map(id => [id]); r.meh = LIVE.filter(i => !must.includes(i.id)).map(i => [i.id]);
    responses[name] = { name, days: 9, flex: false, pace: 1, ranking: r, rated: LIVE.map(i => i.id), submitted: true, updatedAt: '' };
  }
  return { responses, suggestions: [], votes: [] };
};
const setTierFor = (s: AppState, p: Person, id: string, t: 'must' | 'keen') => {
  const r = s.responses[p]!.ranking;
  for (const tier of ['must', 'keen', 'meh', 'skip'] as const) r[tier] = r[tier].map(l => l.filter(x => x !== id)).filter(l => l.length);
  r[t].push([id]);
};

describe('which pairs open a keep vote', () => {
  it('filler-only and one-wanted pairs open nothing', () => {
    const s = mehFill(['yala']);
    const g = run(s);
    const plan = g.base!.chosen;
    // Not vacuous: the plan does hold pairs of one type, made up with Meh fillers.
    const pairs = GENRES.filter(gen => gen.items.filter(id => plan.includes(id)).length >= 2);
    expect(pairs.length).toBeGreaterThan(0);
    expect(g.knockouts.filter(k => k.genre)).toEqual([]);
    expect(g.final).not.toBeNull();
  });
  it('one person wanting both places opens it, and unwanted places in the plan are listed too', () => {
    const s = mehFill(['yala', 'udawalawe']);
    for (const p of PEOPLE.slice(1)) { const r = s.responses[p]!.ranking; r.must = []; r.meh.push(['yala'], ['udawalawe']); }
    expect(wantedBy(s, 'yala')).toBe(1); expect(wantedBy(s, 'udawalawe')).toBe(1);
    const g = run(s);
    const k = g.knockouts.find(x => x.forkId === 'genre:safari');
    expect(k).toBeDefined();
    const inPlan = GENRES.find(x => x.id === 'safari')!.items.filter(id => g.base!.chosen.includes(id));
    expect([...k!.a].sort()).toEqual([...inPlan].sort());
    for (const other of g.knockouts.filter(x => x.genre && x !== k)) expect(other.a.filter(id => wantedBy(s, id) > 0).length).toBeGreaterThanOrEqual(2);
  });
  it('two people each wanting one place opens it', () => {
    const s = mehFill([]);
    for (const p of ['Brittany', 'Antek', 'Lazza'] as const) setTierFor(s, p, 'yala', 'must');
    for (const p of ['Alex', 'Saulie'] as const) setTierFor(s, p, 'udawalawe', 'keen');
    const wants = (p: Person, id: string) => { const r = s.responses[p]!.ranking; return r.must.flat().includes(id) || r.keen.flat().includes(id); };
    expect(PEOPLE.some(p => wants(p, 'yala') && wants(p, 'udawalawe'))).toBe(false);
    const g = run(s);
    expect(g.base!.chosen).toEqual(expect.arrayContaining(SAFARIS));
    expect(g.knockouts.some(x => x.forkId === 'genre:safari')).toBe(true);
  });
  it('never opens once all five have saved a Finalize list, and still honours votes already settled', () => {
    const s = allMust(SAFARIS);
    for (const p of PEOPLE.slice(0, 4)) s.responses[p]!.final = s.responses[p]!.ranking;
    expect(run(s).knockouts.some(k => k.forkId === 'genre:safari')).toBe(true);
    s.responses.Saulie!.final = s.responses.Saulie!.ranking;
    let g = run(s);
    expect(g.knockouts).toEqual([]);
    expect(g.locked).toBe(true);
    expect(g.final!.chosen).toEqual(expect.arrayContaining(SAFARIS));
    tick(s, 'safari', 'yala', THREE, 'a'); tick(s, 'safari', 'udawalawe', THREE, 'b');
    g = run(s);
    expect(g.locked).toBe(true);
    expect(g.final!.chosen).not.toContain('udawalawe');
  });
});

describe('same-type keep vote in a full run', () => {
  it('opens only once the head to heads are done, finishes, and leaves no unasked pair', () => {
    let opened = 0, afterH2h = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = seeded(seed);
      // Drop the lower-scored place of each pair so drops and refills happen.
      const { g, seen } = voteAll(s, id => id === 'udawalawe' || id === 'ninearch' || id === 'anuradhapura' || id === 'coconut');
      for (const x of seen) {
        const genreOpen = x.knockouts.some(k => k.genre);
        if (genreOpen) { opened++; expect(x.knockouts.some(k => !k.genre), `seed ${seed}`).toBe(false); }
        if (genreOpen && x.results.some(r => r.forkId.startsWith('ko:'))) afterH2h++;
      }
      expect(g.final, `seed ${seed}`).not.toBeNull();
      expect(g.knockouts).toEqual([]);
      expect(JSON.stringify(run(s))).toBe(JSON.stringify(g));
      // Every pair of one type in the final plan was asked about (kept by vote or won a head to head).
      const asked = new Set(g.results.flatMap(r => (r.forkId.startsWith('genre:') ? r.a : r.forkId.startsWith('ko:') && r.winner === 'a' ? [r.a[0]] : [])));
      for (const gen of GENRES) {
        const wanted = gen.items.filter(id => g.final!.chosen.includes(id) && wantedBy(s, id) > 0);
        if (wanted.length >= 2) for (const id of wanted) expect(asked.has(id), `seed ${seed} ${gen.id} ${id}`).toBe(true);
      }
      for (const r of g.results.filter(x => x.forkId.startsWith('genre:'))) for (const id of r.b) expect(g.final!.chosen).not.toContain(id);
    }
    expect(opened).toBeGreaterThan(0);
    expect(afterH2h).toBeGreaterThan(0);
  });
});
