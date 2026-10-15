import type { AppState, ChoiceEntry, ChoiceInput, Person, Response, Store, Suggestion, Vote } from '../../types';

/**
 * Behaves like SupabaseStore: a save never notifies this tab (only a realtime reload does, via push()),
 * and responses or the choice log can be made to fail like a missing table or a 500.
 */
export class ServerLike implements Store {
  rows: AppState['responses'] = {};
  failResp = false;
  failLog = false;
  logCalls = 0;
  log: ChoiceInput[] = [];
  private listeners = new Set<(s: AppState) => void>();

  async load(): Promise<AppState> {
    return { responses: structuredClone(this.rows), suggestions: [], votes: [] };
  }
  async saveResponse(name: Person, patch: Partial<Omit<Response, 'name'>>): Promise<void> {
    if (this.failResp) throw new Error('500');
    this.rows[name] = { ...(this.rows[name] as Response), ...patch, name, updatedAt: new Date().toISOString() };
  }
  async addSuggestion(_s: { name: Person; title: string; area: Suggestion['area']; note: string }): Promise<void> {}
  async setSuggestionStatus(_id: string, _st: Suggestion['status']): Promise<void> {}
  async vote(_v: Vote): Promise<void> {}
  async logChoice(c: ChoiceInput): Promise<void> {
    this.logCalls++;
    if (this.failLog) throw new Error('404 choice_log');
    this.log.push(c);
  }
  async loadLog(): Promise<ChoiceEntry[]> { return []; }
  subscribe(cb: (s: AppState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
  /** A realtime reload: every subscriber gets what the server holds now. */
  async push(): Promise<void> {
    const s = await this.load();
    this.listeners.forEach(cb => cb(s));
  }
}
