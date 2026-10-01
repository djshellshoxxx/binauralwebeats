// Service worker (spec 07 §12): network-first with offline fallback.
// Bump VERSION when the app-shell list changes.
const VERSION = 'v2-2';
const CACHE = `binauralwebeats-${VERSION}`;

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/xmr-qr.svg',
  'js/main.js',
  'js/app/controller.js',
  'js/app/exporter.js',
  'js/app/persistence.js',
  'js/app/presets.js',
  'js/app/store.js',
  'js/engine/ambience-worker.js',
  'js/engine/ambience.js',
  'js/engine/audio-engine.js',
  'js/engine/breath.js',
  'js/engine/frequency.js',
  'js/engine/noise.js',
  'js/engine/program.js',
  'js/engine/wav.js',
  'js/ui/controls.js',
  'js/ui/donate.js',
  'js/ui/dom.js',
  'js/ui/editor.js',
  'js/ui/format.js',
  'js/ui/knob.js',
  'js/ui/pwa.js',
  'js/ui/system.js',
  'js/ui/visualizer.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('binauralwebeats-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((hit) => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
