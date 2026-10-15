import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteMap, { routeLayout } from './Map';
import { LANDMARKS } from './Landmarks';
import type { Hub } from '../types';

const WEBDRIVER = navigator.webdriver;
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(navigator, 'webdriver', { value: WEBDRIVER, configurable: true }); });

const HUBS = ['AIR', 'Colombo', 'Jaffna', 'Trincomalee', 'Sigiriya', 'Kandy', 'Kitulgala', 'Nuwara Eliya', 'Ella', 'Tissa', 'Udawalawe', 'Weligama'] as Hub[];
const count = (html: string, hub: string) => (html.match(new RegExp(`data-landmark="${hub}"`, 'g')) ?? []).length;
type B = { l: number; t: number; r: number; b: number };
const hit = (a: B, b: B) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

describe('hub landmarks', () => {
  it('the registry covers exactly the hubs build-data.mjs connects', () => {
    const src = readFileSync('scripts/build-data.mjs', 'utf8');
    const list = [...src.match(/const hubs = \[([^\]]*)\]/)![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(Object.keys(LANDMARKS).sort()).toEqual(list.sort());
  });

  it('every hub on the route gets exactly one landmark and no off-route hub gets one', () => {
    const route: Hub[] = ['AIR', 'Sigiriya', 'Kandy', 'Ella', 'AIR'];
    const html = renderToString(<RouteMap route={route} />);
    for (const h of HUBS) expect(count(html, h), h).toBe(route.includes(h) ? 1 : 0);
  });

  it('a route through all twelve hubs gets twelve landmarks, the airport once although it is both ends', () => {
    const route: Hub[] = ['AIR', 'Jaffna', 'Trincomalee', 'Sigiriya', 'Kandy', 'Kitulgala', 'Nuwara Eliya', 'Ella', 'Tissa', 'Udawalawe', 'Weligama', 'Colombo', 'AIR'];
    const html = renderToString(<RouteMap route={route} />);
    for (const h of HUBS) expect(count(html, h), h).toBe(1);
  });

  it('no landmark box touches a stop name, a stop dot, a parked tuk-tuk or another landmark, on any route shape', () => {
    const routes: Hub[][] = [
      ['AIR', 'Sigiriya', 'Kandy', 'Ella', 'AIR'],
      ['AIR', 'Colombo', 'Weligama', 'Tissa', 'AIR'],
      ['AIR', 'Jaffna', 'Trincomalee', 'Sigiriya', 'Kandy', 'Kitulgala', 'Nuwara Eliya', 'Ella', 'Tissa', 'Udawalawe', 'Weligama', 'Colombo', 'AIR'],
      ['AIR', 'Kandy', 'Nuwara Eliya', 'Ella', 'Udawalawe', 'Weligama', 'AIR'],
      ['AIR', 'Kitulgala', 'Kandy', 'AIR'],
    ];
    // Subsets of the other eleven hubs as well, so a crowded corner cannot hide.
    for (let mask = 3; mask < 1 << 11; mask += 7) {
      const hs = HUBS.slice(1).filter((_, i) => mask & (1 << i));
      if (hs.length >= 2 && hs.length <= 8) routes.push(['AIR', ...hs, 'AIR']);
    }
    expect(routes.length).toBeGreaterThan(50);
    for (const route of routes) {
      const { placed, obstacles } = routeLayout(route);
      const hubs = Object.keys(placed);
      expect([...hubs].sort(), route.join('>')).toEqual([...new Set(route)].sort());
      for (const h of hubs) {
        for (const o of obstacles) expect(hit(placed[h].box, o.box), `${route.join('>')}: ${h} landmark hits ${o.what}`).toBe(false);
        for (const g of hubs) if (g !== h) expect(hit(placed[h].box, placed[g].box), `${route.join('>')}: ${h} hits ${g}`).toBe(false);
      }
    }
  });

  it('pops only with motion on: the pop attribute is set under motion and absent without it or with reduced motion', () => {
    const route: Hub[] = ['AIR', 'Kandy', 'AIR'];
    expect(renderToString(<RouteMap route={route} />)).not.toContain('data-pop="on"');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    expect(renderToString(<RouteMap route={route} />)).toContain('data-pop="on"');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(renderToString(<RouteMap route={route} />)).not.toContain('data-pop="on"');
  });

  it('while the tuk-tuk drives, only the stops it has reached have a landmark', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    const html = renderToString(<RouteMap drive route={['AIR', 'Sigiriya', 'Kandy', 'AIR']} />);
    expect(count(html, 'AIR')).toBe(1);
    expect(count(html, 'Sigiriya')).toBe(0);
    expect(count(html, 'Kandy')).toBe(0);
  });
});
