import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseStore } from './supabase';

const fake = vi.hoisted(() => ({ errors: {} as Record<string, { code?: string; message: string }> }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => {
        const e = fake.errors[table];
        const res = e ? { data: null, error: e } : { data: table === 'responses' ? [{ name: 'Alex', days: 9, pace: 1, ranking: null, rated: [], submitted: false, updated_at: null }] : [], error: null };
        return { then: (r: (v: unknown) => unknown) => Promise.resolve(res).then(r), order: () => Promise.resolve(res) };
      },
    }),
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; },
    removeChannel: async () => undefined,
  }),
}));

const store = () => new SupabaseStore('https://x.supabase.co', 'k', 'trip-pw');
beforeEach(() => { fake.errors = {}; });

describe('a read error on the three soft tables', () => {
  it.each([
    ['PGRST205', 'Could not find the table'],
    ['PGRST204', 'Could not find the column'],
    ['42P01', 'relation "trip_settings" does not exist'],
    [undefined, 'something not in the schema cache'],
  ])('a missing-table error (%s) reads as absent', async (code, message) => {
    fake.errors = { trip_settings: { code, message }, travellers: { code, message }, booking_claims: { code, message } };
    const s = await store().load();
    expect(s.tripSettings).toBeNull();
    expect(s.travellers).toEqual({});
    expect(s.bookingClaims).toEqual({});
  });

  it.each([
    ['42704', 'role "anon" does not exist'],
    ['42501', 'permission denied for relation trip_settings'],
    [undefined, 'permission denied for relation trip_settings'],
    [undefined, 'role "anon" does not exist'],
  ])('an unrelated error (%s: %s) is not a missing table and fails the load', async (code, message) => {
    fake.errors = { trip_settings: { code, message } };
    await expect(store().load()).rejects.toMatchObject({ message });
  });

  it.each(['crew_stays', 'place_suggestions', 'stays_admin', 'trip_admin'])('a 500 on %s fails the whole load, so the snapshot keeps the stays and checklist', async table => {
    fake.errors = { [table]: { code: '500', message: 'Internal Server Error' } };
    await expect(store().load()).rejects.toMatchObject({ message: 'Internal Server Error' });
  });

  it.each(['crew_stays', 'place_suggestions', 'stays_admin', 'trip_admin'])('a missing %s still reads as empty', async table => {
    fake.errors = { [table]: { code: 'PGRST205', message: 'Could not find the table' } };
    await expect(store().load()).resolves.toBeDefined();
  });

  it.each(['trip_settings', 'travellers', 'booking_claims'])('a 500 on %s fails the whole load instead of reading as absent', async table => {
    fake.errors = { [table]: { code: '500', message: 'Internal Server Error' } };
    await expect(store().load()).rejects.toMatchObject({ message: 'Internal Server Error' });
  });
});
