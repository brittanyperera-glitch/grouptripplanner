import { VOTES_TO_RESOLVE } from '../lib/group';
import { applyAdmin, blankCrew, EMPTY_STAYS, emptyRanking, isGuest, PEOPLE } from '../types';
import type { AppState, ChoiceEntry, ChoiceInput, CrewStays, PlaceDraft, PlaceSuggestion, Player, Response, StaysAdmin, StaysState, Store, Suggestion, Vote } from '../types';
import { seedState } from './seed';

const defaultRow = (name: Player): Response => ({
  name, days: null, flex: false, pace: null, ranking: emptyRanking(),
  rated: [], submitted: false, updatedAt: new Date().toISOString(),
});

export class MemoryStore implements Store {
  private state: AppState;
  private log: ChoiceEntry[] = [];
  private listeners = new Set<(s: AppState) => void>();

  // Crew rows start empty unless the caller passes some: the guest takes the quiz themselves.
  constructor(initial: AppState = seedState()) {
    this.state = structuredClone({ ...initial, stays: initial.stays ?? EMPTY_STAYS });
  }

  async load(): Promise<AppState> {
    return structuredClone(this.state);
  }

  async saveResponse(name: Player, patch: Partial<Omit<Response, 'name'>>): Promise<void> {
    const existing = this.state.responses[name] ?? defaultRow(name);
    this.state.responses[name] = structuredClone({ ...existing, ...patch, name, updatedAt: new Date().toISOString() });
    this.emit();
  }

  private stays(): StaysState {
    return this.state.stays ?? (this.state.stays = structuredClone(EMPTY_STAYS));
  }

  async saveCrewStays(name: Player, patch: Partial<Omit<CrewStays, 'name'>>): Promise<void> {
    const stays = this.stays();
    stays.crew[name] = structuredClone({ ...(stays.crew[name] ?? blankCrew(name)), ...patch, name, updatedAt: new Date().toISOString() });
    this.emit();
  }

  async addPlaceSuggestion(s: PlaceDraft): Promise<void> {
    this.stays().suggestions.push(structuredClone({ ...s, id: crypto.randomUUID(), status: 'live' as const, createdAt: new Date().toISOString() }));
    this.emit();
  }

  async setPlaceStatus(id: string, status: PlaceSuggestion['status']): Promise<void> {
    const stays = this.stays();
    stays.suggestions = stays.suggestions.map(x => (x.id === id ? { ...x, status } : x));
    this.emit();
  }

  async saveStaysAdmin(patch: Partial<StaysAdmin>): Promise<void> {
    const stays = this.stays();
    stays.admin = structuredClone(applyAdmin(stays.admin, patch));
    this.emit();
  }

  async addSuggestion(s: { name: Player; title: string; area: Suggestion['area']; note: string }): Promise<void> {
    this.state.suggestions.push({ ...s, id: crypto.randomUUID(), status: isGuest(s.name) ? 'live' : 'pending', createdAt: new Date().toISOString() });
    this.emit();
  }

  async setSuggestionStatus(id: string, status: Suggestion['status']): Promise<void> {
    this.state.suggestions = this.state.suggestions.map(x => (x.id === id ? { ...x, status } : x));
    this.emit();
  }

  async vote(v: Vote): Promise<void> {
    this.state.votes = [...this.state.votes.filter(x => !(x.forkId === v.forkId && x.name === v.name)), { ...v }];
    if (isGuest(v.name) && (v.forkId.startsWith('ko:') || v.forkId.startsWith('genre:'))) {
      // The example crew follows the guest so the demo can finish.
      const voted = new Set(this.state.votes.filter(x => x.forkId === v.forkId).map(x => x.name));
      for (const p of PEOPLE.filter(p => !voted.has(p)).slice(0, VOTES_TO_RESOLVE)) this.state.votes.push({ forkId: v.forkId, name: p, choice: v.choice });
    }
    this.emit();
  }

  async logChoice(c: ChoiceInput): Promise<void> {
    this.log.push(structuredClone({ ...c, id: crypto.randomUUID(), at: new Date().toISOString() }));
  }

  async loadLog(): Promise<ChoiceEntry[]> {
    return structuredClone(this.log);
  }

  subscribe(cb: (s: AppState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private emit(): void {
    this.listeners.forEach(cb => cb(structuredClone(this.state)));
  }
}
