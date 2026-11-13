// Cache dell'app per l'uso offline. Cambia VERSION a ogni rilascio.
const VERSION = 'lav-2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'lib/vexflow.js',
  'js/app.js', 'js/audio.js', 'js/capture-worklet.js', 'js/evaluate.js', 'js/generator.js',
  'js/pitch.js', 'js/score.js', 'js/storage.js', 'js/theory.js', 'js/tuner.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rete prima, cache se offline: gli aggiornamenti arrivano subito quando c'è connessione.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
