import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteMap from './Map';

const WEBDRIVER = navigator.webdriver;
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(navigator, 'webdriver', { value: WEBDRIVER, configurable: true }); });

describe('RouteMap drive mode', () => {
  it('first render (before any effect can run) draws none of the route', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    // renderToString never runs effects, so this is exactly the first painted commit.
    const html = renderToString(<RouteMap drive route={['AIR', 'Sigiriya', 'Kandy', 'AIR']} />);
    const lines = (html.match(/class="route-(line|halo)"/g) ?? []).length;
    expect(lines, 'route lines in the first commit').toBe(0);
  });
  it('without drive the whole route is drawn at once', () => {
    const html = renderToString(<RouteMap route={['AIR', 'Sigiriya', 'AIR']} />);
    expect(html).toContain('class="route-line"');
  });
});
