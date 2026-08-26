// joueurs.js — annuaire des joueurs (cartes) et fiche détaillée au clic :
// courbe d'ELO, couleurs jouées, deck le plus victorieux, head-to-head.

import { getModel, decksDe } from '../store.js';
import { classementElo, classementCommander, eloTimeline, faceAFace } from '../ranking.js';
import { esc, pct, r0, sparkline } from '../util.js';

let selJoueur = null;   // fiche ouverte (null = grille)

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
    <div class="joueur-grid">${cartes || '<div class="empty">Aucun joueur.</div>'}</div>

    <h2>Face-à-face 1v1 — tableau croisé</h2>
    <p class="sub">Bilan de chaque ligne <b>contre</b> chaque colonne (victoires–défaites, toutes catégories 1v1).</p>
    ${h2hMatrix(model)}
  `;

  container.querySelectorAll('.jc-clic').forEach((el) => {
    el.onclick = () => { selJoueur = el.dataset.joueur; ctx.refresh(); };
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
  const decks = decksDe(j.id);
  const plays = deckPlays(model);

  // deck le plus victorieux (Commander), sinon le plus joué
  const cmdDecks = classementCommander(model).decks
    .filter((d) => d.entite && d.entite.joueur_id === j.id)
    .sort((a, b) => b.victoires - a.victoires || b.winrate - a.winrate);
  const topVict = cmdDecks.find((d) => d.victoires > 0) || null;

  container.innerHTML = `
    <div class="titre-ligne">
      <button class="btn btn-mini" id="fiche-retour">← Joueurs</button>
      <h1 style="margin:0">${esc(j.nom)}</h1>
      ${j.actif !== false ? '' : '<span class="inactif" style="color:var(--muted)">inactif</span>'}
    </div>

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
        <b class="rc-val" style="font-size:16px">${topVict ? esc(topVict.entite.nom) : '<span class="rc-vide">—</span>'}</b>
        <span class="rc-sub">${topVict ? `${topVict.victoires} victoire${topVict.victoires > 1 ? 's' : ''} · ${pct(topVict.winrate)}` : ''}</span>
      </div>
    </div>

    <h2>Couleurs jouées <small class="mini">(en Commander, pondéré par parties)</small></h2>
    ${couleursBloc(decks, plays)}

    <h2>Hauts faits</h2>
    ${hautsFaitsBloc(model, j.id, plays)}

    <h2>Face-à-face 1v1</h2>
    ${h2hBloc(model, j.id, h2h)}

    <h2>Decks Commander</h2>
    ${decksBloc(cmdDecks, decks, plays)}
  `;

  container.querySelector('#fiche-retour').onclick = () => { selJoueur = null; ctx.refresh(); };
}

function carteElo(titre, stat, serie, stroke) {
  return `<div class="rcard">
    <span class="rc-lib">${titre}</span>
    <b class="rc-val">${stat ? r0(stat.rating) : '—'}</b>
    <span class="rc-sub">${stat ? `${stat.v}–${stat.d}${stat.n ? '–' + stat.n : ''} · ${pct(stat.winrate)}` : 'aucune partie'}</span>
    ${sparkline(serie, stroke, 210, 40)}
  </div>`;
}

function couleursBloc(decks, plays) {
  const cp = {};
  for (const d of decks) {
    const n = plays[d.id] || 0;
    for (const c of (d.couleurs || [])) cp[c] = (cp[c] || 0) + n;
  }
  const noms = { W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert' };
  const total = Object.values(cp).reduce((a, b) => a + b, 0);
  const pips = ['W', 'U', 'B', 'R', 'G'].filter((c) => cp[c]).map((c) =>
    `<span class="mana-pip mana-${c.toLowerCase()}" title="${noms[c]}">${c}<b>${cp[c]}</b></span>`).join('');
  if (!total) return '<div class="empty">Aucune partie Commander enregistrée.</div>';
  return `<div class="pips-ligne">${pips}</div>`;
}

// Hauts faits (succès) d'un joueur, calculés depuis le log.
function hautsFaits(model, jid, plays) {
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
  for (const dk of model.decks.filter((d) => d.joueur_id === jid)) {
    if ((plays[dk.id] || 0) > 0) for (const c of (dk.couleurs || [])) cols.add(c);
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

function hautsFaitsBloc(model, jid, plays) {
  const list = hautsFaits(model, jid, plays);
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

function decksBloc(cmdDecks, decks, plays) {
  if (!decks.length) return '<div class="empty">Aucun deck enregistré.</div>';
  const stat = Object.fromEntries(cmdDecks.map((d) => [d.id, d]));
  const corps = decks.map((d) => {
    const s = stat[d.id];
    return `<tr>
      <td class="desig">${esc(d.nom)}<small>${esc(d.commandant || '')}</small></td>
      <td>${(d.couleurs || []).map((c) => `<span class="mana-dot mana-${c.toLowerCase()}"></span>`).join('') || '—'}</td>
      <td class="num">${plays[d.id] || 0}</td>
      <td class="num">${s ? s.victoires : 0}</td>
      <td class="num">${s ? pct(s.winrate) : '—'}</td>
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

// Couleur(s) de mana les plus jouées (parties pondérées par deck), ordre WUBRG.
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

// Dégradé CSS à paliers nets pour un jeu de couleurs de mana.
function manaGradient(cols) {
  const varOf = { W: '--w', U: '--u', B: '--b', R: '--r', G: '--g' };
  const ordered = ['W', 'U', 'B', 'R', 'G'].filter((c) => cols.includes(c));
  if (!ordered.length) return '';
  if (ordered.length === 1) return `linear-gradient(90deg, var(${varOf[ordered[0]]}) 0 100%)`;
  const step = 100 / ordered.length;
  const stops = ordered.map((c, i) => `var(${varOf[c]}) ${i * step}% ${(i + 1) * step}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}
