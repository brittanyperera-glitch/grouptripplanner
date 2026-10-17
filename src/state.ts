import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';
import catalogue from './data/catalogue.json';
import legsData from './data/legs.json';
import copyData from './content/copy.json';
import PasswordGate from './components/PasswordGate';
import { getStore, supabaseConfigured } from './store';
import { useTripAccess } from './store/useTripAccess';
import { WriteQueue } from './store/queue';
import { applyAdmin, blankCrew, EMPTY_STAYS, emptyRanking, mergeAdmin, mergeAdminItems, PEOPLE } from './types';
import type { AdminItems, AppState, TripAdminState, CrewStays, Item, Leg, Person, PlaceSuggestion, Player, Response, StayPin, StaysAdmin, Store, Vote } from './types';

// A quip is one line, or a list the app picks from at random so it doesn't repeat.
export type Quip = string | string[];
export const pickQuip = (q?: Quip): string | undefined =>
  Array.isArray(q) ? (q.length ? q[Math.floor(Math.random() * q.length)] : undefined) : q;
export interface Copy {
  welcome: string;
  welcomeSub?: string;
  guestWelcome?: string;
  guestWelcomeSub?: string;
  // Character-select cards: a title and a few joke stat bars (0-10) per friend.
  players?: Record<string, { title?: string; stats?: { label: string; value: number }[] }>;
  quips: { name: Record<string, Quip>; days: Record<string, Quip>; pace: Record<string, Quip>; tier: Record<string, Quip> };
  items: Record<string, { take?: string; review?: string; reviewUrl?: string; approved?: boolean }>;
}

interface AppValue {
  state: AppState; me: Player | null; setMe(p: Player): void; clearMe(): void; store: Store;
  items: Item[]; legs: Leg[]; copy: Copy; error: string | null; retry(): void;
  sandbox: boolean; finishSandbox?: () => void;
}

export const ME_KEY = 'tp:me';
// My own saves, kept here until the server has them, so a failed save survives a reload of the page.
const UNSAVED_KEY = (p: Person) => `tp:unsaved:${p}`;
const PENDING_KEY = (name: string) => `tp:pending:${name}`;
type Rows = AppState['responses'];
// My crew writes, field by field, stamped when made; shown over the server row until it holds them.
type CrewOverlay = Partial<Record<Player, { patch: Partial<Omit<CrewStays, 'name'>>; updatedAt: string }>>;

// My place adds (under a pending id, with the server ids that existed when I added) and status changes.
// Rows carry no updatedAt to compare, so each entry is dropped once the server holds the same value, as votes are.
interface PlaceOverlay { added: { s: PlaceSuggestion; seen: string[] }[]; status: Record<string, PlaceSuggestion['status']> }
const NO_PLACES: PlaceOverlay = { added: [], status: {} };
const PENDING = 'pending:';

const sameDraft = (a: PlaceSuggestion, b: PlaceSuggestion) => a.name === b.name && a.area === b.area && a.kind === b.kind && a.title === b.title;
/** Matches my pending adds to new server rows; a status set on a pending id moves to the real id and is returned to send. */
function settlePlaces(o: PlaceOverlay, rows: PlaceSuggestion[]): { next: PlaceOverlay; send: [string, PlaceSuggestion['status']][] } {
  if (o.added.length === 0 && Object.keys(o.status).length === 0) return { next: o, send: [] };
  const status = { ...o.status };
  const send: [string, PlaceSuggestion['status']][] = [];
  const used = new Set<string>();
  const added = o.added.filter(a => {
    const hit = rows.find(r => !used.has(r.id) && !a.seen.includes(r.id) && sameDraft(r, a.s));
    if (!hit) return true;
    used.add(hit.id);
    const st = status[a.s.id];
    delete status[a.s.id];
    if (st !== undefined && st !== hit.status) { status[hit.id] = st; send.push([hit.id, st]); }
    return false;
  });
  for (const id of Object.keys(status)) if (rows.some(r => r.id === id && r.status === status[id])) delete status[id];
  const same = added.length === o.added.length && Object.keys(status).length === Object.keys(o.status).length && send.length === 0;
  return { next: same ? o : { added, status }, send };
}

const samePins = (a: StayPin[], b: StayPin[]) => a.length === b.length && a.every((p, i) => p.area === b[i].area && p.suggestionId === b[i].suggestionId && p.at === b[i].at);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameNights = (a: Record<string, number | undefined>, b: Record<string, number | undefined>) => { const k = Object.keys(a); return k.length === Object.keys(b).length && k.every(x => a[x] === b[x]); };
/** Drops each admin field (pins, closed and nights whole, scouts per area) the server already holds. */
function settleAdmin(o: Partial<StaysAdmin>, server: StaysAdmin): Partial<StaysAdmin> {
  if (Object.keys(o).length === 0) return o;
  const next: Partial<StaysAdmin> = {};
  if (o.pins && !samePins(o.pins, server.pins)) next.pins = o.pins;
  const scouts = Object.fromEntries(Object.entries(o.scouts ?? {}).filter(([k, v]) => server.scouts[k as keyof StaysAdmin['scouts']] !== v));
  if (Object.keys(scouts).length) next.scouts = scouts;
  if (o.closed && !sameList(o.closed, server.closed)) next.closed = o.closed;
  if (o.nights && !sameNights(o.nights, server.nights ?? {})) next.nights = o.nights;
  const unchanged = !!next.pins === !!o.pins && !!next.closed === !!o.closed && !!next.nights === !!o.nights && Object.keys(scouts).length === Object.keys(o.scouts ?? {}).length;
  return unchanged ? o : next;
}

/** My place and admin writes over the server's stays, so an add, a withdraw or a pin shows at once. */
function withStays(s: AppState, places: PlaceOverlay, admin: Partial<StaysAdmin>): AppState {
  if (places.added.length === 0 && Object.keys(places.status).length === 0 && Object.keys(admin).length === 0) return s;
  const stays = s.stays ?? EMPTY_STAYS;
  const o = settlePlaces(places, stays.suggestions).next;
  const suggestions = [...stays.suggestions, ...o.added.map(a => a.s)].map(p => (o.status[p.id] && o.status[p.id] !== p.status ? { ...p, status: o.status[p.id] } : p));
  return { ...s, stays: { ...stays, suggestions, admin: applyAdmin(stays.admin, admin) } };
}

const blankRow = (name: Player): Response => ({
  name, days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: new Date(0).toISOString(),
});

/** True when the server has not yet caught up with a local save (missing, or written before it). */
const ahead = (local: { updatedAt: string }, server?: { updatedAt: string }) => !server || Date.parse(server.updatedAt) < Date.parse(local.updatedAt);

function readUnsaved(): Rows {
  const out: Rows = {};
  for (const p of PEOPLE) {
    try {
      const raw = localStorage.getItem(UNSAVED_KEY(p));
      const r = raw ? (JSON.parse(raw) as Response) : null;
      if (r && r.name === p && typeof r.updatedAt === 'string') out[p] = r;
    } catch { /* storage unavailable or corrupt: nothing to restore */ }
  }
  return out;
}

function writeUnsaved(rows: Rows): void {
  for (const p of PEOPLE) {
    try {
      const r = rows[p];
      if (r) localStorage.setItem(UNSAVED_KEY(p), JSON.stringify(r)); else localStorage.removeItem(UNSAVED_KEY(p));
    } catch { /* storage unavailable: the overlay lasts this visit */ }
  }
}

type Send = (store: Store) => Promise<void>;
/**
 * One kind of my own writes, shown over the server's state until it holds them. Kept on disk so a failed
 * write survives a reload, and re-sent once after the first server read.
 */
interface Pending<T> {
  empty: T;
  /** Drops what the server already holds (returning `o` itself when nothing went), plus any writes that now can go. */
  settle(o: T, s: AppState): [T, Send[]];
  resend(o: T): Send[];
  read(): T;
  write(o: T): void;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function keepWhere<V>(o: Partial<Record<string, V>>, keep: (k: string, v: V) => boolean): Partial<Record<string, V>> {
  const kept = Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && keep(k, v as V))) as Partial<Record<string, V>>;
  return Object.keys(kept).length === Object.keys(o).length ? o : kept;
}

/** Disk for a kind under tp:pending:<name>; `parse` rejects a corrupt value. */
function onDisk<T>(name: string, empty: T, isEmpty: (o: T) => boolean, parse: (raw: unknown) => T | null, toJSON: (o: T) => unknown = o => o) {
  return {
    read(): T {
      try {
        const raw = localStorage.getItem(PENDING_KEY(name));
        return (raw === null ? null : parse(JSON.parse(raw))) ?? empty;
      } catch { return empty; }
    },
    write(o: T): void {
      try {
        if (isEmpty(o)) localStorage.removeItem(PENDING_KEY(name)); else localStorage.setItem(PENDING_KEY(name), JSON.stringify(toJSON(o)));
      } catch { /* storage unavailable: the overlay lasts this visit */ }
    },
  };
}

const RESPONSES: Pending<Rows> = {
  empty: {}, read: readUnsaved, write: writeUnsaved,
  settle: (o, s) => [keepWhere(o, (_, r) => ahead(r, s.responses[r.name])), []],
  resend: o => Object.values(o).map(r => st => {
    const { name, updatedAt: _at, ...patch } = r!;
    return st.saveResponse(name, patch);
  }),
};

const CREW: Pending<CrewOverlay> = {
  empty: {},
  settle: (o, s) => [keepWhere(o, (n, c) => ahead(c, s.stays?.crew[n as Player])), []],
  resend: o => Object.entries(o).map(([n, c]) => st => st.saveCrewStays(n as Player, c!.patch)),
  ...onDisk<CrewOverlay>('crew', {}, o => Object.keys(o).length === 0,
    raw => (isObj(raw) ? keepWhere(raw as CrewOverlay, (_, c) => isObj(c?.patch) && typeof c?.updatedAt === 'string') : null)),
};

// My trip admin edits per person, item by item, shown over the server row until it holds them.
type TripOverlay = Partial<Record<Player, { items: AdminItems; updatedAt: string }>>;
const TRIP: Pending<TripOverlay> = {
  empty: {},
  settle: (o, s) => [keepWhere(o, (n, t) => ahead(t, s.tripAdmin?.[n as Player])), []],
  resend: o => Object.entries(o).map(([n, t]) => st => st.saveTripAdmin(n as Player, t!.items)),
  ...onDisk<TripOverlay>('trip', {}, o => Object.keys(o).length === 0,
    raw => (isObj(raw) ? keepWhere(raw as TripOverlay, (_, t) => isObj(t?.items) && typeof t?.updatedAt === 'string') : null)),
};
function withTrip(s: AppState, trip: TripOverlay): AppState {
  const pending = (Object.entries(trip) as [Player, NonNullable<TripOverlay[Player]>][]).filter(([n, t]) => ahead(t, s.tripAdmin?.[n]));
  if (pending.length === 0) return s;
  const rows: TripAdminState = { ...s.tripAdmin };
  for (const [n, t] of pending) rows[n] = { name: n, items: mergeAdminItems(rows[n]?.items ?? {}, t.items), updatedAt: t.updatedAt };
  return { ...s, tripAdmin: rows };
}

const sameVote = (a: Vote, b: Vote) => a.forkId === b.forkId && a.name === b.name && a.choice === b.choice;
const VOTES: Pending<Vote[]> = {
  empty: [],
  settle: (o, s) => {
    const kept = o.filter(v => !s.votes.some(x => sameVote(x, v)));
    return [kept.length === o.length ? o : kept, []];
  },
  resend: o => o.map(v => st => st.vote(v)),
  ...onDisk<Vote[]>('votes', [], o => o.length === 0,
    raw => (Array.isArray(raw) ? raw.filter(v => isObj(v) && typeof v.forkId === 'string' && typeof v.name === 'string' && (v.choice === 'a' || v.choice === 'b')) : null)),
};

const PLACES: Pending<PlaceOverlay> = {
  empty: NO_PLACES,
  settle: (o, s) => {
    const { next, send } = settlePlaces(o, s.stays?.suggestions ?? []);
    return [next, send.map(([id, v]) => st => st.setPlaceStatus(id, v))];
  },
  // A status on a pending id waits for its add to land (settle sends it then).
  resend: o => [
    ...o.added.map(({ s: { id: _id, status: _st, createdAt: _at, ...draft } }): Send => st => st.addPlaceSuggestion(draft)),
    ...Object.entries(o.status).filter(([id]) => !id.startsWith(PENDING)).map(([id, v]): Send => st => st.setPlaceStatus(id, v)),
  ],
  ...onDisk<PlaceOverlay>('places', NO_PLACES, o => o.added.length === 0 && Object.keys(o.status).length === 0,
    raw => (isObj(raw) && Array.isArray(raw.added) && isObj(raw.status) && raw.added.every(a => isObj(a) && isObj(a.s) && Array.isArray(a.seen))
      ? (raw as unknown as PlaceOverlay) : null)),
};

// JSON drops undefined, and an undefined scout is a clear, so it goes to disk as null.
const scoutsVia = (o: Partial<StaysAdmin>, to: undefined | null) =>
  (o.scouts ? { ...o, scouts: Object.fromEntries(Object.entries(o.scouts).map(([k, v]) => [k, v ?? to])) } : o);
const ADMIN: Pending<Partial<StaysAdmin>> = {
  empty: {},
  settle: (o, s) => [settleAdmin(o, s.stays?.admin ?? EMPTY_STAYS.admin), []],
  resend: o => (Object.keys(o).length ? [st => st.saveStaysAdmin(o)] : []),
  ...onDisk<Partial<StaysAdmin>>('admin', {}, o => Object.keys(o).length === 0,
    raw => (isObj(raw) ? scoutsVia(raw as Partial<StaysAdmin>, undefined) : null), o => scoutsVia(o, null)),
};

interface PendingState<T> { kind: Pending<T>; value: T; set: Dispatch<SetStateAction<T>>; ref: MutableRefObject<T> }
function usePending<T>(kind: Pending<T>, sandbox: boolean): PendingState<T> {
  const [value, set] = useState<T>(() => (sandbox ? kind.empty : kind.read()));
  const ref = useRef(value);
  ref.current = value;
  useEffect(() => { if (!sandbox) kind.write(value); }, [kind, value, sandbox]);
  return { kind, value, set, ref };
}

/** Prunes one kind against a server read, and sends what can go now (or, on `replay`, everything left). */
function sweep<T>(p: PendingState<T>, server: AppState, store: Store | undefined, replay: boolean): void {
  const before = p.ref.current;
  const [next, send] = p.kind.settle(before, server);
  if (next !== before) p.set(o => (o === before ? next : p.kind.settle(o, server)[0]));
  if (store) for (const w of replay ? p.kind.resend(next) : send) void w(store);
}

/** Server state with my not-yet-stored saves on top, so a reload that lacks them never wipes them from screen. */
function withLocal(server: AppState, local: Rows, votes: Vote[] = [], crew: CrewOverlay = {}): AppState {
  const responses = { ...server.responses };
  for (const r of Object.values(local)) if (r && ahead(r, server.responses[r.name])) responses[r.name] = r;
  // My own taps, shown at once; the server's row replaces them once it holds the same choice.
  const mine = votes.filter(v => !server.votes.some(s => s.forkId === v.forkId && s.name === v.name && s.choice === v.choice));
  const kept = server.votes.filter(s => !mine.some(v => v.forkId === s.forkId && v.name === s.name));
  const out = { ...server, responses, votes: mine.length ? [...kept, ...mine] : server.votes };
  const pending = (Object.entries(crew) as [Player, NonNullable<CrewOverlay[Player]>][]).filter(([n, c]) => ahead(c, server.stays?.crew[n]));
  if (pending.length === 0) return out;
  const stays = server.stays ?? EMPTY_STAYS;
  const rows = { ...stays.crew };
  for (const [n, c] of pending) rows[n] = { ...(rows[n] ?? blankCrew(n)), ...c.patch, name: n, updatedAt: c.updatedAt };
  return { ...out, stays: { ...stays, crew: rows } };
}
const copy: Copy = copyData;

export function liveItems(state: AppState): Item[] {
  const base = (catalogue as unknown as { items: Item[] }).items;
  // Late = suggested after voting = no trip member has rated it (the table has no approval timestamp).
  const ratedByAnyone = new Set(PEOPLE.flatMap(p => state.responses[p]?.rated ?? []));
  const suggested: Item[] = state.suggestions.filter(s => s.status === 'live').map(s => ({
    id: `s:${s.id}`, name: s.title, area: s.area, about: s.note, hours: 2, sideTrip: 0,
    slot: 'any', fee: '', suggestedBy: s.name, late: !ratedByAnyone.has(`s:${s.id}`),
  }));
  return [...base, ...suggested];
}

function readMe(): Person | null {
  try {
    const v = localStorage.getItem(ME_KEY);
    return PEOPLE.find(p => p === v) ?? null;
  } catch {
    return null;
  }
}

const Ctx = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

export function AppProvider({ children, store: injected, sandbox }: { children: ReactNode; store?: Store; sandbox?: { onFinish(): void } }) {
  const [attempt, setAttempt] = useState(0);
  // The password gate stands in front of the shared database only; an injected or local store skips it.
  const access = useTripAccess(!injected && supabaseConfigured());
  const open = access.status === 'open';
  const base = useMemo<Store | null>(() => {
    if (injected) return injected;
    if (!open) return null;
    try { return getStore(access.password ?? undefined); } catch { return null; }
  }, [injected, attempt, open, access.password]);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<AppState | null>(null);
  const local = usePending(RESPONSES, !!sandbox);
  const votes = usePending(VOTES, !!sandbox);
  const crew = usePending(CREW, !!sandbox);
  const places = usePending(PLACES, !!sandbox);
  const admin = usePending(ADMIN, !!sandbox);
  const trip = usePending(TRIP, !!sandbox);
  const serverRef = useRef(server);
  serverRef.current = server;
  const [me, setMeState] = useState<Player | null>(() => (sandbox ? null : readMe()));
  const queue = useMemo(() => base && new WriteQueue(base, {
    onFail: () => setError("Couldn't save"),
    onClear: () => setError(e => (e === "Couldn't save" ? null : e)),
  }), [base]);
  const legs = legsData as unknown as Leg[];

  const load = useCallback(async () => {
    try {
      if (!base) throw new Error('no store');
      setServer(await base.load());
      setError(null);
    } catch {
      setError("Couldn't load");
    }
  }, [base]);

  useEffect(() => {
    void load();
    return base?.subscribe(setServer);
  }, [base, load]);

  // Each server read drops what it now holds; writes left over from an earlier visit go back into the queue once, after the first.
  const replayed = useRef(false);
  useEffect(() => {
    if (!server) return;
    const replay = !sandbox && !!queue && !replayed.current;
    if (replay) replayed.current = true;
    const store = queue?.store;
    sweep(local, server, store, replay);
    sweep(votes, server, store, replay);
    sweep(crew, server, store, replay);
    sweep(places, server, store, replay);
    sweep(admin, server, store, replay);
    sweep(trip, server, store, replay);
  }, [server, queue, sandbox]);

  const store = useMemo<Store | null>(() => queue && {
    ...queue.store,
    saveResponse: (name, patch) => {
      local.set(l => {
        const prev = l[name] ?? serverRef.current?.responses[name] ?? blankRow(name);
        return { ...l, [name]: { ...prev, ...patch, name, updatedAt: new Date().toISOString() } };
      });
      return queue.store.saveResponse(name, patch);
    },
    vote: v => {
      votes.set(l => [...l.filter(x => !(x.forkId === v.forkId && x.name === v.name)), v]);
      return queue.store.vote(v);
    },
    saveCrewStays: (name, patch) => {
      crew.set(l => ({ ...l, [name]: { patch: { ...l[name]?.patch, ...patch }, updatedAt: new Date().toISOString() } }));
      return queue.store.saveCrewStays(name, patch);
    },
    addPlaceSuggestion: s => {
      const seen = (serverRef.current?.stays?.suggestions ?? []).map(x => x.id);
      const shown: PlaceSuggestion = { ...structuredClone(s), id: `${PENDING}${crypto.randomUUID()}`, status: 'live', createdAt: new Date().toISOString() };
      places.set(o => ({ ...o, added: [...o.added, { s: shown, seen }] }));
      return queue.store.addPlaceSuggestion(s);
    },
    // A pending id has no server row yet; the status is sent once a reload brings the row (see settlePlaces).
    setPlaceStatus: (id, st) => {
      places.set(o => ({ ...o, status: { ...o.status, [id]: st } }));
      return id.startsWith(PENDING) ? Promise.resolve() : queue.store.setPlaceStatus(id, st);
    },
    saveStaysAdmin: patch => {
      admin.set(a => mergeAdmin(a, patch));
      return queue.store.saveStaysAdmin(patch);
    },
    saveTripAdmin: (name, patch) => {
      trip.set(l => ({ ...l, [name]: { items: mergeAdminItems(l[name]?.items ?? {}, patch), updatedAt: new Date().toISOString() } }));
      return queue.store.saveTripAdmin(name, patch);
    },
  }, [queue]);
  const state = useMemo(
    () => server && withTrip(withStays(withLocal(server, local.value, votes.value, crew.value), places.value, admin.value), trip.value),
    [server, local.value, votes.value, crew.value, places.value, admin.value, trip.value],
  );

  const retry = useCallback(() => {
    if (!queue) { setAttempt(a => a + 1); return; }
    void queue.flush().then(ok => (ok ? load() : undefined));
  }, [queue, load]);

  const setMe = useCallback((p: Player) => {
    if (!sandbox) try { localStorage.setItem(ME_KEY, p); } catch { /* storage unavailable: the pick lasts this visit */ }
    setMeState(p);
  }, [sandbox]);

  const clearMe = useCallback(() => {
    if (!sandbox) try { localStorage.removeItem(ME_KEY); } catch { /* storage unavailable: the switch lasts this visit */ }
    setMeState(null);
  }, [sandbox]);

  if (access.status === 'gate') return createElement(PasswordGate, { onAccept: access.accept });
  if (access.status === 'checking') return createElement('div', { className: 'app' }, createElement('div', { className: 'body' }, createElement('div', { className: 'sub' }, 'Loading')));

  if (!state) {
    return createElement('div', { className: 'app' },
      error
        ? createElement('button', { className: 'errbar', onClick: retry }, `${error}. Tap to retry`)
        : createElement('div', { className: 'body' }, createElement('div', { className: 'sub' }, 'Loading')));
  }

  const value: AppValue = { state, me, setMe, clearMe, store: store as Store, items: liveItems(state), legs, copy, error, retry, sandbox: !!sandbox, finishSandbox: sandbox?.onFinish };
  return createElement(Ctx.Provider, { value }, children);
}
