import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import type { Tier } from '../types';

// A drag this far along one axis rates the card; a quick flick counts from FLICK_MIN at FLICK_SPEED px/ms.
export const FLING = 100;
const FLICK_MIN = 40;
const FLICK_SPEED = 0.5;

export interface Drag { dx: number; dy: number }

export function tierFor(dx: number, dy: number): Tier {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'must' : 'skip';
  return dy < 0 ? 'keen' : 'meh';
}

/** Pointer-drag handling shared by the rating card and the how-to practice card. */
export function useSwipe(onCommit: (tier: Tier, dx: number, dy: number) => void, onStart?: () => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const last = useRef<{ x: number; y: number; t: number; vx: number; vy: number } | null>(null);
  const cb = useRef(onCommit);
  cb.current = onCommit;
  const startCb = useRef(onStart);
  startCb.current = onStart;

  const reset = useCallback(() => { start.current = null; setDrag(null); }, []);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    startCb.current?.();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    last.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, vx: 0, vy: 0 };
    setDrag({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const l = last.current;
    if (l) {
      const dt = e.timeStamp - l.t;
      last.current = dt > 0 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, vx: (e.clientX - l.x) / dt, vy: (e.clientY - l.y) / dt } : { ...l, x: e.clientX, y: e.clientY };
    }
    setDrag({ dx: e.clientX - s.x, dy: e.clientY - s.y });
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const tier = tierFor(dx, dy);
    const horizontal = tier === 'must' || tier === 'skip';
    const dist = Math.abs(horizontal ? dx : dy);
    const speed = Math.abs(horizontal ? last.current?.vx ?? 0 : last.current?.vy ?? 0);
    if (dist >= FLING || (dist >= FLICK_MIN && speed >= FLICK_SPEED)) cb.current(tier, dx, dy);
    else reset();
  };
  return { drag, reset, bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset } };
}
