import { describe, expect, it } from 'vitest';
import { emptyRanking } from '../types';
import type { AppState, GroupResult, Knockout, Person, Player, Suggestion } from '../types';
import type { Award } from './awards';
import { awardsKey, isFinalizing, openItems, tabBadges } from './openItems';
import type { OpenCtx } from './openItems';

const ko = (forkId: string, a: Person[] = [], b: Person[] = []): Knockout => ({ forkId, a: ['x'], b: ['y'], votes: { a, b } });
const group = (over: Partial<GroupResult> = {}): GroupResult => ({
  open: true, days: 9, pace: 1, base: null, knockouts: [], results: [], final: null, extras: [], knocked: [], finalized: [], locked: false, ...over,
});
const sug = (id: string, title: string, over: Partial<Suggestion> = {}): Suggestion => ({ id, name: 'Alex', title, area: 'Colombo', note: '', status: 'pending', createdAt: 'x', ...over });
// The quiz is marked done for every person under test so these cases keep proving what they did before the stayQuiz to-do existed.
const quizDone = (name: Player) => ({ name, prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '' });
const doneStays = (...names: Player[]): NonNullable<AppState['stays']> => ({ crew: Object.fromEntries(names.map(n => [n, quizDone(n)])), suggestions: [], admin: { pins: [], scouts: {} } });
const empty: AppState = { responses: {}, suggestions: [], votes: [], stays: doneStays('Alex', 'Brittany', 'Aunty') };
const ctx = (over: Partial<OpenCtx> = {}): OpenCtx => ({ me: 'Alex', group: group(), state: empty, unrated: 0, ratingsLocked: false, awardsUnseen: false, ...over });
const ids = (c: OpenCtx) => openItems(c).map(i => i.id);

describe('openItems', () => {
  it('is empty when nothing is owed', () => {
    expect(openItems(ctx())).toEqual([]);
    expect(openItems(ctx({ group: null }))).toEqual([]);
    expect(openItems(ctx({ me: null }))).toEqual([]);
  });

  it('votes owed appear with the count and a target on the Group knockouts view, and only while I owe some', () => {
    const g = group({ knockouts: [ko('ko:1', ['Alex']), ko('ko:2'), ko('ko:3')] });
    const [item] = openItems(ctx({ group: g }));
    expect(item).toMatchObject({ id: 'votes', count: 2, label: 'Vote on 2 head-to-heads', target: { tab: 'Group', view: 'knockouts' } });
    expect(openItems(ctx({ group: group({ knockouts: [ko('ko:1')] }) }))[0].label).toBe('Vote on 1 head-to-head');
    expect(ids(ctx({ group: group({ knockouts: [ko('ko:1', ['Alex'])] }) }))).toEqual([]);
    expect(ids(ctx({ group: group({ open: false, knockouts: [ko('ko:1')] }) }))).toEqual([]);
  });

  it('a guest owes votes from their own raw votes', () => {
    const g = group({ knockouts: [ko('ko:1', ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'])] });
    expect(ids(ctx({ me: 'Aunty', group: g }))).toEqual(['votes']);
    const done: AppState = { ...empty, votes: [{ forkId: 'ko:1', name: 'Aunty', choice: 'a' }] };
    expect(ids(ctx({ me: 'Aunty', group: g, state: done }))).toEqual([]);
  });

  it('Finalize is pending only while finalizing and my final list is not saved', () => {
    const finalizing = group({ final: {} as GroupResult['final'], knockouts: [] });
    const [item] = openItems(ctx({ group: finalizing }));
    expect(item).toMatchObject({ id: 'final', count: 1, label: 'Save your final list', target: { tab: 'Group' } });
    const saved: AppState = { ...empty, responses: { Alex: { name: 'Alex', days: 9, flex: false, pace: 1, ranking: emptyRanking(), rated: [], submitted: true, updatedAt: 'x', final: emptyRanking() } } };
    expect(ids(ctx({ group: finalizing, state: saved }))).toEqual([]);
    expect(ids(ctx({ group: group({ final: finalizing.final, locked: true }) }))).toEqual([]);
    expect(ids(ctx({ group: group({ final: null }) }))).toEqual([]);
    expect(isFinalizing(finalizing)).toBe(true);
    expect(isFinalizing(group({ final: finalizing.final, knockouts: [ko('ko:1')] }))).toBe(false);
  });

  it('new places to rate show only when ratings are not locked', () => {
    const [item] = openItems(ctx({ unrated: 3 }));
    expect(item).toMatchObject({ id: 'rate', count: 3, label: '3 new places to rate', target: { tab: 'Picks' } });
    expect(openItems(ctx({ unrated: 1 }))[0].label).toBe('1 new place to rate');
    expect(ids(ctx({ unrated: 3, ratingsLocked: true }))).toEqual([]);
    expect(ids(ctx({ unrated: 0 }))).toEqual([]);
  });

  it('approvals are Brittany only and count ideas, not people', () => {
    const state: AppState = { ...empty, suggestions: [sug('1', 'Tea tour'), sug('2', ' tea TOUR ', { name: 'Antek' }), sug('3', 'Surf lesson'), sug('4', 'Old', { status: 'live' }), sug('5', 'No', { status: 'rejected' })] };
    const [item] = openItems(ctx({ me: 'Brittany', state }));
    expect(item).toMatchObject({ id: 'approve', count: 2, label: '2 ideas waiting for approval', target: { tab: 'Suggest' } });
    expect(ids(ctx({ me: 'Alex', state }))).toEqual([]);
    expect(ids(ctx({ me: 'Aunty', state }))).toEqual([]);
    expect(openItems(ctx({ me: 'Brittany', state: { ...empty, suggestions: [sug('1', 'Solo')] } }))[0].label).toBe('1 idea waiting for approval');
    expect(ids(ctx({ me: 'Brittany' }))).toEqual([]);
  });

  it('unseen awards appear only once the plan is locked', () => {
    const locked = group({ locked: true });
    const [item] = openItems(ctx({ group: locked, awardsUnseen: true }));
    expect(item).toMatchObject({ id: 'awards', label: 'See the group awards', target: { tab: 'Awards' } });
    expect(item.count).toBeUndefined();
    expect(ids(ctx({ group: locked, awardsUnseen: false }))).toEqual([]);
    expect(ids(ctx({ group: group(), awardsUnseen: true }))).toEqual([]);
  });

  it('lists everything that holds, votes first, and every label is short ASCII', () => {
    const who: Player = 'Brittany';
    const state: AppState = { ...empty, suggestions: [sug('1', 'Tea tour')] };
    const all = openItems(ctx({ me: who, state, unrated: 2, group: group({ knockouts: [ko('ko:1')] }) }));
    expect(all.map(i => i.id)).toEqual(['votes', 'rate', 'approve']);
    for (const i of [...all, ...openItems(ctx({ group: group({ locked: true }), awardsUnseen: true })), ...openItems(ctx({ group: group({ final: {} as GroupResult['final'] }) }))]) {
      expect(i.label).toMatch(/^[\x20-\x7e]+$/);
      expect(i.label.split(' ').length).toBeLessThan(8);
    }
  });
});

describe('stayQuiz', () => {
  it('is owed after approve and before awards until the quiz is done', () => {
    const state: AppState = { ...empty, stays: undefined, suggestions: [sug('1', 'Tea tour')] };
    const c = ctx({ me: 'Brittany', state, group: group({ locked: true }), awardsUnseen: true });
    expect(ids(c)).toEqual(['approve', 'stayQuiz', 'awards']);
    expect(openItems(c).find(i => i.id === 'stayQuiz')).toMatchObject({ id: 'stayQuiz', target: { tab: 'Quiz' } });
    expect(ids({ ...c, state: { ...state, stays: doneStays('Brittany') } })).toEqual(['approve', 'awards']);
  });
});

describe('tabBadges', () => {
  it('Group adds votes owed to a pending Finalize, Picks and Suggest carry their counts, and zero gives no key', () => {
    expect(tabBadges([])).toEqual({});
    const items = openItems(ctx({ me: 'Brittany', unrated: 4, state: { ...empty, suggestions: [sug('1', 'A'), sug('2', 'B')] }, group: group({ knockouts: [ko('ko:1'), ko('ko:2')] }) }));
    expect(tabBadges(items)).toEqual({ Group: 2, Picks: 4, Suggest: 2 });
    const fin = openItems(ctx({ group: group({ final: {} as GroupResult['final'] }) }));
    expect(tabBadges(fin)).toEqual({ Group: 1 });
    expect(tabBadges([...items, ...fin.filter(i => i.id === 'final')]).Group).toBe(3);
  });
  it('awards carry no tab badge', () => {
    expect(tabBadges(openItems(ctx({ group: group({ locked: true }), awardsUnseen: true })))).toEqual({});
  });
});

describe('awardsKey', () => {
  const a = (id: string, winners: Person[]): Award => ({ id, winners, value: 1, unit: 'x' });
  it('is stable for the same result and changes when a winner or an award changes', () => {
    const base = [a('foodie', ['Alex']), a('poseidon', ['Antek', 'Lazza'])];
    expect(awardsKey(base)).toBe(awardsKey([a('foodie', ['Alex']), a('poseidon', ['Antek', 'Lazza'])]));
    expect(awardsKey(base)).not.toBe(awardsKey([a('foodie', ['Saulie']), a('poseidon', ['Antek', 'Lazza'])]));
    expect(awardsKey(base)).not.toBe(awardsKey([base[0]]));
    expect(awardsKey([])).toBe('');
  });
});
