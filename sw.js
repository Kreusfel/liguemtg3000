// sw.js — service worker : coquille en cache pour le hors-ligne.
//
// IMPORTANT : data/ligue.json est traité en RÉSEAU D'ABORD (pas de cache-first),
// sinon on servirait un classement périmé après une publication. Les appels à
// api.github.com (cross-origin) ne sont jamais interceptés.
//
// Pour publier une MAJ du code : incrémenter CACHE.

const CACHE = 'jurande-v6';
const ASSETS = [
  '.', 'index.html', 'manifest.webmanifest',
  'css/styles.css',
  'js/main.js', 'js/store.js', 'js/github.js', 'js/ranking.js', 'js/util.js',
  'js/views/classement.js', 'js/views/historique.js', 'js/views/joueurs.js',
  'js/views/rivalites.js', 'js/views/saisie.js', 'js/views/reglages.js',
  'icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // laisse passer GitHub API, fontes…

  // Données : réseau d'abord, cache en repli hors-ligne.
  if (url.pathname.endsWith('ligue.json')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request)));
    return;
  }

  // Coquille : cache d'abord.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit)));
});
