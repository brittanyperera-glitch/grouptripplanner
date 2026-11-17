import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteMap, { hubXY } from './Map';
import { motion } from './motion';
import { buildLegs, legD } from './routeDrive';
import type { Hub } from '../types';

vi.mock('./motion', async importOriginal => ({ ...(await importOriginal<typeof import('./motion')>()), motion: vi.fn(() => 'full') }));

const ROUTE: Hub[] = ['AIR', 'Sigiriya', 'Kandy', 'Ella', 'AIR'];
const D = buildLegs(ROUTE.map(hubXY)).map(legD);
const on = (c: HTMLElement) => [...c.querySelectorAll('path.route-line.on')].map(p => p.getAttribute('d'));
const driven = (c: HTMLElement) => [...c.querySelectorAll('mask path')].map(p => p.getAttribute('d'));
const tuk = (c: HTMLElement) => {
  const t = c.querySelector('[data-tuktuk]')?.parentElement?.getAttribute('transform') ?? '';
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

beforeEach(() => { vi.useFakeTimers(); vi.mocked(motion).mockReturnValue('full'); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('RouteMap with a day\'s legs', () => {
  it('drives only the given legs, in order, and leaves them highlighted', () => {
    const { container } = render(<RouteMap route={ROUTE} drive legs={[1, 2]} />);
    const seen = new Set<string | null>();
    for (let i = 0; i < 40; i++) { act(() => { vi.advanceTimersByTime(300); }); driven(container).forEach(d => seen.add(d)); }
    expect([...seen]).toEqual([D[1], D[2]]);
    expect(on(container)).toEqual([D[1], D[2]]);
    expect(container.querySelector('.map')).toHaveAttribute('data-drive', 'done');
  });

  it('dims the rest of the route and lights only the day\'s hub pins', () => {
    const { container } = render(<RouteMap route={ROUTE} legs={[1]} />);
    expect(container.querySelectorAll('.route-dim path.route-line')).toHaveLength(4);
    expect(container.querySelectorAll('circle.stop-dot.on')).toHaveLength(2);
    expect(on(container)).toEqual([D[1]]);
  });

  it('parks the tuk-tuk at parkAt, with no drive, on a day with no legs', () => {
    const at = (h: Hub) => tuk(render(<RouteMap route={ROUTE} drive legs={[]} parkAt={h} />).container);
    const [kx, ky] = hubXY('Kandy'), [ex] = hubXY('Ella');
    const kandy = at('Kandy')!;
    expect(Math.abs(kandy[0] - kx)).toBeLessThan(30);
    expect(Math.abs(kandy[1] - ky)).toBeLessThan(30);
    expect(Math.abs(at('Ella')![0] - ex)).toBeLessThan(30);
    expect(kandy).not.toEqual(at('Ella'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['still', 'reduced'] as const)('runs no drive when motion is %s', m => {
    vi.mocked(motion).mockReturnValue(m);
    const { container } = render(<RouteMap route={ROUTE} drive legs={[1, 2]} />);
    expect(container.querySelector('.map')).not.toHaveAttribute('data-drive');
    expect(container.querySelector('mask')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(on(container)).toEqual([D[1], D[2]]);
  });

  it('restarts the drive on the new legs when the day changes', () => {
    const { container, rerender } = render(<RouteMap route={ROUTE} drive legs={[0]} />);
    act(() => { vi.advanceTimersByTime(5000); });
    rerender(<RouteMap route={ROUTE} drive legs={[3]} />);
    const seen = new Set<string | null>();
    for (let i = 0; i < 20; i++) { act(() => { vi.advanceTimersByTime(300); }); driven(container).forEach(d => seen.add(d)); }
    expect([...seen]).toEqual([D[3]]);
  });

  it('survives a shorter day while the drive is on a later leg of a longer one', () => {
    const { container, rerender } = render(<RouteMap route={ROUTE} drive legs={[0, 1, 2, 3]} />);
    for (let i = 0; i < 60 && !driven(container).includes(D[3]); i++) act(() => { vi.advanceTimersByTime(100); });
    expect(driven(container)).toEqual([D[3]]);
    expect(() => rerender(<RouteMap route={ROUTE} drive legs={[0]} />)).not.toThrow();
    for (let i = 0; i < 20; i++) act(() => { vi.advanceTimersByTime(300); });
    expect(on(container)).toEqual([D[0]]);
  });

  it('draws the whole route as before when no legs are given', () => {
    const { container } = render(<RouteMap route={ROUTE} />);
    expect(container.querySelector('.route-dim')).toBeNull();
    expect(container.querySelector('.on')).toBeNull();
  });
});

describe('RouteMap label', () => {
  it('names the highlighted day only in day mode', () => {
    const { container, rerender } = render(<RouteMap route={ROUTE} legs={[1]} dayN={4} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', expect.stringMatching(/^Route: .*\. Day 4 highlighted$/));
    rerender(<RouteMap route={ROUTE} dayN={4} />);
    expect(container.querySelector('svg')?.getAttribute('aria-label')).not.toMatch(/highlighted/);
  });
});
