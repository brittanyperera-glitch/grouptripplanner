import { afterEach, describe, expect, it, vi } from 'vitest';

// The setup file mocks the release switch off; these tests need the real one.
vi.unmock('../lib/release');
import catalogue from '../data/catalogue.json';
import legs from '../data/legs.json';
import releaseJson from '../content/release.json';
import { groupResult } from '../lib/group';
import { RELEASE, releaseFor } from '../lib/release';
import { bookingsByDay } from '../lib/deadlines';
import { addDays } from '../lib/calendar';
import { todayKey } from '../lib/walkthroughKey';
import type { Item, Leg } from '../types';
import { GUEST_RELEASE } from './sampleRelease';
import { guestSeed, seedState } from './seed';

const ALL = (catalogue as unknown as { items: Item[] }).items;

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('the guest sample release', () => {
  it('is given to every guest, is not the real group plan, and uses only catalogue ids', () => {
    for (const g of ['Tuktuk', 'Aunty', 'Groom'] as const) expect(releaseFor(g)).toBe(GUEST_RELEASE);
    expect(GUEST_RELEASE.items).not.toEqual(releaseJson.items);
    expect([...GUEST_RELEASE.items].sort()).not.toEqual([...releaseJson.items].sort());
    const ids = new Set(ALL.map(i => i.id));
    for (const id of GUEST_RELEASE.items) expect(ids.has(id), id).toBe(true);
    expect(new Set(GUEST_RELEASE.items).size).toBe(GUEST_RELEASE.items.length);
    expect(GUEST_RELEASE).toMatchObject({ days: 9, pace: 1, ruledOut: [] });
  });

  it('leaves the five members on the real release', () => {
    expect(RELEASE).not.toBeNull();
    for (const p of ['Brittany', 'Alex', 'Antek', 'Lazza', 'Saulie'] as const) expect(releaseFor(p)).toBe(RELEASE);
  });

  it('plans every sample place into the nine days', () => {
    const g = groupResult(seedState(), ALL, legs as Leg[], [], GUEST_RELEASE);
    expect(g.locked).toBe(true);
    expect([...g.final!.chosen].sort()).toEqual([...GUEST_RELEASE.items].sort());
    expect(g.final!.days).toHaveLength(9);
  });

  it('is off, for guests too, on the vote-flow build (VITE_RELEASE=off)', async () => {
    vi.stubEnv('VITE_RELEASE', 'off');
    vi.resetModules();
    const mod = await import('../lib/release');
    expect(mod.RELEASE).toBeNull();
    expect(mod.releaseFor('Aunty')).toBeNull();
    expect(mod.releaseFor('Alex')).toBeNull();
  });
});

describe('guestSeed', () => {
  it('starts the trip three weeks out, with one booking claimed and one open', () => {
    const s = guestSeed();
    const start = addDays(todayKey(new Date()), 21);
    expect(s.tripSettings?.startDate).toBe(start);
    const g = groupResult(s, ALL, legs as Leg[], [], GUEST_RELEASE);
    const owners = Object.fromEntries(Object.entries(s.bookingClaims ?? {}).map(([id, c]) => [id, c.owner]));
    const days = bookingsByDay({ plan: g.final!, start, today: todayKey(new Date()), items: ALL, stayItems: [], done: {}, owners, overrides: {} });
    const all = Object.values(days).flat();
    expect(all.find(b => b.id === 'book:sigiriya')).toMatchObject({ owner: 'Alex', status: 'open' });
    expect(all.find(b => b.id === 'book:train')).toMatchObject({ owner: null, status: 'open' });
  });

  it('leaves a bare seedState free of trip settings and claims', () => {
    const s = seedState();
    expect(s.tripSettings).toBeUndefined();
    expect(s.bookingClaims).toBeUndefined();
  });
});
