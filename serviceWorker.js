// ── Cache config ──────────────────────────────────────────────────────────────
export const CACHE = 'pocketpiano-v1';

export const ASSETS = [
  './',
  './style.css',
  './src/audio.js',
  './src/keyboard.js',
  './src/warmup.js',
  './manifest.json',
  './icon.png',
  './icon.svg',
  './pr.json',
];

// ── Network-first strategy ────────────────────────────────────────────────────
// Always tries the network; cache is only used when offline.
// This means you never see a stale version while connected.
export async function networkFirst(request) {
  try {
    const res = await fetch(request);
    const cache = await caches.open(CACHE);
    await cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// ── Service worker lifecycle ──────────────────────────────────────────────────
// Only register event handlers when running in actual SW context, not in tests.
if (typeof ServiceWorkerGlobalScope !== 'undefined') {
  self.addEventListener('install', e => {
    // Pre-cache all assets so the app works offline immediately after first visit
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
  });

  self.addEventListener('activate', e => {
    // Clean up caches from previous SW versions
    e.waitUntil(
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
    );
    self.clients.claim();
  });

  self.addEventListener('fetch', e => {
    // Only handle same-origin requests; let cross-origin (e.g. Google Fonts) pass through
    if (!e.request.url.startsWith(self.location.origin)) return;
    e.respondWith(networkFirst(e.request));
  });
}
