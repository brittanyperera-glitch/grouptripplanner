// The build stamps __BUILD__ with a hash of the manifest (see vite.config.ts), so every release
// is a new sw.js, a new precache and a new cache name; activate then drops the old ones.
const VERSION = 'homecoming-__BUILD__';
const FONTS = 'homecoming-fonts';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];
const NAV_TIMEOUT_MS = 3000;

async function killSwitchTripped() {
  let res;
  try {
    res = await fetch('/version.json', { cache: 'no-store' });
  } catch {
    return false; // offline is the case this worker exists for
  }
  try {
    // A captive portal, a 404 or a 5xx must not kill the worker; only an explicit sw:false does.
    return res.ok && (await res.json()).sw === false;
  } catch {
    return false;
  }
}

async function checkKillSwitch() {
  if (!(await killSwitchTripped())) return;
  await self.registration.unregister();
  for (const name of await caches.keys()) await caches.delete(name);
  for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
}

async function precacheList() {
  const res = await fetch('/.vite/manifest.json', { cache: 'no-store' });
  const files = new Set(SHELL);
  for (const entry of Object.values(await res.json())) {
    for (const f of [entry.file, ...(entry.css || []), ...(entry.assets || [])]) files.add('/' + f);
  }
  return [...files];
}

async function networkFirst(request) {
  const network = fetch(request);
  network.catch(() => {});
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(reject, NAV_TIMEOUT_MS); });
  try {
    const res = await Promise.race([network, timeout]);
    if (!res.ok) throw new Error('bad status');
    (await caches.open(VERSION)).put('/index.html', res.clone());
    return res;
  } catch {
    return (await caches.match('/index.html')) || network;
  } finally {
    clearTimeout(timer);
  }
}

async function fontFetch(request) {
  const hit = await caches.match(request);
  const refresh = fetch(request).then(async (res) => {
    if (res.status === 200) (await caches.open(FONTS)).put(request, res.clone());
    return res;
  });
  if (!hit) return refresh;
  refresh.catch(() => {});
  return hit;
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.status === 200) (await caches.open(VERSION)).put(request, res.clone());
  return res;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheList().then(async (urls) => (await caches.open(VERSION)).addAll(urls)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== VERSION && name !== FONTS) await caches.delete(name);
      await self.clients.claim();
      await checkKillSwitch();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method === 'GET' && FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(fontFetch(request));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.waitUntil(checkKillSwitch());
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/img/')) {
    event.respondWith(cacheFirst(request));
  }
});
