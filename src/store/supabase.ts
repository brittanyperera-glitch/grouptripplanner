import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, readAdminKey, tripClient } from './tripKey';
import { applyAdmin, cleanNights, EMPTY_STAYS, emptyRanking, mergeAdminItems } from '../types';
import type { AdminItems, AppState, BookingClaim, TripAdminState, ChoiceEntry, ChoiceInput, Complaint, CrewStays, FinalStore, Person, PlaceDraft, PlaceSuggestion, Player, Response, StaysAdmin, StaysState, Store, Suggestion, TripSettings, Traveller, Vote } from '../types';

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
const nightsOf = (raw: unknown): Pick<StaysAdmin, 'nights'> => { const n = cleanNights(raw); return Object.keys(n).length ? { nights: n } : {}; };
const missingColumn = (e: unknown, col: string): boolean => {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === 'PGRST204' || x?.code === '42703' || (typeof x?.message === 'string' && x.message.includes(col) && /column|schema cache/i.test(x.message));
};
// A code decides alone; the message is read only when there is none, and only for the two wordings a missing table uses.
const missingTable = (e: { code?: string; message?: string }): boolean =>
  e.code ? ['42P01', 'PGRST205', 'PGRST204'].includes(e.code) : /in the schema cache|relation "[^"]+" does not exist/i.test(e.message ?? '');
interface AdminRow { pins: StaysAdmin['pins'] | null; scouts: StaysAdmin['scouts'] | null; closed?: StaysAdmin['closed'] | null; nights?: unknown; fallen?: unknown }
interface SettingsRow { start_date: string | null; last_day_start?: string | null; plan: TripSettings['plan']; booking_dates: TripSettings['bookingDates'] | null; overrides: TripSettings['overrides'] | null; updated_at: string | null }
interface TravellerRow { name: Person; arrive_local: string | null; arrive_flight: string | null; depart_local: string | null; depart_flight: string | null; updated_at: string | null }
interface ClaimRow { item_id: string; owner: Person | null; updated_at: string | null }
const EPOCH = new Date(0).toISOString();

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

export class SupabaseStore implements Store, FinalStore {
  private db: SupabaseClient;
  private adminDbFor: { key: string; db: SupabaseClient } | null = null;
  // Realtime row events are filtered by RLS, which cannot see the x-trip-key header, so once the lock is
  // on they deliver nothing. A broadcast ping on 'tp' carries no data: peers just reload.
  private chan: ReturnType<SupabaseClient['channel']> | null = null;
  private onPing: () => void = () => undefined;

  constructor(private url: string, private anon: string, private tripKey?: string) {
    this.db = tripClient(url, anon, tripKey);
  }

  /** The client for organiser writes, rebuilt when the key in storage changes. With no key the write goes out plain and the server refuses it with 42501. */
  private adminDb(): SupabaseClient {
    const k = readAdminKey();
    if (!k) return this.db;
    if (this.adminDbFor?.key !== k) this.adminDbFor = { key: k, db: adminClient(this.url, this.anon, this.tripKey, k) };
    return this.adminDbFor.db;
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
    const [r, s, v, stays, tripAdmin, tripSettings, travellers, bookingClaims] = await Promise.all([
      this.db.from('responses').select('*'),
      this.db.from('suggestions').select('*').order('created_at'),
      this.db.from('knockout_votes').select('*'),
      this.loadStays(),
      this.loadTripAdmin(),
      this.loadTripSettings(),
      this.loadTravellers(),
      this.loadClaims(),
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
      tripSettings,
      travellers,
      bookingClaims,
    };
  }

  /** A missing table reads as absent (the migration may not be run yet); any other error fails the whole load, so a blip never overwrites the snapshot. */
  private async soft<T>(table: string, empty: T, use: (rows: unknown[]) => T): Promise<T> {
    let res;
    // A thrown (not returned) failure keeps the old absent reading: supabase.final.test.ts pins it.
    try { res = await this.db.from(table).select('*'); } catch { return empty; }
    if (!res.error) return use(res.data ?? []);
    if (missingTable(res.error)) return empty;
    throw res.error;
  }

  private loadTripSettings(): Promise<TripSettings | null> {
    return this.soft<TripSettings | null>('trip_settings', null, rows => {
      const r = (rows as SettingsRow[])[0];
      return r ? { startDate: r.start_date, lastDayStart: r.last_day_start ?? null, plan: r.plan ?? null, bookingDates: r.booking_dates ?? {}, overrides: Array.isArray(r.overrides) ? r.overrides : [], updatedAt: r.updated_at ?? EPOCH } : null;
    });
  }

  private loadTravellers(): Promise<Partial<Record<Person, Traveller>>> {
    return this.soft<Partial<Record<Person, Traveller>>>('travellers', {}, rows => Object.fromEntries((rows as TravellerRow[]).map(r => [r.name, {
      name: r.name, arriveLocal: r.arrive_local, arriveFlight: r.arrive_flight, departLocal: r.depart_local, departFlight: r.depart_flight, updatedAt: r.updated_at ?? EPOCH,
    }])));
  }

  private loadClaims(): Promise<Record<string, BookingClaim>> {
    return this.soft<Record<string, BookingClaim>>('booking_claims', {}, rows => Object.fromEntries((rows as ClaimRow[]).map(r => [r.item_id, { itemId: r.item_id, owner: r.owner, updatedAt: r.updated_at ?? EPOCH }])));
  }

  /** Organiser only: the server answers 42501 without the organiser key. Only the columns in the patch are written. */
  async saveTripSettings(patch: Partial<Omit<TripSettings, 'updatedAt'>>): Promise<void> {
    const cols: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
    if (patch.startDate !== undefined) cols.start_date = patch.startDate;
    if (patch.lastDayStart !== undefined) cols.last_day_start = patch.lastDayStart;
    if (patch.plan !== undefined) cols.plan = patch.plan;
    if (patch.bookingDates !== undefined) cols.booking_dates = patch.bookingDates;
    if (patch.overrides !== undefined) cols.overrides = patch.overrides;
    const { error } = await this.adminDb().from('trip_settings').upsert(cols, { onConflict: 'id' });
    if (error) throw error;
    this.ping();
  }

  async saveTraveller(name: Person, patch: Partial<Omit<Traveller, 'name' | 'updatedAt'>>): Promise<void> {
    const cols: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
    if (patch.arriveLocal !== undefined) cols.arrive_local = patch.arriveLocal;
    if (patch.arriveFlight !== undefined) cols.arrive_flight = patch.arriveFlight;
    if (patch.departLocal !== undefined) cols.depart_local = patch.departLocal;
    if (patch.departFlight !== undefined) cols.depart_flight = patch.departFlight;
    const { error } = await this.db.from('travellers').upsert(cols, { onConflict: 'name' });
    if (error) throw error;
    this.ping();
  }

  async saveBookingClaim(itemId: string, owner: Person | null): Promise<void> {
    const { error } = await this.db.from('booking_claims').upsert({ item_id: itemId, owner, updated_at: new Date().toISOString() }, { onConflict: 'item_id' });
    if (error) throw error;
    this.ping();
  }

  /** A missing trip_admin table reads as empty; any other read error fails the load, so a blip never empties the snapshot. */
  private async loadTripAdmin(): Promise<TripAdminState> {
    const out: TripAdminState = {};
    let res;
    try { res = await this.db.from('trip_admin').select('*'); } catch { return out; }
    if (res.error) { if (missingTable(res.error)) return out; throw res.error; }
    for (const row of (res.data ?? []) as TripRow[]) {
      out[row.name] = { name: row.name, items: row.items ?? {}, updatedAt: row.updated_at ?? new Date(0).toISOString() };
    }
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
   * A stays table missing on a database whose schema was not re-run reads as empty, each table on its own, so a missing
   * place_suggestions does not hide crew rows that exist. Any other read error fails the load, keeping the snapshot.
   */
  private async loadStays(): Promise<StaysState> {
    const stays: StaysState = structuredClone(EMPTY_STAYS);
    const soft = async (read: () => PromiseLike<{ data: unknown[] | null; error: unknown }>, use: (rows: unknown[]) => void) => {
      let res;
      try { res = await read(); } catch { return; }
      if (!res.error) { use(res.data ?? []); return; }
      if (!missingTable(res.error as { code?: string; message?: string })) throw res.error;
    };
    await Promise.all([
      soft(() => this.db.from('crew_stays').select('*'), rows => { for (const row of rows as CrewRow[]) stays.crew[row.name] = toCrew(row); }),
      soft(() => this.db.from('place_suggestions').select('*').order('created_at'), rows => { stays.suggestions = (rows as PlaceRow[]).map(toPlace); }),
      soft(() => this.db.from('stays_admin').select('*'), rows => {
        const a = (rows as AdminRow[])[0];
        if (a) stays.admin = { pins: a.pins ?? [], scouts: a.scouts ?? {}, closed: Array.isArray(a.closed) ? a.closed : [], ...nightsOf(a.nights), ...(Array.isArray(a.fallen) && a.fallen.length ? { fallen: a.fallen as StaysAdmin['fallen'] } : {}), ...('nights' in a ? {} : { nightsOff: true as const }) };
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
    if (patch.nights !== undefined) cols.nights = cleanNights(patch.nights);
    if (patch.scouts !== undefined) {
      const { data, error } = await this.db.from('stays_admin').select('scouts');
      if (error) throw error;
      const stored = ((data ?? []) as AdminRow[])[0]?.scouts ?? {};
      cols.scouts = applyAdmin({ pins: [], scouts: stored, closed: [] }, { scouts: patch.scouts }).scouts;
    }
    const db = this.adminDb();
    let { error } = patch.fallen !== undefined && Object.keys(cols).length === 1 ? { error: null } : await db.from('stays_admin').upsert(cols, { onConflict: 'id' });
    // A live table without the nights column rejects the whole row: write the rest, so one missing column cannot wedge the queue.
    if (error && 'nights' in cols && missingColumn(error, 'nights')) {
      const rest = Object.fromEntries(Object.entries(cols).filter(([k]) => k !== 'nights'));
      ({ error } = Object.keys(rest).length > 1 ? await db.from('stays_admin').upsert(rest, { onConflict: 'id' }) : { error: null });
    }
    // fallen is its own write, so a table without that column (or without nights) never costs the pins and closes above.
    if (!error && patch.fallen !== undefined) {
      ({ error } = await db.from('stays_admin').upsert({ id: 1, fallen: patch.fallen }, { onConflict: 'id' }));
      if (error && missingColumn(error, 'fallen')) error = null;
    }
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

  async addComplaint(c: { name: Player; text: string }): Promise<void> {
    const { error } = await this.db.from('complaints').insert({ id: crypto.randomUUID(), name: c.name, text: c.text });
    if (error) throw error;
  }

  async loadComplaints(): Promise<Complaint[]> {
    const { data, error } = await this.db.from('complaints').select('*').order('created_at');
    if (error) throw error;
    return ((data ?? []) as { id: string; name: Player; text: string; created_at: string }[]).map(x => ({ id: x.id, name: x.name, text: x.text, createdAt: x.created_at }));
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
