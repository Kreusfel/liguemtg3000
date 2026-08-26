// saisie.js — écran organisateur. Édite le log (soirées, parties, joueurs,
// decks, saisons) en brouillon local, puis « Publier » commit data/ligue.json
// via l'API GitHub. Aucune authentification applicative : le token vit dans le
// navigateur de l'organisateur (voir Réglages).

import * as store from '../store.js';
import { publier } from '../github.js';
import { peutPublier } from '../github.js';
import { classementCommander, classementElo } from '../ranking.js';
import { esc, dateFr, today } from '../util.js';

export function renderSaisie(container, ctx) {
  const model = store.getModel();

  container.innerHTML = `
    ${barrePublication()}
    <div class="form-card">
      <h2>Nouvelle soirée</h2>
      <div class="fgrid">
        <div><label>Date</label><input type="date" id="so-date" value="${today()}"></div>
        <div><label>Lieu</label><input type="text" id="so-lieu" placeholder="Chez… / boutique"></div>
        <div><label>Saison</label><select id="so-saison">${optSaisons(model)}</select></div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-noir" id="so-add">Créer la soirée</button>
        <button class="btn" id="so-dup" title="Recrée une soirée (même lieu/saison, aujourd'hui) et pré-coche les présents de la dernière">⧉ Dupliquer la dernière</button>
      </div>
    </div>

    <h2>Saisie des parties</h2>
    ${saisieTabsBar()}
    <div id="saisie-panel"></div>

    <h2>Dernières parties saisies</h2>
    <div id="recentes-zone">${recentesZone(model)}</div>

    <div class="deux-col">
      ${gestionJoueurs(model)}
      ${gestionSaisons(model)}
    </div>
    ${gestionDecks(model)}
  `;

  wirePublication(container, ctx);
  wireSoiree(container, ctx);
  wireSaisieTabs(container, ctx, model);
  renderPanel(container, ctx, model);
  wireGestion(container, ctx, model);
  wireRecentes(container, ctx, model);
}

// --- onglets de saisie (un type de partie à la fois) ------------------------
// Une soirée mélange rarement plusieurs types : on n'affiche qu'un formulaire.
// `saisieTab` survit aux ctx.refresh() (état module).
const SAISIE_TABS = [
  { id: 'commander', label: 'Commander · pods' },
  { id: 'construit', label: 'Construit · 1v1' },
  { id: 'limite', label: 'Limité · 1v1' },
];
let saisieTab = 'commander';

function saisieTabsBar() {
  return `<div class="saisie-tabs" role="tablist">${SAISIE_TABS.map((t) =>
    `<button role="tab" type="button" data-st="${t.id}" aria-selected="${t.id === saisieTab}">${t.label}</button>`).join('')}</div>`;
}
function wireSaisieTabs(container, ctx, model) {
  container.querySelectorAll('.saisie-tabs [data-st]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.st === saisieTab) return;
      saisieTab = b.dataset.st;
      container.querySelectorAll('.saisie-tabs [data-st]')
        .forEach((x) => x.setAttribute('aria-selected', String(x.dataset.st === saisieTab)));
      renderPanel(container, ctx, model);   // re-rend uniquement le panneau actif
    };
  });
}
function renderPanel(container, ctx, model) {
  const host = container.querySelector('#saisie-panel');
  if (saisieTab === 'commander') {
    host.innerHTML = formCommander(model);
    wireCommander(container, ctx, model);
  } else {
    host.innerHTML = form1v1(model, saisieTab);
    wire1v1(container, ctx, model, saisieTab);
  }
}

// --- barre de publication ---------------------------------------------------
function barrePublication() {
  const dirty = store.isDirty();
  const ok = peutPublier();
  return `<div class="pub-bar ${dirty ? 'pub-dirty' : ''}">
    <div class="pub-etat">${dirty ? '● Modifications non publiées' : '✓ À jour avec le dépôt'}</div>
    <div class="pub-actions">
      <button class="btn" id="pub-reload" title="Abandonner le brouillon et recharger le dépôt">Recharger le dépôt</button>
      <button class="btn btn-noir" id="pub-go" ${dirty && ok ? '' : 'disabled'}>Publier sur GitHub</button>
    </div>
    ${ok ? '' : '<div class="pub-warn">⚠️ Token/dépôt non configurés — voir <b>Réglages</b> pour pouvoir publier.</div>'}
  </div>`;
}

function wirePublication(container, ctx) {
  container.querySelector('#pub-go').onclick = async () => {
    const btn = container.querySelector('#pub-go');
    btn.disabled = true; btn.textContent = 'Publication…';
    try {
      const url = await publier(store.getModel(), `MAJ ligue — ${dateFr(today())}`);
      store.publie();
      ctx.toast('Publié sur GitHub ✓');
      if (url) console.log('Commit :', url);
      ctx.refresh();
    } catch (e) {
      ctx.toast('Échec : ' + e.message);
      btn.disabled = false; btn.textContent = 'Publier sur GitHub';
    }
  };
  container.querySelector('#pub-reload').onclick = async () => {
    if (store.isDirty() && !confirm('Abandonner les modifications non publiées et recharger le dépôt ?')) return;
    await store.rechargerDepuisFichier();
    ctx.toast('Rechargé depuis le dépôt.');
    ctx.refresh();
  };
}

// --- soirée -----------------------------------------------------------------
// Présents à pré-cocher dans le prochain formulaire 1v1 (après duplication).
let presetPresents = [];

function wireSoiree(container, ctx) {
  container.querySelector('#so-add').onclick = () => {
    const date = container.querySelector('#so-date').value;
    const lieu = container.querySelector('#so-lieu').value.trim();
    const saison_id = container.querySelector('#so-saison').value || null;
    if (!date) return ctx.toast('Renseigne une date.');
    store.addSoiree({ date, lieu, saison_id, notes: '' });
    ctx.toast('Soirée créée.');
    ctx.refresh();
  };
  container.querySelector('#so-dup').onclick = () => {
    const derniere = store.soirees()[0];   // la plus récente
    if (!derniere) return ctx.toast('Aucune soirée à dupliquer.');
    store.addSoiree({ date: today(), lieu: derniere.lieu || '', saison_id: derniere.saison_id || null, notes: '' });
    presetPresents = [...new Set(store.partiesDe(derniere.id).flatMap((p) => p.participants.map((x) => x.joueur_id)))];
    ctx.toast(presetPresents.length ? 'Soirée dupliquée — présents pré-cochés (onglets 1v1).' : 'Soirée dupliquée.');
    ctx.refresh();
  };
}

// --- lignes de pod (réutilisées par la saisie Commander groupée) -------------
function rowPod(model) {
  return `<div class="pod-row">
    <select class="pr-joueur">${optJoueurs(model, true)}</select>
    <select class="pr-deck"><option value="">— deck —</option></select>
    <input class="pr-place" type="number" min="1" max="8" placeholder="place">
    <button class="btn btn-mini pr-del" type="button">✕</button>
  </div>`;
}

// Crée un élément DOM depuis une chaîne HTML (première racine).
function creerRow(html) {
  const w = document.createElement('div');
  w.innerHTML = html;
  return w.firstElementChild;
}

// Branche une ligne de pod : filtrage des decks selon le joueur + suppression.
function brancherPodRow(row) {
  const jsel = row.querySelector('.pr-joueur');
  const dsel = row.querySelector('.pr-deck');
  const maj = () => {
    const decks = store.decksDe(jsel.value);
    dsel.innerHTML = '<option value="">— deck —</option>'
      + decks.map((d) => `<option value="${d.id}">${esc(d.nom)}</option>`).join('');
  };
  jsel.onchange = maj; maj();
  row.querySelector('.pr-del').onclick = () => { if (row.parentElement.children.length > 1) row.remove(); };
}

// --- soirée 1v1 (Construit ou Limité) : saisie groupée round-robin ----------
function form1v1(model, cat) {
  const isLim = cat === 'limite';
  const titre = isLim ? 'Soirée Limité — matchs 1v1' : 'Soirée Construit — matchs 1v1';
  const pool = isLim ? 'ELO Limité' : 'ELO Construit';
  const fmtPh = isLim ? 'scellé, draft…' : 'pauper, modern…';
  return `<div class="form-card">
    <h2>${titre}</h2>
    <p class="mini">Coche les présents, génère toutes les rondes (chacun affronte chacun), indique le vainqueur
      de chaque match, puis enregistre tout d'un coup. Les matchs comptent en <b>${pool}</b>.</p>
    <div class="fgrid">
      <div><label>Soirée</label><select id="li-soiree">${optSoirees(model)}</select></div>
      <div><label>Format</label><input type="text" id="li-format" placeholder="${fmtPh}"></div>
    </div>
    <label style="margin-top:12px">Joueurs présents</label>
    <div class="chk-joueurs" id="li-joueurs">
      ${model.joueurs.map((j) => `<label class="chk"><input type="checkbox" value="${j.id}"> ${esc(j.nom)}</label>`).join('')
        || '<span class="empty">aucun joueur</span>'}
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn" id="li-gen" type="button">Générer toutes les rondes</button>
      <span class="mini" id="li-info"></span>
    </div>
    <div id="li-matchs" class="match-list"></div>
    <div style="margin-top:14px"><button class="btn btn-noir" id="li-save" disabled>Enregistrer les matchs</button></div>
  </div>`;
}

function wire1v1(container, ctx, model, cat) {
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const matchs = container.querySelector('#li-matchs');
  const save = container.querySelector('#li-save');
  const info = container.querySelector('#li-info');

  // Présents pré-cochés après une duplication de soirée (one-shot).
  if (presetPresents.length) {
    container.querySelectorAll('#li-joueurs input').forEach((i) => { if (presetPresents.includes(i.value)) i.checked = true; });
    presetPresents = [];
  }

  container.querySelector('#li-gen').onclick = () => {
    const ids = [...container.querySelectorAll('#li-joueurs input:checked')].map((i) => i.value);
    if (ids.length < 2) { matchs.innerHTML = ''; save.disabled = true; info.textContent = 'Coche au moins 2 joueurs.'; return; }
    const paires = [];
    for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) paires.push([ids[i], ids[k]]);
    matchs.innerHTML = paires.map(([a, b]) => `
      <div class="match-row" data-a="${a}" data-b="${b}">
        <span class="mr-j">${esc(jn[a])}</span>
        <select class="mr-res">
          <option value="">— non joué —</option>
          <option value="A">${esc(jn[a])} gagne</option>
          <option value="B">${esc(jn[b])} gagne</option>
          <option value="N">nul</option>
        </select>
        <span class="mr-j mr-b">${esc(jn[b])}</span>
      </div>`).join('');
    save.disabled = false;
    info.textContent = `${paires.length} match${paires.length > 1 ? 's' : ''} — remplis les vainqueurs.`;
  };

  save.onclick = () => {
    const soiree_id = container.querySelector('#li-soiree').value;
    if (!soiree_id) return ctx.toast('Crée d\'abord une soirée.');
    const format = container.querySelector('#li-format').value.trim();
    const list = [];
    container.querySelectorAll('#li-matchs .match-row').forEach((row) => {
      const res = row.querySelector('.mr-res').value;
      if (!res) return;
      const a = row.dataset.a, b = row.dataset.b;
      const rA = res === 'A' ? 'V' : res === 'B' ? 'D' : 'N';
      const rB = res === 'B' ? 'V' : res === 'A' ? 'D' : 'N';
      list.push({
        soiree_id, type: '1v1', categorie: cat, format,
        participants: [{ joueur_id: a, deck_id: null, resultat: rA }, { joueur_id: b, deck_id: null, resultat: rB }],
      });
    });
    if (!list.length) return ctx.toast('Renseigne au moins un résultat.');
    const n = store.addParties(list);
    ctx.toast(`${n} match${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''}.`);
    ctx.refresh();
  };
}

// --- soirée Commander : saisie groupée (plusieurs pods) ---------------------
function formCommander(model) {
  return `<div class="form-card">
    <h2>Soirée Commander — pods</h2>
    <p class="mini">Enregistre plusieurs pods de la même soirée d'un coup. Place 1 = vainqueur du pod.</p>
    <div class="fgrid"><div><label>Soirée</label><select id="co-soiree">${optSoirees(model)}</select></div></div>
    <div id="co-pods" class="pods-groupe"></div>
    <div style="margin-top:10px"><button class="btn" id="co-add-pod" type="button">+ Ajouter un pod</button></div>
    <div style="margin-top:14px"><button class="btn btn-noir" id="co-save">Enregistrer tous les pods</button></div>
  </div>`;
}

function podCard(model) {
  return `<div class="pod-card">
    <div class="pod-card-head"><b class="pod-titre">Pod</b><button class="btn btn-mini co-del-pod" type="button">retirer</button></div>
    <div class="pod-rows">${[0, 1, 2, 3].map(() => rowPod(model)).join('')}</div>
    <button class="btn btn-mini co-add-row" type="button">+ joueur</button>
  </div>`;
}

function wireCommander(container, ctx, model) {
  const wrap = container.querySelector('#co-pods');

  const renumeroter = () => {
    wrap.querySelectorAll('.pod-card .pod-titre').forEach((b, i) => { b.textContent = `Pod ${i + 1}`; });
  };
  const brancherCard = (card) => {
    card.querySelectorAll('.pod-row').forEach(brancherPodRow);
    card.querySelector('.co-add-row').onclick = () => {
      const row = creerRow(rowPod(model));
      card.querySelector('.pod-rows').appendChild(row);
      brancherPodRow(row);
    };
    card.querySelector('.co-del-pod').onclick = () => {
      if (wrap.children.length > 1) { card.remove(); renumeroter(); }
    };
  };
  const ajouterPod = () => {
    const card = creerRow(podCard(model));
    wrap.appendChild(card);
    brancherCard(card);
    renumeroter();
  };

  ajouterPod();   // un pod par défaut
  container.querySelector('#co-add-pod').onclick = ajouterPod;

  container.querySelector('#co-save').onclick = () => {
    const soiree_id = container.querySelector('#co-soiree').value;
    if (!soiree_id) return ctx.toast('Crée d\'abord une soirée.');
    const list = [];
    wrap.querySelectorAll('.pod-card').forEach((card) => {
      const participants = [];
      card.querySelectorAll('.pod-row').forEach((row) => {
        const jid = row.querySelector('.pr-joueur').value;
        if (!jid) return;
        const did = row.querySelector('.pr-deck').value || null;
        const pl = parseInt(row.querySelector('.pr-place').value, 10);
        participants.push({ joueur_id: jid, deck_id: did, place: Number.isFinite(pl) ? pl : null });
      });
      if (participants.length >= 2) list.push({ soiree_id, type: 'pod', format: 'commander', participants });
    });
    if (!list.length) return ctx.toast('Renseigne au moins un pod (2 joueurs minimum).');
    const n = store.addParties(list);
    ctx.toast(`${n} pod${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''}.`);
    ctx.refresh();
  };
}

// --- parties récentes -------------------------------------------------------
// La zone bascule entre la liste et le formulaire d'édition d'une partie.
function recentesZone(model) {
  if (editing.partie) {
    const p = model.parties.find((x) => x.id === editing.partie);
    if (p) return formEditPartie(model, p);
    editing.partie = null;   // partie disparue : retour liste
  }
  return listeRecentes(model);
}

function listeRecentes(model) {
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const recentes = model.parties.slice(-8).reverse();
  if (!recentes.length) return '<div class="empty">Aucune partie.</div>';
  return `<div class="tablewrap"><table>
    <thead><tr><th>Type</th><th>Détail</th><th></th></tr></thead>
    <tbody>${recentes.map((p) => {
      const label = p.type === 'pod' ? 'Commander' : (p.categorie === 'limite' ? 'Limité' : 'Construit');
      const detail = p.type === 'pod'
        ? p.participants.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).map((x) => `${x.place || '·'}.${esc(jn[x.joueur_id] || '?')}`).join(', ')
        : p.participants.map((x) => `${esc(jn[x.joueur_id] || '?')} (${x.resultat})`).join(' vs ');
      return `<tr><td><span class="ptag ptag-${p.type === 'pod' ? 'pod' : p.categorie}">${label}</span></td>
        <td>${detail}</td>
        <td class="actions">
          <button class="btn btn-mini" data-edit-partie="${p.id}">Modifier</button>
          <button class="btn btn-mini" data-del-partie="${p.id}">Supprimer</button>
        </td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// Formulaire d'édition d'une partie (pod ou 1v1).
function formEditPartie(model, p) {
  if (p.type === 'pod') {
    return `<div class="form-card" id="edit-partie">
      <h3>Modifier un pod Commander</h3>
      <div class="fgrid"><div><label>Soirée</label><select id="ep-soiree">${optSoirees(model)}</select></div></div>
      <div class="pod-rows" id="ep-rows">${p.participants.map(() => rowPod(model)).join('')}</div>
      <button class="btn btn-mini" id="ep-add-row" type="button">+ joueur</button>
      <div class="hint">Place 1 = vainqueur du pod.</div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-noir" id="ep-save">Enregistrer</button>
        <button class="btn" id="ep-cancel">Annuler</button>
      </div>
    </div>`;
  }
  const isLim = p.categorie === 'limite';
  const [A, B] = p.participants;
  const res = A.resultat === 'V' ? 'A' : A.resultat === 'D' ? 'B' : 'N';
  return `<div class="form-card" id="edit-partie">
    <h3>Modifier un match 1v1</h3>
    <div class="fgrid">
      <div><label>Soirée</label><select id="ep-soiree">${optSoirees(model)}</select></div>
      <div><label>Catégorie</label><select id="ep-cat">
        <option value="construit" ${!isLim ? 'selected' : ''}>Construit</option>
        <option value="limite" ${isLim ? 'selected' : ''}>Limité</option></select></div>
      <div><label>Format</label><input type="text" id="ep-format" value="${esc(p.format || '')}"></div>
    </div>
    <div class="fgrid" style="margin-top:12px">
      <div><label>Joueur A</label><select id="ep-a">${optJoueursSel(model, A.joueur_id)}</select></div>
      <div><label>Joueur B</label><select id="ep-b">${optJoueursSel(model, B.joueur_id)}</select></div>
      <div><label>Résultat</label><select id="ep-res">
        <option value="A" ${res === 'A' ? 'selected' : ''}>A gagne</option>
        <option value="B" ${res === 'B' ? 'selected' : ''}>B gagne</option>
        <option value="N" ${res === 'N' ? 'selected' : ''}>Nul</option></select></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn btn-noir" id="ep-save">Enregistrer</button>
      <button class="btn" id="ep-cancel">Annuler</button>
    </div>
  </div>`;
}

function wireRecentes(container, ctx, model) {
  container.querySelectorAll('[data-del-partie]').forEach((b) => {
    b.onclick = () => { store.removePartie(b.dataset.delPartie); ctx.toast('Partie supprimée.'); ctx.refresh(); };
  });
  container.querySelectorAll('[data-edit-partie]').forEach((b) => {
    b.onclick = () => { editing.partie = b.dataset.editPartie; ctx.refresh(); };
  });
  const zone = container.querySelector('#edit-partie');
  if (zone) wireEditPartie(container, ctx, model);
}

function wireEditPartie(container, ctx, model) {
  const p = model.parties.find((x) => x.id === editing.partie);
  if (!p) return;
  container.querySelector('#ep-soiree').value = p.soiree_id;
  const cancel = () => { editing.partie = null; ctx.refresh(); };
  container.querySelector('#ep-cancel').onclick = cancel;

  if (p.type === 'pod') {
    // Pré-remplit chaque ligne (joueur -> decks du joueur -> deck -> place).
    const rows = [...container.querySelectorAll('#ep-rows .pod-row')];
    rows.forEach((row, i) => {
      const part = p.participants[i];
      row.querySelector('.pr-joueur').value = part.joueur_id || '';
      brancherPodRow(row);
      row.querySelector('.pr-deck').value = part.deck_id || '';
      if (part.place != null) row.querySelector('.pr-place').value = part.place;
    });
    container.querySelector('#ep-add-row').onclick = () => {
      const row = creerRow(rowPod(model));
      container.querySelector('#ep-rows').appendChild(row);
      brancherPodRow(row);
    };
    container.querySelector('#ep-save').onclick = () => {
      const participants = [];
      container.querySelectorAll('#ep-rows .pod-row').forEach((row) => {
        const jid = row.querySelector('.pr-joueur').value;
        if (!jid) return;
        const did = row.querySelector('.pr-deck').value || null;
        const pl = parseInt(row.querySelector('.pr-place').value, 10);
        participants.push({ joueur_id: jid, deck_id: did, place: Number.isFinite(pl) ? pl : null });
      });
      if (participants.length < 2) return ctx.toast('Au moins 2 joueurs dans le pod.');
      store.updatePartie({ id: p.id, soiree_id: container.querySelector('#ep-soiree').value, participants });
      editing.partie = null; ctx.toast('Partie modifiée.'); ctx.refresh();
    };
  } else {
    container.querySelector('#ep-save').onclick = () => {
      const a = container.querySelector('#ep-a').value;
      const b = container.querySelector('#ep-b').value;
      if (!a || !b || a === b) return ctx.toast('Choisis deux joueurs différents.');
      const r = container.querySelector('#ep-res').value;
      const rA = r === 'A' ? 'V' : r === 'B' ? 'D' : 'N';
      const rB = r === 'B' ? 'V' : r === 'A' ? 'D' : 'N';
      store.updatePartie({
        id: p.id, soiree_id: container.querySelector('#ep-soiree').value,
        categorie: container.querySelector('#ep-cat').value,
        format: container.querySelector('#ep-format').value.trim(),
        participants: [{ joueur_id: a, deck_id: null, resultat: rA }, { joueur_id: b, deck_id: null, resultat: rB }],
      });
      editing.partie = null; ctx.toast('Partie modifiée.'); ctx.refresh();
    };
  }
}

// --- gestion joueurs / decks / saisons --------------------------------------
// Édition inline : `editing` retient l'entité en cours de modification ; il
// survit aux ctx.refresh() (état module) le temps que l'utilisateur enregistre
// ou annule.
const editing = { joueur: null, deck: null, saison: null, partie: null };

function gestionJoueurs(model) {
  return `<div class="form-card">
    <h2>Joueurs</h2>
    <div class="ajout-inline"><input type="text" id="jo-nom" placeholder="Nom du joueur"><button class="btn" id="jo-add">Ajouter</button></div>
    <ul class="mini-list">${model.joueurs.map((j) => ligneJoueur(j)).join('') || '<li class="empty">aucun</li>'}</ul>
  </div>`;
}
function ligneJoueur(j) {
  const actif = j.actif !== false;
  if (editing.joueur === j.id) {
    return `<li class="editing" data-id="${j.id}">
      <div class="ajout-inline">
        <input type="text" class="e-nom" value="${esc(j.nom)}">
        <label class="chk"><input type="checkbox" class="e-actif" ${actif ? 'checked' : ''}> actif</label>
        <button class="btn btn-mini" data-act="jo-save">Enregistrer</button>
        <button class="btn btn-mini" data-act="jo-cancel">Annuler</button>
      </div></li>`;
  }
  return `<li data-id="${j.id}">
    <span class="ml-lib">${esc(j.nom)}${actif ? '' : ' <small>inactif</small>'}</span>
    <span class="ml-actions">
      <button class="btn btn-mini" data-act="jo-edit">Modifier</button>
      <button class="btn btn-mini" data-act="jo-del">Supprimer</button>
    </span></li>`;
}

function gestionSaisons(model) {
  return `<div class="form-card">
    <h2>Saisons</h2>
    <div class="ajout-inline">
      <input type="text" id="sa-nom" placeholder="Nom (ex. Saison 2026)">
      <label class="chk"><input type="checkbox" id="sa-active" checked> active</label>
      <button class="btn" id="sa-add">Ajouter</button>
    </div>
    <ul class="mini-list">${model.saisons.map((s) => ligneSaison(s)).join('') || '<li class="empty">aucune</li>'}</ul>
  </div>`;
}
function ligneSaison(s) {
  if (editing.saison === s.id) {
    return `<li class="editing" data-id="${s.id}">
      <div class="ajout-inline">
        <input type="text" class="e-nom" value="${esc(s.nom)}">
        <label class="chk"><input type="checkbox" class="e-actif" ${s.active ? 'checked' : ''}> active</label>
        <button class="btn btn-mini" data-act="sa-save">Enregistrer</button>
        <button class="btn btn-mini" data-act="sa-cancel">Annuler</button>
      </div></li>`;
  }
  const etat = s.cloturee
    ? `<b>(clôturée${s.fin ? ' le ' + dateFr(s.fin) : ''})</b>${palmaresLigne(s.palmares)}`
    : (s.active ? ' <b>(active)</b>' : '');
  const actions = s.cloturee
    ? `<button class="btn btn-mini" data-act="sa-rouvrir">Rouvrir</button>
       <button class="btn btn-mini" data-act="sa-del">Supprimer</button>`
    : `<button class="btn btn-mini" data-act="sa-toggle">${s.active ? 'Désactiver' : 'Activer'}</button>
       <button class="btn btn-mini" data-act="sa-cloturer">Clôturer</button>
       <button class="btn btn-mini" data-act="sa-edit">Modifier</button>
       <button class="btn btn-mini" data-act="sa-del">Supprimer</button>`;
  return `<li data-id="${s.id}">
    <span class="ml-lib">${esc(s.nom)} ${etat}</span>
    <span class="ml-actions">${actions}</span></li>`;
}

// Ligne récap du palmarès figé à la clôture.
function palmaresLigne(p) {
  if (!p) return '';
  const bits = [];
  if (p.champion) bits.push(`🏆 ${esc(p.champion)}`);
  if (p.construit) bits.push(`⚔️ ${esc(p.construit)}`);
  if (p.limite) bits.push(`🎲 ${esc(p.limite)}`);
  return bits.length ? `<small>${bits.join(' · ')}</small>` : '';
}

// Calcule le snapshot des vainqueurs d'une saison au moment de la clôture.
function calcPalmares(model, saisonId) {
  const champ = classementCommander(model, saisonId).joueurs[0];
  const ec = classementElo(model, 'construit', saisonId)[0];
  const el = classementElo(model, 'limite', saisonId)[0];
  return {
    date: today(),
    champion: champ && champ.entite ? champ.entite.nom : null,
    construit: ec && ec.joueur ? ec.joueur.nom : null,
    limite: el && el.joueur ? el.joueur.nom : null,
  };
}

function gestionDecks(model) {
  return `<div class="form-card">
    <h2>Decks Commander</h2>
    <div class="fgrid">
      <div><label>Joueur</label><select id="de-joueur">${optJoueurs(model, true)}</select></div>
      <div><label>Nom du deck</label><input type="text" id="de-nom" placeholder="ex. Krenko Gobelins"></div>
      <div><label>Commandant</label><input type="text" id="de-cmd" placeholder="ex. Krenko, Mob Boss"></div>
      <div><label>Couleurs</label><input type="text" id="de-couleurs" placeholder="WUBRG (ex. RG)"></div>
    </div>
    <div style="margin-top:12px"><button class="btn" id="de-add">Ajouter le deck</button></div>
    <ul class="mini-list">${model.decks.map((d) => ligneDeck(d, model)).join('') || '<li class="empty">aucun</li>'}</ul>
  </div>`;
}
function ligneDeck(d, model) {
  if (editing.deck === d.id) {
    return `<li class="editing" data-id="${d.id}">
      <div class="fgrid">
        <div><label>Joueur</label><select class="e-joueur">${optJoueursSel(model, d.joueur_id)}</select></div>
        <div><label>Nom du deck</label><input type="text" class="e-nom" value="${esc(d.nom)}"></div>
        <div><label>Commandant</label><input type="text" class="e-cmd" value="${esc(d.commandant || '')}"></div>
        <div><label>Couleurs</label><input type="text" class="e-couleurs" value="${esc((d.couleurs || []).join(''))}"></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-mini" data-act="de-save">Enregistrer</button>
        <button class="btn btn-mini" data-act="de-cancel">Annuler</button>
      </div></li>`;
  }
  const jn = model.joueurs.find((j) => j.id === d.joueur_id);
  return `<li data-id="${d.id}">
    <span class="ml-lib">${esc(d.nom)} <small>${esc(d.commandant || '')} — ${esc(jn ? jn.nom : '?')}</small></span>
    <span class="ml-actions">
      <button class="btn btn-mini" data-act="de-edit">Modifier</button>
      <button class="btn btn-mini" data-act="de-del">Supprimer</button>
    </span></li>`;
}

function wireGestion(container, ctx, model) {
  container.querySelector('#jo-add').onclick = () => {
    const nom = container.querySelector('#jo-nom').value.trim();
    if (!nom) return;
    store.upsertJoueur({ nom }); ctx.toast('Joueur ajouté.'); ctx.refresh();
  };
  container.querySelector('#sa-add').onclick = () => {
    const nom = container.querySelector('#sa-nom').value.trim();
    if (!nom) return;
    store.upsertSaison({ nom, active: container.querySelector('#sa-active').checked, debut: today(), fin: null });
    ctx.toast('Saison ajoutée.'); ctx.refresh();
  };
  container.querySelector('#de-add').onclick = () => {
    const joueur_id = container.querySelector('#de-joueur').value;
    const nom = container.querySelector('#de-nom').value.trim();
    if (!joueur_id || !nom) return ctx.toast('Joueur + nom du deck requis.');
    store.upsertDeck({
      joueur_id, nom,
      commandant: container.querySelector('#de-cmd').value.trim(),
      couleurs: parseCouleurs(container.querySelector('#de-couleurs').value),
      format: 'commander',
    });
    ctx.toast('Deck ajouté.'); ctx.refresh();
  };

  // Actions d'édition/suppression déléguées sur les <li data-id>.
  container.querySelectorAll('.mini-list [data-act]').forEach((b) => {
    b.onclick = () => actionGestion(b, container, ctx, model);
  });
}

function actionGestion(btn, container, ctx, model) {
  const li = btn.closest('li[data-id]');
  const id = li && li.dataset.id;
  const val = (sel) => { const e = li.querySelector(sel); return e ? e.value : ''; };
  const chk = (sel) => { const e = li.querySelector(sel); return e ? e.checked : false; };
  switch (btn.dataset.act) {
    // --- joueurs ---
    case 'jo-edit': editing.joueur = id; ctx.refresh(); break;
    case 'jo-cancel': editing.joueur = null; ctx.refresh(); break;
    case 'jo-save': {
      const nom = val('.e-nom').trim();
      if (!nom) return ctx.toast('Nom requis.');
      store.upsertJoueur({ id, nom, actif: chk('.e-actif') });
      editing.joueur = null; ctx.toast('Joueur modifié.'); ctx.refresh(); break;
    }
    case 'jo-del': {
      const n = store.refsJoueur(id);
      if (n) return ctx.toast(`Impossible : joueur utilisé dans ${n} deck(s)/partie(s).`);
      if (!confirm('Supprimer ce joueur ?')) return;
      store.removeJoueur(id); ctx.toast('Joueur supprimé.'); ctx.refresh(); break;
    }
    // --- decks ---
    case 'de-edit': editing.deck = id; ctx.refresh(); break;
    case 'de-cancel': editing.deck = null; ctx.refresh(); break;
    case 'de-save': {
      const joueur_id = val('.e-joueur');
      const nom = val('.e-nom').trim();
      if (!joueur_id || !nom) return ctx.toast('Joueur + nom du deck requis.');
      store.upsertDeck({
        id, joueur_id, nom,
        commandant: val('.e-cmd').trim(),
        couleurs: parseCouleurs(val('.e-couleurs')),
      });
      editing.deck = null; ctx.toast('Deck modifié.'); ctx.refresh(); break;
    }
    case 'de-del': {
      const n = store.refsDeck(id);
      if (n) return ctx.toast(`Impossible : deck utilisé dans ${n} partie(s).`);
      if (!confirm('Supprimer ce deck ?')) return;
      store.removeDeck(id); ctx.toast('Deck supprimé.'); ctx.refresh(); break;
    }
    // --- saisons ---
    case 'sa-edit': editing.saison = id; ctx.refresh(); break;
    case 'sa-cancel': editing.saison = null; ctx.refresh(); break;
    case 'sa-toggle': {
      const s = model.saisons.find((x) => x.id === id);
      store.upsertSaison({ id, active: !s.active });
      ctx.toast(s.active ? 'Saison désactivée.' : 'Saison activée.'); ctx.refresh(); break;
    }
    case 'sa-save': {
      const nom = val('.e-nom').trim();
      if (!nom) return ctx.toast('Nom requis.');
      store.upsertSaison({ id, nom, active: chk('.e-actif') });
      editing.saison = null; ctx.toast('Saison modifiée.'); ctx.refresh(); break;
    }
    case 'sa-del': {
      const n = store.refsSaison(id);
      if (n) return ctx.toast(`Impossible : saison utilisée dans ${n} soirée(s)/partie(s).`);
      if (!confirm('Supprimer cette saison ?')) return;
      store.removeSaison(id); ctx.toast('Saison supprimée.'); ctx.refresh(); break;
    }
    case 'sa-cloturer': {
      if (!confirm('Clôturer cette saison ? Elle sera désactivée et son palmarès figé.')) return;
      store.cloturerSaison(id, calcPalmares(model, id));
      ctx.toast('Saison clôturée.'); ctx.refresh(); break;
    }
    case 'sa-rouvrir': {
      store.rouvrirSaison(id); ctx.toast('Saison rouverte.'); ctx.refresh(); break;
    }
  }
}

// "RG" / "wubrg" -> ['R','G'] (lettres de mana valides uniquement).
function parseCouleurs(s) {
  return String(s || '').toUpperCase().replace(/[^WUBRG]/g, '').split('').filter(Boolean);
}

// --- options <select> -------------------------------------------------------
function optJoueurs(model, vide) {
  return (vide ? '<option value="">— joueur —</option>' : '')
    + model.joueurs.map((j) => `<option value="${j.id}">${esc(j.nom)}</option>`).join('');
}
function optJoueursSel(model, sel) {
  return model.joueurs.map((j) => `<option value="${j.id}" ${j.id === sel ? 'selected' : ''}>${esc(j.nom)}</option>`).join('');
}
function optSaisons(model) {
  return model.saisons.map((s) => `<option value="${s.id}" ${s.active ? 'selected' : ''}>${esc(s.nom)}</option>`).join('');
}
function optSoirees(model) {
  return store.soirees().map((e) => `<option value="${e.id}">${dateFr(e.date)}${e.lieu ? ' · ' + esc(e.lieu) : ''}</option>`).join('');
}
