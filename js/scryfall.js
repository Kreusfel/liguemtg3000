// scryfall.js — résolution des commandants via l'API Scryfall (illustration +
// nom français). Résultats mis en cache dans localStorage : on n'interroge
// Scryfall qu'une fois par commandant, et l'app reste utilisable hors-ligne.
//
// API publique, CORS ouvert. On reste poli : requêtes en série avec un petit
// délai, et tout est mémorisé (y compris les « non trouvés »).

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

// Choisit une image utilisable (gère les cartes recto-verso).
function imageDe(card) {
  const u = card.image_uris || (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris);
  return u ? (u.art_crop || u.normal || u.small || null) : null;
}

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
    }
    cache[k] = { img, en: en.name, fr, uri: en.scryfall_uri || null };
  } catch {
    cache[k] = { notFound: true };
  }
  sauver();
  return cache[k];
}

// Résout en série une liste de noms non encore en cache (poli avec l'API).
// `onResolved(nom, entry)` est appelé après chaque résolution.
export async function resoudreManquants(noms, onResolved) {
  const uniques = [...new Set(noms.map(cle).filter(Boolean))].filter((k) => !cache[k]);
  for (const k of uniques) {
    const e = await resolve(k);
    if (onResolved) onResolved(k, e);
    await pause(120);
  }
}
