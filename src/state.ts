import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import catalogue from './data/catalogue.json';
import legsData from './data/legs.json';
import copyData from './content/copy.json';
import { getStore } from './store';
import { PEOPLE } from './types';
import type { AppState, Item, Leg, Person, Store } from './types';

export interface Copy {
  welcome: string;
  quips: { name: Record<string, string>; days: Record<string, string>; pace: Record<string, string>; tier: Record<string, string> };
  items: Record<string, { take?: string; review?: string; reviewUrl?: string }>;
}

interface AppValue {
  state: AppState; me: Person | null; setMe(p: Person): void; clearMe(): void; store: Store;
  items: Item[]; legs: Leg[]; copy: Copy; error: string | null; retry(): void;
}

const ME_KEY = 'tp:me';

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

// Wraps a store so a failed write keeps local state, raises the retry banner and is replayed by retry().
function guarded(base: Store, queue: { current: Array<() => Promise<void>> }, fail: () => void): Store {
  const run = async (op: () => Promise<void>) => {
    try { await op(); } catch { queue.current.push(op); fail(); }
  };
  return {
    load: () => base.load(),
    saveResponse: (n, p) => run(() => base.saveResponse(n, p)),
    addSuggestion: s => run(() => base.addSuggestion(s)),
    setSuggestionStatus: (id, st) => run(() => base.setSuggestionStatus(id, st)),
    vote: v => run(() => base.vote(v)),
    subscribe: cb => base.subscribe(cb),
  };
}

export function AppProvider({ children, store: injected }: { children: ReactNode; store?: Store }) {
  const base = useMemo(() => injected ?? getStore(), [injected]);
  const queue = useRef<Array<() => Promise<void>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [me, setMeState] = useState<Person | null>(readMe);
  const store = useMemo(() => guarded(base, queue, () => setError("Couldn't save")), [base]);
  const legs = legsData as unknown as Leg[];

  const load = useCallback(async () => {
    try {
      setState(await base.load());
      setError(null);
    } catch {
      setError("Couldn't load");
    }
  }, [base]);

  useEffect(() => {
    void load();
    return base.subscribe(setState);
  }, [base, load]);

  const retry = useCallback(() => {
    void (async () => {
      const pending = queue.current;
      queue.current = [];
      for (const op of pending) {
        try { await op(); } catch { queue.current.push(op); }
      }
      if (queue.current.length > 0) { setError("Couldn't save"); return; }
      await load();
    })();
  }, [load]);

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

  const value: AppValue = { state, me, setMe, clearMe, store, items: liveItems(state), legs, copy: copyData as unknown as Copy, error, retry };
  return createElement(Ctx.Provider, { value }, children);
}
