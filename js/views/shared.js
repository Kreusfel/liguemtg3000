// shared.js — briques réutilisées par plusieurs vues (saisie, historique,
// joueurs, decks) : options de <select>, lignes de pod (avec prêt de deck),
// et petits calculs sur les couleurs/decks.

import * as store from '../store.js';
import { esc, dateFr } from '../util.js';

// --- options <select> -------------------------------------------------------
export function optJoueurs(model, vide) {
  return (vide ? '<option value="">— joueur —</option>' : '')
    + model.joueurs.map((j) => `<option value="${j.id}">${esc(j.nom)}</option>`).join('');
}
export function optJoueursSel(model, sel) {
  return model.joueurs.map((j) => `<option value="${j.id}" ${j.id === sel ? 'selected' : ''}>${esc(j.nom)}</option>`).join('');
}
export function optSaisons(model) {
  return model.saisons.map((s) => `<option value="${s.id}" ${s.active ? 'selected' : ''}>${esc(s.nom)}</option>`).join('');
}
export function optSoirees() {
  return store.soirees().map((e) => `<option value="${e.id}">${dateFr(e.date)}${e.titre ? ' · ' + esc(e.titre) : ''}${e.lieu ? ' · ' + esc(e.lieu) : ''}</option>`).join('');
}

// --- lignes de pod ----------------------------------------------------------
export function rowPod(model) {
  return `<div class="pod-row">
    <select class="pr-joueur">${optJoueurs(model, true)}</select>
    <select class="pr-deck"><option value="">— deck —</option></select>
    <input class="pr-place" type="number" min="1" max="8" placeholder="place">
    <button class="btn btn-mini pr-del" type="button">✕</button>
  </div>`;
}

// Crée un élément DOM depuis une chaîne HTML (première racine).
export function creerRow(html) {
  const w = document.createElement('div');
  w.innerHTML = html;
  return w.firstElementChild;
}

// Branche une ligne de pod : options de deck selon le joueur (ses decks + les
// decks empruntés aux autres joueurs) + suppression de la ligne.
export function brancherPodRow(row) {
  const jsel = row.querySelector('.pr-joueur');
  const dsel = row.querySelector('.pr-deck');
  const jn = Object.fromEntries(store.joueurs().map((j) => [j.id, j.nom]));
  const maj = () => {
    const jid = jsel.value;
    if (!jid) { dsel.innerHTML = '<option value="">— deck —</option>'; return; }
    const own = store.decksDe(jid);
    const autres = store.decks().filter((d) => d.joueur_id !== jid);
    let html = '<option value="">— deck —</option>';
    if (own.length) {
      html += `<optgroup label="Ses decks">${own.map((d) => `<option value="${d.id}">${esc(d.nom)}</option>`).join('')}</optgroup>`;
    }
    if (autres.length) {
      html += `<optgroup label="Emprunt (autres joueurs)">${autres.map((d) => `<option value="${d.id}">${esc(d.nom)} — ${esc(jn[d.joueur_id] || '?')}</option>`).join('')}</optgroup>`;
    }
    dsel.innerHTML = html;
  };
  jsel.onchange = maj; maj();
  row.querySelector('.pr-del').onclick = () => { if (row.parentElement.children.length > 1) row.remove(); };
}

// --- decks / couleurs -------------------------------------------------------
// "RG" / "wubrg" -> ['R','G'] (lettres de mana valides uniquement).
export function parseCouleurs(s) {
  return String(s || '').toUpperCase().replace(/[^WUBRG]/g, '').split('').filter(Boolean);
}

// Nombre de parties où chaque deck a été utilisé (deck_id présent), tous
// joueurs confondus — c'est le total du deck, prêts inclus.
export function deckPlays(model) {
  const out = {};
  for (const p of model.parties) {
    for (const x of (p.participants || [])) {
      if (x.deck_id) out[x.deck_id] = (out[x.deck_id] || 0) + 1;
    }
  }
  return out;
}

// Couleur(s) de mana les plus jouées (parties pondérées par deck), ordre WUBRG.
export function couleursDominantes(decks, plays) {
  const cp = {};
  for (const d of decks) {
    const n = plays[d.id] || 0;
    if (!n) continue;
    for (const col of (d.couleurs || [])) cp[col] = (cp[col] || 0) + n;
  }
  const max = Math.max(0, ...Object.values(cp));
  if (max === 0) return [];
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => cp[c] === max);
}

// Dégradé CSS à paliers nets pour un jeu de couleurs de mana.
export function manaGradient(cols) {
  const varOf = { W: '--w', U: '--u', B: '--b', R: '--r', G: '--g' };
  const ordered = ['W', 'U', 'B', 'R', 'G'].filter((c) => cols.includes(c));
  if (!ordered.length) return '';
  if (ordered.length === 1) return `linear-gradient(90deg, var(${varOf[ordered[0]]}) 0 100%)`;
  const step = 100 / ordered.length;
  const stops = ordered.map((c, i) => `var(${varOf[c]}) ${i * step}% ${(i + 1) * step}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}
