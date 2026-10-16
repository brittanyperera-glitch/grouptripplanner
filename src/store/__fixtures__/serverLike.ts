import { responseCols, toResponse } from '../supabase';
import type { RespRow } from '../supabase';
import type { AppState, ChoiceEntry, ChoiceInput, CrewStays, Person, PlaceDraft, PlaceSuggestion, Response, StaysAdmin, Store, Suggestion, Vote } from '../../types';

const toRow = (r: Response): RespRow => ({
  name: r.name as Person, days: r.days, flex: r.flex, pace: r.pace, ranking: { ...r.ranking, final: r.final ?? null },
  rated: r.rated, submitted: r.submitted, updated_at: r.updatedAt,
});
const NO_ROW = (name: Person): RespRow => ({ name, days: null, flex: null, pace: null, ranking: null, rated: null, submitted: null, updated_at: null });

/**
 * Behaves like SupabaseStore: a save never notifies this tab (only a realtime reload does, via push()),
 * and responses or the choice log can be made to fail like a missing table or a 500.
 * Responses are written as the real columns are (final inside the ranking column, only sent columns
 * replaced). The old `{ ...row, ...patch }` kept final on a ranking-only save, which hid that the real store wiped it.
 */
export class ServerLike implements Store {
  rows: AppState['responses'] = {};
  /** Optional crew stays rows the server holds, so a test can mark a quiz done. */
  stays?: AppState['stays'];
  failResp = false;
  failLog = false;
  logCalls = 0;
  log: ChoiceInput[] = [];
  private listeners = new Set<(s: AppState) => void>();

  async load(): Promise<AppState> {
    return { responses: structuredClone(this.rows), suggestions: [], votes: [], ...(this.stays ? { stays: structuredClone(this.stays) } : {}) };
  }
  async saveResponse(name: Person, patch: Partial<Omit<Response, 'name'>>): Promise<void> {
    if (this.failResp) throw new Error('500');
    const row = this.rows[name] ? toRow(this.rows[name]) : NO_ROW(name);
    this.rows[name] = toResponse({ ...row, ...responseCols(name, patch, row.ranking) } as RespRow);
  }
  async addSuggestion(_s: { name: Person; title: string; area: Suggestion['area']; note: string }): Promise<void> {}
  async setSuggestionStatus(_id: string, _st: Suggestion['status']): Promise<void> {}
  async vote(_v: Vote): Promise<void> {}
  async saveCrewStays(_n: Person, _p: Partial<Omit<CrewStays, 'name'>>): Promise<void> {}
  async addPlaceSuggestion(_s: PlaceDraft): Promise<void> {}
  async setPlaceStatus(_id: string, _st: PlaceSuggestion['status']): Promise<void> {}
  async saveStaysAdmin(_p: Partial<StaysAdmin>): Promise<void> {}
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
