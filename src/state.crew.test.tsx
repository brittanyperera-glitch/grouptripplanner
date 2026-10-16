import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './store/local';
import { AppProvider, useApp } from './state';
import type { CrewStays, PrefAnswer } from './types';

// A store whose crew write never finishes, standing in for a slow network (the live store has no self-broadcast).
class SlowCrewStore extends LocalStore {
  saveCrewStays(): Promise<void> { return new Promise(() => undefined); }
}
// Stores a crew write without telling this tab, like SupabaseStore; push() is the poll arriving.
class QuietCrewStore extends LocalStore {
  rows: Partial<Record<CrewStays['name'], CrewStays>> = {};
  private cbs = new Set<(s: Awaited<ReturnType<LocalStore['load']>>) => void>();
  override async load() {
    const s = await super.load();
    return { ...s, stays: { ...s.stays!, crew: structuredClone(this.rows) } };
  }
  override async saveCrewStays(name: CrewStays['name'], patch: Partial<Omit<CrewStays, 'name'>>) {
    this.rows[name] = { ...(this.rows[name] ?? { name, prefs: [], quizDone: false, locked: false, ranks: {}, bingo: [] }), ...patch, name, updatedAt: new Date().toISOString() };
  }
  override subscribe(cb: (s: Awaited<ReturnType<LocalStore['load']>>) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  async push() { const s = await this.load(); this.cbs.forEach(cb => cb(s)); }
}

const PREF: PrefAnswer = { topic: 'budget', picks: { low: 'happy' }, noPreference: false, skipped: false };
let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>ready</div>; };

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => cleanup());

describe('my crew stays writes', () => {
  it('show at once, before the write finishes', async () => {
    render(<AppProvider store={new SlowCrewStore()}><Probe /></AppProvider>);
    await screen.findByText('ready');
    act(() => { void ctx.store.saveCrewStays('Alex', { prefs: [PREF], quizDone: true }); });
    expect(ctx.state.stays?.crew.Alex).toMatchObject({ name: 'Alex', prefs: [PREF], quizDone: true });
    act(() => { void ctx.store.saveCrewStays('Alex', { locked: true }); });
    expect(ctx.state.stays?.crew.Alex).toMatchObject({ prefs: [PREF], quizDone: true, locked: true });
  });

  it('give way to the server row once it holds the write, so a later server change shows', async () => {
    const store = new QuietCrewStore();
    render(<AppProvider store={store}><Probe /></AppProvider>);
    await screen.findByText('ready');
    await act(async () => { await ctx.store.saveCrewStays('Alex', { quizDone: true }); });
    expect(ctx.state.stays?.crew.Alex?.quizDone).toBe(true);
    await act(async () => { await store.push(); });
    store.rows.Alex = { ...store.rows.Alex!, quizDone: false, updatedAt: new Date(Date.now() + 60_000).toISOString() };
    await act(async () => { await store.push(); });
    expect(ctx.state.stays?.crew.Alex?.quizDone).toBe(false);
  });
});
