// historique.js — journal des soirées et de leurs parties (lecture seule).

import { getModel, soirees, partiesDe } from '../store.js';
import { esc, dateFr } from '../util.js';

export function renderHistorique(container, ctx) {
  const model = getModel();
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const dn = Object.fromEntries(model.decks.map((d) => [d.id, d]));
  const sn = Object.fromEntries(model.saisons.map((s) => [s.id, s.nom]));
  const liste = soirees();

  container.innerHTML = `
    <h1>Historique</h1>
    <p class="sub">Toutes les soirées et leurs parties, de la plus récente à la plus ancienne.</p>
    ${liste.length ? liste.map((e) => bloc(e, model, jn, dn, sn)).join('')
      : `<div class="empty">Aucune soirée. Va dans « Saisie » pour en créer une.</div>`}
  `;
}

function bloc(e, model, jn, dn, sn) {
  const parties = partiesDe(e.id);
  return `<div class="bloc">
    <div class="bloc-head">
      <span>${dateFr(e.date)}${e.lieu ? ' · ' + esc(e.lieu) : ''}</span>
      <span class="bloc-tag">${esc(sn[e.saison_id] || '')} · ${parties.length} partie${parties.length > 1 ? 's' : ''}</span>
    </div>
    <div class="parties">
      ${parties.length ? parties.map((p) => ligne(p, jn, dn)).join('') : '<div class="empty">—</div>'}
    </div>
  </div>`;
}

function ligne(p, jn, dn) {
  if (p.type === 'pod') {
    const parts = p.participants.slice().sort((a, b) => (a.place || 99) - (b.place || 99))
      .map((pt) => {
        const d = dn[pt.deck_id];
        return `<span class="pod-pt ${pt.place === 1 ? 'gagnant' : ''}">${pt.place ? pt.place + '.' : '·'} ${esc(jn[pt.joueur_id] || '?')}${d ? ` <em>${esc(d.commandant || d.nom)}</em>` : ''}</span>`;
      }).join('');
    return `<div class="partie"><span class="ptag ptag-pod">Commander</span><div class="pod-list">${parts}</div></div>`;
  }
  // 1v1
  const cat = p.categorie === 'limite' ? 'Limité' : 'Construit';
  const [A, B] = p.participants;
  const nom = (x) => `${esc(jn[x.joueur_id] || '?')} <b>(${x.resultat})</b>`;
  return `<div class="partie">
    <span class="ptag ptag-${p.categorie}">${cat}${p.format ? ' · ' + esc(p.format) : ''}</span>
    <div class="duel">${nom(A)} <span class="vs">vs</span> ${nom(B)}</div>
  </div>`;
}
