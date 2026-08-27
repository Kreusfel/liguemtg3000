// scryfall.js — illustrations + noms français des commandants.
//
// Source NORMALE : le cache embarqué `data/scryfall.json` (+ images dans
// `data/cards/`), généré HORS-LIGNE par tools/scryfall-fetch.py et versionné.
// C'est un chemin MÊME ORIGINE : il n'est donc jamais bloqué par le proxy
// SEMINOR, contrairement à un appel direct à api.scryfall.com. `prime()` le
// charge une fois au démarrage.
//
// Repli : l'API Scryfall en direct ne sert plus que pour un commandant absent
// du fichier (deck ajouté depuis un réseau libre). Derrière le proxy ce repli
// échoue silencieusement — d'où l'intérêt de relancer le script + commiter.

const LS = 'jurande_scryfall';
let cache = charger();

function charger() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; }
  catch { return {}; }
}
function sauver() {
  try { localStorage.setItem(LS, JSON.stringify(cache)); } catch { /* quota : tant pis */ }
}
function cle(nom) {
  return String(nom || '').trim().toLowerCase();
}

// Entrée en cache (synchrone) : { img, fr, en, uri } ou { notFound:true } ou null.
export function getCached(nom) {
  const k = cle(nom);
  return k ? (cache[k] || null) : null;
}

// Précharge (une seule fois) le cache embarqué data/scryfall.json. Le fichier
// fait foi : il écrase d'éventuelles entrées « live » restées en localStorage
// (URLs distantes bloquées au bureau) par des chemins d'images locaux.
let primed = null;
export function prime() {
  if (!primed) {
    primed = (async () => {
      try {
        const r = await fetch(`data/scryfall.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        for (const [k, v] of Object.entries(data)) cache[k] = v;
        sauver();
      } catch { /* pas de fichier : on tombera sur le repli live si dispo */ }
    })();
  }
  return primed;
}

// Images d'une carte (gère les cartes recto-verso).
function urisDe(card) {
  return card.image_uris || (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) || {};
}
const imageDe = (card) => { const u = urisDe(card); return u.art_crop || u.normal || u.small || null; };  // bandeau
const fullDe = (card) => { const u = urisDe(card); return u.normal || u.large || u.small || null; };        // carte entière

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  return r.json();
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Résout un commandant (async). Met en cache et renvoie l'entrée.
export async function resolve(nom) {
  const k = cle(nom);
  if (!k) return null;
  if (cache[k]) return cache[k];
  try {
    const en = await jget('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(nom));
    if (!en) { cache[k] = { notFound: true }; sauver(); return cache[k]; }
    let img = imageDe(en);
    let card = null;
    let fr = null;
    // Cherche la version française (nom imprimé + éventuellement l'illustration FR).
    // Correspondance de nom exact (!"…") filtrée sur la langue française.
    await pause(120);
    const rechFr = await jget('https://api.scryfall.com/cards/search?unique=prints&q='
      + encodeURIComponent(`!"${en.name}" lang:fr`));
    if (rechFr && rechFr.data && rechFr.data.length) {
      const cfr = rechFr.data[0];
      fr = cfr.printed_name || null;
      const imgFr = imageDe(cfr);
      if (imgFr) img = imgFr;   // privilégie l'illustration de la carte FR
      card = fullDe(cfr);       // carte entière en FR si dispo
    }
    if (!card) card = fullDe(en);
    cache[k] = { img, card, en: en.name, fr, uri: en.scryfall_uri || null };
  } catch {
    cache[k] = { notFound: true };
  }
  sauver();
  return cache[k];
}

// Peint une liste de commandants. On charge d'abord le cache embarqué, puis on
// applique chaque entrée (illustration + nom FR) via `onResolved(nom, entry)`.
// Un commandant absent du fichier déclenche un repli live (réseau libre requis).
export async function resoudreManquants(noms, onResolved) {
  await prime();
  const cles = [...new Set(noms.map(cle).filter(Boolean))];
  for (const k of cles) {
    let e = cache[k];
    if (!e) { e = await resolve(k); await pause(120); }   // repli live, poli
    if (onResolved) onResolved(k, e);
  }
}
