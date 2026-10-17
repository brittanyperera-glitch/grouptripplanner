import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './store/local';
import { AppProvider, useApp } from './state';
import type { AdminItems } from './types';

type Loaded = Awaited<ReturnType<LocalStore['load']>>;
// A write that never finishes, standing in for a slow network.
class SlowStore extends LocalStore {
  saveTripAdmin(): Promise<void> { return new Promise(() => undefined); }
}
// Holds rows like SupabaseStore: a save does not notify this tab until push() (the poll) arrives.
class QuietStore extends LocalStore {
  items: AdminItems = {};
  stamp = '2000-01-01T00:00:00.000Z';
  private cbs = new Set<(s: Loaded) => void>();
  override async load() {
    const s = await super.load();
    return { ...s, tripAdmin: { Alex: { name: 'Alex' as const, items: structuredClone(this.items), updatedAt: this.stamp } } };
  }
  override async saveTripAdmin(_n: string, p: AdminItems) { this.items = { ...this.items, ...p }; this.stamp = new Date(Date.now() + 1000).toISOString(); }
  override subscribe(cb: (s: Loaded) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  async push() { const s = await this.load(); this.cbs.forEach(cb => cb(s)); }
}

let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>ready</div>; };
const mount = async (store: LocalStore) => {
  render(<AppProvider store={store}><Probe /></AppProvider>);
  await screen.findByText('ready');
};

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => cleanup());

describe('my trip admin writes', () => {
  it('show at once, before the write finishes, merged by item id', async () => {
    await mount(new SlowStore());
    act(() => { void ctx.store.saveTripAdmin('Alex', { flights: { done: true } }); });
    act(() => { void ctx.store.saveTripAdmin('Alex', { eta: { done: true }, flights: { done: false } }); });
    expect(ctx.state.tripAdmin?.Alex?.items).toEqual({ flights: { done: false }, eta: { done: true } });
  });

  it('are kept on disk while unsaved, so a reload still shows them', async () => {
    await mount(new SlowStore());
    act(() => { void ctx.store.saveTripAdmin('Alex', { money: { done: true } }); });
    expect(JSON.parse(localStorage.getItem('tp:pending:trip') ?? 'null').Alex.items).toEqual({ money: { done: true } });
  });

  it('give way to the server once it holds them, so a later server change shows', async () => {
    const store = new QuietStore();
    await mount(store);
    await act(async () => { await ctx.store.saveTripAdmin('Alex', { flights: { done: true } }); });
    await act(async () => { await store.push(); });
    expect(localStorage.getItem('tp:pending:trip')).toBeNull();
    store.items = { flights: { done: false } };
    store.stamp = new Date(Date.now() + 60_000).toISOString();
    await act(async () => { await store.push(); });
    expect(ctx.state.tripAdmin?.Alex?.items).toEqual({ flights: { done: false } });
  });
});
