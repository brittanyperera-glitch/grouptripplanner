import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './local';
import { WriteQueue } from './queue';
import type { Response } from '../types';
import { emptyRanking } from '../types';

type Patch = Partial<Omit<Response, 'name'>>;
type Name = Parameters<LocalStore['saveResponse']>[0];
const full = (over: Patch): Patch => ({ days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, ...over });
const hooks = () => ({ fails: 0, clears: 0, onFail() { this.fails++; }, onClear() { this.clears++; } });

beforeEach(() => localStorage.clear());

describe('WriteQueue', () => {
  it('failed save, newer save, retry: the latest full row is what gets stored', async () => {
    let offline = true;
    class Flaky extends LocalStore {
      override async saveResponse(...a: Parameters<LocalStore['saveResponse']>) {
        if (offline) throw new Error('offline');
        return super.saveResponse(...a);
      }
    }
    const base = new Flaky();
    const h = hooks();
    const q = new WriteQueue(base, h);
    await q.store.saveResponse('Alex', full({ days: 9 }));
    await q.store.saveResponse('Alex', full({ days: 14, pace: 2 }));
    expect(h.fails).toBeGreaterThan(0);
    offline = false;
    expect(await q.flush()).toBe(true);
    const row = (await base.load()).responses.Alex;
    expect(row?.days).toBe(14);
    expect(row?.pace).toBe(2);
    expect(h.clears).toBe(1);
  });

  it('retry sends one request per person, not one per failed save', async () => {
    const sent: Patch[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async saveResponse(_n: Name, p: Patch) {
        if (this.fail) throw new Error('offline');
        sent.push(p);
      }
    }
    const base = new Spy();
    const q = new WriteQueue(base, hooks());
    for (const d of [5, 6, 7]) await q.store.saveResponse('Alex', full({ days: d }));
    base.fail = false;
    await q.flush();
    expect(sent.map(p => p.days)).toEqual([7]);
  });

  it('keeps only the latest vote per fork and person', async () => {
    const sent: string[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async vote(v: Parameters<LocalStore['vote']>[0]) {
        if (this.fail) throw new Error('offline');
        sent.push(`${v.forkId}:${v.name}:${v.choice}`);
      }
    }
    const base = new Spy();
    const q = new WriteQueue(base, hooks());
    await q.store.vote({ forkId: 'f1', name: 'Alex', choice: 'a' });
    await q.store.vote({ forkId: 'f1', name: 'Alex', choice: 'b' });
    await q.store.vote({ forkId: 'f2', name: 'Alex', choice: 'a' });
    base.fail = false;
    await q.flush();
    expect(sent.sort()).toEqual(['f1:Alex:b', 'f2:Alex:a']);
  });

  it('never runs two writes at once and keeps submit order', async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    class Slow extends LocalStore {
      override async saveResponse(_n: Name, p: Patch) {
        active++; maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 5));
        order.push(p.days as number);
        active--;
      }
    }
    const q = new WriteQueue(new Slow(), hooks());
    await Promise.all([
      q.store.saveResponse('Alex', full({ days: 1 })),
      q.store.saveResponse('Brittany', full({ days: 2 })),
      q.store.saveResponse('Antek', full({ days: 3 })),
    ]);
    expect(maxActive).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it('a newer save that lands while an older one is failing is not overwritten by the retry', async () => {
    const sent: number[] = [];
    let calls = 0;
    class Spy extends LocalStore {
      override async saveResponse(_n: Name, p: Patch) {
        calls++;
        if (calls === 1) { await new Promise(r => setTimeout(r, 5)); throw new Error('offline'); }
        sent.push(p.days as number);
      }
    }
    const q = new WriteQueue(new Spy(), hooks());
    await Promise.all([
      q.store.saveResponse('Alex', full({ days: 9 })),
      q.store.saveResponse('Alex', full({ days: 14 })),
    ]);
    await q.flush();
    expect(sent.at(-1)).toBe(14);
  });
});
