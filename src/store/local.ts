import { applyAdmin, cleanNights, mergeAdminItems, blankCrew, EMPTY_STAYS, emptyRanking, PEOPLE } from '../types';
import type { AdminItems, AppState, TripAdminRow, ChoiceEntry, ChoiceInput, CrewStays, Person, PlaceDraft, PlaceSuggestion, Response, StaysAdmin, Store, Suggestion, Vote } from '../types';

const SUGG = 'tp:sugg';
const VOTES = 'tp:votes';
const LOG = 'tp:log';
const PLACES = 'tp:placesug';
const ADMIN = 'tp:staysadmin';
const tripKey = (n: Person) => `tp:tripadmin:${n}`;
const respKey = (n: Person) => `tp:resp:${n}`;
const staysKey = (n: Person) => `tp:stays:${n}`;

/** The keys that are this store's shared data (everyone's rows, votes, suggestions, log), not one person's progress. */
export const isLocalStoreKey = (k: string) =>
  k === SUGG || k === VOTES || k === LOG || k === PLACES || k === ADMIN || k.startsWith('tp:tripadmin:') || k.startsWith('tp:resp:') || k.startsWith('tp:stays:');

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

function readAdmin(): StaysAdmin {
  const a = read<Partial<StaysAdmin> | null>(ADMIN, null);
  if (!a || typeof a !== 'object') return structuredClone(EMPTY_STAYS.admin);
  return { pins: Array.isArray(a.pins) ? a.pins : [], scouts: a.scouts && typeof a.scouts === 'object' ? a.scouts : {}, closed: Array.isArray(a.closed) ? a.closed : [], ...(Object.keys(cleanNights(a.nights)).length ? { nights: cleanNights(a.nights) } : {}) };
}

export class LocalStore implements Store {
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
    write(ADMIN, applyAdmin(readAdmin(), patch));
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
