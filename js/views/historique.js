// historique.js — journal des soirées et de leurs parties, avec filtres et
// édition/suppression des soirées ET des parties directement depuis ici.

import {
  getModel, soirees, partiesDe,
  updateSoiree, removeSoiree, updatePartie, removePartie,
} from '../store.js';
import { esc, dateFr } from '../util.js';
import { optJoueursSel, optSoirees, rowPod, creerRow, brancherPodRow } from './shared.js';

const filtre = { joueur: '', type: '', saison: '', format: '' };
const editing = { soiree: null, partie: null };   // survit aux refresh

export function renderHistorique(container, ctx) {
  const model = getModel();
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const dn = Object.fromEntries(model.decks.map((d) => [d.id, d]));
  const sn = Object.fromEntries(model.saisons.map((s) => [s.id, s.nom]));

  const blocs = soirees()
    .filter((e) => !filtre.saison || e.saison_id === filtre.saison)
    .map((e) => ({ e, parties: partiesDe(e.id).filter(matchPartie) }))
    .filter(({ e, parties }) => parties.length || editing.soiree === e.id);

  container.innerHTML = `
    <h1>Historique</h1>
    <p class="sub">Toutes les soirées et leurs parties. Modifie ou supprime directement depuis ici.</p>
    ${barreFiltres(model)}
    ${blocs.length ? blocs.map(({ e, parties }) => bloc(e, parties, model, jn, dn, sn)).join('')
      : `<div class="empty">${filtreActif() ? 'Aucune partie ne correspond aux filtres.' : 'Aucune soirée. Va dans « Saisie » pour en créer une.'}</div>`}
  `;

  wireFiltres(container, ctx);
  wireActions(container, ctx, model);
}

function filtreActif() {
  return filtre.joueur || filtre.type || filtre.saison || filtre.format;
}

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

// --- rendu d'une soirée -----------------------------------------------------
function bloc(e, parties, model, jn, dn, sn) {
  if (editing.soiree === e.id) return blocEditSoiree(e, model);
  return `<div class="bloc" data-soiree="${e.id}">
    <div class="bloc-head">
      <span>${e.titre ? esc(e.titre) + ' · ' : ''}${dateFr(e.date)}${e.lieu ? ' · ' + esc(e.lieu) : ''}</span>
      <span class="bloc-head-r">
        <span class="bloc-tag">${esc(sn[e.saison_id] || '')} · ${parties.length} partie${parties.length > 1 ? 's' : ''}</span>
        <button class="btn btn-mini" data-act="so-edit" data-id="${e.id}">Modifier</button>
        <button class="btn btn-mini" data-act="so-del" data-id="${e.id}">Supprimer</button>
      </span>
    </div>
    <div class="parties">
      ${parties.length ? parties.map((p) => ligne(p, jn, dn, model)).join('') : '<div class="empty">—</div>'}
    </div>
  </div>`;
}

function blocEditSoiree(e, model) {
  return `<div class="bloc" data-soiree="${e.id}"><div class="soiree-edit" style="padding:16px" data-id="${e.id}">
    <h3 style="margin:0 0 12px;font-family:'Fredoka',sans-serif;color:var(--accent-d)">Modifier la soirée</h3>
    <div class="fgrid">
      <div><label>Date</label><input type="date" class="e-date" value="${esc(e.date || '')}"></div>
      <div><label>Titre</label><input type="text" class="e-titre" value="${esc(e.titre || '')}" placeholder="ex. Soirée Spéciale Noël"></div>
      <div><label>Lieu</label><input type="text" class="e-lieu" value="${esc(e.lieu || '')}"></div>
      <div><label>Saison</label><select class="e-saison"><option value="">— sans saison —</option>${model.saisons.map((s) => `<option value="${s.id}" ${s.id === e.saison_id ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-mini btn-noir" data-act="so-save" data-id="${e.id}">Enregistrer</button>
      <button class="btn btn-mini" data-act="so-cancel">Annuler</button>
    </div>
  </div></div>`;
}

// --- rendu d'une partie -----------------------------------------------------
function ligne(p, jn, dn, model) {
  if (editing.partie === p.id) return formEditPartie(model, p);
  const actions = `<span class="p-actions">
    <button class="btn btn-mini" data-act="pa-edit" data-id="${p.id}">Modifier</button>
    <button class="btn btn-mini" data-act="pa-del" data-id="${p.id}">Supprimer</button>
  </span>`;
  if (p.type === 'pod') {
    const parts = p.participants.slice().sort((a, b) => (a.place || 99) - (b.place || 99))
      .map((pt) => {
        const d = dn[pt.deck_id];
        return `<span class="pod-pt ${pt.place === 1 ? 'gagnant' : ''}">${pt.place ? pt.place + '.' : '·'} ${esc(jn[pt.joueur_id] || '?')}${d ? ` <em>${esc(d.commandant || d.nom)}</em>` : ''}</span>`;
      }).join('');
    return `<div class="partie"><span class="ptag ptag-pod">Commander</span><div class="pod-list">${parts}</div>${actions}</div>`;
  }
  const cat = p.categorie === 'limite' ? 'Limité' : 'Construit';
  const [A, B] = p.participants;
  const nom = (x) => `${esc(jn[x.joueur_id] || '?')} <b>(${x.resultat})</b>`;
  return `<div class="partie">
    <span class="ptag ptag-${p.categorie}">${cat}${p.format ? ' · ' + esc(p.format) : ''}</span>
    <div class="duel">${nom(A)} <span class="vs">vs</span> ${nom(B)}</div>${actions}
  </div>`;
}

// Formulaire d'édition d'une partie (pod ou 1v1), rendu dans la liste.
function formEditPartie(model, p) {
  if (p.type === 'pod') {
    return `<div class="partie-edit" data-id="${p.id}">
      <h3>Modifier un pod Commander</h3>
      <div class="fgrid"><div><label>Soirée</label><select class="ep-soiree">${optSoirees()}</select></div></div>
      <div class="pod-rows ep-rows">${p.participants.map(() => rowPod(model)).join('')}</div>
      <button class="btn btn-mini ep-add-row" type="button">+ joueur</button>
      <div class="hint">Place 1 = vainqueur du pod.</div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-noir" data-act="pa-save" data-id="${p.id}">Enregistrer</button>
        <button class="btn" data-act="pa-cancel">Annuler</button>
      </div>
    </div>`;
  }
  const isLim = p.categorie === 'limite';
  const [A, B] = p.participants;
  const res = A.resultat === 'V' ? 'A' : A.resultat === 'D' ? 'B' : 'N';
  return `<div class="partie-edit" data-id="${p.id}">
    <h3>Modifier un match 1v1</h3>
    <div class="fgrid">
      <div><label>Soirée</label><select class="ep-soiree">${optSoirees()}</select></div>
      <div><label>Catégorie</label><select class="ep-cat">
        <option value="construit" ${!isLim ? 'selected' : ''}>Construit</option>
        <option value="limite" ${isLim ? 'selected' : ''}>Limité</option></select></div>
      <div><label>Format</label><input type="text" class="ep-format" value="${esc(p.format || '')}"></div>
    </div>
    <div class="fgrid" style="margin-top:12px">
      <div><label>Joueur A</label><select class="ep-a">${optJoueursSel(model, A.joueur_id)}</select></div>
      <div><label>Joueur B</label><select class="ep-b">${optJoueursSel(model, B.joueur_id)}</select></div>
      <div><label>Résultat</label><select class="ep-res">
        <option value="A" ${res === 'A' ? 'selected' : ''}>A gagne</option>
        <option value="B" ${res === 'B' ? 'selected' : ''}>B gagne</option>
        <option value="N" ${res === 'N' ? 'selected' : ''}>Nul</option></select></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn btn-noir" data-act="pa-save" data-id="${p.id}">Enregistrer</button>
      <button class="btn" data-act="pa-cancel">Annuler</button>
    </div>
  </div>`;
}

// --- actions ----------------------------------------------------------------
function wireActions(container, ctx, model) {
  container.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => action(b, container, ctx, model); });
  // pré-remplissage des formulaires d'édition présents
  const pe = container.querySelector('.partie-edit');
  if (pe) prefillPartieEdit(pe, model);
}

function action(btn, container, ctx, model) {
  const id = btn.dataset.id;
  switch (btn.dataset.act) {
    // soirées
    case 'so-edit': editing.soiree = id; editing.partie = null; ctx.refresh(); break;
    case 'so-cancel': editing.soiree = null; ctx.refresh(); break;
    case 'so-save': {
      const box = btn.closest('.soiree-edit');
      const date = box.querySelector('.e-date').value;
      if (!date) return ctx.toast('Renseigne une date.');
      updateSoiree({
        id, date,
        titre: box.querySelector('.e-titre').value.trim(),
        lieu: box.querySelector('.e-lieu').value.trim(),
        saison_id: box.querySelector('.e-saison').value || null,
      });
      editing.soiree = null; ctx.toast('Soirée modifiée.'); ctx.refresh(); break;
    }
    case 'so-del': {
      const n = partiesDe(id).length;
      if (!confirm(n ? `Supprimer cette soirée et ses ${n} partie${n > 1 ? 's' : ''} ?` : 'Supprimer cette soirée ?')) return;
      removeSoiree(id); ctx.toast('Soirée supprimée.'); ctx.refresh(); break;
    }
    // parties
    case 'pa-edit': editing.partie = id; editing.soiree = null; ctx.refresh(); break;
    case 'pa-cancel': editing.partie = null; ctx.refresh(); break;
    case 'pa-del': removePartie(id); ctx.toast('Partie supprimée.'); ctx.refresh(); break;
    case 'pa-save': savePartie(btn.closest('.partie-edit'), model, ctx); break;
  }
}

// Pré-remplit le formulaire d'édition d'une partie + branche ses lignes de pod.
function prefillPartieEdit(box, model) {
  const p = model.parties.find((x) => x.id === box.dataset.id);
  if (!p) return;
  const so = box.querySelector('.ep-soiree');
  if (so) so.value = p.soiree_id;
  if (p.type === 'pod') {
    [...box.querySelectorAll('.ep-rows .pod-row')].forEach((row, i) => {
      const part = p.participants[i];
      row.querySelector('.pr-joueur').value = part.joueur_id || '';
      brancherPodRow(row);
      row.querySelector('.pr-deck').value = part.deck_id || '';
      if (part.place != null) row.querySelector('.pr-place').value = part.place;
    });
    box.querySelector('.ep-add-row').onclick = () => {
      const row = creerRow(rowPod(model));
      box.querySelector('.ep-rows').appendChild(row);
      brancherPodRow(row);
    };
  }
}

function savePartie(box, model, ctx) {
  const p = model.parties.find((x) => x.id === box.dataset.id);
  if (!p) return;
  const soiree_id = box.querySelector('.ep-soiree').value;
  if (p.type === 'pod') {
    const participants = [];
    box.querySelectorAll('.ep-rows .pod-row').forEach((row) => {
      const jid = row.querySelector('.pr-joueur').value;
      if (!jid) return;
      const did = row.querySelector('.pr-deck').value || null;
      const pl = parseInt(row.querySelector('.pr-place').value, 10);
      participants.push({ joueur_id: jid, deck_id: did, place: Number.isFinite(pl) ? pl : null });
    });
    if (participants.length < 2) return ctx.toast('Au moins 2 joueurs dans le pod.');
    updatePartie({ id: p.id, soiree_id, participants });
  } else {
    const a = box.querySelector('.ep-a').value, b = box.querySelector('.ep-b').value;
    if (!a || !b || a === b) return ctx.toast('Choisis deux joueurs différents.');
    const r = box.querySelector('.ep-res').value;
    const rA = r === 'A' ? 'V' : r === 'B' ? 'D' : 'N';
    const rB = r === 'B' ? 'V' : r === 'A' ? 'D' : 'N';
    updatePartie({
      id: p.id, soiree_id,
      categorie: box.querySelector('.ep-cat').value,
      format: box.querySelector('.ep-format').value.trim(),
      participants: [{ joueur_id: a, deck_id: null, resultat: rA }, { joueur_id: b, deck_id: null, resultat: rB }],
    });
  }
  editing.partie = null; ctx.toast('Partie modifiée.'); ctx.refresh();
}
