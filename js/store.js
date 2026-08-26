// store.js — état en mémoire (le log de la ligue) + mutations.
//
// Source de lecture : data/ligue.json (servi statiquement par GitHub Pages).
// Les modifications non publiées sont gardées en brouillon dans localStorage,
// pour survivre à un rafraîchissement avant le « Publier » (API GitHub).

import { genId, today } from './util.js';

const LS_DRAFT = 'jurande_draft';

let model = vide();
let dirty = false;

function vide() {
  return { version: 1, titre: 'La Jurande', joueurs: [], decks: [], saisons: [], soirees: [], parties: [] };
}

export function getModel() { return model; }
export function isDirty() { return dirty; }

// Charge le brouillon local s'il existe, sinon le fichier publié.
export async function load() {
  const draft = localStorage.getItem(LS_DRAFT);
  if (draft) {
    try { model = JSON.parse(draft); dirty = true; return; }
    catch { localStorage.removeItem(LS_DRAFT); }
  }
  await rechargerDepuisFichier();
}

// (Re)charge depuis data/ligue.json en abandonnant le brouillon local.
export async function rechargerDepuisFichier() {
  const r = await fetch(`data/ligue.json?t=${Date.now()}`, { cache: 'no-store' });
  model = r.ok ? await r.json() : vide();
  dirty = false;
  localStorage.removeItem(LS_DRAFT);
}

// Remplace le modèle courant (ex. après un pull API) et repart propre.
export function remplacer(nouveau) {
  model = nouveau;
  dirty = false;
  localStorage.removeItem(LS_DRAFT);
}

function toucher() {
  dirty = true;
  localStorage.setItem(LS_DRAFT, JSON.stringify(model));
}

export function publie() {   // appelé après un push réussi
  dirty = false;
  localStorage.removeItem(LS_DRAFT);
}

// --- accès lecture ----------------------------------------------------------
export const joueurs = () => model.joueurs;
export const decks = () => model.decks;
export const decksDe = (jid) => model.decks.filter((d) => d.joueur_id === jid);
export const saisons = () => model.saisons;
export const soirees = () => model.soirees.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
export const parties = () => model.parties;
export const partiesDe = (soireeId) => model.parties.filter((p) => p.soiree_id === soireeId);

// --- mutations --------------------------------------------------------------
export function upsertJoueur(o) {
  if (o.id) {
    Object.assign(model.joueurs.find((x) => x.id === o.id), o);
  } else {
    o.id = genId('j'); o.actif = o.actif ?? true; model.joueurs.push(o);
  }
  toucher(); return o.id;
}

export function upsertDeck(o) {
  if (o.id) {
    Object.assign(model.decks.find((x) => x.id === o.id), o);
  } else {
    o.id = genId('d'); o.actif = o.actif ?? true; model.decks.push(o);
  }
  toucher(); return o.id;
}

export function upsertSaison(o) {
  if (o.active) model.saisons.forEach((s) => { s.active = false; });
  if (o.id) {
    Object.assign(model.saisons.find((x) => x.id === o.id), o);
  } else {
    o.id = genId('s'); model.saisons.push(o);
  }
  toucher(); return o.id;
}

// Suppressions. Les vues vérifient l'absence de références avant d'appeler
// (un joueur/deck/saison encore utilisé dans une partie n'est pas supprimable).
export function removeJoueur(id) {
  model.joueurs = model.joueurs.filter((j) => j.id !== id);
  toucher();
}
export function removeDeck(id) {
  model.decks = model.decks.filter((d) => d.id !== id);
  toucher();
}
export function removeSaison(id) {
  model.saisons = model.saisons.filter((s) => s.id !== id);
  toucher();
}

// Comptage des références (pour bloquer une suppression destructrice).
export const refsJoueur = (id) =>
  model.decks.filter((d) => d.joueur_id === id).length
  + model.parties.filter((p) => p.participants.some((x) => x.joueur_id === id)).length;
export const refsDeck = (id) =>
  model.parties.filter((p) => p.participants.some((x) => x.deck_id === id)).length;
export const refsSaison = (id) =>
  model.soirees.filter((e) => e.saison_id === id).length
  + model.parties.filter((p) => p.saison_id === id).length;

export function addSoiree(o) {
  o.id = genId('e'); o.date = o.date || today();
  model.soirees.push(o); toucher(); return o.id;
}

export function removeSoiree(id) {
  model.soirees = model.soirees.filter((e) => e.id !== id);
  model.parties = model.parties.filter((p) => p.soiree_id !== id);
  toucher();
}

export function addPartie(o) {
  o.id = genId('p');
  // rattache la saison depuis la soirée si absente
  if (!o.saison_id) {
    const so = model.soirees.find((e) => e.id === o.soiree_id);
    o.saison_id = so ? so.saison_id : null;
  }
  model.parties.push(o); toucher(); return o.id;
}

export function removePartie(id) {
  model.parties = model.parties.filter((p) => p.id !== id);
  toucher();
}

// Ajout par lot (saisie groupée d'une soirée) : une seule persistance.
export function addParties(list) {
  for (const o of list) {
    o.id = genId('p');
    if (!o.saison_id) {
      const so = model.soirees.find((e) => e.id === o.soiree_id);
      o.saison_id = so ? so.saison_id : null;
    }
    model.parties.push(o);
  }
  toucher();
  return list.length;
}
