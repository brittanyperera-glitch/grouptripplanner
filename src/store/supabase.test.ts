import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseStore } from './supabase';

const fake = vi.hoisted(() => ({
  handler: null as null | (() => void),
  delays: [] as number[],
  loads: 0,
  upserts: [] as unknown[],
  reads: 0,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = (data: unknown[]) => ({ data, error: null });
      const q = {
        select: () => {
          if (table !== 'responses') return { ...thenable(result([])), order: () => thenable(result([])) };
          const n = fake.loads++;
          fake.reads++;
          const row = { name: 'Alex', days: n + 1, flex: false, pace: 1, ranking: null, rated: [], submitted: false, updated_at: null };
          return { ...thenable(result([row]), fake.delays[n] ?? 0), eq: () => ({ maybeSingle: async () => result([]) }) };
        },
        upsert: async (cols: unknown) => { fake.upserts.push(cols); return { error: null }; },
      };
      return q;
    },
    channel: () => {
      const ch = { on: (_e: string, _c: unknown, h: () => void) => { fake.handler = h; return ch; }, subscribe: () => ch };
      return ch;
    },
    removeChannel: async () => undefined,
  }),
}));

function thenable<T>(value: T, ms = 0) {
  return { then: (res: (v: T) => unknown) => new Promise(r => setTimeout(r, ms)).then(() => res(value)) };
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => { fake.handler = null; fake.delays = []; fake.loads = 0; fake.upserts = []; fake.reads = 0; });

describe('SupabaseStore.saveResponse', () => {
  it('upserts the row it is given without reading the server first', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'k');
    await s.saveResponse('Alex', { days: 9, flex: false, pace: 1, rated: ['a'], submitted: false });
    expect(fake.reads).toBe(0);
    expect(fake.upserts).toHaveLength(1);
    expect(fake.upserts[0]).toMatchObject({ name: 'Alex', days: 9, pace: 1, rated: ['a'] });
  });
});

describe('SupabaseStore.subscribe', () => {
  it('a burst of change events causes one reload', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'k');
    const cb = vi.fn();
    const off = s.subscribe(cb);
    for (let i = 0; i < 5; i++) { fake.handler?.(); await wait(10); }
    await wait(400);
    expect(fake.loads).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('an older snapshot that resolves after a newer one is never applied', async () => {
    fake.delays = [400, 0];
    const s = new SupabaseStore('https://x.supabase.co', 'k');
    const cb = vi.fn();
    const off = s.subscribe(cb);
    fake.handler?.();
    await wait(260);
    fake.handler?.();
    await wait(700);
    expect(fake.loads).toBe(2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].responses.Alex.days).toBe(2);
    off();
  });
});
