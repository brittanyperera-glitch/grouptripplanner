import { useEffect, useMemo, useRef, useState } from 'react';
import genresJson from '../data/genres.json';
import { groupResult, personPlan } from '../lib/group';
import type { Release } from '../lib/release';
import type { AppState, Genre, GroupResult, Item, Leg, Plan, Response } from '../types';

const GENRES = genresJson.genres as Genre[];

export type PersonPlan = Plan & { mustFit: number | null };
export type PlanRequest =
  | { id: number; kind: 'person'; payload: { resp: Response; items: Item[]; legs: Leg[] } }
  | { id: number; kind: 'group'; payload: { state: AppState; items: Item[]; legs: Leg[]; genres: Genre[]; release: Release | null } };

interface Out<T> { data: T | null; loading: boolean }

// payload null means "nothing to compute". Without a Worker (jsdom) it computes synchronously.
function useCompute<T, P>(kind: PlanRequest['kind'], payload: P | null, sync: (p: P) => T): Out<T> {
  const key = useMemo(() => JSON.stringify(payload), [payload]);
  const hasWorker = typeof Worker !== 'undefined';
  const syncData = useMemo(() => (hasWorker || payload === null ? null : sync(payload)), [key, hasWorker]); // eslint-disable-line react-hooks/exhaustive-deps
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const sentKey = useRef('');
  const [done, setDone] = useState<{ key: string; data: T } | null>(null);

  useEffect(() => {
    if (!hasWorker || payload === null) return;
    if (!worker.current) {
      const w = new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; result: T }>) => {
        if (e.data.id !== seq.current) return;
        setDone({ key: sentKey.current, data: e.data.result });
      };
      worker.current = w;
    }
    const id = ++seq.current;
    sentKey.current = key;
    worker.current.postMessage({ id, kind, payload });
  }, [key, hasWorker]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);

  if (payload === null) return { data: null, loading: false };
  if (!hasWorker) return { data: syncData, loading: false };
  return { data: done ? done.data : null, loading: done?.key !== key };
}

export function usePersonPlan(resp: Response | undefined, items: Item[], legs: Leg[]): Out<PersonPlan> {
  const payload = useMemo(() => (resp ? { resp, items, legs } : null), [resp, items, legs]);
  return useCompute<PersonPlan, NonNullable<typeof payload>>('person', payload, p => personPlan(p.resp, p.items, p.legs));
}

export function useGroupResult(state: AppState, items: Item[], legs: Leg[], release: Release | null = null): Out<GroupResult> {
  const payload = useMemo(() => ({ state, items, legs, genres: GENRES, release }), [state, items, legs, release]);
  return useCompute<GroupResult, typeof payload>('group', payload, p => groupResult(p.state, p.items, p.legs, p.genres, p.release));
}
