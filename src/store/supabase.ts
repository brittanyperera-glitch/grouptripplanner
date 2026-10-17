import type { SupabaseClient } from '@supabase/supabase-js';
import { tripClient } from './tripKey';
import { applyAdmin, EMPTY_STAYS, emptyRanking, mergeAdminItems } from '../types';
import type { AdminItems, AppState, TripAdminState, ChoiceEntry, ChoiceInput, CrewStays, Person, PlaceDraft, PlaceSuggestion, Response, StaysAdmin, StaysState, Store, Suggestion, Vote } from '../types';

type RankingCol = Response['ranking'] & { final?: Response['final'] };
export interface RespRow {
  name: Person; days: number | null; flex?: boolean | null; pace: Response['pace'];
  ranking: RankingCol | null; rated: string[] | null; submitted: boolean | null; updated_at: string | null;
}
interface SuggRow {
  id: string; name: Person; title: string; area: Suggestion['area']; note: string | null;
  status: Suggestion['status']; created_at: string;
}
interface LogRow { id: string; name: Person; kind: ChoiceEntry['kind']; ref: string | null; value: unknown; at: string }
interface VoteRow { fork_id: string; name: Person; choice: 'a' | 'b' }
interface CrewRow {
  name: Person; prefs: CrewStays['prefs'] | null; quiz_done: boolean | null; locked: boolean | null;
  ranks: CrewStays['ranks'] | null; bingo: CrewStays['bingo'] | null; updated_at: string | null;
}
const toCrew = (r: CrewRow): CrewStays => ({
  name: r.name, prefs: r.prefs ?? [], quizDone: r.quiz_done ?? false, locked: r.locked ?? false,
  ranks: r.ranks ?? {}, bingo: r.bingo ?? [], updatedAt: r.updated_at ?? new Date(0).toISOString(),
});
interface PlaceRow {
  id: string; name: Person; area: PlaceSuggestion['area']; kind: PlaceSuggestion['kind']; title: string;
  link: string | null; price_gbp: number | null; stay_type: PlaceSuggestion['stayType'] | null; rooms: PlaceSuggestion['rooms'] | null;
  why: string | null; photo: string | null; hostel_id: string | null; status: PlaceSuggestion['status']; created_at: string;
}
// Optional columns come back null; leave them off rather than carry nulls the type does not allow.
const toPlace = (r: PlaceRow): PlaceSuggestion => {
  const opt = { link: r.link, priceGbp: r.price_gbp, stayType: r.stay_type, rooms: r.rooms, why: r.why, photo: r.photo, hostelId: r.hostel_id };
  return {
    id: r.id, name: r.name, area: r.area, kind: r.kind, title: r.title, status: r.status, createdAt: r.created_at,
    ...Object.fromEntries(Object.entries(opt).filter(([, v]) => v !== null && v !== undefined)),
  };
};
interface TripRow { name: Person; items: AdminItems | null; updated_at: string | null }
interface AdminRow { pins: StaysAdmin['pins'] | null; scouts: StaysAdmin['scouts'] | null; closed?: StaysAdmin['closed'] | null }

// The Finalize list is kept inside the ranking jsonb column under "final", so the live table needs
// no new column.
export const toResponse = (r: RespRow): Response => {
  const { final, ...ranking } = r.ranking ?? { ...emptyRanking(), final: null };
  return {
    name: r.name, days: r.days, flex: r.flex ?? false, pace: r.pace,
    ranking, final: final ?? null, rated: r.rated ?? [], submitted: r.submitted ?? false,
    updatedAt: r.updated_at ?? new Date(0).toISOString(),
  };
};

type Patch = Partial<Omit<Response, 'name'>>;
/** One of ranking and final without the other: the column write must carry the stored half, which only a read has. */
export const needsStoredRanking = (p: Patch) => (p.ranking === undefined) !== (p.final === undefined);

/** The upsert columns for a patch. Only columns present are written, so a partial patch never nulls the rest. */
export function responseCols(name: Person, p: Patch, stored: RankingCol | null): Record<string, unknown> {
  const cols: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
  for (const k of ['days', 'flex', 'pace', 'rated', 'submitted'] as const) if (p[k] !== undefined) cols[k] = p[k];
  if (p.ranking !== undefined || p.final !== undefined) {
    const { final = null, ...ranking }: RankingCol = stored ?? emptyRanking();
    cols.ranking = { ...(p.ranking ?? ranking), final: p.final !== undefined ? p.final : final };
  }
  return cols;
}

const RELOAD_DEBOUNCE_MS = 200;
const POLL_MS = 20_000;
const TRIP_WRITE_TRIES = 5;

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
    const [r, s, v, stays, tripAdmin] = await Promise.all([
      this.db.from('responses').select('*'),
      this.db.from('suggestions').select('*').order('created_at'),
      this.db.from('knockout_votes').select('*'),
      this.loadStays(),
      this.loadTripAdmin(),
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
      stays,
      tripAdmin,
    };
  }

  /** Never throws: the trip_admin table is missing until the schema is re-run, and that must not blank the app. */
  private async loadTripAdmin(): Promise<TripAdminState> {
    const out: TripAdminState = {};
    try {
      const { data, error } = await this.db.from('trip_admin').select('*');
      if (error) return out;
      for (const row of (data ?? []) as TripRow[]) {
        out[row.name] = { name: row.name, items: row.items ?? {}, updatedAt: row.updated_at ?? new Date(0).toISOString() };
      }
    } catch { /* same as an error result: the checklist starts empty */ }
    return out;
  }

  /**
   * One jsonb row per person, so a patch is merged into the stored map. Two devices of one person can read the same map and
   * the second write would drop the first's key, so the write is compare-and-swap on updated_at and re-reads when it lost.
   */
  async saveTripAdmin(name: Person, patch: AdminItems): Promise<void> {
    for (let attempt = 0; attempt < TRIP_WRITE_TRIES; attempt++) {
      const { data, error: readErr } = await this.db.from('trip_admin').select('items, updated_at').eq('name', name).maybeSingle();
      if (readErr) throw readErr;
      const row = data as { items: AdminItems | null; updated_at: string | null } | null;
      const items = mergeAdminItems(row?.items ?? {}, patch);
      const updated_at = new Date().toISOString();
      if (!row) {
        const { error } = await this.db.from('trip_admin').insert({ name, items, updated_at });
        if (!error) { this.ping(); return; }
        if (error.code !== '23505') throw error;
        continue;
      }
      const base = this.db.from('trip_admin').update({ items, updated_at }).eq('name', name);
      const { data: won, error } = await (row.updated_at === null ? base.is('updated_at', null) : base.eq('updated_at', row.updated_at)).select('name');
      if (error) throw error;
      if (won && won.length > 0) { this.ping(); return; }
    }
    throw new Error('trip_admin changed under the save; kept for retry');
  }

  /**
   * Never throws: a stays table missing on a database whose schema was not re-run must not blank the whole app.
   * Each table fails on its own, so a missing place_suggestions does not hide crew rows that exist.
   */
  private async loadStays(): Promise<StaysState> {
    const stays: StaysState = structuredClone(EMPTY_STAYS);
    const soft = async (read: () => PromiseLike<{ data: unknown[] | null; error: unknown }>, use: (rows: unknown[]) => void) => {
      try {
        const { data, error } = await read();
        if (!error) use(data ?? []);
      } catch { /* same as an error result: that piece starts empty */ }
    };
    await Promise.all([
      soft(() => this.db.from('crew_stays').select('*'), rows => { for (const row of rows as CrewRow[]) stays.crew[row.name] = toCrew(row); }),
      soft(() => this.db.from('place_suggestions').select('*').order('created_at'), rows => { stays.suggestions = (rows as PlaceRow[]).map(toPlace); }),
      soft(() => this.db.from('stays_admin').select('*'), rows => {
        const a = (rows as AdminRow[])[0];
        if (a) stays.admin = { pins: a.pins ?? [], scouts: a.scouts ?? {}, closed: Array.isArray(a.closed) ? a.closed : [] };
      }),
    ]);
    return stays;
  }

  async saveResponse(name: Person, patch: Partial<Omit<Response, 'name'>>): Promise<void> {
    let stored: RankingCol | null = null;
    if (needsStoredRanking(patch)) {
      const { data, error } = await this.db.from('responses').select('ranking').eq('name', name).maybeSingle();
      if (error) throw error;
      stored = (data as { ranking: RankingCol | null } | null)?.ranking ?? null;
    }
    const { error } = await this.db.from('responses').upsert(responseCols(name, patch, stored), { onConflict: 'name' });
    if (error) throw error;
    this.ping();
  }

  // Only the fields in the patch are written, so saving the quiz never clears ranks or bingo.
  async saveCrewStays(name: Person, patch: Partial<Omit<CrewStays, 'name'>>): Promise<void> {
    const cols: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
    if (patch.prefs !== undefined) cols.prefs = patch.prefs;
    if (patch.quizDone !== undefined) cols.quiz_done = patch.quizDone;
    if (patch.locked !== undefined) cols.locked = patch.locked;
    if (patch.ranks !== undefined) cols.ranks = patch.ranks;
    if (patch.bingo !== undefined) cols.bingo = patch.bingo;
    const { error } = await this.db.from('crew_stays').upsert(cols, { onConflict: 'name' });
    if (error) throw error;
    this.ping();
  }

  async addPlaceSuggestion(s: PlaceDraft): Promise<void> {
    const { error } = await this.db.from('place_suggestions').insert({
      id: crypto.randomUUID(), name: s.name, area: s.area, kind: s.kind, title: s.title, link: s.link, price_gbp: s.priceGbp,
      stay_type: s.stayType, rooms: s.rooms, why: s.why, photo: s.photo, hostel_id: s.hostelId, status: 'live',
    });
    if (error) throw error;
    this.ping();
  }

  async setPlaceStatus(id: string, status: PlaceSuggestion['status']): Promise<void> {
    const { error } = await this.db.from('place_suggestions').update({ status }).eq('id', id);
    if (error) throw error;
    this.ping();
  }

  // Scouts merge by area, which needs the stored map; pins are written whole and need no read.
  async saveStaysAdmin(patch: Partial<StaysAdmin>): Promise<void> {
    const cols: Record<string, unknown> = { id: 1 };
    if (patch.pins !== undefined) cols.pins = patch.pins;
    if (patch.closed !== undefined) cols.closed = patch.closed;
    if (patch.scouts !== undefined) {
      const { data, error } = await this.db.from('stays_admin').select('scouts');
      if (error) throw error;
      const stored = ((data ?? []) as AdminRow[])[0]?.scouts ?? {};
      cols.scouts = applyAdmin({ pins: [], scouts: stored, closed: [] }, { scouts: patch.scouts }).scouts;
    }
    const { error } = await this.db.from('stays_admin').upsert(cols, { onConflict: 'id' });
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
