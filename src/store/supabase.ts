import type { SupabaseClient } from '@supabase/supabase-js';
import { tripClient } from './tripKey';
import { emptyRanking } from '../types';
import type { AppState, ChoiceEntry, ChoiceInput, Person, Response, Store, Suggestion, Vote } from '../types';

interface RespRow {
  name: Person; days: number | null; flex?: boolean | null; pace: Response['pace'];
  ranking: (Response['ranking'] & { final?: Response['final'] }) | null; rated: string[] | null; submitted: boolean | null; updated_at: string | null;
}
interface SuggRow {
  id: string; name: Person; title: string; area: Suggestion['area']; note: string | null;
  status: Suggestion['status']; created_at: string;
}
interface LogRow { id: string; name: Person; kind: ChoiceEntry['kind']; ref: string | null; value: unknown; at: string }
interface VoteRow { fork_id: string; name: Person; choice: 'a' | 'b' }

// The Finalize list is kept inside the ranking jsonb column under "final", so the live table needs
// no new column.
const toResponse = (r: RespRow): Response => {
  const { final, ...ranking } = r.ranking ?? { ...emptyRanking(), final: null };
  return {
    name: r.name, days: r.days, flex: r.flex ?? false, pace: r.pace,
    ranking, final: final ?? null, rated: r.rated ?? [], submitted: r.submitted ?? false,
    updatedAt: r.updated_at ?? new Date(0).toISOString(),
  };
};

const RELOAD_DEBOUNCE_MS = 200;
const POLL_MS = 20_000;

export class SupabaseStore implements Store {
  private db: SupabaseClient;
  // Realtime row events are filtered by RLS, which cannot see the x-trip-key header, so once the lock is
  // on they deliver nothing. A broadcast ping on 'tp' carries no data: peers just reload.
  private chan: ReturnType<SupabaseClient['channel']> | null = null;
  private onPing: () => void = () => undefined;

  constructor(url: string, key: string, tripKey?: string) {
    this.db = tripClient(url, key, tripKey);
  }

  private channel() {
    if (!this.chan) this.chan = this.db.channel('tp').on('broadcast', { event: 'changed' }, () => this.onPing()).subscribe();
    return this.chan;
  }

  /** Best effort: the write already succeeded, and every client also reloads every 20 s. Only while subscribed, so no channel outlives the app. */
  private ping(): void {
    try {
      void Promise.resolve(this.chan?.send({ type: 'broadcast', event: 'changed', payload: {} })).catch(() => undefined);
    } catch { /* peers catch up on the next poll */ }
  }

  async load(): Promise<AppState> {
    const [r, s, v] = await Promise.all([
      this.db.from('responses').select('*'),
      this.db.from('suggestions').select('*').order('created_at'),
      this.db.from('knockout_votes').select('*'),
    ]);
    const err = r.error ?? s.error ?? v.error;
    if (err) throw err;
    const responses: AppState['responses'] = {};
    for (const row of (r.data ?? []) as RespRow[]) responses[row.name] = toResponse(row);
    return {
      responses,
      suggestions: ((s.data ?? []) as SuggRow[]).map(x => ({
        id: x.id, name: x.name, title: x.title, area: x.area, note: x.note ?? '',
        status: x.status, createdAt: x.created_at,
      })),
      votes: ((v.data ?? []) as VoteRow[]).map(x => ({ forkId: x.fork_id, name: x.name, choice: x.choice })),
    };
  }

  async saveResponse(name: Person, patch: Partial<Omit<Response, 'name'>>): Promise<void> {
    // The queue sends the full current row, so there is no server read to merge against. Only
    // the columns present in the patch are written, which keeps a partial patch from nulling the rest.
    const cols: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
    for (const k of ['days', 'flex', 'pace', 'ranking', 'rated', 'submitted'] as const) {
      if (patch[k] !== undefined) cols[k] = patch[k];
    }
    if (patch.final !== undefined && patch.ranking) cols.ranking = { ...patch.ranking, final: patch.final };
    const { error } = await this.db.from('responses').upsert(cols, { onConflict: 'name' });
    if (error) throw error;
    this.ping();
  }

  // 80 and 300 match the CHECK constraints in schema.sql, so an over-long entry is cut rather than rejected forever.
  async addSuggestion(s: { name: Person; title: string; area: Suggestion['area']; note: string }): Promise<void> {
    const { error } = await this.db.from('suggestions').insert({
      id: crypto.randomUUID(), name: s.name, title: s.title.slice(0, 80), area: s.area, note: s.note.slice(0, 300), status: 'pending',
    });
    if (error) throw error;
    this.ping();
  }

  async setSuggestionStatus(id: string, status: Suggestion['status']): Promise<void> {
    const { error } = await this.db.from('suggestions').update({ status }).eq('id', id);
    if (error) throw error;
    this.ping();
  }

  async vote(v: Vote): Promise<void> {
    const { error } = await this.db.from('knockout_votes').upsert(
      { fork_id: v.forkId, name: v.name, choice: v.choice },
      { onConflict: 'fork_id,name' },
    );
    if (error) throw error;
    this.ping();
  }

  // Append-only: choice_log has insert and select policies only, and is kept out of the realtime publication.
  async logChoice(c: ChoiceInput): Promise<void> {
    const { error } = await this.db.from('choice_log').insert({ id: crypto.randomUUID(), name: c.name, kind: c.kind, ref: c.ref, value: c.value });
    if (error) throw error;
    this.ping();
  }

  async loadLog(): Promise<ChoiceEntry[]> {
    const { data, error } = await this.db.from('choice_log').select('*').order('at');
    if (error) throw error;
    return ((data ?? []) as LogRow[]).map(x => ({ id: x.id, name: x.name, kind: x.kind, ref: x.ref, value: x.value, at: x.at }));
  }

  subscribe(cb: (s: AppState) => void): () => void {
    // Debounced, and only the newest reload may apply: an older snapshot resolving late must not win.
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const mine = ++seq;
        void this.load().then(s => { if (mine === seq) cb(s); }).catch(() => undefined);
      }, RELOAD_DEBOUNCE_MS);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    this.onPing = reload;
    this.channel();
    const poll = setInterval(reload, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      this.onPing = () => undefined;
      seq++;
      const chan = this.chan;
      this.chan = null;
      if (chan) void this.db.removeChannel(chan);
    };
  }
}
