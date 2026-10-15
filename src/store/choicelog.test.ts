import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './local';
import { WriteQueue } from './queue';
import { choicesToCsv } from './choices';
import type { Ranking } from '../types';

beforeEach(() => localStorage.clear());

const rk = (o: Partial<Ranking>): Ranking => ({ must: [], keen: [], meh: [], skip: [], ...o });
const hooks = { onFail: () => undefined, onClear: () => undefined };
const setup = () => {
  const base = new LocalStore();
  return { base, store: new WriteQueue(base, hooks).store };
};

describe('choice log', () => {
  it('a re-rank after swipes keeps the original tiers and the re-rank', async () => {
    const { base, store } = setup();
    await store.saveResponse('Alex', { ranking: rk({ must: [['a']] }), rated: ['a'] });
    await store.saveResponse('Alex', { ranking: rk({ must: [['a']], keen: [['b']] }), rated: ['a', 'b'] });
    await store.saveResponse('Alex', { ranking: rk({ must: [['b']], keen: [['a']] }), rated: ['a', 'b'] });
    const log = await base.loadLog();
    expect(log.filter(e => e.kind === 'tier').map(e => [e.ref, (e.value as { tier: string }).tier])).toEqual([['a', 'must'], ['b', 'keen']]);
    const re = log.filter(e => e.kind === 'rerank');
    expect(re).toHaveLength(1);
    expect((re[0].value as { ranking: Ranking }).ranking.must).toEqual([['b']]);
  });

  it('a changed knockout vote keeps both votes, and a repeated click adds nothing', async () => {
    const { base, store } = setup();
    await store.vote({ forkId: 'ko:x', name: 'Alex', choice: 'a' });
    await store.vote({ forkId: 'ko:x', name: 'Alex', choice: 'b' });
    await store.vote({ forkId: 'ko:x', name: 'Alex', choice: 'b' });
    const log = (await base.loadLog()).filter(e => e.kind === 'knockout');
    expect(log.map(e => (e.value as { choice: string }).choice)).toEqual(['a', 'b']);
    expect((await base.load()).votes).toHaveLength(1);
  });

  it('logs days, pace and suggestions once each', async () => {
    const { base, store } = setup();
    await store.saveResponse('Lazza', { days: 9, flex: false, pace: null, ranking: rk({}), rated: [] });
    await store.saveResponse('Lazza', { days: 9, flex: false, pace: 1, ranking: rk({}), rated: [] });
    await store.saveResponse('Lazza', { days: 9, flex: false, pace: 1, ranking: rk({}), rated: [] });
    await store.addSuggestion({ name: 'Lazza', title: 'Hike', area: 'Ella', note: 'n' });
    expect((await base.loadLog()).map(e => e.kind)).toEqual(['days', 'pace', 'suggest']);
  });
});

describe('choicesToCsv', () => {
  it('has a header and one row per entry', () => {
    const e = (id: string, ref: string) => ({ id, name: 'Alex' as const, kind: 'tier' as const, ref, value: { tier: 'must', pos: 0 }, at: `2026-10-0${id}T10:00:00Z` });
    const csv = choicesToCsv([e('2', 'b'), e('1', 'a')], id => id.toUpperCase()).split('\n');
    expect(csv[0]).toBe('Friend,Time,What,Place,Choice');
    expect(csv).toHaveLength(3);
    expect(csv[1]).toContain('A');
  });
});

describe('choice_log schema', () => {
  const sql = readFileSync('supabase/schema.sql', 'utf8').replace(/--.*$/gm, '');
  it('allows anon insert and select only', () => {
    expect(sql).toMatch(/create policy "anon insert" on choice_log for insert to anon/);
    expect(sql).toMatch(/create policy "anon select" on choice_log for select to anon/);
    expect(sql).not.toMatch(/on choice_log for (update|delete|all)/);
  });
});
