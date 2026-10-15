import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import catalogue from './data/catalogue.json';
import legsData from './data/legs.json';
import copyData from './content/copy.json';
import { getStore } from './store';
import { WriteQueue } from './store/queue';
import { PEOPLE } from './types';
import type { AppState, Item, Leg, Person, Store } from './types';

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
  state: AppState; me: Person | null; setMe(p: Person): void; clearMe(): void; store: Store;
  items: Item[]; legs: Leg[]; copy: Copy; error: string | null; retry(): void;
}

const ME_KEY = 'tp:me';
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

export function AppProvider({ children, store: injected }: { children: ReactNode; store?: Store }) {
  const [attempt, setAttempt] = useState(0);
  const base = useMemo<Store | null>(() => {
    if (injected) return injected;
    try { return getStore(); } catch { return null; }
  }, [injected, attempt]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [me, setMeState] = useState<Person | null>(readMe);
  const queue = useMemo(() => base && new WriteQueue(base, {
    onFail: () => setError("Couldn't save"),
    onClear: () => setError(e => (e === "Couldn't save" ? null : e)),
  }), [base]);
  const legs = legsData as unknown as Leg[];

  const load = useCallback(async () => {
    try {
      if (!base) throw new Error('no store');
      setState(await base.load());
      setError(null);
    } catch {
      setError("Couldn't load");
    }
  }, [base]);

  useEffect(() => {
    void load();
    return base?.subscribe(setState);
  }, [base, load]);

  const retry = useCallback(() => {
    if (!queue) { setAttempt(a => a + 1); return; }
    void queue.flush().then(ok => (ok ? load() : undefined));
  }, [queue, load]);

  const setMe = useCallback((p: Person) => {
    try { localStorage.setItem(ME_KEY, p); } catch { /* storage unavailable: the pick lasts this visit */ }
    setMeState(p);
  }, []);

  const clearMe = useCallback(() => {
    try { localStorage.removeItem(ME_KEY); } catch { /* storage unavailable: the switch lasts this visit */ }
    setMeState(null);
  }, []);

  if (!state) {
    return createElement('div', { className: 'app' },
      error
        ? createElement('button', { className: 'errbar', onClick: retry }, `${error}. Tap to retry`)
        : createElement('div', { className: 'body' }, createElement('div', { className: 'sub' }, 'Loading')));
  }

  const value: AppValue = { state, me, setMe, clearMe, store: (queue as WriteQueue).store, items: liveItems(state), legs, copy, error, retry };
  return createElement(Ctx.Provider, { value }, children);
}
