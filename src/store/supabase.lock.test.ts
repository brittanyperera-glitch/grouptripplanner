import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseStore } from './supabase';

const fake = vi.hoisted(() => ({
  clientArgs: [] as unknown[][],
  loads: 0,
  sent: [] as unknown[],
  handlers: [] as { type: string; filter: unknown; cb: () => void }[],
  removed: 0,
  failWrite: false,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    fake.clientArgs.push(args);
    return {
      from: (table: string) => ({
        select: () => {
          if (table === 'responses') fake.loads++;
          const res = { data: [], error: null };
          return { then: (r: (v: unknown) => unknown) => Promise.resolve(res).then(r), order: () => Promise.resolve(res) };
        },
        upsert: async () => ({ error: fake.failWrite ? new Error('no') : null }),
        insert: async () => ({ error: fake.failWrite ? new Error('no') : null }),
        update: () => ({ eq: async () => ({ error: fake.failWrite ? new Error('no') : null }) }),
      }),
      channel: (name: string) => {
        const ch = {
          name,
          on: (type: string, filter: unknown, cb: () => void) => { fake.handlers.push({ type, filter, cb }); return ch; },
          subscribe: () => ch,
          send: async (m: unknown) => { fake.sent.push(m); return 'ok'; },
        };
        return ch;
      },
      removeChannel: async () => { fake.removed++; },
    };
  },
}));

const flush = async () => { await vi.advanceTimersByTimeAsync(400); };
const ping = () => fake.handlers.find(h => h.type === 'broadcast')!.cb();

beforeEach(() => {
  fake.clientArgs = []; fake.loads = 0; fake.sent = []; fake.handlers = []; fake.removed = 0; fake.failWrite = false;
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe('SupabaseStore trip password', () => {
  it('sends the password as the x-trip-key header on every request', () => {
    new SupabaseStore('https://x.supabase.co', 'anon', 'made-up-pass');
    expect(fake.clientArgs[0]).toEqual(['https://x.supabase.co', 'anon', { global: { headers: { 'x-trip-key': 'made-up-pass' } } }]);
  });
});

describe('SupabaseStore.subscribe live updates', () => {
  it('reloads when a broadcast ping arrives, and listens on the tp channel for event changed', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'anon', 'p');
    const cb = vi.fn();
    const off = s.subscribe(cb);
    expect(fake.handlers.some(h => h.type === 'postgres_changes')).toBe(false);
    expect(fake.handlers.find(h => h.type === 'broadcast')!.filter).toEqual({ event: 'changed' });
    ping();
    await flush();
    expect(fake.loads).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('reloads every 20 seconds', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'anon', 'p');
    const off = s.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(19_000);
    expect(fake.loads).toBe(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fake.loads).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fake.loads).toBe(2);
    off();
  });

  it('reloads when the page becomes visible, and not while hidden', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'anon', 'p');
    const off = s.subscribe(vi.fn());
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(fake.loads).toBe(0);
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(fake.loads).toBe(1);
    vis.mockRestore();
    off();
  });

  it('cleanup stops the ping, the interval and the visibility listener and drops the channel', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'anon', 'p');
    const off = s.subscribe(vi.fn());
    off();
    expect(fake.removed).toBe(1);
    ping();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.loads).toBe(0);
  });
});

describe('SupabaseStore write pings', () => {
  const ev = { type: 'broadcast', event: 'changed', payload: {} };
  it('pings after every kind of successful write', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'anon', 'p');
    s.subscribe(vi.fn());
    await s.saveResponse('Alex', { days: 9 });
    await s.vote({ forkId: 'f', name: 'Alex', choice: 'a' });
    await s.addSuggestion({ name: 'Alex', title: 't', area: 'Ella', note: '' });
    await s.setSuggestionStatus('id', 'live');
    await s.logChoice({ name: 'Alex', kind: 'days', ref: null, value: {} });
    expect(fake.sent).toEqual([ev, ev, ev, ev, ev]);
  });

  it('does not ping when the write fails', async () => {
    fake.failWrite = true;
    const s = new SupabaseStore('https://x.supabase.co', 'anon', 'p');
    s.subscribe(vi.fn());
    await expect(s.saveResponse('Alex', { days: 9 })).rejects.toThrow();
    await expect(s.vote({ forkId: 'f', name: 'Alex', choice: 'a' })).rejects.toThrow();
    await expect(s.logChoice({ name: 'Alex', kind: 'days', ref: null, value: {} })).rejects.toThrow();
    expect(fake.sent).toEqual([]);
  });
});
