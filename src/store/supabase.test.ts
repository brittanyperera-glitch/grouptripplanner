import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseStore } from './supabase';
import { EMPTY_STAYS } from '../types';

const fake = vi.hoisted(() => ({
  handler: null as null | (() => void),
  delays: [] as number[],
  loads: 0,
  upserts: [] as unknown[],
  reads: 0,
  ranking: null as unknown,
  crew: 'ok' as 'ok' | 'error' | 'throw',
  crewRows: [] as unknown[],
  upsertTables: [] as string[],
  upsertOpts: [] as unknown[],
  failUpsert: false,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = (data: unknown[]) => ({ data, error: null });
      const q = {
        select: () => {
          if (table === 'crew_stays') {
            if (fake.crew === 'throw') throw new Error('network down');
            return thenable(fake.crew === 'error' ? { data: null, error: { message: 'relation "public.crew_stays" does not exist' } } : result(fake.crewRows));
          }
          if (table !== 'responses') return { ...thenable(result([])), order: () => thenable(result([])) };
          const n = fake.loads++;
          fake.reads++;
          const row = { name: 'Alex', days: n + 1, flex: false, pace: 1, ranking: fake.ranking, rated: [], submitted: false, updated_at: null };
          return { ...thenable(result([row]), fake.delays[n] ?? 0), eq: () => ({ maybeSingle: async () => result([]) }) };
        },
        upsert: async (cols: unknown, opts?: unknown) => {
          fake.upserts.push(cols); fake.upsertTables.push(table); fake.upsertOpts.push(opts);
          return { error: fake.failUpsert ? new Error('500') : null };
        },
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

beforeEach(() => {
  fake.handler = null; fake.delays = []; fake.loads = 0; fake.upserts = []; fake.reads = 0; fake.ranking = null;
  fake.crew = 'ok'; fake.crewRows = []; fake.upsertTables = []; fake.upsertOpts = []; fake.failUpsert = false;
});

describe('SupabaseStore.saveResponse', () => {
  it('upserts the row it is given without reading the server first', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'k');
    await s.saveResponse('Alex', { days: 9, flex: false, pace: 1, rated: ['a'], submitted: false });
    expect(fake.reads).toBe(0);
    expect(fake.upserts).toHaveLength(1);
    expect(fake.upserts[0]).toMatchObject({ name: 'Alex', days: 9, pace: 1, rated: ['a'] });
  });
});

// The final list rides inside the ranking jsonb column, so the live table needs no new column.
describe('SupabaseStore final list', () => {
  const R = { must: [['a', 'b']], keen: [], meh: [], skip: [] };
  const FIN = { must: [['b'], ['a']], keen: [], meh: [], skip: [] };
  it('writes it inside the ranking column', async () => {
    const s = new SupabaseStore('https://x.supabase.co', 'k');
    await s.saveResponse('Alex', { ranking: R, final: FIN });
    expect(fake.upserts[0]).toMatchObject({ ranking: { ...R, final: FIN } });
    expect(fake.upserts[0]).not.toHaveProperty('final');
  });
  it('reads it back out of the ranking column', async () => {
    fake.ranking = { ...R, final: FIN };
    const r = (await new SupabaseStore('https://x.supabase.co', 'k').load()).responses.Alex!;
    expect(r.ranking).toEqual(R);
    expect(r.final).toEqual(FIN);
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

// A missing crew_stays table (schema not yet re-run) must not blank the app with "Couldn't load".
describe('SupabaseStore crew stays', () => {
  it.each(['error', 'throw'] as const)('load() still resolves when the crew_stays read fails (%s), with stays empty', async mode => {
    fake.crew = mode;
    const st = await new SupabaseStore('https://x.supabase.co', 'k').load();
    expect(st.responses.Alex?.days).toBe(1);
    expect(st.suggestions).toEqual([]);
    expect(st.votes).toEqual([]);
    expect(st.stays).toEqual(EMPTY_STAYS);
  });

  it('load() maps crew_stays rows', async () => {
    fake.crewRows = [{ name: 'Alex', prefs: [], quiz_done: true, locked: false, ranks: {}, bingo: [], updated_at: '2026-10-16T10:00:00.000Z' }];
    const st = await new SupabaseStore('https://x.supabase.co', 'k').load();
    expect(st.stays?.crew.Alex).toEqual({ name: 'Alex', prefs: [], quizDone: true, locked: false, ranks: {}, bingo: [], updatedAt: '2026-10-16T10:00:00.000Z' });
  });

  it('saveCrewStays upserts only the given fields on conflict name', async () => {
    await new SupabaseStore('https://x.supabase.co', 'k').saveCrewStays('Alex', { quizDone: true, locked: false });
    expect(fake.upsertTables).toEqual(['crew_stays']);
    expect(fake.upsertOpts).toEqual([{ onConflict: 'name' }]);
    const cols = fake.upserts[0] as Record<string, unknown>;
    expect(cols).toMatchObject({ name: 'Alex', quiz_done: true, locked: false });
    expect(Object.keys(cols).sort()).toEqual(['locked', 'name', 'quiz_done', 'updated_at']);
  });

  it('saveCrewStays throws when the write fails, so the queue keeps it', async () => {
    fake.failUpsert = true;
    await expect(new SupabaseStore('https://x.supabase.co', 'k').saveCrewStays('Alex', { locked: true })).rejects.toThrow('500');
  });
});
