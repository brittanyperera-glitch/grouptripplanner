import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from './state';

// Stands in for Supabase: every read and the trip-key check can be made to answer, fail with a 500, or hang.
const fake = vi.hoisted(() => ({ hang: false, settingsError: null as null | { code: string; message: string } }));
const ROW = { name: 'Alex', days: 9, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: true, updated_at: '2026-11-16T10:00:00.000Z' };
const SETTINGS = { id: 1, start_date: '2026-12-01', plan: null, booking_dates: {}, overrides: [], updated_at: '2026-11-16T09:00:00.000Z' };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const never = new Promise<never>(() => undefined);
    const ch = { on: () => ch, subscribe: () => ch, send: async () => 'ok' };
    return {
      rpc: () => (fake.hang ? never : Promise.resolve({ data: true, error: null })),
      from: (table: string) => ({
        select: () => {
          const res = fake.hang ? never
            : Promise.resolve(table === 'trip_settings' && fake.settingsError ? { data: null, error: fake.settingsError }
              : { data: table === 'responses' ? [ROW] : table === 'trip_settings' ? [SETTINGS] : [], error: null });
          return { then: (r: (v: unknown) => unknown) => res.then(r), order: () => res };
        },
      }),
      channel: () => ch,
      removeChannel: async () => undefined,
    };
  },
}));

let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>app is up</div>; };
const snapState = { responses: { Alex: { name: 'Alex', days: 7, flex: false, pace: 1, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: true, updatedAt: '2026-11-16T10:00:00.000Z' } }, suggestions: [], votes: [] };
const stored = () => localStorage.getItem('tp:snapshot');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tp:me', 'Alex');
  fake.hang = false; fake.settingsError = null;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('boot with a stored trip key and a snapshot', () => {
  it('shows the snapshot at 0 ms and flags offline at 4000 ms when neither verify nor load answers', async () => {
    localStorage.setItem('tp-trip-key', 'pw');
    localStorage.setItem('tp:snapshot', JSON.stringify({ at: '2026-11-16T10:30:00.000Z', state: snapState, tripSettings: null }));
    fake.hang = true;
    vi.useFakeTimers();
    render(<AppProvider><Probe /></AppProvider>);
    expect(screen.getByText('app is up')).toBeInTheDocument();
    expect(ctx.state.responses.Alex?.days).toBe(7);
    expect(ctx.offlineSince).toBeNull();
    await act(async () => { vi.advanceTimersByTime(3999); });
    expect(ctx.offlineSince).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(ctx.offlineSince).toBe('2026-11-16T10:30:00.000Z');
  });

  it('without a snapshot it still waits on Loading for the key check', async () => {
    localStorage.setItem('tp-trip-key', 'pw');
    fake.hang = true;
    render(<AppProvider><Probe /></AppProvider>);
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('app is up')).toBeNull();
  });
});

describe('a transient read error on trip_settings', () => {
  it('keeps the previous tripSettings and leaves tp:snapshot alone, while a missing table reads as null', async () => {
    localStorage.setItem('tp-trip-key', 'pw');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T11:00:00.000Z'));
    render(<AppProvider><Probe /></AppProvider>);
    await screen.findByText('app is up');
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(ctx.state.tripSettings?.startDate).toBe('2026-12-01');
    const before = stored();
    expect(before).toContain('"startDate":"2026-12-01"');

    vi.setSystemTime(new Date('2026-11-16T11:05:00.000Z'));
    fake.settingsError = { code: '500', message: 'Internal Server Error' };
    await act(async () => { ctx.retry(); await new Promise(r => setTimeout(r, 0)); });
    expect(ctx.error).toBe("Couldn't load");
    expect(ctx.state.tripSettings?.startDate).toBe('2026-12-01');
    expect(stored()).toBe(before);

    fake.settingsError = { code: 'PGRST205', message: "Could not find the table 'public.trip_settings' in the schema cache" };
    await act(async () => { ctx.retry(); await new Promise(r => setTimeout(r, 0)); });
    expect(ctx.error).toBeNull();
    expect(ctx.state.tripSettings).toBeNull();
  });
});
