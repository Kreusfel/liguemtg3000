// historique.js — journal des soirées et de leurs parties (lecture seule),
// avec filtres (joueur / type / saison / format).

import { getModel, soirees, partiesDe } from '../store.js';
import { esc, dateFr } from '../util.js';

// Filtres mémorisés entre rendus.
const filtre = { joueur: '', type: '', saison: '', format: '' };

export function renderHistorique(container, ctx) {
  const model = getModel();
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const dn = Object.fromEntries(model.decks.map((d) => [d.id, d]));
  const sn = Object.fromEntries(model.saisons.map((s) => [s.id, s.nom]));

  // Soirées filtrées par saison, puis parties filtrées ; on masque les soirées
  // sans partie correspondante.
  const blocs = soirees()
    .filter((e) => !filtre.saison || e.saison_id === filtre.saison)
    .map((e) => ({ e, parties: partiesDe(e.id).filter(matchPartie) }))
    .filter(({ parties }) => parties.length);

  container.innerHTML = `
    <h1>Historique</h1>
    <p class="sub">Toutes les soirées et leurs parties, de la plus récente à la plus ancienne.</p>
    ${barreFiltres(model)}
    ${blocs.length ? blocs.map(({ e, parties }) => bloc(e, parties, jn, dn, sn)).join('')
      : `<div class="empty">${filtreActif() ? 'Aucune partie ne correspond aux filtres.' : 'Aucune soirée. Va dans « Saisie » pour en créer une.'}</div>`}
  `;

  wireFiltres(container, ctx);
}

function filtreActif() {
  return filtre.joueur || filtre.type || filtre.saison || filtre.format;
}

// Un match de partie contre les filtres (hors saison, gérée au niveau soirée).
function matchPartie(p) {
  if (filtre.type === 'pod' && p.type !== 'pod') return false;
  if ((filtre.type === 'construit' || filtre.type === 'limite')
    && !(p.type === '1v1' && p.categorie === filtre.type)) return false;
  if (filtre.joueur && !p.participants.some((x) => x.joueur_id === filtre.joueur)) return false;
  if (filtre.format && !String(p.format || '').toLowerCase().includes(filtre.format.toLowerCase())) return false;
  return true;
}

function barreFiltres(model) {
  const optJ = model.joueurs.map((j) => `<option value="${j.id}" ${filtre.joueur === j.id ? 'selected' : ''}>${esc(j.nom)}</option>`).join('');
  const optS = model.saisons.map((s) => `<option value="${s.id}" ${filtre.saison === s.id ? 'selected' : ''}>${esc(s.nom)}</option>`).join('');
  const optT = [['', 'Tous types'], ['pod', 'Commander'], ['construit', 'Construit'], ['limite', 'Limité']]
    .map(([v, lib]) => `<option value="${v}" ${filtre.type === v ? 'selected' : ''}>${lib}</option>`).join('');
  return `<div class="filtres">
    <select id="f-joueur"><option value="">Tous joueurs</option>${optJ}</select>
    <select id="f-type">${optT}</select>
    <select id="f-saison"><option value="">Toutes saisons</option>${optS}</select>
    <input type="text" id="f-format" placeholder="Format (pauper, draft…)" value="${esc(filtre.format)}">
    ${filtreActif() ? '<button class="btn btn-mini" id="f-reset">Réinitialiser</button>' : ''}
  </div>`;
}

function wireFiltres(container, ctx) {
  const bind = (id, key) => {
    const el = container.querySelector(id);
    if (el) el.onchange = () => { filtre[key] = el.value; ctx.refresh(); };
  };
  bind('#f-joueur', 'joueur');
  bind('#f-type', 'type');
  bind('#f-saison', 'saison');
  const fmt = container.querySelector('#f-format');
  if (fmt) fmt.oninput = () => { filtre.format = fmt.value; ctx.refresh(); };
  const reset = container.querySelector('#f-reset');
  if (reset) reset.onclick = () => { filtre.joueur = filtre.type = filtre.saison = filtre.format = ''; ctx.refresh(); };
}

function bloc(e, parties, jn, dn, sn) {
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
