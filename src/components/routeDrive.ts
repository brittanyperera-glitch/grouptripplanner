import { useEffect, type RefObject } from 'react';

// Shared by the route reveal and My trip's inline drive: legs between map points, and a frame loop that
// moves the tuk-tuk and draws the leg's line together.
export type Pt = [number, number];
export interface Leg { a: Pt; c: Pt; b: Pt; ms: number }

const MIN_LEG_MS = 700, MAX_LEG_MS = 1600, MS_PER_UNIT = 9;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const bez = ({ a, c, b }: Leg, t: number): Pt => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];

/** One leg per pair of points. `bow` > 0 curves each leg, alternating sides, so the line looks drawn by hand. */
export function buildLegs(points: Pt[], bow = 0): Leg[] {
  return points.slice(1).map((b, k) => {
    const a = points[k];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const off = len * bow * (k % 2 ? 1 : -1);
    const c: Pt = [(a[0] + b[0]) / 2 - (dy / len) * off, (a[1] + b[1]) / 2 + (dx / len) * off];
    return { a, c, b, ms: Math.round(Math.max(MIN_LEG_MS, Math.min(MAX_LEG_MS, len * MS_PER_UNIT))) };
  });
}

export const legD = ({ a, c, b }: Leg) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;

/** Transform for a TukTuk `w` wide whose wheels touch (x, y); `left` mirrors it to face the way it drives. */
export function tukTransform(x: number, y: number, left: boolean, w: number) {
  const wheel = (w * 55.2) / 72; // TukTuk art is 72 x 60, wheels touch y 55.2
  return left ? `translate(${(x + w / 2).toFixed(1)} ${(y - wheel).toFixed(1)}) scale(-1 1)` : `translate(${(x - w / 2).toFixed(1)} ${(y - wheel).toFixed(1)})`;
}
export const tukHeight = (w: number) => (w * 60) / 72;

/**
 * While `on`, drives `leg` over leg.ms: the tuk-tuk group follows the curve (its wheels lifted by dy0 at the start,
 * dy1 at the end) and the line group's --o goes 1 to 0, for paths using stroke-dashoffset: var(--o).
 */
export function useLegDrive(on: boolean, leg: Leg | undefined, dy0: number, dy1: number, w: number,
  tukRef: RefObject<SVGGElement>, lineRef: RefObject<SVGGElement>) {
  useEffect(() => {
    if (!on || !leg || typeof requestAnimationFrame !== 'function') return;
    const left = leg.b[0] < leg.a[0];
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / leg.ms), e = ease(t);
      const [x, y] = bez(leg, e);
      tukRef.current?.setAttribute('transform', tukTransform(x, y + dy0 + (dy1 - dy0) * e, left, w));
      lineRef.current?.style.setProperty('--o', String(1 - e));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, leg, dy0, dy1, w, tukRef, lineRef]);
}
