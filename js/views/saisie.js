// saisie.js — console de saisie organisateur (refonte 2026-11) :
// barre de publication collante, carte « Soirée en cours » (un seul sélecteur de
// soirée pour tous les onglets), switch de format mana-codé, surface de saisie
// (Commander / Construit / Limité) et Saisons repliées en tiroir.
// Nouveauté : on peut créer un joueur ou un deck sans quitter la page (modale).

import * as store from '../store.js';
import { publier, peutPublier } from '../github.js';
import { classementCommander, classementElo } from '../ranking.js';
import { esc, dateFr, today } from '../util.js';
import { optJoueurs, optSaisons, rowPod, creerRow, brancherPodRow } from './shared.js';

// --- petites icônes inline (Feather-like) ----------------------------------
const IC = {
  up: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 19V6M5 12l7-7 7 7"/></svg>',
  reload: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  player: '<svg class="ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.4"/><path d="M4 20c0-3 2.4-5 5-5s5 2 5 5M18 9v6M15 12h6"/></svg>',
  deck: '<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="3" width="12" height="16" rx="2"/><path d="M8 7h4M8 11h4M19 8v6M16 11h6"/></svg>',
  cal: '<svg class="ci" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  pin: '<svg class="ci" viewBox="0 0 24 24"><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  season: '<svg class="ci" viewBox="0 0 24 24"><path d="M3 7h18v13H3zM3 7l3-4h12l3 4"/></svg>',
  caret: '<svg class="caret" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  crown: '<svg class="crown" viewBox="0 0 24 24"><path d="M3 7l4 4 5-7 5 7 4-4-2 11H5z"/></svg>',
};
const MANA = { W: '#f2c94c', U: '#3d8be0', B: '#7a5aa8', R: '#eb5757', G: '#37b26d' };

export function renderSaisie(container, ctx) {
  const model = store.getModel();

  container.innerHTML = `<div class="saisie-page">
    ${pubBar()}
    ${soireeCard(model)}
    ${newSoireeForm(model)}
    <p class="eyebrow">Saisie des parties</p>
    ${modesBar()}
    <section class="entry"><div id="saisie-panel"></div></section>
    ${saisonsDrawer(model)}
    ${modalMarkup(model)}
  </div>`;

  wirePublication(container, ctx);
  wireSoiree(container, ctx, model);
  wireModal(container, ctx, model);
  wireSaisieTabs(container, ctx, model);
  renderPanel(container, ctx, model);
  wireSaisons(container, ctx, model);
}

/* ========================================================================== *
 *  Barre de publication (collante)
 * ========================================================================== */
function pubBar() {
  const dirty = store.isDirty();
  const ok = peutPublier();
  return `<div class="pubbar" id="pubbar">
    <div class="pb-state ${dirty ? '' : 'clean'}">
      <span class="pb-dot"></span>
      <span class="pb-txt">${dirty ? 'Modifications non publiées' : 'À jour avec le dépôt'}</span>
    </div>
    <div class="pb-actions">
      <button class="btn btn-mini" id="pub-reload" title="Abandonner le brouillon et recharger le dépôt">${IC.reload} Recharger le dépôt</button>
      <button class="btn btn-noir" id="pub-go" ${dirty && ok ? '' : 'disabled'}>${IC.up} Publier sur GitHub</button>
    </div>
    ${ok ? '' : '<div class="pub-warn">⚠️ Token/dépôt non configurés — voir <b>Réglages</b> pour pouvoir publier.</div>'}
  </div>`;
}

function syncPubBar(container) {
  const dirty = store.isDirty(), ok = peutPublier();
  const st = container.querySelector('.pb-state');
  if (st) { st.classList.toggle('clean', !dirty); st.querySelector('.pb-txt').textContent = dirty ? 'Modifications non publiées' : 'À jour avec le dépôt'; }
  const go = container.querySelector('#pub-go');
  if (go) go.disabled = !(dirty && ok);
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
      btn.disabled = false; btn.innerHTML = `${IC.up} Publier sur GitHub`;
    }
  };
  container.querySelector('#pub-reload').onclick = async () => {
    if (store.isDirty() && !confirm('Abandonner les modifications non publiées et recharger le dépôt ?')) return;
    await store.rechargerDepuisFichier();
    ctx.toast('Rechargé depuis le dépôt.');
    ctx.refresh();
  };
}

/* ========================================================================== *
 *  Soirée en cours (sélecteur unique) + nouvelle soirée / duplication
 * ========================================================================== */
let newsoOpen = false;              // formulaire « nouvelle soirée » déplié ?
let presetPresents = [];            // présents à pré-cocher en Construit (après duplication)

function optSoireesFull() {
  return store.soirees().map((e) =>
    `<option value="${e.id}">${dateFr(e.date)}${e.titre ? ' · ' + esc(e.titre) : ''}${e.lieu ? ' · ' + esc(e.lieu) : ''}</option>`).join('');
}

function soireeCard(model) {
  const list = store.soirees();
  return `<section class="card soiree">
    <div class="soiree-main">
      <p class="eyebrow">Soirée en cours de saisie</p>
      ${list.length
        ? `<div class="soiree-pick"><select id="so-select" aria-label="Choisir la soirée">${optSoireesFull()}</select></div>
           <div class="chips" id="so-chips">${soireeChips(model, list[0].id)}</div>`
        : `<p class="soiree-title">Aucune soirée</p><p class="mini">Crée une soirée pour commencer à saisir des parties.</p>`}
    </div>
    <div class="soiree-aside">
      <button class="btn" id="so-new">${IC.plus} Nouvelle soirée</button>
      <button class="btn btn-mini" id="so-dup" title="Recrée une soirée (même lieu/saison, aujourd'hui) et pré-coche les présents de la dernière">⧉ Dupliquer la dernière</button>
      <div class="aside-add">
        <button class="btn btn-mini" id="add-player">${IC.player} Joueur</button>
        <button class="btn btn-mini" id="add-deck">${IC.deck} Deck</button>
      </div>
    </div>
  </section>`;
}

function soireeChips(model, soireeId) {
  const e = model.soirees.find((s) => s.id === soireeId);
  if (!e) return '';
  const sn = Object.fromEntries(model.saisons.map((s) => [s.id, s.nom]));
  const n = model.parties.filter((p) => p.soiree_id === soireeId).length;
  const bits = [`<span class="chip">${IC.cal}${dateFr(e.date)}</span>`];
  if (e.titre) bits.push(`<span class="chip">${esc(e.titre)}</span>`);
  if (e.lieu) bits.push(`<span class="chip">${IC.pin}${esc(e.lieu)}</span>`);
  if (e.saison_id && sn[e.saison_id]) bits.push(`<span class="chip">${IC.season}${esc(sn[e.saison_id])}</span>`);
  bits.push(`<span class="chip count"><b>${n}</b>&nbsp;partie${n > 1 ? 's' : ''} saisie${n > 1 ? 's' : ''}</span>`);
  return bits.join('');
}

function currentSoireeId(container) {
  const s = container.querySelector('#so-select');
  return s ? s.value : '';
}

function refreshSoireeSelect(container, model, selectId) {
  const host = container.querySelector('.soiree-main');
  if (!host) return;
  host.innerHTML = `<p class="eyebrow">Soirée en cours de saisie</p>
    <div class="soiree-pick"><select id="so-select" aria-label="Choisir la soirée">${optSoireesFull()}</select></div>
    <div class="chips" id="so-chips"></div>`;
  const sel = container.querySelector('#so-select');
  if (selectId) sel.value = selectId;
  wireSoireeSelect(container, model);
  container.querySelector('#so-chips').innerHTML = soireeChips(model, sel.value);
}

function wireSoireeSelect(container, model) {
  const sel = container.querySelector('#so-select');
  if (sel) sel.onchange = () => { container.querySelector('#so-chips').innerHTML = soireeChips(model, sel.value); };
}

function newSoireeForm(model) {
  return `<section class="newso" id="newso" ${newsoOpen ? '' : 'hidden'}>
    <p class="eyebrow">Créer une soirée</p>
    <div class="fgrid">
      <div><label>Date</label><input type="date" id="so-date" value="${today()}"></div>
      <div><label>Titre <span class="opt">(optionnel)</span></label><input type="text" id="so-titre" placeholder="ex. Soirée Spéciale Noël"></div>
      <div><label>Lieu</label><input type="text" id="so-lieu" placeholder="Chez… / boutique"></div>
      <div><label>Saison</label><select id="so-saison">${optSaisons(model)}</select></div>
    </div>
    <div class="newso-actions">
      <button class="btn btn-noir btn-mini" id="so-create">Créer la soirée</button>
      <button class="btn btn-mini" id="so-cancel">Annuler</button>
    </div>
  </section>`;
}

function wireSoiree(container, ctx, model) {
  wireSoireeSelect(container, model);

  const newso = container.querySelector('#newso');
  container.querySelector('#so-new').onclick = () => {
    newsoOpen = !newsoOpen; newso.hidden = !newsoOpen;
    if (newsoOpen) newso.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  container.querySelector('#so-cancel').onclick = () => { newsoOpen = false; newso.hidden = true; };

  container.querySelector('#so-create').onclick = () => {
    const date = container.querySelector('#so-date').value;
    const titre = container.querySelector('#so-titre').value.trim();
    const lieu = container.querySelector('#so-lieu').value.trim();
    const saison_id = container.querySelector('#so-saison').value || null;
    if (!date) return ctx.toast('Renseigne une date.');
    const id = store.addSoiree({ date, titre, lieu, saison_id, notes: '' });
    newsoOpen = false; newso.hidden = true;
    refreshSoireeSelect(container, model, id);
    syncPubBar(container);
    ctx.toast('Soirée créée.');
  };

  container.querySelector('#so-dup').onclick = () => {
    const derniere = store.soirees()[0];
    if (!derniere) return ctx.toast('Aucune soirée à dupliquer.');
    const id = store.addSoiree({ date: today(), lieu: derniere.lieu || '', saison_id: derniere.saison_id || null, notes: '' });
    presetPresents = [...new Set(store.partiesDe(derniere.id).flatMap((p) => p.participants.map((x) => x.joueur_id)))];
    refreshSoireeSelect(container, model, id);
    syncPubBar(container);
    if (saisieTab === 'construit') renderPanel(container, ctx, model);   // ré-applique les présents pré-cochés
    ctx.toast(presetPresents.length ? 'Soirée dupliquée — présents pré-cochés (Construit).' : 'Soirée dupliquée.');
  };
}

/* ========================================================================== *
 *  Switch de format
 * ========================================================================== */
const SAISIE_TABS = [
  { id: 'commander', k: 'Commander', sub: 'pods · classement points' },
  { id: 'construit', k: 'Construit', sub: '1v1 · rondes auto · ELO' },
  { id: 'limite', k: 'Limité', sub: '1v1 · saisie manuelle · ELO' },
];
let saisieTab = 'commander';

function modesBar() {
  return `<nav class="modes" role="tablist" aria-label="Type de partie">${SAISIE_TABS.map((t) =>
    `<button class="mode" role="tab" type="button" data-m="${t.id}" aria-selected="${t.id === saisieTab}">
      <span class="m-k"><span class="pip"></span>${t.k}</span>
      <span class="m-sub">${t.sub}</span>
    </button>`).join('')}</nav>`;
}

function wireSaisieTabs(container, ctx, model) {
  container.querySelectorAll('.modes [data-m]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.m === saisieTab) return;
      saisieTab = b.dataset.m;
      container.querySelectorAll('.modes [data-m]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.m === saisieTab)));
      renderPanel(container, ctx, model);
    };
  });
}

function renderPanel(container, ctx, model) {
  const host = container.querySelector('#saisie-panel');
  if (saisieTab === 'commander') { host.innerHTML = formCommander(); wireCommander(container, ctx, model); }
  else if (saisieTab === 'limite') { host.innerHTML = formLimite(); wireLimite(container, ctx, model); }
  else { host.innerHTML = form1v1(model); wire1v1(container, ctx, model); }
}

/* ========================================================================== *
 *  Panneau LIMITÉ — saisie manuelle (pairings + score A/B + archétype)
 * ========================================================================== */
function formLimite() {
  return `<div class="panel" id="p-limite">
    <div class="panel-head">
      <div>
        <h2>Soirée Limité — matchs 1v1</h2>
        <p class="panel-note">Saisis chaque match librement : les deux joueurs, leur couleurs/archétype et le score.
          Le <b>vainqueur est déduit du score</b> (score égal = nul). Gagner le BO rapporte le plus, mais les <b>manches comptent</b> dans l'ELO.</p>
      </div>
      <div class="fmt-field"><label>Format</label><input type="text" id="li-format" placeholder="scellé, draft…"></div>
    </div>
    <div class="matchs" id="li-matchs"></div>
    <div class="entry-foot">
      <button class="btn btn-mini" id="li-add" type="button">${IC.plus} Ajouter un match</button>
      <span class="mini" id="li-info"></span>
      <button class="btn btn-noir save" id="li-save" type="button">Enregistrer les matchs</button>
    </div>
  </div>`;
}

function optJoueursNew(model, selId) {
  return '<option value="">— joueur —</option>'
    + model.joueurs.map((j) => `<option value="${j.id}" ${j.id === selId ? 'selected' : ''}>${esc(j.nom)}</option>`).join('')
    + '<option value="__new">＋ Nouveau joueur…</option>';
}

function pips(txt) {
  const up = String(txt || '').toUpperCase();
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => up.indexOf(c) >= 0)
    .map((c) => `<i style="background:${MANA[c]}"></i>`).join('');
}

function matchHTML(model, m) {
  m = m || { a: '', b: '', sa: '', sb: '', na: '', nb: '' };
  return `<div class="match">
    <div class="seat a">
      <div class="seat-name"><select class="pa" data-role="player">${optJoueursNew(model, m.a)}</select></div>
      <div class="arch"><span class="arch-pips">${pips(m.na)}</span><input class="arch-in na" type="text" value="${esc(m.na)}" placeholder="couleurs / archétype"></div>
    </div>
    <div class="score">
      <div class="stepper"><input class="sval ssa" inputmode="numeric" value="${m.sa}">
        <div class="sbtns"><button class="sbtn" type="button" data-s="a" data-d="-1">−</button><button class="sbtn" type="button" data-s="a" data-d="1">+</button></div></div>
      <span class="dash">–</span>
      <div class="stepper"><input class="sval ssb" inputmode="numeric" value="${m.sb}">
        <div class="sbtns"><button class="sbtn" type="button" data-s="b" data-d="-1">−</button><button class="sbtn" type="button" data-s="b" data-d="1">+</button></div></div>
    </div>
    <div class="seat b">
      <div class="seat-name"><select class="pb" data-role="player">${optJoueursNew(model, m.b)}</select></div>
      <div class="arch"><span class="arch-pips">${pips(m.nb)}</span><input class="arch-in nb" type="text" value="${esc(m.nb)}" placeholder="couleurs / archétype"></div>
    </div>
    <button class="rm" type="button" aria-label="retirer le match">${IC.x}</button>
    <div class="verdict"></div>
  </div>`;
}

// Met à jour le verdict (vainqueur déduit du score) et le surlignage.
function limVerdict(row, model) {
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const sa = parseInt(row.querySelector('.ssa').value, 10);
  const sb = parseInt(row.querySelector('.ssb').value, 10);
  const a = row.querySelector('.pa').value, b = row.querySelector('.pb').value;
  const v = row.querySelector('.verdict');
  row.classList.remove('win-a', 'win-b');
  const incomplet = !a || !b || a === '__new' || b === '__new' || Number.isNaN(sa) || Number.isNaN(sb);
  if (incomplet) { v.innerHTML = '<span>match à compléter</span>'; return; }
  if (sa === sb) { v.innerHTML = `<span>match nul <b>${sa}–${sb}</b></span>`; return; }
  if (sa > sb) { row.classList.add('win-a'); v.innerHTML = `${IC.crown}<span><b>${esc(jn[a] || '?')}</b> gagne le BO ${sa}–${sb}</span>`; }
  else { row.classList.add('win-b'); v.innerHTML = `${IC.crown}<span><b>${esc(jn[b] || '?')}</b> gagne le BO ${sb}–${sa}</span>`; }
}

function wireLimite(container, ctx, model) {
  const host = container.querySelector('#li-matchs');

  const wireRow = (row) => {
    row.querySelectorAll('.sbtn').forEach((btn) => {
      btn.onclick = () => {
        const inp = row.querySelector(btn.dataset.s === 'a' ? '.ssa' : '.ssb');
        let n = parseInt(inp.value, 10); if (Number.isNaN(n)) n = 0;
        n += parseInt(btn.dataset.d, 10); if (n < 0) n = 0;
        inp.value = n; limVerdict(row, model);
      };
    });
    row.querySelectorAll('.ssa, .ssb').forEach((el) => { el.oninput = () => limVerdict(row, model); });
    row.querySelector('.na').oninput = (e) => { row.querySelector('.seat.a .arch-pips').innerHTML = pips(e.target.value); };
    row.querySelector('.nb').oninput = (e) => { row.querySelector('.seat.b .arch-pips').innerHTML = pips(e.target.value); };
    row.querySelectorAll('.pa, .pb').forEach((s) => {
      s.onchange = () => {
        if (s.value === '__new') { modalApi.openPlayer && modalApi.openPlayer(s); return; }
        limVerdict(row, model);
      };
    });
    row.querySelector('.rm').onclick = () => { if (host.children.length > 1) { row.remove(); updateInfo(); } else ctx.toast('Au moins un match.'); };
    limVerdict(row, model);
  };
  const addRow = (m) => { const row = creerRow(matchHTML(model, m)); host.appendChild(row); wireRow(row); return row; };
  const updateInfo = () => {
    const n = host.children.length;
    container.querySelector('#li-info').textContent = `${n} match${n > 1 ? 's' : ''} prêt${n > 1 ? 's' : ''}`;
  };

  addRow(); addRow(); updateInfo();

  container.querySelector('#li-add').onclick = () => { const row = addRow(); updateInfo(); row.querySelector('.pa').focus(); };

  container.querySelector('#li-save').onclick = () => {
    const soiree_id = currentSoireeId(container);
    if (!soiree_id) return ctx.toast('Crée d\'abord une soirée.');
    const format = container.querySelector('#li-format').value.trim();
    const list = [];
    let invalide = 0;
    host.querySelectorAll('.match').forEach((row) => {
      const a = row.querySelector('.pa').value, b = row.querySelector('.pb').value;
      const saRaw = row.querySelector('.ssa').value.trim(), sbRaw = row.querySelector('.ssb').value.trim();
      if (!a && !b && saRaw === '' && sbRaw === '') return;                 // ligne vide → ignorée
      if (!a || !b || a === '__new' || b === '__new' || a === b) { invalide++; return; }
      const sa = parseInt(saRaw, 10), sb = parseInt(sbRaw, 10);
      if (!Number.isFinite(sa) || !Number.isFinite(sb)) { invalide++; return; }
      const na = row.querySelector('.na').value.trim(), nb = row.querySelector('.nb').value.trim();
      const rA = sa > sb ? 'V' : sa < sb ? 'D' : 'N';
      const rB = sb > sa ? 'V' : sb < sa ? 'D' : 'N';
      const pA = { joueur_id: a, deck_id: null, resultat: rA, score: sa };
      const pB = { joueur_id: b, deck_id: null, resultat: rB, score: sb };
      if (na) pA.note = na;
      if (nb) pB.note = nb;
      list.push({ soiree_id, type: '1v1', categorie: 'limite', format, participants: [pA, pB] });
    });
    if (invalide) return ctx.toast('Chaque match : 2 joueurs différents et les 2 scores.');
    if (!list.length) return ctx.toast('Renseigne au moins un match.');
    const n = store.addParties(list);
    ctx.toast(`${n} match${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''}.`);
    ctx.refresh();
  };
}

/* ========================================================================== *
 *  Panneau CONSTRUIT — round-robin (chacun affronte chacun)
 * ========================================================================== */
function form1v1(model) {
  return `<div class="panel" id="p-construit">
    <div class="panel-head">
      <div>
        <h2>Soirée Construit — matchs 1v1</h2>
        <p class="panel-note">Coche les présents, <b>génère toutes les rondes</b> (chacun affronte chacun), indique le vainqueur de chaque match, puis enregistre tout d'un coup. Les matchs comptent en <b>ELO Construit</b>.</p>
      </div>
      <div class="fmt-field"><label>Format</label><input type="text" id="co-format" placeholder="pauper, modern…"></div>
    </div>
    <label style="margin-top:14px">Joueurs présents</label>
    <div class="chk-joueurs" id="li-joueurs">
      ${model.joueurs.map((j) => `<label class="chk"><input type="checkbox" value="${j.id}"> ${esc(j.nom)}</label>`).join('')
        || '<span class="empty">aucun joueur</span>'}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-mini" id="co-gen" type="button">Générer toutes les rondes</button>
      <span class="mini" id="co-geninfo"></span>
    </div>
    <div id="co-matchs" class="match-list"></div>
    <div class="entry-foot"><button class="btn btn-noir save" id="co-save" type="button" disabled>Enregistrer les matchs</button></div>
  </div>`;
}

function wire1v1(container, ctx, model) {
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const matchs = container.querySelector('#co-matchs');
  const save = container.querySelector('#co-save');
  const info = container.querySelector('#co-geninfo');

  if (presetPresents.length) {
    container.querySelectorAll('#li-joueurs input').forEach((i) => { if (presetPresents.includes(i.value)) i.checked = true; });
    presetPresents = [];
  }

  container.querySelector('#co-gen').onclick = () => {
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
    const soiree_id = currentSoireeId(container);
    if (!soiree_id) return ctx.toast('Crée d\'abord une soirée.');
    const format = container.querySelector('#co-format').value.trim();
    const list = [];
    container.querySelectorAll('#co-matchs .match-row').forEach((row) => {
      const res = row.querySelector('.mr-res').value;
      if (!res) return;
      const a = row.dataset.a, b = row.dataset.b;
      const rA = res === 'A' ? 'V' : res === 'B' ? 'D' : 'N';
      const rB = res === 'B' ? 'V' : res === 'A' ? 'D' : 'N';
      list.push({
        soiree_id, type: '1v1', categorie: 'construit', format,
        participants: [{ joueur_id: a, deck_id: null, resultat: rA }, { joueur_id: b, deck_id: null, resultat: rB }],
      });
    });
    if (!list.length) return ctx.toast('Renseigne au moins un résultat.');
    const n = store.addParties(list);
    ctx.toast(`${n} match${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''}.`);
    ctx.refresh();
  };
}

/* ========================================================================== *
 *  Panneau COMMANDER — pods (inchangé, via shared.rowPod)
 * ========================================================================== */
function formCommander() {
  return `<div class="panel" id="p-commander">
    <div class="panel-head">
      <div>
        <h2>Soirée Commander — pods</h2>
        <p class="panel-note">Enregistre plusieurs pods de la même soirée d'un coup. <b>Place 1 = vainqueur</b> du pod. Un joueur peut jouer un deck emprunté.</p>
      </div>
    </div>
    <div id="co-pods" class="pods-groupe"></div>
    <div style="margin-top:10px"><button class="btn btn-mini" id="co-add-pod" type="button">+ Ajouter un pod</button></div>
    <div class="entry-foot"><button class="btn btn-noir save" id="co-save-pods" type="button">Enregistrer tous les pods</button></div>
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

  const renumeroter = () => { wrap.querySelectorAll('.pod-card .pod-titre').forEach((b, i) => { b.textContent = `Pod ${i + 1}`; }); };
  const brancherCard = (card) => {
    card.querySelectorAll('.pod-row').forEach(brancherPodRow);
    card.querySelector('.co-add-row').onclick = () => {
      const row = creerRow(rowPod(model));
      card.querySelector('.pod-rows').appendChild(row);
      brancherPodRow(row);
    };
    card.querySelector('.co-del-pod').onclick = () => { if (wrap.children.length > 1) { card.remove(); renumeroter(); } };
  };
  const ajouterPod = () => { const card = creerRow(podCard(model)); wrap.appendChild(card); brancherCard(card); renumeroter(); };

  ajouterPod();
  container.querySelector('#co-add-pod').onclick = ajouterPod;

  container.querySelector('#co-save-pods').onclick = () => {
    const soiree_id = currentSoireeId(container);
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

/* ========================================================================== *
 *  Ajout joueur / deck sans quitter la page (modale)
 * ========================================================================== */
const modalApi = {};   // exposé pour l'option « ＋ Nouveau joueur… » des listes Limité

function modalMarkup(model) {
  const cols = [['W', '#f2c94c'], ['U', '#3d8be0'], ['B', '#7a5aa8'], ['R', '#eb5757'], ['G', '#37b26d']];
  return `<div class="overlay" id="overlay" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true">
      <form class="mform" id="formPlayer">
        <h3>Nouveau joueur</h3>
        <label class="lbl" for="np-nom">Nom</label>
        <input id="np-nom" type="text" placeholder="Prénom / pseudo">
        <label class="chk-inline"><input type="checkbox" id="np-actif" checked> joueur actif</label>
        <div class="mfoot">
          <button type="button" class="btn btn-mini mcancel">Annuler</button>
          <button type="submit" class="btn btn-noir btn-mini">Ajouter le joueur</button>
        </div>
      </form>
      <form class="mform" id="formDeck" hidden>
        <h3>Nouveau deck</h3>
        <div class="fgrid">
          <div><label for="nd-owner">Propriétaire</label><select id="nd-owner">${model.joueurs.map((j) => `<option value="${j.id}">${esc(j.nom)}</option>`).join('')}</select></div>
          <div><label for="nd-fmt">Format</label><input id="nd-fmt" type="text" value="commander"></div>
        </div>
        <label for="nd-nom">Nom du deck</label>
        <input id="nd-nom" type="text" placeholder="ex. Krenko Gobelins">
        <label for="nd-cmd">Commandant</label>
        <input id="nd-cmd" type="text" placeholder="ex. Krenko, Mob Boss">
        <label>Couleurs</label>
        <div class="pips-pick" id="nd-cols">
          ${cols.map(([c, hex]) => `<button type="button" class="pp" data-c="${c}" style="--m:${hex}">${c}</button>`).join('')}
        </div>
        <div class="mfoot">
          <button type="button" class="btn btn-mini mcancel">Annuler</button>
          <button type="submit" class="btn btn-noir btn-mini">Ajouter le deck</button>
        </div>
      </form>
    </div>
  </div>`;
}

function wireModal(container, ctx, model) {
  const overlay = container.querySelector('#overlay');
  const formPlayer = container.querySelector('#formPlayer');
  const formDeck = container.querySelector('#formDeck');
  let pendingSelect = null;   // la liste Limité à qui rendre le joueur créé (ou null)

  // Répercute un ajout de joueur/deck sur toutes les listes présentes, sans
  // perdre la saisie en cours.
  const onRosterChange = () => {
    container.querySelectorAll('#saisie-panel .match .pa, #saisie-panel .match .pb').forEach((s) => {
      const v = s.value && s.value !== '__new' ? s.value : '';
      s.innerHTML = optJoueursNew(model, v);
    });
    container.querySelectorAll('#saisie-panel .pod-row').forEach((row) => refreshPodRow(row, model));
    const chk = container.querySelector('#li-joueurs');
    if (chk) {
      const checked = new Set([...chk.querySelectorAll('input:checked')].map((i) => i.value));
      chk.innerHTML = model.joueurs.map((j) => `<label class="chk"><input type="checkbox" value="${j.id}" ${checked.has(j.id) ? 'checked' : ''}> ${esc(j.nom)}</label>`).join('')
        || '<span class="empty">aucun joueur</span>';
    }
    const ow = container.querySelector('#nd-owner');
    if (ow) { const v = ow.value; ow.innerHTML = model.joueurs.map((j) => `<option value="${j.id}" ${j.id === v ? 'selected' : ''}>${esc(j.nom)}</option>`).join(''); }
    syncPubBar(container);
  };

  const open = (which, origin) => {
    pendingSelect = origin || null;
    formPlayer.hidden = which !== 'player';
    formDeck.hidden = which !== 'deck';
    overlay.classList.add('show'); overlay.setAttribute('aria-hidden', 'false');
    if (which === 'player') { const n = container.querySelector('#np-nom'); n.value = ''; container.querySelector('#np-actif').checked = true; setTimeout(() => n.focus(), 0); }
    else {
      container.querySelector('#nd-nom').value = ''; container.querySelector('#nd-cmd').value = '';
      container.querySelectorAll('#nd-cols .pp').forEach((p) => p.classList.remove('on'));
      setTimeout(() => container.querySelector('#nd-nom').focus(), 0);
    }
  };
  const close = (restore) => {
    overlay.classList.remove('show'); overlay.setAttribute('aria-hidden', 'true');
    if (restore && pendingSelect) { pendingSelect.value = ''; const row = pendingSelect.closest('.match'); if (row) limVerdict(row, model); }
    pendingSelect = null;
  };
  modalApi.openPlayer = (origin) => open('player', origin);

  container.querySelectorAll('#nd-cols .pp').forEach((p) => { p.onclick = () => p.classList.toggle('on'); });

  formPlayer.onsubmit = (e) => {
    e.preventDefault();
    const nom = container.querySelector('#np-nom').value.trim();
    if (!nom) return ctx.toast('Nom requis.');
    if (model.joueurs.some((j) => j.nom.toLowerCase() === nom.toLowerCase())) return ctx.toast('Ce joueur existe déjà.');
    const id = store.upsertJoueur({ nom, actif: container.querySelector('#np-actif').checked });
    onRosterChange();
    if (pendingSelect) { pendingSelect.value = id; const row = pendingSelect.closest('.match'); if (row) limVerdict(row, model); }
    pendingSelect = null;
    overlay.classList.remove('show'); overlay.setAttribute('aria-hidden', 'true');
    ctx.toast('Joueur ajouté : ' + nom);
  };

  formDeck.onsubmit = (e) => {
    e.preventDefault();
    const nom = container.querySelector('#nd-nom').value.trim();
    if (!nom) return ctx.toast('Nom du deck requis.');
    const joueur_id = container.querySelector('#nd-owner').value;
    if (!joueur_id) return ctx.toast('Choisis un propriétaire.');
    const couleurs = [...container.querySelectorAll('#nd-cols .pp.on')].map((p) => p.dataset.c);
    store.upsertDeck({
      joueur_id, nom,
      commandant: container.querySelector('#nd-cmd').value.trim(),
      couleurs,
      format: container.querySelector('#nd-fmt').value.trim() || 'commander',
    });
    onRosterChange();
    overlay.classList.remove('show'); overlay.setAttribute('aria-hidden', 'true');
    ctx.toast('Deck ajouté : ' + nom);
  };

  container.querySelectorAll('.mcancel').forEach((b) => { b.onclick = () => close(true); });
  overlay.onclick = (e) => { if (e.target === overlay) close(true); };
  overlay._esc = (e) => { if (e.key === 'Escape' && overlay.classList.contains('show')) close(true); };
  document.addEventListener('keydown', overlay._esc);

  container.querySelector('#add-player').onclick = () => open('player', null);
  container.querySelector('#add-deck').onclick = () => open('deck', null);
}

// Reconstruit les listes joueur + deck d'une ligne de pod en préservant la
// sélection (miroir de shared.brancherPodRow, pour répercuter un ajout à chaud).
function refreshPodRow(row, model) {
  const jsel = row.querySelector('.pr-joueur'), dsel = row.querySelector('.pr-deck');
  if (!jsel || !dsel) return;
  const jv = jsel.value, dv = dsel.value;
  jsel.innerHTML = optJoueurs(model, true); jsel.value = jv;
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const jid = jsel.value;
  let html = '<option value="">— deck —</option>';
  if (jid) {
    const own = model.decks.filter((d) => d.joueur_id === jid);
    const autres = model.decks.filter((d) => d.joueur_id !== jid);
    if (own.length) html += `<optgroup label="Ses decks">${own.map((d) => `<option value="${d.id}">${esc(d.nom)}</option>`).join('')}</optgroup>`;
    if (autres.length) html += `<optgroup label="Emprunt (autres joueurs)">${autres.map((d) => `<option value="${d.id}">${esc(d.nom)} — ${esc(jn[d.joueur_id] || '?')}</option>`).join('')}</optgroup>`;
  }
  dsel.innerHTML = html; dsel.value = dv;
}

/* ========================================================================== *
 *  Saisons (tiroir repliable) — logique inchangée
 * ========================================================================== */
let editSaison = null;

function saisonsDrawer(model) {
  const actives = model.saisons.filter((s) => s.active).length;
  return `<details class="drawer">
    <summary>Saisons <span class="tag">${model.saisons.length} saison${model.saisons.length > 1 ? 's' : ''}${actives ? ' · ' + actives + ' active' : ''}</span>${IC.caret}</summary>
    <div class="drawer-body">
      <div class="ajout-inline">
        <input type="text" id="sa-nom" placeholder="Nom (ex. Saison 2026)">
        <label class="chk"><input type="checkbox" id="sa-active" checked> active</label>
        <button class="btn btn-mini" id="sa-add">Ajouter</button>
      </div>
      <ul class="mini-list">${model.saisons.map((s) => ligneSaison(s)).join('') || '<li class="empty">aucune</li>'}</ul>
    </div>
  </details>`;
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
