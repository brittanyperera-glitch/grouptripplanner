import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from './guest/MemoryStore';
import { LocalStore } from './store/local';
import { AppProvider, MAX_OVERRIDES, useApp } from './state';
import type { AppState } from './types';

// A write that never finishes, standing in for a slow network; so the overlay is what the screen shows.
class SlowStore extends LocalStore {
  saveTripSettings(): Promise<void> { return new Promise(() => undefined); }
  saveTraveller(): Promise<void> { return new Promise(() => undefined); }
  saveBookingClaim(): Promise<void> { return new Promise(() => undefined); }
}
class HangStore extends LocalStore {
  load(): Promise<AppState> { return new Promise(() => undefined); }
}

let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>ready</div>; };
const mount = async (store: LocalStore | MemoryStore, sandbox?: { onFinish(): void }) => {
  render(<AppProvider store={store} sandbox={sandbox}><Probe /></AppProvider>);
  await screen.findByText('ready');
};
const row = (days: number) => ({ name: 'Alex' as const, days, flex: false, pace: 1 as const, ranking: { must: [], keen: [], meh: [], skip: [] }, rated: [], submitted: true, updatedAt: '2026-11-16T10:00:00.000Z' });
const snapshot = (): AppState => ({ responses: { Alex: row(9) }, suggestions: [], votes: [] });

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('final-stage state', () => {
  it('tripSettings, travellers and claims come back from the first load, null and empty on a fresh store', async () => {
    await mount(new LocalStore());
    expect(ctx.state.tripSettings).toBeNull();
    expect(ctx.state.travellers).toEqual({});
    expect(ctx.state.bookingClaims).toEqual({});
    expect(ctx.needsAdminKey).toBe(false);
    expect(ctx.offlineSince).toBeNull();
  });

  it('my three kinds of write show at once and sit on disk under their tp:pending keys until saved', async () => {
    await mount(new SlowStore());
    act(() => { void ctx.saveTripSettings({ startDate: '2026-12-01' }, 'start'); });
    act(() => { void ctx.saveTraveller('Alex', { arriveFlight: 'UL 504' }); });
    act(() => { void ctx.claimBooking('train', 'Lazza'); });
    expect(ctx.state.tripSettings?.startDate).toBe('2026-12-01');
    expect(ctx.state.travellers?.Alex?.arriveFlight).toBe('UL 504');
    expect(ctx.state.bookingClaims?.train?.owner).toBe('Lazza');
    expect(JSON.parse(localStorage.getItem('tp:pending:settings') ?? 'null').patch.startDate).toBe('2026-12-01');
    expect(JSON.parse(localStorage.getItem('tp:pending:travellers') ?? 'null').Alex.patch.arriveFlight).toBe('UL 504');
    expect(JSON.parse(localStorage.getItem('tp:pending:claims') ?? 'null').train.owner).toBe('Lazza');
  });

  it('writes saved for real give way to the server row and clear their pending key', async () => {
    const store = new LocalStore();
    await mount(store);
    await act(async () => { await ctx.saveTripSettings({ startDate: '2026-12-01' }, 'start'); await ctx.saveTraveller('Alex', { arriveFlight: 'x' }); await ctx.claimBooking('train', 'Alex'); });
    await act(async () => { ctx.retry(); });
    expect((await store.load()).tripSettings?.startDate).toBe('2026-12-01');
    expect(ctx.state.tripSettings?.startDate).toBe('2026-12-01');
    expect(ctx.state.bookingClaims?.train?.owner).toBe('Alex');
  });

  it('logs an override when the plan, start date or booking dates change, and not for a traveller or a claim', async () => {
    const store = new LocalStore();
    await mount(store);
    await act(async () => { await ctx.saveTripSettings({ startDate: '2026-12-01' }, 'start moved'); });
    await act(async () => { await ctx.saveTripSettings({ bookingDates: { train: { bookBy: '2026-11-20' } } }); });
    await act(async () => { await ctx.saveTraveller('Alex', { arriveFlight: 'x' }); await ctx.claimBooking('train', 'Alex'); });
    const log = (await store.load()).tripSettings?.overrides ?? [];
    expect(log.map(e => e.what)).toEqual(['start moved', 'bookingDates']);
    expect(typeof log[0].at).toBe('string');
  });

  it('keeps only the last 100 override entries', async () => {
    const store = new LocalStore();
    await mount(store);
    for (let i = 0; i < MAX_OVERRIDES + 5; i++) await act(async () => { await ctx.saveTripSettings({ startDate: `2026-12-${String(i % 28 + 1).padStart(2, '0')}` }, `edit ${i}`); });
    const log = (await store.load()).tripSettings?.overrides ?? [];
    expect(log).toHaveLength(MAX_OVERRIDES);
    expect(log[0].what).toBe('edit 5');
    expect(log[MAX_OVERRIDES - 1].what).toBe(`edit ${MAX_OVERRIDES + 4}`);
  });

  it('a refused organiser write drops the job, clears the overlay and asks for the key; a good key clears the ask', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    localStorage.setItem('tp-admin-key', 'wrong');
    const store = new LocalStore();
    await mount(store);
    await act(async () => { await ctx.saveTripSettings({ startDate: '2026-12-01' }, 'start'); });
    await act(async () => { await ctx.store.saveStaysAdmin({ closed: ['Ella'] }); });
    expect(ctx.needsAdminKey).toBe(true);
    expect(ctx.state.tripSettings).toBeNull();
    expect(ctx.state.stays?.admin.closed).toEqual([]);
    expect(localStorage.getItem('tp:pending:settings')).toBeNull();
    expect(localStorage.getItem('tp:pending:admin')).toBeNull();
    expect(ctx.error).toBeNull();
    let ok = true;
    await act(async () => { ok = await ctx.setAdminKey('nope'); });
    expect(ok).toBe(false);
    expect(ctx.needsAdminKey).toBe(true);
    await act(async () => { ok = await ctx.setAdminKey('secret'); });
    expect(ok).toBe(true);
    expect(ctx.needsAdminKey).toBe(false);
    expect(localStorage.getItem('tp-admin-key')).toBe('secret');
    await act(async () => { await ctx.saveTripSettings({ startDate: '2026-12-01' }, 'start'); });
    expect((await store.load()).tripSettings?.startDate).toBe('2026-12-01');
  });
});

describe('snapshot', () => {
  const stored = () => JSON.parse(localStorage.getItem('tp:snapshot') ?? 'null');

  it('is written after a non-empty load, with the settings', async () => {
    const store = new LocalStore();
    await store.saveResponse('Alex', { days: 7 });
    await store.saveTripSettings({ startDate: '2026-12-01' });
    await mount(store);
    expect(stored().state.responses.Alex.days).toBe(7);
    expect(stored().tripSettings.startDate).toBe('2026-12-01');
    expect(typeof stored().at).toBe('string');
  });

  it('is not written for an empty read, and an empty read never overwrites a good one', async () => {
    localStorage.setItem('tp:snapshot', JSON.stringify({ at: '2026-11-16T10:30:00.000Z', state: snapshot(), tripSettings: null }));
    await mount(new LocalStore());
    expect(stored().state.responses.Alex.days).toBe(9);
    localStorage.removeItem('tp:snapshot');
    cleanup();
    await mount(new LocalStore());
    expect(localStorage.getItem('tp:snapshot')).toBeNull();
  });

  it('is never written by a guest sandbox', async () => {
    await mount(new MemoryStore(), { onFinish: () => undefined });
    expect(localStorage.getItem('tp:snapshot')).toBeNull();
  });

  it('boot shows it at once while the load is pending, and flags offline only after 4 s', async () => {
    localStorage.setItem('tp:snapshot', JSON.stringify({ at: '2026-11-16T10:30:00.000Z', state: snapshot(), tripSettings: null }));
    vi.useFakeTimers();
    render(<AppProvider store={new HangStore()}><Probe /></AppProvider>);
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(ctx.state.responses.Alex?.days).toBe(9);
    expect(ctx.offlineSince).toBeNull();
    await act(async () => { vi.advanceTimersByTime(3999); });
    expect(ctx.offlineSince).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(ctx.offlineSince).toBe('2026-11-16T10:30:00.000Z');
    expect(ctx.state.responses.Alex?.days).toBe(9);
  });

  it('a load that arrives replaces the snapshot and clears the flag', async () => {
    localStorage.setItem('tp:snapshot', JSON.stringify({ at: '2026-11-16T10:30:00.000Z', state: snapshot(), tripSettings: null }));
    const store = new LocalStore();
    await store.saveResponse('Alex', { days: 14 });
    await mount(store);
    expect(ctx.state.responses.Alex?.days).toBe(14);
    expect(ctx.offlineSince).toBeNull();
  });

  it('a corrupt snapshot is ignored', async () => {
    localStorage.setItem('tp:snapshot', '{"at":1,"state":[]}');
    await mount(new LocalStore());
    expect(ctx.offlineSince).toBeNull();
  });
});
