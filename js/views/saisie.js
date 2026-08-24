// saisie.js — écran organisateur. Édite le log (soirées, parties, joueurs,
// decks, saisons) en brouillon local, puis « Publier » commit data/ligue.json
// via l'API GitHub. Aucune authentification applicative : le token vit dans le
// navigateur de l'organisateur (voir Réglages).

import * as store from '../store.js';
import { publier } from '../github.js';
import { peutPublier } from '../github.js';
import { esc, dateFr, today } from '../util.js';

export function renderSaisie(container, ctx) {
  const model = store.getModel();

  container.innerHTML = `
    ${barrePublication()}
    <div class="deux-col">
      <div class="form-card">
        <h2>Nouvelle soirée</h2>
        <div class="fgrid">
          <div><label>Date</label><input type="date" id="so-date" value="${today()}"></div>
          <div><label>Lieu</label><input type="text" id="so-lieu" placeholder="Chez… / boutique"></div>
          <div><label>Saison</label><select id="so-saison">${optSaisons(model)}</select></div>
        </div>
        <div style="margin-top:14px"><button class="btn btn-noir" id="so-add">Créer la soirée</button></div>
      </div>

      <div class="form-card">
        <h2>Ajouter une partie</h2>
        <div class="fgrid">
          <div><label>Soirée</label><select id="pa-soiree">${optSoirees(model)}</select></div>
          <div><label>Type</label><select id="pa-type"><option value="pod">Commander (pod)</option><option value="1v1">1v1 (duel)</option></select></div>
        </div>
        <div id="pa-pod">${formPod(model)}</div>
        <div id="pa-duel" hidden>${formDuel(model)}</div>
        <div style="margin-top:14px"><button class="btn btn-noir" id="pa-add">Enregistrer la partie</button></div>
      </div>
    </div>

    ${formLimite(model)}

    ${formCommander(model)}

    <h2>Dernières parties saisies</h2>
    ${listeRecentes(model)}

    <div class="deux-col">
      ${gestionJoueurs(model)}
      ${gestionSaisons(model)}
    </div>
    ${gestionDecks(model)}
  `;

  wirePublication(container, ctx);
  wireSoiree(container, ctx);
  wirePartie(container, ctx, model);
  wireLimite(container, ctx, model);
  wireCommander(container, ctx, model);
  wireGestion(container, ctx, model);
  wireRecentes(container, ctx);
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
}

// --- partie -----------------------------------------------------------------
function formPod(model) {
  return `<div class="pod-rows" id="pod-rows">${[0, 1, 2, 3].map(() => rowPod(model)).join('')}</div>
    <button class="btn btn-mini" id="pod-add-row" type="button">+ joueur</button>
    <div class="hint">Place 1 = vainqueur du pod.</div>`;
}
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
function formDuel(model) {
  return `<div class="fgrid">
    <div><label>Catégorie</label><select id="du-cat"><option value="construit">Construit</option><option value="limite">Limité</option></select></div>
    <div><label>Format</label><input type="text" id="du-format" placeholder="pauper, scellé, draft…"></div>
  </div>
  <div class="fgrid" style="margin-top:12px">
    <div><label>Joueur A</label><select id="du-a">${optJoueurs(model, true)}</select></div>
    <div><label>Joueur B</label><select id="du-b">${optJoueurs(model, true)}</select></div>
    <div><label>Résultat</label><select id="du-res"><option value="A">A gagne</option><option value="B">B gagne</option><option value="N">Nul</option></select></div>
  </div>`;
}

function wirePartie(container, ctx, model) {
  const type = container.querySelector('#pa-type');
  const pod = container.querySelector('#pa-pod');
  const duel = container.querySelector('#pa-duel');
  type.onchange = () => {
    const t = type.value;
    pod.hidden = t !== 'pod';
    duel.hidden = t !== '1v1';
  };

  // decks filtrés par joueur dans chaque ligne de pod
  container.querySelectorAll('#pod-rows .pod-row').forEach(brancherPodRow);
  container.querySelector('#pod-add-row').onclick = () => {
    const row = creerRow(rowPod(model));
    container.querySelector('#pod-rows').appendChild(row);
    brancherPodRow(row);
  };

  container.querySelector('#pa-add').onclick = () => {
    const soiree_id = container.querySelector('#pa-soiree').value;
    if (!soiree_id) return ctx.toast('Crée d\'abord une soirée.');
    if (type.value === 'pod') {
      const participants = [];
      container.querySelectorAll('#pod-rows .pod-row').forEach((row) => {
        const jid = row.querySelector('.pr-joueur').value;
        if (!jid) return;
        const did = row.querySelector('.pr-deck').value || null;
        const pl = parseInt(row.querySelector('.pr-place').value, 10);
        participants.push({ joueur_id: jid, deck_id: did, place: Number.isFinite(pl) ? pl : null });
      });
      if (participants.length < 2) return ctx.toast('Au moins 2 joueurs dans le pod.');
      store.addPartie({ soiree_id, type: 'pod', format: 'commander', participants });
    } else {
      const a = container.querySelector('#du-a').value;
      const b = container.querySelector('#du-b').value;
      if (!a || !b || a === b) return ctx.toast('Choisis deux joueurs différents.');
      const res = container.querySelector('#du-res').value;
      const rA = res === 'A' ? 'V' : res === 'B' ? 'D' : 'N';
      const rB = res === 'B' ? 'V' : res === 'A' ? 'D' : 'N';
      store.addPartie({
        soiree_id, type: '1v1',
        categorie: container.querySelector('#du-cat').value,
        format: container.querySelector('#du-format').value.trim(),
        participants: [{ joueur_id: a, deck_id: null, resultat: rA }, { joueur_id: b, deck_id: null, resultat: rB }],
      });
    }
    ctx.toast('Partie enregistrée.');
    ctx.refresh();
  };
}

// --- soirée limitée : saisie groupée (round-robin) --------------------------
function formLimite(model) {
  return `<div class="form-card">
    <h2>Soirée limitée — saisie groupée</h2>
    <p class="mini">Coche les présents, génère toutes les rondes (chacun affronte chacun), indique le vainqueur
      de chaque match, puis enregistre tout d'un coup. Les matchs comptent en <b>ELO Limité</b>.</p>
    <div class="fgrid">
      <div><label>Soirée</label><select id="li-soiree">${optSoirees(model)}</select></div>
      <div><label>Format</label><input type="text" id="li-format" placeholder="scellé, draft…"></div>
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

function wireLimite(container, ctx, model) {
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const matchs = container.querySelector('#li-matchs');
  const save = container.querySelector('#li-save');
  const info = container.querySelector('#li-info');

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
        soiree_id, type: '1v1', categorie: 'limite', format,
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
    <h2>Soirée Commander — saisie groupée</h2>
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
        <td class="actions"><button class="btn btn-mini" data-del-partie="${p.id}">Supprimer</button></td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
function wireRecentes(container, ctx) {
  container.querySelectorAll('[data-del-partie]').forEach((b) => {
    b.onclick = () => { store.removePartie(b.dataset.delPartie); ctx.toast('Partie supprimée.'); ctx.refresh(); };
  });
}

// --- gestion joueurs / decks / saisons --------------------------------------
function gestionJoueurs(model) {
  return `<div class="form-card">
    <h2>Joueurs</h2>
    <div class="ajout-inline"><input type="text" id="jo-nom" placeholder="Nom du joueur"><button class="btn" id="jo-add">Ajouter</button></div>
    <ul class="mini-list">${model.joueurs.map((j) => `<li>${esc(j.nom)}</li>`).join('') || '<li class="empty">aucun</li>'}</ul>
  </div>`;
}
function gestionSaisons(model) {
  return `<div class="form-card">
    <h2>Saisons</h2>
    <div class="ajout-inline">
      <input type="text" id="sa-nom" placeholder="Nom (ex. Saison 2026)">
      <label class="chk"><input type="checkbox" id="sa-active" checked> active</label>
      <button class="btn" id="sa-add">Ajouter</button>
    </div>
    <ul class="mini-list">${model.saisons.map((s) => `<li>${esc(s.nom)}${s.active ? ' <b>(active)</b>' : ''}</li>`).join('') || '<li class="empty">aucune</li>'}</ul>
  </div>`;
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
    <ul class="mini-list">${model.decks.map((d) => {
      const jn = model.joueurs.find((j) => j.id === d.joueur_id);
      return `<li>${esc(d.nom)} <small>${esc(d.commandant || '')} — ${esc(jn ? jn.nom : '?')}</small></li>`;
    }).join('') || '<li class="empty">aucun</li>'}</ul>
  </div>`;
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
    const couleurs = container.querySelector('#de-couleurs').value.toUpperCase().replace(/[^WUBRG]/g, '').split('');
    store.upsertDeck({
      joueur_id, nom,
      commandant: container.querySelector('#de-cmd').value.trim(),
      couleurs, format: 'commander',
    });
    ctx.toast('Deck ajouté.'); ctx.refresh();
  };
}

// --- options <select> -------------------------------------------------------
function optJoueurs(model, vide) {
  return (vide ? '<option value="">— joueur —</option>' : '')
    + model.joueurs.map((j) => `<option value="${j.id}">${esc(j.nom)}</option>`).join('');
}
function optSaisons(model) {
  return model.saisons.map((s) => `<option value="${s.id}" ${s.active ? 'selected' : ''}>${esc(s.nom)}</option>`).join('');
}
function optSoirees(model) {
  return store.soirees().map((e) => `<option value="${e.id}">${dateFr(e.date)}${e.lieu ? ' · ' + esc(e.lieu) : ''}</option>`).join('');
}
