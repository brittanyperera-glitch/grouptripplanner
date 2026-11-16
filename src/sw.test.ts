import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = process.cwd();
const swSource = readFileSync(join(root, 'public/sw.js'), 'utf8');
const ORIGIN = 'https://trip.test';

interface FakeRes { ok: boolean; status: number; body: string; clone(): FakeRes; json(): Promise<unknown> }
const res = (body: string, ok = true): FakeRes => ({
  ok, status: ok ? 200 : 500, body,
  clone() { return this; },
  json: async () => JSON.parse(body),
});
const keyOf = (r: unknown) => new URL(typeof r === 'string' ? r : (r as { url: string }).url, ORIGIN).pathname;

function fakeCaches(fetchFn: (u: string) => Promise<FakeRes>) {
  const stores = new Map<string, Map<string, FakeRes>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const s = stores.get(name)!;
    return {
      put: async (k: unknown, v: FakeRes) => { s.set(keyOf(k), v); },
      addAll: async (urls: string[]) => {
        for (const u of urls) s.set(keyOf(u), await fetchFn(u));
      },
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (k: unknown) => { for (const s of stores.values()) if (s.has(keyOf(k))) return s.get(keyOf(k)); return undefined; },
  };
}

type Route = (url: string) => FakeRes | Promise<FakeRes>;

function boot(route: Route) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (r: unknown) => {
    const url = keyOf(r);
    calls.push(url);
    return route(url);
  });
  const caches = fakeCaches(fetchFn);
  const handlers: Record<string, (e: unknown) => void> = {};
  const client = { url: `${ORIGIN}/`, navigate: vi.fn(async () => undefined) };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, h: (e: unknown) => void) => { handlers[t] = h; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => [client]) },
    registration: { unregister: vi.fn(async () => true) },
  };
  new Function('self', 'caches', 'fetch', swSource)(self, caches, fetchFn);
  const waits: Promise<unknown>[] = [];
  const lifecycle = async (type: 'install' | 'activate') => {
    handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits.splice(0));
  };
  const request = async (url: string, mode = 'cors') => {
    let responded: Promise<FakeRes> | undefined;
    handlers.fetch({
      request: { url, method: 'GET', mode },
      respondWith: (p: Promise<FakeRes>) => { responded = p; },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const out = responded && (await responded);
    await Promise.all(waits.splice(0));
    return { handled: responded !== undefined, out };
  };
  return { self, caches, client, fetchFn, calls, lifecycle, request };
}

const manifest = JSON.stringify({
  'index.html': { file: 'assets/index-AAA.js', css: ['assets/index-BBB.css'], assets: ['assets/font-CCC.woff2'] },
  'src/workers/plan.worker.ts': { file: 'assets/plan.worker-DDD.js' },
});
const live: Route = (url) => {
  if (url === '/version.json') return res('{"sw": true}');
  if (url === '/.vite/manifest.json') return res(manifest);
  return res(`body:${url}`);
};

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('sw.js install', () => {
  it('precaches every manifest file including the plan worker chunk, plus the shell, and skips waiting', async () => {
    const sw = boot(live);
    await sw.lifecycle('install');
    const cached = [...[...sw.caches.stores.values()][0].keys()].sort();
    expect(cached).toEqual([
      '/', '/assets/font-CCC.woff2', '/assets/index-AAA.js', '/assets/index-BBB.css',
      '/assets/plan.worker-DDD.js', '/index.html', '/manifest.webmanifest',
    ]);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });
});

describe('sw.js kill switch', () => {
  const killed = async (route: Route) => {
    const sw = boot(route);
    await sw.caches.open('keep-me');
    await sw.lifecycle('activate');
    return sw;
  };

  it('unregisters, clears every cache and reloads clients when version.json says sw:false', async () => {
    const sw = await killed((u) => (u === '/version.json' ? res('{"sw": false}') : live(u)));
    expect(sw.self.registration.unregister).toHaveBeenCalled();
    expect(sw.caches.stores.size).toBe(0);
    expect(sw.client.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it('kills on a version.json that is not JSON (an SPA rewrite swallowing it returns index.html)', async () => {
    const sw = await killed((u) => (u === '/version.json' ? res('<!doctype html><html>') : live(u)));
    expect(sw.self.registration.unregister).toHaveBeenCalled();
    expect(sw.caches.stores.size).toBe(0);
  });

  it('stays alive when the network is down, so the offline shell keeps working', async () => {
    let offline = false;
    const sw = boot((u) => { if (offline && u === '/version.json') throw new Error('offline'); return live(u); });
    await sw.lifecycle('install');
    offline = true;
    await sw.lifecycle('activate');
    expect(sw.self.registration.unregister).not.toHaveBeenCalled();
    expect(sw.caches.stores.size).toBe(1);
  });

  it('stays alive on {"sw": true}', async () => {
    const sw = await killed(live);
    expect(sw.self.registration.unregister).not.toHaveBeenCalled();
  });

  it('is re-checked on every navigation, not just activation', async () => {
    let enabled = true;
    const sw = boot((u) => (u === '/version.json' ? res(enabled ? '{"sw": true}' : '{"sw": false}') : live(u)));
    await sw.request(`${ORIGIN}/`, 'navigate');
    expect(sw.self.registration.unregister).not.toHaveBeenCalled();
    enabled = false;
    await sw.request(`${ORIGIN}/plan`, 'navigate');
    expect(sw.self.registration.unregister).toHaveBeenCalled();
  });
});

describe('sw.js activate', () => {
  it('claims clients and deletes caches that are not the current version', async () => {
    const sw = boot(live);
    await sw.lifecycle('install');
    const current = [...sw.caches.stores.keys()][0];
    await sw.caches.open('old-version');
    await sw.lifecycle('activate');
    expect(sw.self.clients.claim).toHaveBeenCalled();
    expect([...sw.caches.stores.keys()]).toEqual([current]);
  });
});

describe('sw.js fetch', () => {
  it('lets cross-origin requests (Supabase, fonts) go straight to the network and never caches them', async () => {
    const sw = boot(live);
    for (const url of ['https://abc.supabase.co/rest/v1/trips', 'https://cdn.other/assets/app-1.js', 'https://cdn.other/img/a.png']) {
      expect((await sw.request(url)).handled).toBe(false);
    }
    expect((await sw.request('https://abc.supabase.co/', 'navigate')).handled).toBe(false);
    expect(sw.caches.stores.size).toBe(0);
    expect(sw.calls).toEqual([]);
  });

  it('serves cached index.html for a navigation when the network rejects', async () => {
    const offline = boot((u) => { if (u === '/version.json') return res('{"sw": true}'); throw new Error('offline'); });
    const cache = await offline.caches.open('v');
    await cache.put('/index.html', res('<shell>'));
    const r = await offline.request(`${ORIGIN}/day/3`, 'navigate');
    expect(r.out?.body).toBe('<shell>');
  });

  it('serves a navigation from the network when it answers, and refreshes the cached shell', async () => {
    const sw = boot((u) => (u === '/version.json' ? res('{"sw": true}') : res('<fresh>')));
    const r = await sw.request(`${ORIGIN}/`, 'navigate');
    expect(r.out?.body).toBe('<fresh>');
    expect((await sw.caches.match('/index.html'))?.body).toBe('<fresh>');
  });

  it('falls back to the cached shell when the network is slower than 3 s', async () => {
    vi.useFakeTimers();
    try {
      const sw = boot((u) => {
        if (u === '/version.json') return res('{"sw": true}');
        return new Promise<FakeRes>(() => {});
      });
      await (await sw.caches.open('v')).put('/index.html', res('<shell>'));
      const pending = sw.request(`${ORIGIN}/`, 'navigate');
      await vi.advanceTimersByTimeAsync(3001);
      expect((await pending).out?.body).toBe('<shell>');
    } finally {
      vi.useRealTimers();
    }
  });

  it('serves hashed assets cache-first: one network hit, then the cache', async () => {
    const sw = boot(live);
    const a = await sw.request(`${ORIGIN}/assets/app-1.js`);
    const b = await sw.request(`${ORIGIN}/assets/app-1.js`);
    expect(a.out?.body).toBe('body:/assets/app-1.js');
    expect(b.out?.body).toBe('body:/assets/app-1.js');
    expect(sw.calls.filter((u) => u === '/assets/app-1.js')).toHaveLength(1);
  });

  it('does not intercept same-origin non-asset requests such as version.json or sw.js', async () => {
    const sw = boot(live);
    expect((await sw.request(`${ORIGIN}/version.json`)).handled).toBe(false);
    expect((await sw.request(`${ORIGIN}/sw.js`)).handled).toBe(false);
  });
});

describe('shipped config', () => {
  it('version.json ships enabled', () => {
    expect(JSON.parse(readFileSync(join(root, 'public/version.json'), 'utf8'))).toEqual({ sw: true });
  });

  it('manifest.webmanifest names the app and points at images that exist', () => {
    const m = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
    expect(m).toMatchObject({ name: 'The Homecoming', short_name: 'Homecoming', start_url: '/', display: 'standalone' });
    expect(m.icons.length).toBeGreaterThan(0);
    for (const i of m.icons) expect(() => readFileSync(join(root, 'public', i.src))).not.toThrow();
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toContain('<link rel="manifest" href="/manifest.webmanifest"');
  });

  it('vercel.json rewrites do not swallow the worker files and sets no-cache on them', () => {
    const v = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    const swallowed = (p: string) => v.rewrites.some((r: { source: string }) => new RegExp(`^${r.source}$`).test(p));
    for (const p of ['/sw.js', '/version.json', '/manifest.webmanifest', '/.vite/manifest.json']) expect(swallowed(p)).toBe(false);
    for (const p of ['/', '/day/3', '/plan']) expect(swallowed(p)).toBe(true);
    const noCache = v.headers
      .filter((h: { headers: { key: string; value: string }[] }) => h.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-cache'))
      .map((h: { source: string }) => h.source);
    expect(noCache).toEqual(expect.arrayContaining(['/sw.js', '/version.json', '/manifest.webmanifest']));
  });

  it('vite builds a manifest', () => {
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf8')).toMatch(/manifest:\s*true/);
  });

  // Needs a prior `npm run build`; the gate builds first.
  it.skipIf(!existsSync(join(root, 'dist/.vite/manifest.json')))('the built manifest lists the plan worker chunk', () => {
    const built = JSON.parse(readFileSync(join(root, 'dist/.vite/manifest.json'), 'utf8'));
    const files = Object.values(built).map((e) => (e as { file: string }).file);
    expect(files.some((f) => /^assets\/plan\.worker-.+\.js$/.test(f))).toBe(true);
  });
});

describe('main.tsx registration', () => {
  const load = async (prod: boolean, hasSw: boolean) => {
    vi.doMock('./App', () => ({ default: () => null }));
    vi.doMock('./styles.css', () => ({}));
    vi.doMock('./store/fresh', () => ({ freshStartForEpoch: () => {}, freshStartFromUrl: () => null }));
    vi.doMock('./guest/deviceState', () => ({ recoverGuestOnBoot: () => {} }));
    vi.stubEnv('PROD', prod);
    document.body.innerHTML = '<div id="root"></div>';
    const register = vi.fn(async () => undefined);
    if (hasSw) Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    else delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    await import('./main');
    window.dispatchEvent(new Event('load'));
    return register;
  };

  it('registers /sw.js after load in a production build', async () => {
    expect(await load(true, true)).toHaveBeenCalledWith('/sw.js');
  });

  it('does not register in dev or tests', async () => {
    expect(await load(false, true)).not.toHaveBeenCalled();
  });

  it('does not throw where service workers are unsupported', async () => {
    await expect(load(true, false)).resolves.toBeDefined();
  });
});
