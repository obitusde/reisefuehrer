/* Reiseführer – service worker (v0.13.5)
 * App files: network first (always fresh after a push), cache only as fallback.
 * Map tiles: cache first (own cache, trimmed). version.json and APIs: never cached here.
 */
const VERSION = '0.13.5';
const APP_CACHE = 'rf-app-' + VERSION;
const TILE_CACHE = 'rf-tiles';
const TILE_MAX = 2000;
const SHELL = [
  './', 'index.html', 'style.css?v=' + VERSION, 'core.js?v=' + VERSION, 'app.js?v=' + VERSION,
  'config.json', 'manifest.webmanifest', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE)
    .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'no-cache' })).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rf-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

let tilePuts = 0;
async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length > TILE_MAX) await Promise.all(keys.slice(0, keys.length - TILE_MAX).map((k) => cache.delete(k)));
}

async function tile(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    // CORS request so the response is not opaque (opaque responses blow up storage quota)
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) {
      cache.put(req.url, res.clone()).then(() => { if (++tilePuts % 50 === 0) trimTiles(cache); }).catch(() => {});
    }
    return res;
  } catch (e) {
    return fetch(req); // server without CORS: load normally, do not cache
  }
}

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) cache.put(req.url, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(req.url);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html') || await cache.match('./');
      if (shell) return shell;
    }
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/version.json')) return; // always straight to the network
    if (url.pathname.includes('/osm/') || url.pathname.includes('/paket/')) return; // v0.11/v0.12: OSM files and the country package – the app stores them itself
    event.respondWith(networkFirst(req));
  } else if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(tile(req));
  }
  // everything else (Wikipedia, Wikidata, Nominatim): browser default
});
