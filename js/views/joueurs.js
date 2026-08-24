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

  const cartes = model.joueurs.map((j) => {
    const decks = decksDe(j.id);
    const c = eloC[j.id], l = eloL[j.id], m = cmd[j.id];
    return `<div class="joueur-card">
      <div class="jc-head"><b>${esc(j.nom)}</b>${j.actif ? '' : ' <span class="inactif">inactif</span>'}</div>
      <div class="jc-stats">
        <div class="jc-stat"><span>ELO Construit</span><b>${c ? r0(c.rating) : '—'}</b></div>
        <div class="jc-stat"><span>ELO Limité</span><b>${l ? r0(l.rating) : '—'}</b></div>
        <div class="jc-stat"><span>Commander (pts)</span><b>${m ? m.points : '—'}</b></div>
        <div class="jc-stat"><span>Winrate EDH</span><b>${m ? pct(m.winrate) : '—'}</b></div>
      </div>
      <div class="jc-decks">
        ${decks.length ? decks.map((d) => `<div class="deck-pill">${esc(d.nom)}<small>${esc(d.commandant || '')}</small></div>`).join('')
          : '<span class="empty">aucun deck enregistré</span>'}
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <h1>Joueurs — ${model.joueurs.length}</h1>
    <p class="sub">Fiche de chaque membre : ratings, bilan Commander et decks déclarés.</p>
    <div class="joueur-grid">${cartes || '<div class="empty">Aucun joueur.</div>'}</div>
  `;
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
