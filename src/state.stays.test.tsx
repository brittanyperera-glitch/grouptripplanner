import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './store/local';
import { AppProvider, useApp } from './state';
import type { PlaceDraft, PlaceSuggestion, StaysAdmin } from './types';

type Loaded = Awaited<ReturnType<LocalStore['load']>>;
// Writes that never finish, standing in for a slow network.
class SlowStore extends LocalStore {
  addPlaceSuggestion(): Promise<void> { return new Promise(() => undefined); }
  setPlaceStatus(): Promise<void> { return new Promise(() => undefined); }
  saveStaysAdmin(): Promise<void> { return new Promise(() => undefined); }
}
// Stores a write without telling this tab, like SupabaseStore; push() is the poll arriving.
class QuietStore extends LocalStore {
  places: PlaceSuggestion[] = [];
  admin: StaysAdmin = { pins: [], scouts: {}, closed: [] };
  statusCalls: Array<[string, PlaceSuggestion['status']]> = [];
  private cbs = new Set<(s: Loaded) => void>();
  override async load() {
    const s = await super.load();
    return { ...s, stays: { ...s.stays!, suggestions: structuredClone(this.places), admin: structuredClone(this.admin) } };
  }
  override async addPlaceSuggestion(d: PlaceDraft) {
    this.places.push({ ...d, id: `srv${this.places.length}`, status: 'live', createdAt: new Date().toISOString() });
  }
  override async setPlaceStatus(id: string, st: PlaceSuggestion['status']) {
    this.statusCalls.push([id, st]);
    this.places = this.places.map(p => (p.id === id ? { ...p, status: st } : p));
  }
  override async saveStaysAdmin(patch: Partial<StaysAdmin>) {
    this.admin = { pins: patch.pins ?? this.admin.pins, scouts: { ...this.admin.scouts, ...patch.scouts }, closed: patch.closed ?? this.admin.closed };
  }
  override subscribe(cb: (s: Loaded) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  async push() { const s = await this.load(); this.cbs.forEach(cb => cb(s)); }
}

const DRAFT: PlaceDraft = { name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut' };
const pin = (suggestionId: string | null) => ({ area: 'Ella' as const, suggestionId, at: 't' });
let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>ready</div>; };
const mount = async (store: LocalStore) => {
  render(<AppProvider store={store}><Probe /></AppProvider>);
  await screen.findByText('ready');
};

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => cleanup());

describe('my place and admin writes', () => {
  it('show at once, before the write finishes', async () => {
    await mount(new SlowStore());
    act(() => { void ctx.store.addPlaceSuggestion(DRAFT); });
    expect(ctx.state.stays?.suggestions).toMatchObject([{ ...DRAFT, status: 'live' }]);
    act(() => { void ctx.store.setPlaceStatus(ctx.state.stays!.suggestions[0].id, 'withdrawn'); });
    expect(ctx.state.stays?.suggestions).toMatchObject([{ title: 'Hill hut', status: 'withdrawn' }]);
    act(() => { void ctx.store.saveStaysAdmin({ pins: [pin('a')], scouts: { Ella: 'Lazza', North: 'Alex' } }); });
    act(() => { void ctx.store.saveStaysAdmin({ scouts: { Ella: 'Saulie' } }); });
    expect(ctx.state.stays?.admin).toEqual({ pins: [pin('a')], scouts: { Ella: 'Saulie', North: 'Alex' }, closed: [] });
  });

  it('a withdraw on a server row shows at once', async () => {
    const store = new SlowStore();
    localStorage.setItem('tp:placesug', JSON.stringify([{ ...DRAFT, id: 'p1', status: 'live', createdAt: 't' }]));
    await mount(store);
    act(() => { void ctx.store.setPlaceStatus('p1', 'withdrawn'); });
    expect(ctx.state.stays?.suggestions).toEqual([{ ...DRAFT, id: 'p1', status: 'withdrawn', createdAt: 't' }]);
  });

  it('give way to the server once it holds them, with no duplicate row, so a later server change shows', async () => {
    const store = new QuietStore();
    await mount(store);
    await act(async () => { await ctx.store.addPlaceSuggestion(DRAFT); await ctx.store.saveStaysAdmin({ scouts: { Ella: 'Lazza' } }); });
    await act(async () => { await store.push(); });
    expect(ctx.state.stays?.suggestions.map(p => p.id)).toEqual(['srv0']);
    store.places[0].status = 'withdrawn';
    store.admin.scouts = { Ella: 'Antek' };
    await act(async () => { await store.push(); });
    expect(ctx.state.stays?.suggestions.map(p => p.status)).toEqual(['withdrawn']);
    expect(ctx.state.stays?.admin.scouts).toEqual({ Ella: 'Antek' });
  });

  it('a withdraw made before my add reached the server is sent to the real row once it arrives', async () => {
    const store = new QuietStore();
    await mount(store);
    await act(async () => { await ctx.store.addPlaceSuggestion(DRAFT); });
    await act(async () => { await ctx.store.setPlaceStatus(ctx.state.stays!.suggestions[0].id, 'withdrawn'); });
    expect(store.statusCalls).toEqual([]);
    await act(async () => { await store.push(); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(store.statusCalls).toEqual([['srv0', 'withdrawn']]);
    expect(ctx.state.stays?.suggestions).toMatchObject([{ id: 'srv0', status: 'withdrawn' }]);
    await act(async () => { await store.push(); });
    store.places[0].status = 'live';
    await act(async () => { await store.push(); });
    expect(ctx.state.stays?.suggestions).toMatchObject([{ id: 'srv0', status: 'live' }]);
  });

  it('an identical earlier suggestion on the server does not swallow my new one', async () => {
    const store = new QuietStore();
    store.places = [{ ...DRAFT, id: 'old', status: 'withdrawn', createdAt: 't' }];
    await mount(store);
    act(() => { void ctx.store.addPlaceSuggestion(DRAFT); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    store.places = [{ ...DRAFT, id: 'old', status: 'withdrawn', createdAt: 't' }];
    await act(async () => { await store.push(); });
    expect(ctx.state.stays?.suggestions.map(p => p.status)).toEqual(['withdrawn', 'live']);
  });
});
