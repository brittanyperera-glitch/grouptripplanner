import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyRanking } from '../types';
import type { AppState, Person, Response, Store, Suggestion, Vote } from '../types';

interface RespRow {
  name: Person; days: number | null; flex?: boolean | null; pace: Response['pace'];
  ranking: Response['ranking'] | null; rated: string[] | null; submitted: boolean | null; updated_at: string | null;
}
interface SuggRow {
  id: string; name: Person; title: string; area: Suggestion['area']; note: string | null;
  status: Suggestion['status']; created_at: string;
}
interface VoteRow { fork_id: string; name: Person; choice: 'a' | 'b' }

const toResponse = (r: RespRow): Response => ({
  name: r.name, days: r.days, flex: r.flex ?? false, pace: r.pace,
  ranking: r.ranking ?? emptyRanking(), rated: r.rated ?? [], submitted: r.submitted ?? false,
  updatedAt: r.updated_at ?? new Date(0).toISOString(),
});

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, key: string) {
    this.db = createClient(url, key);
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
    // Read-merge-write so a partial patch never nulls the person's other columns.
    const { data, error: readErr } = await this.db.from('responses').select('*').eq('name', name).maybeSingle();
    if (readErr) throw readErr;
    const base: Response = data
      ? toResponse(data as RespRow)
      : { name, days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: '' };
    const m = { ...base, ...patch };
    const { error } = await this.db.from('responses').upsert(
      {
        name, days: m.days, flex: m.flex, pace: m.pace, ranking: m.ranking, rated: m.rated,
        submitted: m.submitted, updated_at: new Date().toISOString(),
      },
      { onConflict: 'name' },
    );
    if (error) throw error;
  }

  async addSuggestion(s: { name: Person; title: string; area: Suggestion['area']; note: string }): Promise<void> {
    const { error } = await this.db.from('suggestions').insert({
      id: crypto.randomUUID(), name: s.name, title: s.title, area: s.area, note: s.note, status: 'pending',
    });
    if (error) throw error;
  }

  async setSuggestionStatus(id: string, status: Suggestion['status']): Promise<void> {
    const { error } = await this.db.from('suggestions').update({ status }).eq('id', id);
    if (error) throw error;
  }

  async vote(v: Vote): Promise<void> {
    const { error } = await this.db.from('knockout_votes').upsert(
      { fork_id: v.forkId, name: v.name, choice: v.choice },
      { onConflict: 'fork_id,name' },
    );
    if (error) throw error;
  }

  subscribe(cb: (s: AppState) => void): () => void {
    const reload = () => { void this.load().then(cb).catch(() => undefined); };
    const channel = this.db
      .channel('tp')
      .on('postgres_changes', { event: '*', schema: 'public' }, reload)
      .subscribe();
    return () => { void this.db.removeChannel(channel); };
  }
}
