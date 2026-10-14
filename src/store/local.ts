import { emptyRanking, PEOPLE } from '../types';
import type { AppState, Person, Response, Store, Suggestion, Vote } from '../types';

const SUGG = 'tp:sugg';
const VOTES = 'tp:votes';
const respKey = (n: Person) => `tp:resp:${n}`;

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

export class LocalStore implements Store {
  private listeners = new Set<(s: AppState) => void>();

  async load(): Promise<AppState> {
    const responses: AppState['responses'] = {};
    for (const p of PEOPLE) {
      const r = read<Response | null>(respKey(p), null);
      if (r && typeof r === 'object') responses[p] = r;
    }
    const suggestions = read<Suggestion[]>(SUGG, []);
    const votes = read<Vote[]>(VOTES, []);
    return {
      responses,
      suggestions: Array.isArray(suggestions) ? suggestions : [],
      votes: Array.isArray(votes) ? votes : [],
    };
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
