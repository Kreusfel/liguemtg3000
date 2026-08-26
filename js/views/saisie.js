// saisie.js — écran organisateur, allégé : publication, création de soirée,
// saisie des parties (onglets Commander / Construit / Limité) et gestion des
// saisons. Les joueurs s'éditent sur la page Joueurs, les decks sur la page
// Decks, les soirées et parties sur l'Historique.

import * as store from '../store.js';
import { publier, peutPublier } from '../github.js';
import { classementCommander, classementElo } from '../ranking.js';
import { esc, dateFr, today } from '../util.js';
import { optSaisons, optSoirees, rowPod, creerRow, brancherPodRow } from './_shared.js';

export function renderSaisie(container, ctx) {
  const model = store.getModel();

  container.innerHTML = `
    ${barrePublication()}
    <div class="form-card">
      <h2>Nouvelle soirée</h2>
      <div class="fgrid">
        <div><label>Date</label><input type="date" id="so-date" value="${today()}"></div>
        <div><label>Titre <span class="opt">(optionnel)</span></label><input type="text" id="so-titre" placeholder="ex. Soirée Spéciale Noël"></div>
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

    ${gestionSaisons(model)}
  `;

  wirePublication(container, ctx);
  wireSoiree(container, ctx);
  wireSaisieTabs(container, ctx, model);
  renderPanel(container, ctx, model);
  wireSaisons(container, ctx, model);
}

// --- onglets de saisie (un type de partie à la fois) ------------------------
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
      renderPanel(container, ctx, model);
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
    const titre = container.querySelector('#so-titre').value.trim();
    const lieu = container.querySelector('#so-lieu').value.trim();
    const saison_id = container.querySelector('#so-saison').value || null;
    if (!date) return ctx.toast('Renseigne une date.');
    store.addSoiree({ date, titre, lieu, saison_id, notes: '' });
    ctx.toast('Soirée créée.');
    ctx.refresh();
  };
  container.querySelector('#so-dup').onclick = () => {
    const derniere = store.soirees()[0];
    if (!derniere) return ctx.toast('Aucune soirée à dupliquer.');
    store.addSoiree({ date: today(), lieu: derniere.lieu || '', saison_id: derniere.saison_id || null, notes: '' });
    presetPresents = [...new Set(store.partiesDe(derniere.id).flatMap((p) => p.participants.map((x) => x.joueur_id)))];
    ctx.toast(presetPresents.length ? 'Soirée dupliquée — présents pré-cochés (onglets 1v1).' : 'Soirée dupliquée.');
    ctx.refresh();
  };
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
      <div><label>Soirée</label><select id="li-soiree">${optSoirees()}</select></div>
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
    <p class="mini">Enregistre plusieurs pods de la même soirée d'un coup. Place 1 = vainqueur du pod. Un joueur peut jouer un deck emprunté.</p>
    <div class="fgrid"><div><label>Soirée</label><select id="co-soiree">${optSoirees()}</select></div></div>
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

  ajouterPod();
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

// --- saisons ----------------------------------------------------------------
let editSaison = null;   // id de la saison en cours d'édition

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
  if (editSaison === s.id) {
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

function palmaresLigne(p) {
  if (!p) return '';
  const bits = [];
  if (p.champion) bits.push(`🏆 ${esc(p.champion)}`);
  if (p.construit) bits.push(`⚔️ ${esc(p.construit)}`);
  if (p.limite) bits.push(`🎲 ${esc(p.limite)}`);
  return bits.length ? `<small>${bits.join(' · ')}</small>` : '';
}

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

function wireSaisons(container, ctx, model) {
  container.querySelector('#sa-add').onclick = () => {
    const nom = container.querySelector('#sa-nom').value.trim();
    if (!nom) return;
    store.upsertSaison({ nom, active: container.querySelector('#sa-active').checked, debut: today(), fin: null });
    ctx.toast('Saison ajoutée.'); ctx.refresh();
  };
  container.querySelectorAll('.mini-list [data-act]').forEach((b) => { b.onclick = () => actionSaison(b, container, ctx, model); });
}

function actionSaison(btn, container, ctx, model) {
  const li = btn.closest('li[data-id]');
  const id = li && li.dataset.id;
  const val = (sel) => { const e = li.querySelector(sel); return e ? e.value : ''; };
  const chk = (sel) => { const e = li.querySelector(sel); return e ? e.checked : false; };
  switch (btn.dataset.act) {
    case 'sa-edit': editSaison = id; ctx.refresh(); break;
    case 'sa-cancel': editSaison = null; ctx.refresh(); break;
    case 'sa-toggle': {
      const s = model.saisons.find((x) => x.id === id);
      store.upsertSaison({ id, active: !s.active });
      ctx.toast(s.active ? 'Saison désactivée.' : 'Saison activée.'); ctx.refresh(); break;
    }
    case 'sa-save': {
      const nom = val('.e-nom').trim();
      if (!nom) return ctx.toast('Nom requis.');
      store.upsertSaison({ id, nom, active: chk('.e-actif') });
      editSaison = null; ctx.toast('Saison modifiée.'); ctx.refresh(); break;
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
