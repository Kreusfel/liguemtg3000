// joueurs.js — annuaire des joueurs (cartes) et fiche détaillée au clic :
// courbe d'ELO, couleurs jouées, deck le plus victorieux, head-to-head.

import { getModel, decksDe, upsertJoueur, removeJoueur, refsJoueur } from '../store.js';
import { classementElo, classementCommander, eloTimeline, faceAFace } from '../ranking.js';
import { esc, pct, r0, sparkline } from '../util.js';
import { deckPlays, couleursDominantes, manaGradient } from './_shared.js';

let selJoueur = null;   // fiche ouverte (null = grille)
let editJoueur = false; // mode édition sur la fiche ouverte

export function renderJoueurs(container, ctx) {
  const model = getModel();
  if (selJoueur && model.joueurs.some((j) => j.id === selJoueur)) {
    renderFiche(container, ctx, model);
  } else {
    selJoueur = null;
    renderGrille(container, ctx, model);
  }
}

// ---------------------------------------------------------------- grille -----
function renderGrille(container, ctx, model) {
  const eloC = idx(classementElo(model, 'construit'));
  const eloL = idx(classementElo(model, 'limite'));
  const cmd = idx(classementCommander(model).joueurs, 'entite');
  const plays = deckPlays(model);

  const cartes = model.joueurs.map((j) => {
    const decks = decksDe(j.id);
    const top = decks.slice().sort((a, b) => (plays[b.id] || 0) - (plays[a.id] || 0))[0];
    const autres = decks.length - 1;
    let contour = couleursDominantes(decks, plays);
    if (!contour.length && top) contour = (top.couleurs || []).slice();
    const grad = manaGradient(contour);
    const style = grad
      ? ` style="border:3px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box, ${grad} border-box"`
      : '';
    const c = eloC[j.id], l = eloL[j.id], m = cmd[j.id];
    return `<div class="joueur-card jc-clic" data-joueur="${j.id}"${style}>
      <div class="jc-head"><b>${esc(j.nom)}</b>${j.actif !== false ? '' : ' <span class="inactif">inactif</span>'}</div>
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
    <p class="sub">Clique sur un joueur pour sa fiche détaillée (courbe d'ELO, couleurs, head-to-head).</p>
    <div class="ajout-inline" style="margin-bottom:18px">
      <input type="text" id="jo-nom" placeholder="Nom du joueur"><button class="btn" id="jo-add">Ajouter un joueur</button>
    </div>
    <div class="joueur-grid">${cartes || '<div class="empty">Aucun joueur.</div>'}</div>

    <h2>Face-à-face 1v1 — tableau croisé</h2>
    <p class="sub">Bilan de chaque ligne <b>contre</b> chaque colonne (victoires–défaites, toutes catégories 1v1).</p>
    ${h2hMatrix(model)}
  `;

  const add = () => {
    const nom = container.querySelector('#jo-nom').value.trim();
    if (!nom) return;
    upsertJoueur({ nom }); ctx.toast('Joueur ajouté.'); ctx.refresh();
  };
  container.querySelector('#jo-add').onclick = add;
  container.querySelector('#jo-nom').onkeydown = (e) => { if (e.key === 'Enter') add(); };
  container.querySelectorAll('.jc-clic').forEach((el) => {
    el.onclick = () => { selJoueur = el.dataset.joueur; editJoueur = false; ctx.refresh(); };
  });
}

// Tableau croisé des face-à-face 1v1 (ligne vs colonne).
function h2hMatrix(model) {
  const h = faceAFace(model);
  const joueurs = model.joueurs.filter((j) => h[j.id] && Object.values(h[j.id]).some((r) => r.total));
  if (joueurs.length < 2) return '<div class="empty">Pas encore de match 1v1.</div>';
  const th = joueurs.map((c) => `<th class="num" title="${esc(c.nom)}">${esc(abbr(c.nom))}</th>`).join('');
  const rows = joueurs.map((a) => {
    const cells = joueurs.map((b) => {
      if (a.id === b.id) return '<td class="h2h-diag"></td>';
      const r = h[a.id] && h[a.id][b.id];
      if (!r || !r.total) return '<td class="num h2h-vide">·</td>';
      const bilan = r.v - r.d;
      const cls = bilan > 0 ? 'h2h-pos' : bilan < 0 ? 'h2h-neg' : '';
      return `<td class="num ${cls}" title="${esc(a.nom)} vs ${esc(b.nom)}">${r.v}–${r.d}${r.n ? '–' + r.n : ''}</td>`;
    }).join('');
    return `<tr><td class="desig">${esc(a.nom)}</td>${cells}</tr>`;
  }).join('');
  return `<div class="tablewrap"><table class="matrix">
    <thead><tr><th></th>${th}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// Abrège un nom pour les en-têtes de colonnes (3 premières lettres).
function abbr(nom) {
  return String(nom || '').slice(0, 3);
}

// ----------------------------------------------------------------- fiche -----
function renderFiche(container, ctx, model) {
  const j = model.joueurs.find((x) => x.id === selJoueur);
  const eloC = idx(classementElo(model, 'construit'))[j.id];
  const eloL = idx(classementElo(model, 'limite'))[j.id];
  const m = idx(classementCommander(model).joueurs, 'entite')[j.id];
  const tlC = eloTimeline(model, 'construit')[j.id];
  const tlL = eloTimeline(model, 'limite')[j.id];
  const h2h = faceAFace(model)[j.id] || {};
  const deckById = Object.fromEntries(model.decks.map((d) => [d.id, d]));
  const usage = decksJoues(model, j.id);   // decks joués par CE joueur (emprunts inclus)

  // deck le plus victorieux DE CE JOUEUR (ses propres parties)
  let topVict = null;
  for (const id of Object.keys(usage)) {
    if (usage[id].victoires > 0 && (!topVict || usage[id].victoires > usage[topVict].victoires)) topVict = id;
  }

  const enTete = editJoueur
    ? `<div class="titre-ligne">
        <button class="btn btn-mini" id="fiche-retour">← Joueurs</button>
        <input type="text" id="j-nom" value="${esc(j.nom)}" style="width:auto;font-size:16px">
        <label class="chk" style="display:flex;align-items:center;gap:7px;text-transform:none;letter-spacing:0;color:var(--ink);margin:0;width:auto;font-weight:700"><input type="checkbox" id="j-actif" ${j.actif !== false ? 'checked' : ''} style="width:auto"> actif</label>
        <div class="tl-controls">
          <button class="btn btn-mini btn-noir" id="j-save">Enregistrer</button>
          <button class="btn btn-mini" id="j-cancel">Annuler</button>
        </div>
      </div>`
    : `<div class="titre-ligne">
        <button class="btn btn-mini" id="fiche-retour">← Joueurs</button>
        <h1 style="margin:0">${esc(j.nom)}</h1>
        ${j.actif !== false ? '' : '<span class="inactif" style="color:var(--muted)">inactif</span>'}
        <div class="tl-controls">
          <button class="btn btn-mini" id="j-edit">Modifier</button>
          <button class="btn btn-mini" id="j-del">Supprimer</button>
        </div>
      </div>`;

  container.innerHTML = `
    ${enTete}

    <div class="fiche-stats">
      ${carteElo('⚔️ ELO Construit', eloC, tlC, 'var(--u)')}
      ${carteElo('🎲 ELO Limité', eloL, tlL, 'var(--g)')}
      <div class="rcard">
        <span class="rc-lib">👑 Commander</span>
        <b class="rc-val">${m ? m.points : '—'} <small>pts</small></b>
        <span class="rc-sub">${m ? `${m.victoires} v · ${m.parties} parties · ${pct(m.winrate)}` : 'aucun pod'}</span>
      </div>
      <div class="rcard">
        <span class="rc-lib">🏆 Deck le plus victorieux</span>
        <b class="rc-val" style="font-size:16px">${topVict ? esc(deckById[topVict].nom) : '<span class="rc-vide">—</span>'}</b>
        <span class="rc-sub">${topVict ? `${usage[topVict].victoires} victoire${usage[topVict].victoires > 1 ? 's' : ''} · ${pct(usage[topVict].victoires / usage[topVict].parties)}` : ''}</span>
      </div>
    </div>

    <h2>Couleurs jouées <small class="mini">(en Commander, pondéré par parties)</small></h2>
    ${couleursBloc(usage, deckById)}

    <h2>Hauts faits</h2>
    ${hautsFaitsBloc(model, j.id, usage, deckById)}

    <h2>Face-à-face 1v1</h2>
    ${h2hBloc(model, j.id, h2h)}

    <h2>Decks joués</h2>
    ${decksBloc(model, j.id, usage, deckById)}
  `;

  container.querySelector('#fiche-retour').onclick = () => { selJoueur = null; editJoueur = false; ctx.refresh(); };
  if (editJoueur) {
    container.querySelector('#j-cancel').onclick = () => { editJoueur = false; ctx.refresh(); };
    container.querySelector('#j-save').onclick = () => {
      const nom = container.querySelector('#j-nom').value.trim();
      if (!nom) return ctx.toast('Nom requis.');
      upsertJoueur({ id: j.id, nom, actif: container.querySelector('#j-actif').checked });
      editJoueur = false; ctx.toast('Joueur modifié.'); ctx.refresh();
    };
  } else {
    container.querySelector('#j-edit').onclick = () => { editJoueur = true; ctx.refresh(); };
    container.querySelector('#j-del').onclick = () => {
      const n = refsJoueur(j.id);
      if (n) return ctx.toast(`Impossible : joueur utilisé dans ${n} deck(s)/partie(s).`);
      if (!confirm('Supprimer ce joueur ?')) return;
      removeJoueur(j.id); selJoueur = null; ctx.toast('Joueur supprimé.'); ctx.refresh();
    };
  }
}

function carteElo(titre, stat, serie, stroke) {
  return `<div class="rcard">
    <span class="rc-lib">${titre}</span>
    <b class="rc-val">${stat ? r0(stat.rating) : '—'}</b>
    <span class="rc-sub">${stat ? `${stat.v}–${stat.d}${stat.n ? '–' + stat.n : ''} · ${pct(stat.winrate)}` : 'aucune partie'}</span>
    ${sparkline(serie, stroke, 210, 40)}
  </div>`;
}

// Decks réellement joués par un joueur (emprunts inclus) : { deckId: {parties, victoires} }.
function decksJoues(model, jid) {
  const u = {};
  for (const p of model.parties) {
    for (const x of (p.participants || [])) {
      if (x.joueur_id !== jid || !x.deck_id) continue;
      const e = u[x.deck_id] || (u[x.deck_id] = { parties: 0, victoires: 0 });
      e.parties++;
      if (p.type === 'pod' ? x.place === 1 : x.resultat === 'V') e.victoires++;
    }
  }
  return u;
}

function couleursBloc(usage, deckById) {
  const cp = {};
  for (const [id, u] of Object.entries(usage)) {
    const d = deckById[id];
    if (!d) continue;
    for (const c of (d.couleurs || [])) cp[c] = (cp[c] || 0) + u.parties;
  }
  const noms = { W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert' };
  const total = Object.values(cp).reduce((a, b) => a + b, 0);
  const pips = ['W', 'U', 'B', 'R', 'G'].filter((c) => cp[c]).map((c) =>
    `<span class="mana-pip mana-${c.toLowerCase()}" title="${noms[c]}">${c}<b>${cp[c]}</b></span>`).join('');
  if (!total) return '<div class="empty">Aucune partie Commander enregistrée.</div>';
  return `<div class="pips-ligne">${pips}</div>`;
}

// Hauts faits (succès) d'un joueur, calculés depuis le log.
function hautsFaits(model, jid, usage, deckById) {
  const sdate = Object.fromEntries(model.soirees.map((s) => [s.id, s.date || '']));
  const mine = model.parties.filter((p) => p.participants.some((x) => x.joueur_id === jid));
  const duels = mine.filter((p) => p.type === '1v1')
    .sort((a, b) => (sdate[a.soiree_id] || '').localeCompare(sdate[b.soiree_id] || ''));
  const formats = new Set();
  let v1 = 0, d1 = 0, streak = 0, best = 0;
  for (const p of duels) {
    const me = p.participants.find((x) => x.joueur_id === jid);
    formats.add(p.categorie === 'limite' ? 'limite' : 'construit');
    if (me.resultat === 'V') { v1++; streak++; best = Math.max(best, streak); }
    else { if (me.resultat === 'D') d1++; streak = 0; }
  }
  let podsWon = 0;
  for (const p of mine.filter((p) => p.type === 'pod')) {
    formats.add('commander');
    if (p.participants.find((x) => x.joueur_id === jid).place === 1) podsWon++;
  }
  const cols = new Set();
  for (const id of Object.keys(usage)) {
    const dk = deckById[id];
    if (dk) for (const c of (dk.couleurs || [])) cols.add(c);
  }
  const total = mine.length;
  const wr1 = (v1 + d1) ? v1 / (v1 + d1) : 0;
  const jnom = (model.joueurs.find((j) => j.id === jid) || {}).nom;
  const titres = model.saisons.filter((s) => s.cloturee && s.palmares && s.palmares.champion === jnom).length;

  return [
    { emo: '🩸', t: 'Premier sang', d: 'Gagner un pod Commander', got: podsWon >= 1 },
    { emo: '🔥', t: best >= 3 ? `Série de ${best}` : 'Série de victoires', d: '3 victoires 1v1 d\'affilée', got: best >= 3 },
    { emo: '🌈', t: 'Toutes les couleurs', d: 'Jouer les 5 couleurs', got: cols.size >= 5 },
    { emo: '🎯', t: 'Sans faute', d: '100 % en 1v1 (≥ 3 matchs)', got: (v1 + d1) >= 3 && wr1 === 1 },
    { emo: '🎲', t: 'Triple menace', d: 'Jouer Commander, Construit et Limité', got: formats.has('commander') && formats.has('construit') && formats.has('limite') },
    { emo: '🗡️', t: 'Vétéran', d: '10 parties jouées', got: total >= 10 },
    { emo: '👑', t: 'Champion de saison', d: 'Finir 1er Commander d\'une saison clôturée', got: titres >= 1 },
  ];
}

function hautsFaitsBloc(model, jid, usage, deckById) {
  const list = hautsFaits(model, jid, usage, deckById);
  return `<div class="badges">${list.map((b) => `
    <div class="badge-hf ${b.got ? 'got' : 'locked'}">
      <span class="bhf-emo">${b.got ? b.emo : '🔒'}</span>
      <span class="bhf-t">${esc(b.t)}</span>
      <span class="bhf-d">${esc(b.d)}</span>
    </div>`).join('')}</div>`;
}

function h2hBloc(model, jid, h2h) {
  const noms = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const advs = model.joueurs.filter((a) => a.id !== jid && h2h[a.id] && h2h[a.id].total);
  if (!advs.length) return '<div class="empty">Aucun match 1v1 disputé.</div>';
  const corps = advs.map((a) => {
    const r = h2h[a.id];
    const bilan = r.v - r.d;
    const cls = bilan > 0 ? 'h2h-pos' : bilan < 0 ? 'h2h-neg' : '';
    return `<tr>
      <td class="desig">${esc(noms[a.id])}</td>
      <td class="num">${r.total}</td>
      <td class="num ${cls}">${r.v}–${r.d}${r.n ? '–' + r.n : ''}</td>
      <td class="num">${pct(r.total ? r.v / r.total : 0)}</td>
    </tr>`;
  }).join('');
  return `<div class="tablewrap"><table>
    <thead><tr><th>Adversaire</th><th class="num">Matchs</th><th class="num">V–D</th><th class="num">Winrate</th></tr></thead>
    <tbody>${corps}</tbody>
  </table></div>`;
}

// Decks joués par le joueur (emprunts inclus), avec SES stats sur chaque deck.
function decksBloc(model, jid, usage, deckById) {
  // union : decks possédés (même jamais joués) + decks joués (dont empruntés)
  const ids = [...new Set([...decksDe(jid).map((d) => d.id), ...Object.keys(usage)])];
  if (!ids.length) return '<div class="empty">Aucun deck.</div>';
  const corps = ids.map((id) => {
    const d = deckById[id];
    if (!d) return '';
    const u = usage[id] || { parties: 0, victoires: 0 };
    const emprunt = d.joueur_id !== jid;
    return `<tr>
      <td class="desig">${esc(d.nom)}${emprunt ? ' <span class="tag-emprunt">emprunt</span>' : ''}<small>${esc(d.commandant || '')}</small></td>
      <td>${(d.couleurs || []).map((c) => `<span class="mana-dot mana-${c.toLowerCase()}"></span>`).join('') || '—'}</td>
      <td class="num">${u.parties}</td>
      <td class="num">${u.victoires}</td>
      <td class="num">${u.parties ? pct(u.victoires / u.parties) : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="tablewrap"><table>
    <thead><tr><th>Deck</th><th>Couleurs</th><th class="num">Parties</th><th class="num">Victoires</th><th class="num">Winrate</th></tr></thead>
    <tbody>${corps}</tbody>
  </table></div>`;
}

// -------------------------------------------------------------- helpers ------
function idx(arr, cle) {
  const out = {};
  for (const l of arr) {
    const id = cle ? (l.entite && l.entite.id) : l.joueur_id;
    if (id) out[id] = l;
  }
  return out;
}
