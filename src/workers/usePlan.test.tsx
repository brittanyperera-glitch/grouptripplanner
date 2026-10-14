import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import { groupResult } from '../lib/group';
import { emptyRanking, type AppState, type Item, type Leg, type Person, type Response } from '../types';
import { useGroupResult } from './usePlan';

const items = catalogue.items as Item[];
const L = legs as Leg[];
const resp = (name: Person, must: string[]): Response => {
  const r = emptyRanking(); r.must = must.map(m => [m]);
  return { name, days: 9, flex: false, pace: 1, ranking: r, rated: must, submitted: true, updatedAt: '' };
};
const state = (must: string[]): AppState => ({
  responses: {
    Brittany: resp('Brittany', must), Alex: resp('Alex', ['yala']), Antek: resp('Antek', ['rafting']),
    Lazza: resp('Lazza', ['train']), Saulie: resp('Saulie', ['surf']),
  }, suggestions: [], votes: [],
});

class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: { id: number }[] = [];
  constructor() { FakeWorker.all.push(this); }
  postMessage(m: { id: number }) { this.sent.push(m); }
  terminate() {}
  reply(id: number, result: unknown) { this.onmessage?.({ data: { id, result } }); }
}

const original = (globalThis as { Worker?: unknown }).Worker;
afterEach(() => { (globalThis as { Worker?: unknown }).Worker = original; FakeWorker.all = []; });

describe('useGroupResult', () => {
  it('without Worker returns the same result as groupResult', () => {
    const s = state(['sigiriya']);
    const { result } = renderHook(() => useGroupResult(s, items, L));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(groupResult(s, items, L));
  });

  it('ignores a stale reply and keeps last data while recomputing', () => {
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
    const a = state(['sigiriya']), b = state(['galle']);
    const { result, rerender } = renderHook(({ s }) => useGroupResult(s, items, L), { initialProps: { s: a } });
    const w = FakeWorker.all[0];
    expect(result.current).toEqual({ data: null, loading: true });
    const ra = groupResult(a, items, L), rb = groupResult(b, items, L);
    act(() => w.reply(1, ra));
    expect(result.current.data).toBe(ra);
    rerender({ s: b });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(ra);
    expect(w.sent.map(m => m.id)).toEqual([1, 2]);
    rerender({ s: a });
    expect(w.sent.map(m => m.id)).toEqual([1, 2, 3]);
    act(() => w.reply(3, ra));
    act(() => w.reply(2, rb));
    expect(result.current.data).toBe(ra);
    expect(result.current.loading).toBe(false);
  });
});
