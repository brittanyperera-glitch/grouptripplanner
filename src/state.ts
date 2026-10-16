import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import catalogue from './data/catalogue.json';
import legsData from './data/legs.json';
import copyData from './content/copy.json';
import PasswordGate from './components/PasswordGate';
import { getStore, supabaseConfigured } from './store';
import { useTripAccess } from './store/useTripAccess';
import { WriteQueue } from './store/queue';
import { applyAdmin, blankCrew, EMPTY_STAYS, emptyRanking, mergeAdmin, PEOPLE } from './types';
import type { AppState, CrewStays, Item, Leg, Person, PlaceSuggestion, Player, Response, StayPin, StaysAdmin, Store, Vote } from './types';

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
/** Drops each admin field (pins whole, scouts per area) the server already holds. */
function settleAdmin(o: Partial<StaysAdmin>, server: StaysAdmin): Partial<StaysAdmin> {
  if (Object.keys(o).length === 0) return o;
  const next: Partial<StaysAdmin> = {};
  if (o.pins && !samePins(o.pins, server.pins)) next.pins = o.pins;
  const scouts = Object.fromEntries(Object.entries(o.scouts ?? {}).filter(([k, v]) => server.scouts[k as keyof StaysAdmin['scouts']] !== v));
  if (Object.keys(scouts).length) next.scouts = scouts;
  const unchanged = !!next.pins === !!o.pins && Object.keys(scouts).length === Object.keys(o.scouts ?? {}).length;
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
  const [local, setLocal] = useState<Rows>(() => (sandbox ? {} : readUnsaved()));
  const [localVotes, setLocalVotes] = useState<Vote[]>([]);
  const [localCrew, setLocalCrew] = useState<CrewOverlay>({});
  const [localPlaces, setLocalPlaces] = useState<PlaceOverlay>(NO_PLACES);
  const [localAdmin, setLocalAdmin] = useState<Partial<StaysAdmin>>({});
  const placesRef = useRef(localPlaces);
  placesRef.current = localPlaces;
  const serverRef = useRef(server);
  serverRef.current = server;
  const localRef = useRef(local);
  localRef.current = local;
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

  // Drop a local row once the server holds it (or something newer), and keep the rest on disk.
  useEffect(() => {
    if (!server) return;
    setLocal(l => {
      const kept = Object.fromEntries(Object.entries(l).filter(([, r]) => r && ahead(r, server.responses[r.name]))) as Rows;
      return Object.keys(kept).length === Object.keys(l).length ? l : kept;
    });
    setLocalCrew(l => {
      const kept = Object.fromEntries(Object.entries(l).filter(([n, c]) => c && ahead(c, server.stays?.crew[n as Player]))) as CrewOverlay;
      return Object.keys(kept).length === Object.keys(l).length ? l : kept;
    });
    const { next, send } = settlePlaces(placesRef.current, server.stays?.suggestions ?? []);
    if (next !== placesRef.current) setLocalPlaces(next);
    for (const [id, st] of send) void queue?.store.setPlaceStatus(id, st);
    setLocalAdmin(a => settleAdmin(a, server.stays?.admin ?? EMPTY_STAYS.admin));
  }, [server, queue]);
  useEffect(() => { if (!sandbox) writeUnsaved(local); }, [local, sandbox]);

  // Saves left over from an earlier visit go back into the queue once, after the first server read.
  const replayed = useRef(false);
  useEffect(() => {
    if (sandbox || !server || !queue || replayed.current) return;
    replayed.current = true;
    for (const r of Object.values(localRef.current)) {
      if (!r || !ahead(r, server.responses[r.name])) continue;
      const { name, updatedAt: _at, ...patch } = r;
      void queue.store.saveResponse(name, patch);
    }
  }, [server, queue, sandbox]);

  const store = useMemo<Store | null>(() => queue && {
    ...queue.store,
    saveResponse: (name, patch) => {
      setLocal(l => {
        const prev = l[name] ?? serverRef.current?.responses[name] ?? blankRow(name);
        return { ...l, [name]: { ...prev, ...patch, name, updatedAt: new Date().toISOString() } };
      });
      return queue.store.saveResponse(name, patch);
    },
    vote: v => {
      setLocalVotes(l => [...l.filter(x => !(x.forkId === v.forkId && x.name === v.name)), v]);
      return queue.store.vote(v);
    },
    saveCrewStays: (name, patch) => {
      setLocalCrew(l => ({ ...l, [name]: { patch: { ...l[name]?.patch, ...patch }, updatedAt: new Date().toISOString() } }));
      return queue.store.saveCrewStays(name, patch);
    },
    addPlaceSuggestion: s => {
      const seen = (serverRef.current?.stays?.suggestions ?? []).map(x => x.id);
      const shown: PlaceSuggestion = { ...structuredClone(s), id: `${PENDING}${crypto.randomUUID()}`, status: 'live', createdAt: new Date().toISOString() };
      setLocalPlaces(o => ({ ...o, added: [...o.added, { s: shown, seen }] }));
      return queue.store.addPlaceSuggestion(s);
    },
    // A pending id has no server row yet; the status is sent once a reload brings the row (see settlePlaces).
    setPlaceStatus: (id, st) => {
      setLocalPlaces(o => ({ ...o, status: { ...o.status, [id]: st } }));
      return id.startsWith(PENDING) ? Promise.resolve() : queue.store.setPlaceStatus(id, st);
    },
    saveStaysAdmin: patch => {
      setLocalAdmin(a => mergeAdmin(a, patch));
      return queue.store.saveStaysAdmin(patch);
    },
  }, [queue]);
  const state = useMemo(
    () => server && withStays(withLocal(server, local, localVotes, localCrew), localPlaces, localAdmin),
    [server, local, localVotes, localCrew, localPlaces, localAdmin],
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
