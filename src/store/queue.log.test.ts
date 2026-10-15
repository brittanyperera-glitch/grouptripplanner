import { describe, expect, it } from 'vitest';
import { ServerLike } from './__fixtures__/serverLike';
import { WriteQueue } from './queue';
import { emptyRanking } from '../types';

const hooks = () => ({ fails: 0, clears: 0, onFail() { this.fails++; }, onClear() { this.clears++; } });
const swipe = (ids: string[]) => ({ days: 9, flex: false, pace: 1 as const, ranking: { ...emptyRanking(), must: ids.map(i => [i]) }, rated: ids, submitted: false });

describe('WriteQueue and the choice log', () => {
  it('a failing log does not block the response save, raise the error, or fail the flush', async () => {
    const base = new ServerLike();
    base.failLog = true;
    const h = hooks();
    const q = new WriteQueue(base, h);
    await q.store.saveResponse('Alex', swipe(['a']));
    expect(base.rows.Alex?.rated).toEqual(['a']);
    expect(h.fails).toBe(0);
    expect(await q.flush()).toBe(true);
  });

  it('failed log entries wait in one job: each retry sends one request, not one per save', async () => {
    const base = new ServerLike();
    base.failLog = true;
    const q = new WriteQueue(base, hooks());
    for (const ids of [['a'], ['a', 'b'], ['a', 'b', 'c']]) await q.store.saveResponse('Alex', swipe(ids));
    const before = base.logCalls;
    await q.flush();
    expect(base.logCalls - before).toBe(1);

    base.failLog = false;
    await q.flush();
    expect(base.log.map(e => e.kind)).toEqual(['tier', 'days', 'pace', 'tier', 'tier']);
    expect(base.log.filter(e => e.kind === 'tier').map(e => e.ref)).toEqual(['a', 'b', 'c']);
  });

  it('a reset to no days logs no days entry', async () => {
    const base = new ServerLike();
    const q = new WriteQueue(base, hooks());
    await q.store.saveResponse('Alex', swipe(['a']));
    base.log = [];
    await q.store.saveResponse('Alex', { days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, final: null });
    expect(base.log.map(e => e.kind)).not.toContain('days');
  });
});
