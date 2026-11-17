import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from './store/local';
import { AppProvider, capWhat, MAX_OVERRIDES, useApp } from './state';
import { applyAdmin } from './types';
import type { Fallen, StaysAdmin } from './types';

type Loaded = Awaited<ReturnType<LocalStore['load']>>;
// The live database for the admin row: writes fail while `fail` is set, push() is the poll.
class Server extends LocalStore {
  fail = true;
  sent: Partial<StaysAdmin>[] = [];
  admin: StaysAdmin = { pins: [], scouts: {}, closed: [] };
  private cbs = new Set<(s: Loaded) => void>();
  override async load(): Promise<Loaded> {
    const s = await super.load();
    return { ...s, stays: { crew: {}, suggestions: [], admin: structuredClone(this.admin) } };
  }
  override async saveStaysAdmin(p: Partial<StaysAdmin>) {
    if (this.fail) throw new Error('offline');
    this.sent.push(p);
    this.admin = applyAdmin(this.admin, p);
  }
  override subscribe(cb: (s: Loaded) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  async push() { const s = await this.load(); this.cbs.forEach(cb => cb(s)); }
}

let ctx: ReturnType<typeof useApp>;
const Probe = () => { ctx = useApp(); return <div>ready</div>; };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const mount = async (store: LocalStore) => {
  render(<AppProvider store={store}><Probe /></AppProvider>);
  await screen.findByText('ready');
  await settle();
};
const FALLEN: Fallen[] = [{ id: 'p1', area: 'Ella', at: '2026-11-20T10:00' }];

beforeEach(() => { localStorage.clear(); localStorage.setItem('tp:me', 'Alex'); });
afterEach(() => { cleanup(); });

describe('a pending fallen overlay', () => {
  it('is dropped once the server returns the same list, and is not resent on the next boot', async () => {
    const store = new Server();
    await mount(store);
    await act(async () => { await ctx.store.saveStaysAdmin({ fallen: FALLEN }); });
    expect(JSON.parse(localStorage.getItem('tp:pending:admin') ?? 'null')).toEqual({ fallen: FALLEN });
    cleanup();
    store.fail = false;
    store.admin = { ...store.admin, fallen: structuredClone(FALLEN) };
    await mount(store);
    expect(localStorage.getItem('tp:pending:admin')).toBeNull();
    await act(async () => { await store.push(); });
    cleanup();
    await mount(store);
    expect(store.sent).toEqual([]);
    expect(ctx.state.stays?.admin.fallen).toEqual(FALLEN);
  });

  it('stays while the server holds a different list', async () => {
    const store = new Server();
    await mount(store);
    await act(async () => { await ctx.store.saveStaysAdmin({ fallen: FALLEN }); });
    store.admin = { ...store.admin, fallen: [{ id: 'p2', area: 'Ella', at: 'x' }] };
    await act(async () => { await store.push(); });
    expect(localStorage.getItem('tp:pending:admin')).not.toBeNull();
    expect(ctx.state.stays?.admin.fallen).toEqual(FALLEN);
  });

  it('a pending pin overlay does not hide the server fallen list', async () => {
    const store = new Server();
    store.admin = { ...store.admin, fallen: structuredClone(FALLEN) };
    await mount(store);
    await act(async () => { await ctx.store.saveStaysAdmin({ pins: [{ area: 'Ella', suggestionId: 'p9', at: 't' }] }); });
    expect(ctx.state.stays?.admin.pins).toHaveLength(1);
    expect(ctx.state.stays?.admin.fallen).toEqual(FALLEN);
  });
});

describe('the overrides log', () => {
  it('caps by bytes as the column counts them: three-byte text, escapes, and no split surrogate pair', async () => {
    const store = new LocalStore();
    await mount(store);
    const nasty = ['\u20ac'.repeat(500), '"'.repeat(500), '\u0001'.repeat(500), '\u{1F600}'.repeat(500), 'a' + '\u{1F600}'.repeat(500)];
    for (let i = 0; i < MAX_OVERRIDES; i++) await act(async () => { await ctx.saveTripSettings({ startDate: `2026-12-${String(i % 28 + 1).padStart(2, '0')}` }, nasty[i % nasty.length]); });
    const log = (await store.load()).tripSettings?.overrides ?? [];
    expect(log).toHaveLength(MAX_OVERRIDES);
    expect(new TextEncoder().encode(JSON.stringify(log)).length).toBeLessThan(20000);
    expect(log.every(e => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(e.what))).toBe(true);
    expect(capWhat('\u{1F600}'.repeat(500))).toBe('\u{1F600}'.repeat(30));
  });

  it('re-caps entries saved before the cap, so an old long log cannot wedge the next save', async () => {
    const store = new LocalStore();
    const old = Array.from({ length: MAX_OVERRIDES }, (_, i) => ({ at: `2026-11-${String(i % 28 + 1).padStart(2, '0')}T00:00`, what: 'y'.repeat(500) }));
    await store.saveTripSettings({ overrides: old });
    await mount(store);
    await act(async () => { await ctx.saveTripSettings({ startDate: '2026-12-08' }, 'set the start date'); });
    const log = (await store.load()).tripSettings?.overrides ?? [];
    expect(log).toHaveLength(MAX_OVERRIDES);
    expect(new TextEncoder().encode(JSON.stringify(log)).length).toBeLessThan(20000);
  });

  it('caps each entry, so 100 long entries stay under the 20000-byte column check', async () => {
    const store = new LocalStore();
    await mount(store);
    for (let i = 0; i < MAX_OVERRIDES; i++) await act(async () => { await ctx.saveTripSettings({ startDate: `2026-12-${String(i % 28 + 1).padStart(2, '0')}` }, 'x'.repeat(500)); });
    const log = (await store.load()).tripSettings?.overrides ?? [];
    expect(log).toHaveLength(MAX_OVERRIDES);
    expect(log.every(e => e.what.length <= 120)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(log)).length).toBeLessThan(20000);
  });
});
