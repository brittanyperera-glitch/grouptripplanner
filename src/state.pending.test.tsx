import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './store/local';
import { AppProvider, useApp } from './state';
import { applyAdmin, blankCrew } from './types';
import type { CrewStays, PlaceDraft, PlaceSuggestion, Player, PrefAnswer, StaysAdmin, Vote } from './types';

type Loaded = Awaited<ReturnType<LocalStore['load']>>;
// The live database: writes fail while `fail` is set, a stored write never notifies this tab, push() is the poll.
class Server extends LocalStore {
  fail = true;
  sent: string[] = [];
  crew: Partial<Record<Player, CrewStays>> = {};
  votes: Vote[] = [];
  places: PlaceSuggestion[] = [{ name: 'Lazza', area: 'Ella', kind: 'eat', title: 'Curry shack', id: 'p1', status: 'live', createdAt: 't' }];
  admin: StaysAdmin = { pins: [], scouts: {}, closed: [] };
  private cbs = new Set<(s: Loaded) => void>();
  private gate(what: string) {
    if (this.fail) throw new Error('offline');
    this.sent.push(what);
  }
  override async load(): Promise<Loaded> {
    const s = await super.load();
    return { ...s, votes: structuredClone(this.votes), stays: { crew: structuredClone(this.crew), suggestions: structuredClone(this.places), admin: structuredClone(this.admin) } };
  }
  override async saveCrewStays(n: Player, p: Partial<Omit<CrewStays, 'name'>>) {
    this.gate(`crew ${n}`);
    this.crew[n] = { ...(this.crew[n] ?? blankCrew(n)), ...p, name: n, updatedAt: new Date(Date.now() + 1).toISOString() };
  }
  override async vote(v: Vote) {
    this.gate(`vote ${v.forkId} ${v.choice}`);
    this.votes = [...this.votes.filter(x => !(x.forkId === v.forkId && x.name === v.name)), v];
  }
  override async addPlaceSuggestion(d: PlaceDraft) {
    this.gate(`add ${d.title}`);
    this.places.push({ ...d, id: `srv${this.places.length}`, status: 'live', createdAt: 't' });
  }
  override async setPlaceStatus(id: string, st: PlaceSuggestion['status']) {
    this.gate(`status ${id} ${st}`);
    this.places = this.places.map(p => (p.id === id ? { ...p, status: st } : p));
  }
  override async saveStaysAdmin(p: Partial<StaysAdmin>) {
    this.gate('admin');
    this.admin = applyAdmin(this.admin, p);
  }
  override async logChoice() {}
  override subscribe(cb: (s: Loaded) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  async push() { const s = await this.load(); this.cbs.forEach(cb => cb(s)); }
}

const PREF: PrefAnswer = { topic: 'budget', picks: { low: 'happy' }, noPreference: false, skipped: false };
const DRAFT: PlaceDraft = { name: 'Alex', area: 'Ella', kind: 'stay', title: 'Hill hut' };
let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>ready</div>; };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const mount = async (store: Server) => {
  render(<AppProvider store={store}><Probe /></AppProvider>);
  await screen.findByText('ready');
  await settle();
};
const pendingKeys = () => Object.keys(localStorage).filter(k => k.startsWith('tp:pending:'));

// Every write the stays phase makes, each failing; then the page reloads.
async function failEverythingThenReload(store: Server) {
  await mount(store);
  await act(async () => {
    await ctx.store.saveCrewStays('Alex', { prefs: [PREF], quizDone: true });
    await ctx.store.vote({ forkId: 'react:p1', name: 'Alex', choice: 'a' });
    await ctx.store.addPlaceSuggestion(DRAFT);
    await ctx.store.setPlaceStatus('p1', 'withdrawn');
    await ctx.store.saveStaysAdmin({ scouts: { Ella: 'Lazza' } });
  });
  expect(ctx.state.stays?.crew.Alex?.quizDone).toBe(true);
  cleanup();
  await mount(store);
}

const showsEverything = () => {
  expect(ctx.state.stays?.crew.Alex).toMatchObject({ quizDone: true, prefs: [PREF] });
  expect(ctx.state.votes).toContainEqual({ forkId: 'react:p1', name: 'Alex', choice: 'a' });
  expect(ctx.state.stays?.suggestions).toMatchObject([{ id: 'p1', status: 'withdrawn' }, { title: 'Hill hut', status: 'live' }]);
  expect(ctx.state.stays?.admin.scouts).toEqual({ Ella: 'Lazza' });
};

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => cleanup());

describe('my failed stays writes, across a reload', () => {
  it('are still shown while the server is still failing', async () => {
    const store = new Server();
    await failEverythingThenReload(store);
    showsEverything();
    expect(store.sent).toEqual([]);
  });

  it('are re-sent once after the first server read, then cleared from disk once the server holds them', async () => {
    const store = new Server();
    store.fail = true;
    await mount(store);
    await act(async () => {
      await ctx.store.saveCrewStays('Alex', { prefs: [PREF], quizDone: true });
      await ctx.store.vote({ forkId: 'react:p1', name: 'Alex', choice: 'a' });
      await ctx.store.addPlaceSuggestion(DRAFT);
      await ctx.store.setPlaceStatus('p1', 'withdrawn');
      await ctx.store.saveStaysAdmin({ scouts: { Ella: 'Lazza' } });
    });
    expect(pendingKeys().length).toBeGreaterThan(0);
    cleanup();
    store.fail = false;
    await mount(store);
    await settle();
    expect(store.sent.sort()).toEqual(['add Hill hut', 'admin', 'crew Alex', 'status p1 withdrawn', 'vote react:p1 a']);
    showsEverything();
    await act(async () => { await store.push(); });
    await settle();
    showsEverything();
    expect(ctx.state.stays?.suggestions.map(p => p.id)).toEqual(['p1', 'srv1']);
    expect(pendingKeys()).toEqual([]);
  });

  it('a cleared scout survives the reload as a clear', async () => {
    const store = new Server();
    store.admin = { pins: [], scouts: { Ella: 'Lazza', North: 'Alex' }, closed: [] };
    await mount(store);
    await act(async () => { await ctx.store.saveStaysAdmin({ scouts: { Ella: undefined } }); });
    cleanup();
    store.fail = false;
    await mount(store);
    await settle();
    expect(store.admin.scouts).toEqual({ North: 'Alex' });
    expect(ctx.state.stays?.admin.scouts).toEqual({ North: 'Alex' });
  });
});

describe('a close ranking that failed to save', () => {
  it('is resent after the reload, shows meanwhile, and gives way once the server holds it', async () => {
    const store = new Server();
    await mount(store);
    await act(async () => { await ctx.store.saveStaysAdmin({ closed: ['Ella'] }); });
    expect(ctx.state.stays?.admin.closed).toEqual(['Ella']);
    cleanup();
    store.fail = false;
    await mount(store);
    await settle();
    expect(store.admin.closed).toEqual(['Ella']);
    expect(ctx.state.stays?.admin.closed).toEqual(['Ella']);
    await act(async () => { await store.push(); });
    await settle();
    expect(pendingKeys()).toEqual([]);
  });
});

describe('my vote, once the server holds it', () => {
  it('gives way, so a later change on the server shows', async () => {
    const store = new Server();
    store.fail = false;
    await mount(store);
    await act(async () => { await ctx.store.vote({ forkId: 'f1', name: 'Alex', choice: 'a' }); });
    await act(async () => { await store.push(); });
    store.votes = [{ forkId: 'f1', name: 'Alex', choice: 'b' }];
    await act(async () => { await store.push(); });
    expect(ctx.state.votes).toEqual([{ forkId: 'f1', name: 'Alex', choice: 'b' }]);
  });
});
