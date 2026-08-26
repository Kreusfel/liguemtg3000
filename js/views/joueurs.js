// joueurs.js — annuaire des joueurs et de leurs decks Commander, avec un
// résumé de leurs stats (ELO par catégorie + bilan Commander), lecture seule.

import { getModel, decksDe } from '../store.js';
import { classementElo, classementCommander } from '../ranking.js';
import { esc, pct, r0 } from '../util.js';

export function renderJoueurs(container, ctx) {
  const model = getModel();
  const eloC = idx(classementElo(model, 'construit'));
  const eloL = idx(classementElo(model, 'limite'));
  const cmd = idx(classementCommander(model).joueurs, 'entite');
  const plays = deckPlays(model);   // nb de parties par deck

  const cartes = model.joueurs.map((j) => {
    const decks = decksDe(j.id);
    // On n'affiche que le deck le plus joué (les listes complètes deviennent
    // vite trop longues). Tri stable : à égalité, l'ordre de déclaration prime.
    const top = decks.slice().sort((a, b) => (plays[b.id] || 0) - (plays[a.id] || 0))[0];
    const autres = decks.length - 1;
    // Contour = couleur(s) de mana les plus jouées en Commander (parties
    // pondérées). À défaut de partie, on retombe sur les couleurs du deck affiché.
    let contour = couleursDominantes(decks, plays);
    if (!contour.length && top) contour = (top.couleurs || []).slice();
    const grad = manaGradient(contour);
    const style = grad
      ? ` style="border:3px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box, ${grad} border-box"`
      : '';
    const c = eloC[j.id], l = eloL[j.id], m = cmd[j.id];
    return `<div class="joueur-card"${style}>
      <div class="jc-head"><b>${esc(j.nom)}</b>${j.actif ? '' : ' <span class="inactif">inactif</span>'}</div>
      <div class="jc-stats">
        <div class="jc-stat"><span>ELO Construit</span><b>${c ? r0(c.rating) : '—'}</b></div>
        <div class="jc-stat"><span>ELO Limité</span><b>${l ? r0(l.rating) : '—'}</b></div>
        <div class="jc-stat"><span>Commander (pts)</span><b>${m ? m.points : '—'}</b></div>
        <div class="jc-stat"><span>Winrate EDH</span><b>${m ? pct(m.winrate) : '—'}</b></div>
      </div>
      <div class="jc-decks">
        ${top
          ? `<div class="deck-pill">${esc(top.nom)}<small>${esc(top.commandant || '')}${plays[top.id] ? ` — ${plays[top.id]} partie${plays[top.id] > 1 ? 's' : ''}` : ''}</small></div>`
            + (autres > 0 ? `<div class="deck-autres">+ ${autres} autre${autres > 1 ? 's' : ''} deck${autres > 1 ? 's' : ''}</div>` : '')
          : '<span class="empty">aucun deck enregistré</span>'}
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <h1>Joueurs — ${model.joueurs.length}</h1>
    <p class="sub">Fiche de chaque membre : ratings, bilan Commander et deck Commander le plus joué.</p>
    <div class="joueur-grid">${cartes || '<div class="empty">Aucun joueur.</div>'}</div>
  `;
}

// Compte le nombre de parties où chaque deck a été utilisé (deck_id présent).
function deckPlays(model) {
  const out = {};
  for (const p of model.parties) {
    for (const x of (p.participants || [])) {
      if (x.deck_id) out[x.deck_id] = (out[x.deck_id] || 0) + 1;
    }
  }
  return out;
}

// Couleur(s) de mana les plus jouées par un joueur : chaque couleur d'un deck
// est pondérée par le nombre de parties de ce deck. Renvoie la/les couleur(s)
// ex æquo au sommet, dans l'ordre WUBRG. [] si aucune partie.
function couleursDominantes(decks, plays) {
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

// Construit un dégradé CSS à paliers nets pour un jeu de couleurs de mana.
function manaGradient(cols) {
  const varOf = { W: '--w', U: '--u', B: '--b', R: '--r', G: '--g' };
  const ordered = ['W', 'U', 'B', 'R', 'G'].filter((c) => cols.includes(c));
  if (!ordered.length) return '';
  if (ordered.length === 1) return `linear-gradient(90deg, var(${varOf[ordered[0]]}) 0 100%)`;
  const step = 100 / ordered.length;
  const stops = ordered.map((c, i) => `var(${varOf[c]}) ${i * step}% ${(i + 1) * step}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

// Indexe un tableau de classement par joueur_id (ou par entite.id).
function idx(arr, cle) {
  const out = {};
  for (const l of arr) {
    const id = cle ? (l.entite && l.entite.id) : l.joueur_id;
    if (id) out[id] = l;
  }
  return out;
}
