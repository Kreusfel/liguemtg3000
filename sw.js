// sw.js — service worker : cache de secours HORS-LIGNE uniquement.
//
// Stratégie RÉSEAU D'ABORD pour tout (coquille + data) : on sert toujours la
// dernière version en ligne, et le cache ne sert que de repli si le réseau est
// indisponible. Cela évite qu'un ancien cache serve une version cassée après
// une mise à jour (le fameux « page blanche au Ctrl+Maj+R »). Les appels à
// api.github.com (cross-origin) ne sont jamais interceptés.
//
// Bump CACHE quand tu veux forcer la purge de l'ancien cache.

const CACHE = 'jurande-v15';
const ASSETS = [
  '.', 'index.html', 'manifest.webmanifest',
  'data/scryfall.json',
  'css/styles.css',
  'js/main.js', 'js/store.js', 'js/github.js', 'js/ranking.js', 'js/util.js', 'js/scryfall.js',
  'js/views/shared.js',
  'js/views/classement.js', 'js/views/historique.js', 'js/views/joueurs.js',
  'js/views/decks.js', 'js/views/rivalites.js', 'js/views/saisie.js', 'js/views/reglages.js',
  'icons/icon.svg',
];

self.addEventListener('install', (e) => {
  // Précache tolérant : un asset manquant ne fait plus échouer l'installation.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // laisse passer GitHub API, fontes…

  // Réseau d'abord ; on met à jour le cache au passage ; repli cache si hors-ligne.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))));
});
