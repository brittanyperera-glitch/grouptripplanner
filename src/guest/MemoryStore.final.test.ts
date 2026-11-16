import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from './MemoryStore';

beforeEach(() => localStorage.clear());

describe('MemoryStore final-stage fields', () => {
  it('starts with null settings and empty maps', async () => {
    const s = await new MemoryStore().load();
    expect(s.tripSettings).toBeNull();
    expect(s.travellers).toEqual({});
    expect(s.bookingClaims).toEqual({});
  });

  it('round-trips settings, a traveller, a claim and fallen stays, and tells listeners', async () => {
    const st = new MemoryStore();
    let seen = 0;
    st.subscribe(() => { seen++; });
    await st.saveTripSettings({ startDate: '2026-12-01', overrides: [{ at: 't', what: 'w' }] });
    await st.saveTripSettings({ bookingDates: { train: { opensOn: '2026-11-01' } } });
    await st.saveTraveller('Saulie', { departLocal: '2026-12-10T22:00' });
    await st.saveBookingClaim('train', 'Saulie');
    await st.saveStaysAdmin({ fallen: [{ id: 'p', area: 'Ella', at: 't' }] });
    const s = await st.load();
    expect(s.tripSettings).toMatchObject({ startDate: '2026-12-01', plan: null, overrides: [{ at: 't', what: 'w' }], bookingDates: { train: { opensOn: '2026-11-01' } } });
    expect(s.travellers?.Saulie).toMatchObject({ name: 'Saulie', departLocal: '2026-12-10T22:00', arriveLocal: null });
    expect(s.bookingClaims?.train?.owner).toBe('Saulie');
    expect(s.stays?.admin.fallen).toEqual([{ id: 'p', area: 'Ella', at: 't' }]);
    expect(seen).toBe(5);
  });

  it('never refuses an organiser write, and two stores share nothing', async () => {
    localStorage.setItem('tp-local-admin-key', 'secret');
    await new MemoryStore().saveTripSettings({ startDate: '2026-12-01' });
    expect((await new MemoryStore().load()).tripSettings).toBeNull();
  });
});
