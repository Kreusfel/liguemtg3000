// github.js — publication du log dans le repo via l'API GitHub (Contents API).
//
// Modèle « git comme backend » : le token personnel de l'organisateur est
// stocké UNIQUEMENT dans son navigateur (localStorage). La lecture publique,
// elle, ne passe pas par ici (fetch statique de data/ligue.json).

const LS_TOKEN = 'jurande_gh_token';
const LS_CONFIG = 'jurande_gh_config';
const API = 'https://api.github.com';

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(LS_CONFIG)) || null; } catch { return null; }
}
export function setConfig(cfg) { localStorage.setItem(LS_CONFIG, JSON.stringify(cfg)); }

export function getToken() { return localStorage.getItem(LS_TOKEN) || ''; }
export function setToken(t) { if (t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN); }

// Vrai si on peut écrire : token + repo configurés.
export function peutPublier() {
  const c = getConfig();
  return !!(getToken() && c && c.owner && c.repo);
}

function headers() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// Base64 d'une chaîne UTF-8 (robuste aux accents / gros contenus).
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// Valide le token : renvoie le login GitHub associé, ou lève une erreur.
export async function verifierToken() {
  const r = await fetch(`${API}/user`, { headers: headers() });
  if (!r.ok) throw new Error(`Token invalide (HTTP ${r.status}).`);
  return (await r.json()).login;
}

// Récupère le SHA courant du fichier (nécessaire pour l'écraser proprement).
async function shaCourant(cfg) {
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}?ref=${cfg.branch}`;
  const r = await fetch(url, { headers: headers() });
  if (r.status === 404) return null;             // le fichier n'existe pas encore
  if (!r.ok) throw new Error(`Lecture du fichier impossible (HTTP ${r.status}).`);
  return (await r.json()).sha;
}

// Publie le modèle : commit de data/ligue.json via l'API. Renvoie l'URL du commit.
export async function publier(model, message) {
  if (!peutPublier()) throw new Error('Token ou dépôt non configurés (voir Réglages).');
  const cfg = getConfig();
  const sha = await shaCourant(cfg);
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}`;
  const body = {
    message: message || `MAJ ligue — ${new Date().toISOString()}`,
    content: b64(JSON.stringify(model, null, 2) + '\n'),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(url, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Publication refusée (HTTP ${r.status}). ${txt.slice(0, 160)}`);
  }
  const data = await r.json();
  return data.commit && data.commit.html_url;
}

// Lit la dernière version publiée via l'API (plus fraîche que le fichier statique,
// qui attend la reconstruction Pages). Utile pour « recharger depuis le repo ».
export async function lireDepuisApi() {
  const cfg = getConfig();
  if (!cfg || !cfg.owner || !cfg.repo) throw new Error('Dépôt non configuré.');
  const url = `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}?ref=${cfg.branch}`;
  const r = await fetch(url, { headers: getToken() ? headers() : { Accept: 'application/vnd.github.raw+json' } });
  if (!r.ok) throw new Error(`Lecture impossible (HTTP ${r.status}).`);
  const data = await r.json();
  const txt = new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
  return JSON.parse(txt);
}
