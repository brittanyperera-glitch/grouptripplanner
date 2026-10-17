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
  missingNights: false,
  places: 'ok' as 'ok' | 'error' | 'throw',
  placeRows: [] as unknown[],
  admin: 'ok' as 'ok' | 'error' | 'throw',
  adminRows: [] as unknown[],
  trip: 'ok' as 'ok' | 'error' | 'throw',
  tripRows: [] as unknown[],
  inserts: [] as Array<[string, unknown]>,
  tripLose: 0,
  tripStored: null as null | { items: Record<string, unknown>; updated_at: string | null },
  tripInsertCode: undefined as string | undefined,
  updates: [] as Array<[string, unknown, string, unknown]>,
  selects: [] as Array<[string, string]>,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = (data: unknown[]) => ({ data, error: null });
      const q = {
        select: (cols: string) => {
          fake.selects.push([table, cols]);
          const soft = { place_suggestions: [fake.places, fake.placeRows], stays_admin: [fake.admin, fake.adminRows] } as Record<string, [string, unknown[]]>;
          if (soft[table]) {
            const [mode, rows] = soft[table];
            if (mode === 'throw') throw new Error('network down');
            const res = mode === 'error' ? { data: null, error: { message: `relation "public.${table}" does not exist` } } : result(rows);
            return { ...thenable(res), order: () => thenable(res) };
          }
          if (table === 'trip_admin') {
            if (fake.trip === 'throw') throw new Error('network down');
            const res = fake.trip === 'error' ? { data: null, error: { message: 'relation "public.trip_admin" does not exist' } } : result(fake.tripRows);
            const one = { data: fake.trip === 'error' ? null : (fake.tripStored ?? fake.tripRows[0] ?? null), error: res.error };
            return { ...thenable(res), eq: () => ({ maybeSingle: async () => one }) };
          }
          if (table === 'crew_stays') {
            if (fake.crew === 'throw') throw new Error('network down');
            return thenable(fake.crew === 'error' ? { data: null, error: { message: 'relation "public.crew_stays" does not exist' } } : result(fake.crewRows));
          }
          if (table !== 'responses') return { ...thenable(result([])), order: () => thenable(result([])) };
          const n = fake.loads++;
          fake.reads++;
          const row = { name: 'Alex', days: n + 1, flex: false, pace: 1, ranking: fake.ranking, rated: [], submitted: false, updated_at: null };
          return {
            ...thenable(result([row]), fake.delays[n] ?? 0),
            eq: () => ({ maybeSingle: async () => ({ data: fake.ranking === null ? null : { ranking: fake.ranking }, error: null }) }),
          };
        },
        upsert: async (cols: unknown, opts?: unknown) => {
          fake.upserts.push(cols); fake.upsertTables.push(table); fake.upsertOpts.push(opts);
          if (fake.missingNights && cols && typeof cols === 'object' && 'nights' in cols) return { error: { code: 'PGRST204', message: "Could not find the 'nights' column of 'stays_admin' in the schema cache" } };
          return { error: fake.failUpsert ? new Error('500') : null };
        },
        insert: async (cols: unknown) => {
          fake.inserts.push([table, cols]);
          if (fake.tripInsertCode && fake.inserts.length === 1) fake.tripStored = { items: { eta: { done: true } }, updated_at: 'T1' };
          return { error: fake.failUpsert ? new Error('500') : fake.tripInsertCode && fake.inserts.length === 1 ? { code: fake.tripInsertCode } : null };
        },
        update: (cols: unknown) => table === 'trip_admin' ? tripUpdate(cols) : ({
          eq: async (col: string, val: unknown) => { fake.updates.push([table, cols, col, val]); return { error: fake.failUpsert ? new Error('500') : null }; },
        }),
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

// A compare-and-swap update: .eq/.is filters stack, .select() resolves to the rows won (none while tripLose > 0).
function tripUpdate(cols: unknown) {
  const filters: unknown[] = [];
  const chain = {
    eq: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
    is: (c: string, v: unknown) => { filters.push([c, v, 'is']); return chain; },
    select: async () => {
      fake.updates.push(['trip_admin', cols, 'cas', filters]);
      if (fake.failUpsert) return { data: null, error: new Error('500') };
      if (fake.tripLose > 0) { fake.tripLose--; return { data: [], error: null }; }
      return { data: [{ name: 'Alex' }], error: null };
    },
  };
  return chain;
}

function thenable<T>(value: T, ms = 0) {
  return { then: (res: (v: T) => unknown) => new Promise(r => setTimeout(r, ms)).then(() => res(value)) };
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => {
  fake.handler = null; fake.delays = []; fake.loads = 0; fake.upserts = []; fake.reads = 0; fake.ranking = null;
  fake.crew = 'ok'; fake.crewRows = []; fake.upsertTables = []; fake.upsertOpts = []; fake.failUpsert = false; fake.missingNights = false;
  fake.places = 'ok'; fake.placeRows = []; fake.admin = 'ok'; fake.adminRows = []; fake.trip = 'ok'; fake.tripRows = []; fake.inserts = []; fake.updates = []; fake.tripLose = 0; fake.tripStored = null; fake.tripInsertCode = undefined; fake.selects = [];
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
  it('a patch holding both writes them in one request, with no read', async () => {
    fake.ranking = { ...R, final: null };
    await new SupabaseStore('https://x.supabase.co', 'k').saveResponse('Alex', { ranking: R, final: FIN });
    expect(fake.reads).toBe(0);
    expect(fake.upserts).toEqual([expect.objectContaining({ ranking: { ...R, final: FIN } })]);
  });
  it('a ranking without final keeps the stored final', async () => {
    fake.ranking = { ...R, final: FIN };
    const R2 = { must: [['b']], keen: [['a']], meh: [], skip: [] };
    await new SupabaseStore('https://x.supabase.co', 'k').saveResponse('Alex', { ranking: R2, days: 9 });
    expect(fake.upserts[0]).toMatchObject({ days: 9, ranking: { ...R2, final: FIN } });
  });
  it('a final without ranking is saved, over the stored ranking', async () => {
    fake.ranking = { ...R, final: null };
    await new SupabaseStore('https://x.supabase.co', 'k').saveResponse('Alex', { final: FIN });
    expect(fake.upserts[0]).toMatchObject({ ranking: { ...R, final: FIN } });
  });
  it('a final without ranking for a person with no row yet goes over an empty ranking', async () => {
    await new SupabaseStore('https://x.supabase.co', 'k').saveResponse('Alex', { final: FIN });
    expect(fake.upserts[0]).toMatchObject({ ranking: { must: [], keen: [], meh: [], skip: [], final: FIN } });
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

// The live database has crew_stays but not yet place_suggestions or stays_admin, so each table fails on its own.
describe('SupabaseStore place suggestions and stays admin', () => {
  const store = () => new SupabaseStore('https://x.supabase.co', 'k');
  const CREW = { name: 'Alex', prefs: [], quiz_done: true, locked: false, ranks: {}, bingo: [], updated_at: '2026-10-16T10:00:00.000Z' };
  const PLACE = {
    id: 'p1', name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut', link: null, price_gbp: 40, stay_type: 'guesthouse',
    rooms: null, why: 'view', photo: null, hostel_id: null, status: 'live', created_at: '2026-10-16T10:00:00.000Z',
  };

  it.each(['error', 'throw'] as const)('a missing place_suggestions or stays_admin (%s) leaves crew rows and the app loading', async mode => {
    fake.crewRows = [CREW];
    fake.places = mode;
    fake.admin = mode;
    const st = await store().load();
    expect(st.responses.Alex?.days).toBe(1);
    expect(st.stays?.crew.Alex?.quizDone).toBe(true);
    expect(st.stays?.suggestions).toEqual([]);
    expect(st.stays?.admin).toEqual(EMPTY_STAYS.admin);
  });

  it.each(['error', 'throw'] as const)('all three stays tables failing (%s) still resolves with EMPTY_STAYS', async mode => {
    fake.crew = mode; fake.places = mode; fake.admin = mode;
    expect((await store().load()).stays).toEqual(EMPTY_STAYS);
  });

  it('a missing crew_stays leaves place suggestions and admin loading', async () => {
    fake.crew = 'error';
    fake.placeRows = [PLACE];
    fake.adminRows = [{ pins: [{ area: 'Ella', suggestionId: 'p1', at: 't' }], scouts: { Ella: 'Lazza' } }];
    const st = await store().load();
    expect(st.stays?.crew).toEqual({});
    expect(st.stays?.suggestions.map(p => p.id)).toEqual(['p1']);
    expect(st.stays?.admin.scouts).toEqual({ Ella: 'Lazza' });
  });

  it('load() maps place rows, leaving null optional columns off', async () => {
    fake.placeRows = [PLACE];
    const st = await store().load();
    expect(st.stays?.suggestions).toEqual([{
      id: 'p1', name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut', priceGbp: 40, stayType: 'guesthouse', why: 'view',
      status: 'live', createdAt: '2026-10-16T10:00:00.000Z',
    }]);
  });

  it('addPlaceSuggestion inserts a live row with snake_case columns', async () => {
    await store().addPlaceSuggestion({ name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut', priceGbp: 40, stayType: 'hostel', rooms: 'dorm', hostelId: 'h1' });
    expect(fake.inserts).toHaveLength(1);
    const [table, cols] = fake.inserts[0] as [string, Record<string, unknown>];
    expect(table).toBe('place_suggestions');
    expect(cols).toMatchObject({ name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut', price_gbp: 40, stay_type: 'hostel', rooms: 'dorm', hostel_id: 'h1', status: 'live' });
    expect(typeof cols.id).toBe('string');
  });

  it('setPlaceStatus updates that one row by id', async () => {
    await store().setPlaceStatus('p1', 'withdrawn');
    expect(fake.updates).toEqual([['place_suggestions', { status: 'withdrawn' }, 'id', 'p1']]);
  });

  it('saveStaysAdmin with pins only writes them whole on id 1, without a read', async () => {
    const pins = [{ area: 'Ella' as const, suggestionId: 'p1', at: 't' }];
    await store().saveStaysAdmin({ pins });
    expect(fake.selects.filter(([t]) => t === 'stays_admin')).toEqual([]);
    expect(fake.upsertTables).toEqual(['stays_admin']);
    expect(fake.upsertOpts).toEqual([{ onConflict: 'id' }]);
    expect(fake.upserts[0]).toEqual({ id: 1, pins });
  });

  it('a stored admin row without closed loads with closed empty, and with it loads as stored', async () => {
    fake.adminRows = [{ pins: [], scouts: {} }];
    expect((await store().load()).stays?.admin.closed).toEqual([]);
    fake.adminRows = [{ pins: [], scouts: {}, closed: ['Ella'] }];
    expect((await store().load()).stays?.admin.closed).toEqual(['Ella']);
  });

  it('saveStaysAdmin with closed only writes just closed on id 1, without a read', async () => {
    await store().saveStaysAdmin({ closed: ['Ella'] });
    expect(fake.selects.filter(([t]) => t === 'stays_admin')).toEqual([]);
    expect(fake.upserts[0]).toEqual({ id: 1, closed: ['Ella'] });
  });

  it('nights load as stored, and a row from before the column loads with none', async () => {
    fake.adminRows = [{ pins: [], scouts: {}, closed: [] }];
    expect((await store().load()).stays?.admin.nights).toBeUndefined();
    // Added 2026-10-17 (review): a row without the column marks nights off so the stepper hides; a row with it, even empty, does not.
    expect((await store().load()).stays?.admin.nightsOff).toBe(true);
    fake.adminRows = [{ pins: [], scouts: {}, closed: [], nights: {} }];
    expect((await store().load()).stays?.admin.nightsOff).toBeUndefined();
    fake.adminRows = [{ pins: [], scouts: {}, closed: [], nights: { Ella: 3, Colombo: 40 } }];
    expect((await store().load()).stays?.admin.nights).toEqual({ Ella: 3 });
  });

  it('saveStaysAdmin with nights writes just nights, clamped to whole numbers 1 to 14', async () => {
    await store().saveStaysAdmin({ nights: { Ella: 3, Colombo: 99 } });
    expect(fake.upserts[0]).toEqual({ id: 1, nights: { Ella: 3 } });
  });

  it('a live table without the nights column still takes the rest of the admin row, and the queue is not wedged', async () => {
    fake.missingNights = true;
    const pins = [{ area: 'Ella' as const, suggestionId: 'p1', at: 't' }];
    await expect(store().saveStaysAdmin({ pins, nights: { Ella: 3 } })).resolves.toBeUndefined();
    expect(fake.upserts).toEqual([{ id: 1, pins, nights: { Ella: 3 } }, { id: 1, pins }]);
    fake.upserts = [];
    await expect(store().saveStaysAdmin({ nights: { Ella: 3 } })).resolves.toBeUndefined();
    expect(fake.upserts).toEqual([{ id: 1, nights: { Ella: 3 } }]);
  });

  it('a different upsert failure alongside nights still throws, so the queue keeps it', async () => {
    fake.failUpsert = true;
    await expect(store().saveStaysAdmin({ nights: { Ella: 3 } })).rejects.toThrow('500');
  });

  it('saveStaysAdmin merges scouts by area into the stored map, and undefined clears one area', async () => {
    fake.adminRows = [{ scouts: { Ella: 'Lazza', North: 'Alex', Colombo: 'Antek' } }];
    await store().saveStaysAdmin({ scouts: { Ella: 'Saulie', North: undefined } });
    expect(fake.upserts[0]).toEqual({ id: 1, scouts: { Ella: 'Saulie', Colombo: 'Antek' } });
  });

  it('saveStaysAdmin throws when the scouts read or the write fails, so the queue keeps it', async () => {
    fake.admin = 'error';
    await expect(store().saveStaysAdmin({ scouts: { Ella: 'Alex' } })).rejects.toBeTruthy();
    expect(fake.upserts).toEqual([]);
    fake.admin = 'ok';
    fake.failUpsert = true;
    await expect(store().saveStaysAdmin({ pins: [] })).rejects.toThrow('500');
  });
});

// trip_admin is loaded in its own call and fails alone: the live database has no such table until the schema is re-run.
describe('SupabaseStore trip admin', () => {
  const store = () => new SupabaseStore('https://x.supabase.co', 'k');
  const ROW = { name: 'Alex', items: { flights: { done: true, doneAt: 't', ref: 'ABC' }, money: { done: true } }, updated_at: '2026-10-17T10:00:00.000Z' };

  it.each(['error', 'throw'] as const)('a missing trip_admin (%s) leaves the rest loading, with the checklist empty', async mode => {
    fake.trip = mode;
    fake.crewRows = [{ name: 'Alex', prefs: [], quiz_done: true, locked: false, ranks: {}, bingo: [], updated_at: '2026-10-16T10:00:00.000Z' }];
    const st = await store().load();
    expect(st.responses.Alex?.days).toBe(1);
    expect(st.stays?.crew.Alex?.quizDone).toBe(true);
    expect(st.tripAdmin).toEqual({});
  });

  it('load() maps rows by person', async () => {
    fake.tripRows = [ROW];
    expect((await store().load()).tripAdmin).toEqual({ Alex: { name: 'Alex', items: ROW.items, updatedAt: '2026-10-17T10:00:00.000Z' } });
  });

  // Changed deliberately (two devices of one person lost each other's ticks): the write is a compare-and-swap update, not a blind upsert.
  it('saveTripAdmin merges the patch into the stored items by id and updates only if updated_at is unchanged', async () => {
    fake.tripRows = [ROW];
    await store().saveTripAdmin('Alex', { eta: { done: true }, flights: { done: false } });
    expect(fake.upserts).toEqual([]);
    const [, cols, , filters] = fake.updates[0] as [string, { items: unknown }, string, unknown[]];
    expect(cols.items).toEqual({ money: { done: true }, eta: { done: true }, flights: { done: false } });
    expect(filters).toEqual([['name', 'Alex'], ['updated_at', ROW.updated_at]]);
  });

  it('saveTripAdmin re-reads and merges again when another device wrote between its read and write', async () => {
    fake.tripRows = [ROW];
    fake.tripLose = 1;
    await store().saveTripAdmin('Alex', { eta: { done: true } });
    expect(fake.updates).toHaveLength(2);
    expect(fake.selects.filter(([t]) => t === 'trip_admin')).toHaveLength(2);
  });

  it('saveTripAdmin keeps the save for the queue when it keeps losing the race', async () => {
    fake.tripRows = [ROW];
    fake.tripLose = 99;
    await expect(store().saveTripAdmin('Alex', { eta: { done: true } })).rejects.toThrow('changed under');
  });

  it('saveTripAdmin inserts the first row, and retries via update when a second device inserted first', async () => {
    await store().saveTripAdmin('Alex', { eta: { done: true } });
    expect(fake.inserts).toEqual([['trip_admin', expect.objectContaining({ name: 'Alex', items: { eta: { done: true } } })]]);
    fake.inserts = []; fake.tripInsertCode = '23505'; fake.tripStored = null;
    await store().saveTripAdmin('Alex', { flights: { done: true } });
    expect((fake.updates[0][1] as { items: unknown }).items).toEqual({ eta: { done: true }, flights: { done: true } });
  });

  it('saveTripAdmin throws when the read or the write fails, so the queue keeps it', async () => {
    fake.trip = 'error';
    await expect(store().saveTripAdmin('Alex', { eta: { done: true } })).rejects.toBeTruthy();
    expect(fake.upserts).toEqual([]);
    fake.trip = 'ok';
    fake.failUpsert = true;
    await expect(store().saveTripAdmin('Alex', { eta: { done: true } })).rejects.toThrow('500');
  });
});
