import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import catalogue from './data/catalogue.json';
import legsData from './data/legs.json';
import copyData from './content/copy.json';
import PasswordGate from './components/PasswordGate';
import { getStore, supabaseConfigured } from './store';
import { useTripAccess } from './store/useTripAccess';
import { WriteQueue } from './store/queue';
import { emptyRanking, GUEST, PEOPLE } from './types';
import type { AppState, Item, Leg, Person, Player, Response, Store } from './types';

// A quip is one line, or a list the app picks from at random so it doesn't repeat.
export type Quip = string | string[];
export const pickQuip = (q?: Quip): string | undefined =>
  Array.isArray(q) ? (q.length ? q[Math.floor(Math.random() * q.length)] : undefined) : q;
export interface Copy {
  welcome: string;
  welcomeSub?: string;
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

const blankRow = (name: Player): Response => ({
  name, days: null, flex: false, pace: null, ranking: emptyRanking(), rated: [], submitted: false, updatedAt: new Date(0).toISOString(),
});

/** True when the server has not yet caught up with a local save (missing, or written before it). */
const ahead = (local: Response, server?: Response) => !server || Date.parse(server.updatedAt) < Date.parse(local.updatedAt);

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
function withLocal(server: AppState, local: Rows): AppState {
  const responses = { ...server.responses };
  for (const r of Object.values(local)) if (r && ahead(r, server.responses[r.name])) responses[r.name] = r;
  return { ...server, responses };
}
const copy: Copy = copyData;

export function liveItems(state: AppState): Item[] {
  const base = (catalogue as unknown as { items: Item[] }).items;
  const suggested: Item[] = state.suggestions.filter(s => s.status === 'live').map(s => ({
    id: `s:${s.id}`, name: s.title, area: s.area, about: s.note, hours: 2, sideTrip: 0,
    slot: 'any', fee: '', suggestedBy: s.name,
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
  const serverRef = useRef(server);
  serverRef.current = server;
  const localRef = useRef(local);
  localRef.current = local;
  const [me, setMeState] = useState<Player | null>(() => (sandbox ? GUEST : readMe()));
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
  }, [server]);
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
  }, [queue]);
  const state = useMemo(() => server && withLocal(server, local), [server, local]);

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
