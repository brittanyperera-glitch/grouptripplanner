import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore, isLocalStoreKey } from './local';
import { WriteQueue } from './queue';
import { clearLocalProgress } from './fresh';
import { ADMIN_KEY } from './tripKey';
import type { Store } from '../types';

beforeEach(() => localStorage.clear());

const code = (e: unknown) => (e as { code?: string }).code;

describe('LocalStore final-stage fields', () => {
  it('load returns null settings and empty maps before anything is saved', async () => {
    const s = await new LocalStore().load();
    expect(s.tripSettings).toBeNull();
    expect(s.travellers).toEqual({});
    expect(s.bookingClaims).toEqual({});
  });

  it('round-trips settings, a traveller and a claim', async () => {
    const st = new LocalStore();
    await st.saveTripSettings({ startDate: '2026-12-01', bookingDates: { train: { bookBy: '2026-11-20' } } });
    await st.saveTripSettings({ overrides: [{ at: 't', what: 'moved start' }] });
    await st.saveTraveller('Alex', { arriveLocal: '2026-12-01T09:30', arriveFlight: 'UL 504' });
    await st.saveBookingClaim('train', 'Lazza');
    const s = await st.load();
    expect(s.tripSettings).toMatchObject({ startDate: '2026-12-01', plan: null, bookingDates: { train: { bookBy: '2026-11-20' } }, overrides: [{ at: 't', what: 'moved start' }] });
    expect(s.travellers?.Alex).toMatchObject({ name: 'Alex', arriveLocal: '2026-12-01T09:30', arriveFlight: 'UL 504', departLocal: null });
    expect(s.bookingClaims?.train).toMatchObject({ itemId: 'train', owner: 'Lazza' });
    await st.saveBookingClaim('train', null);
    expect((await st.load()).bookingClaims?.train?.owner).toBeNull();
  });

  it('round-trips fallen stays', async () => {
    const st = new LocalStore();
    await st.saveStaysAdmin({ fallen: [{ id: 'p1', area: 'Ella', at: 't' }] });
    expect((await st.load()).stays?.admin.fallen).toEqual([{ id: 'p1', area: 'Ella', at: 't' }]);
  });

  it('refuses organiser writes with a 42501 error when the keys differ, and allows them when they match', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    localStorage.setItem(ADMIN_KEY, 'wrong');
    const st = new LocalStore();
    const e1 = await st.saveTripSettings({ startDate: '2026-12-01' }).catch(e => e);
    const e2 = await st.saveStaysAdmin({ closed: ['Ella'] }).catch(e => e);
    expect([code(e1), code(e2)]).toEqual(['42501', '42501']);
    expect((await st.load()).tripSettings).toBeNull();
    localStorage.setItem(ADMIN_KEY, 'secret');
    await st.saveTripSettings({ startDate: '2026-12-01' });
    expect((await st.load()).tripSettings?.startDate).toBe('2026-12-01');
  });

  it('allows organiser writes when no local admin key is set', async () => {
    await new LocalStore().saveTripSettings({ startDate: '2026-12-02' });
    expect((await new LocalStore().load()).tripSettings?.startDate).toBe('2026-12-02');
  });

  it('keeps the new rows through Start over and keeps the organiser key', async () => {
    const st = new LocalStore();
    await st.saveTripSettings({ startDate: '2026-12-01' });
    await st.saveTraveller('Alex', { arriveFlight: 'x' });
    await st.saveBookingClaim('train', 'Alex');
    localStorage.setItem(ADMIN_KEY, 'secret');
    localStorage.setItem('tp:snapshot', '{}');
    clearLocalProgress(isLocalStoreKey);
    expect(localStorage.getItem(ADMIN_KEY)).toBe('secret');
    expect(localStorage.getItem('tp:snapshot')).toBeNull();
    const s = await st.load();
    expect(s.tripSettings?.startDate).toBe('2026-12-01');
    expect(s.travellers?.Alex).toBeDefined();
    expect(s.bookingClaims?.train).toBeDefined();
  });
});

describe('WriteQueue and organiser refusals', () => {
  const hooks = () => ({ fails: 0, denied: [] as string[], onFail() { this.fails++; }, onClear() {}, onAdminDenied(k: string) { this.denied.push(k); } });

  it('a 42501 on a settings write drops the job instead of retrying it', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    const h = hooks();
    const q = new WriteQueue(new LocalStore(), h);
    await q.store.saveTripSettings({ startDate: '2026-12-01' });
    expect(h.denied).toEqual(['settings']);
    expect(h.fails).toBe(0);
    localStorage.setItem(ADMIN_KEY, 'secret');
    expect(await q.flush()).toBe(true);
    expect((await new LocalStore().load()).tripSettings).toBeNull();
  });

  it('a 42501 on a stays admin write drops it too', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    const h = hooks();
    const q = new WriteQueue(new LocalStore(), h);
    await q.store.saveStaysAdmin({ closed: ['Ella'] });
    expect(h.denied).toEqual(['admin']);
  });

  it('any other failure on an admin write is still retried', async () => {
    let offline = true;
    class Flaky extends LocalStore {
      override async saveTripSettings(...a: Parameters<LocalStore['saveTripSettings']>) {
        if (offline) throw new Error('offline');
        return super.saveTripSettings(...a);
      }
    }
    const h = hooks();
    const q = new WriteQueue(new Flaky(), h);
    await q.store.saveTripSettings({ startDate: '2026-12-01' });
    expect(h.fails).toBe(1);
    offline = false;
    expect(await q.flush()).toBe(true);
    expect((await new LocalStore().load()).tripSettings?.startDate).toBe('2026-12-01');
  });

  it('coalesces traveller and claim writes per row', async () => {
    const sent: string[] = [];
    class Spy extends LocalStore {
      fail = true;
      override async saveTraveller(n: Parameters<LocalStore['saveTraveller']>[0], p: Parameters<LocalStore['saveTraveller']>[1]) {
        if (this.fail) throw new Error('offline');
        sent.push(`${n}:${JSON.stringify(p)}`);
      }
      override async saveBookingClaim(id: string, o: Parameters<LocalStore['saveBookingClaim']>[1]) {
        if (this.fail) throw new Error('offline');
        sent.push(`${id}:${o}`);
      }
    }
    const base = new Spy();
    const q = new WriteQueue(base, hooks());
    await q.store.saveTraveller('Alex', { arriveFlight: 'a' });
    await q.store.saveTraveller('Alex', { departFlight: 'b' });
    await q.store.saveBookingClaim('train', 'Alex');
    await q.store.saveBookingClaim('train', null);
    base.fail = false;
    await q.flush();
    expect(sent).toEqual(['Alex:{"arriveFlight":"a","departFlight":"b"}', 'train:null']);
  });

  it('a store without the final-stage methods (an old stub) does not break the queue', async () => {
    const stub = { load: async () => ({ responses: {}, suggestions: [], votes: [] }) } as unknown as Store;
    const q = new WriteQueue(stub, hooks());
    await expect(q.store.saveTripSettings({ startDate: '2026-12-01' })).resolves.toBeUndefined();
  });
});
