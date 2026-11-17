import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseStore } from './supabase';
import { ADMIN_KEY, verifyAdminKey } from './tripKey';

type Opts = { global?: { headers?: Record<string, string> } } | undefined;
const fake = vi.hoisted(() => ({
  clients: [] as Array<{ id: number; headers: Record<string, string> }>,
  missing: [] as string[],
  mode: 'error' as 'error' | 'throw',
  rows: {} as Record<string, unknown[]>,
  writes: [] as Array<{ client: number; table: string; cols: Record<string, unknown>; opts: unknown }>,
  noFallen: false,
  denyAdmin: false,
  rpc: [] as Array<{ client: number; fn: string }>,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_u: string, _k: string, opts: Opts) => {
    const id = fake.clients.length;
    fake.clients.push({ id, headers: opts?.global?.headers ?? {} });
    return {
      from: (table: string) => ({
        select: () => {
          if (fake.missing.includes(table)) {
            if (fake.mode === 'throw') throw new Error('network down');
            const res = { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } };
            return { then: (r: (v: unknown) => unknown) => Promise.resolve(res).then(r), order: () => Promise.resolve(res) };
          }
          const res = { data: fake.rows[table] ?? [], error: null };
          return { then: (r: (v: unknown) => unknown) => Promise.resolve(res).then(r), order: () => Promise.resolve(res) };
        },
        upsert: async (cols: Record<string, unknown>, opts: unknown) => {
          fake.writes.push({ client: id, table, cols, opts });
          if (fake.denyAdmin) return { error: { code: '42501', message: 'new row violates row-level security policy' } };
          if (fake.noFallen && 'fallen' in cols) return { error: { code: 'PGRST204', message: "Could not find the 'fallen' column of 'stays_admin' in the schema cache" } };
          return { error: null };
        },
      }),
      rpc: async (fn: string) => { fake.rpc.push({ client: id, fn }); return { data: fake.denyAdmin ? false : true, error: null }; },
      channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; },
      removeChannel: async () => undefined,
    };
  },
}));

const store = () => new SupabaseStore('https://x.supabase.co', 'k', 'trip-pw');
const lastWrite = () => fake.writes[fake.writes.length - 1];

beforeEach(() => {
  localStorage.clear();
  Object.assign(fake, { clients: [], missing: [], mode: 'error', rows: { responses: [{ name: 'Alex', days: 9, pace: 1, ranking: null, rated: [], submitted: false, updated_at: null }] }, writes: [], noFallen: false, denyAdmin: false, rpc: [] });
});

describe('SupabaseStore final-stage load', () => {
  it.each(['error', 'throw'] as const)('missing trip_settings, travellers and booking_claims (%s) load as null and empty maps', async mode => {
    fake.missing = ['trip_settings', 'travellers', 'booking_claims'];
    fake.mode = mode;
    const s = await store().load();
    expect(s.responses.Alex?.days).toBe(9);
    expect(s.tripSettings).toBeNull();
    expect(s.travellers).toEqual({});
    expect(s.bookingClaims).toEqual({});
  });

  it('an empty trip_settings table is null, not undefined', async () => {
    expect((await store().load()).tripSettings).toBeNull();
  });

  it('maps last_day_start, and a missing column to null', async () => {
    fake.rows.trip_settings = [{ id: 1, start_date: null, plan: null, last_day_start: '07:00', updated_at: 'U' }];
    expect((await store().load()).tripSettings?.lastDayStart).toBe('07:00');
    fake.rows.trip_settings = [{ id: 1, start_date: null, plan: null, updated_at: 'U' }];
    expect((await store().load()).tripSettings?.lastDayStart).toBeNull();
  });

  it('maps the three tables', async () => {
    fake.rows.trip_settings = [{ id: 1, start_date: '2026-12-01', plan: { days: 9 }, booking_dates: { train: { bookBy: '2026-11-20' } }, overrides: [{ at: 't', what: 'w' }], updated_at: 'U' }];
    fake.rows.travellers = [{ name: 'Alex', arrive_local: '2026-12-01T09:30', arrive_flight: 'UL 504', depart_local: null, depart_flight: null, updated_at: 'U' }];
    fake.rows.booking_claims = [{ item_id: 'train', owner: 'Lazza', updated_at: 'U' }, { item_id: 'bus', owner: null, updated_at: 'U' }];
    const s = await store().load();
    expect(s.tripSettings).toEqual({ startDate: '2026-12-01', plan: { days: 9 }, bookingDates: { train: { bookBy: '2026-11-20' } }, overrides: [{ at: 't', what: 'w' }], updatedAt: 'U' });
    expect(s.travellers?.Alex).toEqual({ name: 'Alex', arriveLocal: '2026-12-01T09:30', arriveFlight: 'UL 504', departLocal: null, departFlight: null, updatedAt: 'U' });
    expect(s.bookingClaims).toEqual({ train: { itemId: 'train', owner: 'Lazza', updatedAt: 'U' }, bus: { itemId: 'bus', owner: null, updatedAt: 'U' } });
  });

  it('reads fallen from stays_admin, and a row without the column has none', async () => {
    fake.rows.stays_admin = [{ pins: [], scouts: {}, closed: [], nights: {}, fallen: [{ id: 'p', area: 'Ella', at: 't' }] }];
    expect((await store().load()).stays?.admin.fallen).toEqual([{ id: 'p', area: 'Ella', at: 't' }]);
    fake.rows.stays_admin = [{ pins: [], scouts: {}, closed: [], nights: {} }];
    expect((await store().load()).stays?.admin.fallen).toBeUndefined();
  });
});

describe('SupabaseStore final-stage writes', () => {
  it('saveTripSettings upserts only the given columns, on id, with the organiser header', async () => {
    localStorage.setItem(ADMIN_KEY, 'org');
    await store().saveTripSettings({ startDate: '2026-12-01', bookingDates: {} });
    const w = lastWrite();
    expect(w.table).toBe('trip_settings');
    expect(w.opts).toEqual({ onConflict: 'id' });
    expect(Object.keys(w.cols).sort()).toEqual(['booking_dates', 'id', 'start_date', 'updated_at']);
    expect(w.cols).toMatchObject({ id: 1, start_date: '2026-12-01' });
    expect(fake.clients[w.client].headers).toEqual({ 'x-trip-key': 'trip-pw', 'x-admin-key': 'org' });
  });

  it('saveStaysAdmin carries the organiser header too, and a non-admin write does not', async () => {
    localStorage.setItem(ADMIN_KEY, 'org');
    const s = store();
    await s.saveStaysAdmin({ closed: ['Ella'] });
    expect(fake.clients[lastWrite().client].headers['x-admin-key']).toBe('org');
    await s.saveBookingClaim('train', 'Alex');
    expect(fake.clients[lastWrite().client].headers['x-admin-key']).toBeUndefined();
  });

  it('without an organiser key an admin write goes out unauthorised, and the refusal reaches the caller as 42501', async () => {
    fake.denyAdmin = true;
    await expect(store().saveTripSettings({ startDate: '2026-12-01' })).rejects.toMatchObject({ code: '42501' });
    expect(fake.clients[lastWrite().client].headers['x-admin-key']).toBeUndefined();
  });

  it('a changed organiser key is used by the next write', async () => {
    const s = store();
    localStorage.setItem(ADMIN_KEY, 'one');
    await s.saveTripSettings({ startDate: 'a' });
    localStorage.setItem(ADMIN_KEY, 'two');
    await s.saveTripSettings({ startDate: 'b' });
    expect(fake.clients[lastWrite().client].headers['x-admin-key']).toBe('two');
  });

  it('saveTraveller and saveBookingClaim upsert their own rows', async () => {
    await store().saveTraveller('Alex', { departFlight: 'UL 505' });
    expect(lastWrite()).toMatchObject({ table: 'travellers', opts: { onConflict: 'name' }, cols: { name: 'Alex', depart_flight: 'UL 505' } });
    expect(Object.keys(lastWrite().cols).sort()).toEqual(['depart_flight', 'name', 'updated_at']);
    await store().saveBookingClaim('train', null);
    expect(lastWrite()).toMatchObject({ table: 'booking_claims', opts: { onConflict: 'item_id' }, cols: { item_id: 'train', owner: null } });
  });

  it('fallen goes in its own write', async () => {
    await store().saveStaysAdmin({ closed: ['Ella'], fallen: [{ id: 'p', area: 'Ella', at: 't' }] });
    expect(fake.writes.map(w => Object.keys(w.cols).filter(k => k !== 'id'))).toEqual([['closed'], ['fallen']]);
  });

  it('a live table without the fallen column loses nothing else and never throws', async () => {
    fake.noFallen = true;
    await store().saveStaysAdmin({ closed: ['Ella'], fallen: [{ id: 'p', area: 'Ella', at: 't' }] });
    expect(fake.writes[0].cols).toMatchObject({ closed: ['Ella'] });
    await store().saveStaysAdmin({ fallen: [] });
    expect(fake.writes).toHaveLength(3);
  });
});

describe('verifyAdminKey', () => {
  it('asks admin_ok with both headers', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'k');
    localStorage.setItem('tp-trip-key', 'trip-pw');
    expect(await verifyAdminKey('org')).toBe(true);
    expect(fake.rpc).toEqual([{ client: 0, fn: 'admin_ok' }]);
    expect(fake.clients[0].headers).toEqual({ 'x-trip-key': 'trip-pw', 'x-admin-key': 'org' });
    fake.denyAdmin = true;
    expect(await verifyAdminKey('bad')).toBe(false);
    vi.unstubAllEnvs();
  });
});
