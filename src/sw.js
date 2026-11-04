/* Service worker: guarda la app para jugar sin conexión. Cambiar VERSION al publicar cambios. */
const VERSION = 'gremio-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/data.js', 'js/floors.js', 'js/util.js', 'js/core.js', 'js/sprites.js', 'js/scene.js', 'js/audio.js', 'js/ui.js', 'js/main.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Red primero (para recibir actualizaciones) y caché si no hay conexión.
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
