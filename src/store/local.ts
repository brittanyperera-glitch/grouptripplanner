import { applyAdmin, cleanNights, mergeAdminItems, blankCrew, EMPTY_STAYS, emptyRanking, PEOPLE } from '../types';
import { readAdminKey } from './tripKey';
import type { AdminItems, AppState, BookingClaim, TripAdminRow, ChoiceEntry, ChoiceInput, Complaint, CrewStays, FinalStore, Person, PlaceDraft, PlaceSuggestion, Player, Response, StaysAdmin, Store, Suggestion, TripSettings, Traveller, Vote } from '../types';

const SUGG = 'tp:sugg';
const VOTES = 'tp:votes';
const LOG = 'tp:log';
const COMPLAINTS = 'tp:complaints';
const PLACES = 'tp:placesug';
const ADMIN = 'tp:staysadmin';
const SETTINGS = 'tp:settings';
const TRAVELLERS = 'tp:travellers';
const CLAIMS = 'tp:claims';
/** Not a tp: key, like tp-admin-key: tests and e2e set it to stand in for the server's admin_secret. */
export const LOCAL_ADMIN_KEY = 'tp-local-admin-key';
const tripKey = (n: Person) => `tp:tripadmin:${n}`;
const respKey = (n: Person) => `tp:resp:${n}`;
const staysKey = (n: Person) => `tp:stays:${n}`;

/** The keys that are this store's shared data (everyone's rows, votes, suggestions, log), not one person's progress. */
export const isLocalStoreKey = (k: string) =>
  k === SUGG || k === VOTES || k === LOG || k === COMPLAINTS || k === PLACES || k === ADMIN || k === SETTINGS || k === TRAVELLERS || k === CLAIMS || k.startsWith('tp:tripadmin:') || k.startsWith('tp:resp:') || k.startsWith('tp:stays:');

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state stays in the caller's memory */
  }
}

const defaultRow = (name: Person): Response => ({
  name, days: null, flex: false, pace: null, ranking: emptyRanking(),
  rated: [], submitted: false, updatedAt: new Date().toISOString(),
});

/** The fake admin check: with no tp-local-admin-key set every key passes, so existing local flows keep working. */
export const localAdminKeyOk = (key: string | null): boolean => {
  try { const need = localStorage.getItem(LOCAL_ADMIN_KEY); return need === null || key === need; } catch { return true; }
};
const requireAdmin = (): void => {
  if (!localAdminKeyOk(readAdminKey())) throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' });
};

function readAdmin(): StaysAdmin {
  const a = read<Partial<StaysAdmin> | null>(ADMIN, null);
  if (!a || typeof a !== 'object') return structuredClone(EMPTY_STAYS.admin);
  return { pins: Array.isArray(a.pins) ? a.pins : [], scouts: a.scouts && typeof a.scouts === 'object' ? a.scouts : {}, closed: Array.isArray(a.closed) ? a.closed : [], ...(Object.keys(cleanNights(a.nights)).length ? { nights: cleanNights(a.nights) } : {}), ...(Array.isArray(a.fallen) && a.fallen.length ? { fallen: a.fallen } : {}) };
}

export class LocalStore implements Store, FinalStore {
  private listeners = new Set<(s: AppState) => void>();

  async load(): Promise<AppState> {
    const responses: AppState['responses'] = {};
    for (const p of PEOPLE) {
      const r = read<Response | null>(respKey(p), null);
      if (r && typeof r === 'object') responses[p] = r;
    }
    const crew: Partial<Record<Person, CrewStays>> = {};
    for (const p of PEOPLE) {
      const c = read<CrewStays | null>(staysKey(p), null);
      if (c && typeof c === 'object') crew[p] = c;
    }
    const tripAdmin: AppState['tripAdmin'] = {};
    for (const p of PEOPLE) {
      const t = read<TripAdminRow | null>(tripKey(p), null);
      if (t && typeof t === 'object') tripAdmin[p] = t;
    }
    const suggestions = read<Suggestion[]>(SUGG, []);
    const votes = read<Vote[]>(VOTES, []);
    const places = read<PlaceSuggestion[]>(PLACES, []);
    return {
      responses,
      suggestions: Array.isArray(suggestions) ? suggestions : [],
      votes: Array.isArray(votes) ? votes : [],
      stays: { crew, suggestions: Array.isArray(places) ? places : [], admin: readAdmin() },
      tripAdmin,
      tripSettings: read<TripSettings | null>(SETTINGS, null) ?? null,
      travellers: read<AppState['travellers']>(TRAVELLERS, {}) ?? {},
      bookingClaims: read<AppState['bookingClaims']>(CLAIMS, {}) ?? {},
    };
  }

  async addPlaceSuggestion(s: PlaceDraft): Promise<void> {
    const list = (await this.load()).stays!.suggestions;
    list.push({ ...s, id: crypto.randomUUID(), status: 'live', createdAt: new Date().toISOString() });
    write(PLACES, list);
    await this.emit();
  }

  async setPlaceStatus(id: string, status: PlaceSuggestion['status']): Promise<void> {
    write(PLACES, (await this.load()).stays!.suggestions.map(x => (x.id === id ? { ...x, status } : x)));
    await this.emit();
  }

  async saveStaysAdmin(patch: Partial<StaysAdmin>): Promise<void> {
    requireAdmin();
    const stored = readAdmin();
    const fallen = patch.fallen ?? stored.fallen;
    write(ADMIN, { ...applyAdmin(stored, patch), ...(fallen ? { fallen } : {}) });
    await this.emit();
  }

  async saveTripSettings(patch: Partial<Omit<TripSettings, 'updatedAt'>>): Promise<void> {
    requireAdmin();
    const stored = read<TripSettings | null>(SETTINGS, null) ?? { startDate: null, plan: null, bookingDates: {}, overrides: [], updatedAt: '' };
    write(SETTINGS, { ...stored, ...patch, updatedAt: new Date().toISOString() });
    await this.emit();
  }

  async saveTraveller(name: Person, patch: Partial<Omit<Traveller, 'name' | 'updatedAt'>>): Promise<void> {
    const all = read<NonNullable<AppState['travellers']>>(TRAVELLERS, {});
    const blank: Traveller = { name, arriveLocal: null, arriveFlight: null, departLocal: null, departFlight: null, updatedAt: '' };
    write(TRAVELLERS, { ...all, [name]: { ...blank, ...all[name], ...patch, name, updatedAt: new Date().toISOString() } });
    await this.emit();
  }

  async saveBookingClaim(itemId: string, owner: Person | null): Promise<void> {
    const claim: BookingClaim = { itemId, owner, updatedAt: new Date().toISOString() };
    write(CLAIMS, { ...read<Record<string, BookingClaim>>(CLAIMS, {}), [itemId]: claim });
    await this.emit();
  }

  async saveTripAdmin(name: Person, patch: AdminItems): Promise<void> {
    const existing = read<TripAdminRow | null>(tripKey(name), null);
    write(tripKey(name), { name, items: mergeAdminItems(existing?.items ?? {}, patch), updatedAt: new Date().toISOString() });
    await this.emit();
  }

  async saveCrewStays(name: Person, patch: Partial<Omit<CrewStays, 'name'>>): Promise<void> {
    const existing = read<CrewStays | null>(staysKey(name), null) ?? blankCrew(name);
    write(staysKey(name), { ...existing, ...patch, name, updatedAt: new Date().toISOString() });
    await this.emit();
  }

  async saveResponse(name: Person, patch: Partial<Omit<Response, 'name'>>): Promise<void> {
    const existing = read<Response | null>(respKey(name), null) ?? defaultRow(name);
    write(respKey(name), { ...existing, ...patch, name, updatedAt: new Date().toISOString() });
    await this.emit();
  }

  async addSuggestion(s: { name: Person; title: string; area: Suggestion['area']; note: string }): Promise<void> {
    const list = (await this.load()).suggestions;
    list.push({ ...s, id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString() });
    write(SUGG, list);
    await this.emit();
  }

  async setSuggestionStatus(id: string, status: Suggestion['status']): Promise<void> {
    const list = (await this.load()).suggestions.map(x => (x.id === id ? { ...x, status } : x));
    write(SUGG, list);
    await this.emit();
  }

  async vote(v: Vote): Promise<void> {
    const rest = (await this.load()).votes.filter(x => !(x.forkId === v.forkId && x.name === v.name));
    write(VOTES, [...rest, v]);
    await this.emit();
  }

  async logChoice(c: ChoiceInput): Promise<void> {
    write(LOG, [...(await this.loadLog()), { ...c, id: crypto.randomUUID(), at: new Date().toISOString() }]);
  }

  async addComplaint(c: { name: Player; text: string }): Promise<void> {
    write(COMPLAINTS, [...(await this.loadComplaints()), { ...c, id: crypto.randomUUID(), createdAt: new Date().toISOString() }]);
  }

  async loadComplaints(): Promise<Complaint[]> {
    const list = read<Complaint[]>(COMPLAINTS, []);
    return Array.isArray(list) ? list : [];
  }

  async loadLog(): Promise<ChoiceEntry[]> {
    const log = read<ChoiceEntry[]>(LOG, []);
    return Array.isArray(log) ? log : [];
  }

  subscribe(cb: (s: AppState) => void): () => void {
    this.listeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('tp:')) void this.load().then(cb);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      this.listeners.delete(cb);
      window.removeEventListener('storage', onStorage);
    };
  }

  private async emit(): Promise<void> {
    if (this.listeners.size === 0) return;
    const s = await this.load();
    this.listeners.forEach(cb => cb(s));
  }
}
