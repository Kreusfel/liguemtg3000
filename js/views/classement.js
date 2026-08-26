// classement.js — écran public. Sélecteur de saison, puis les DEUX classements
// ELO 1v1 (Construit / Limité, jamais mêlés) et le classement Commander en
// points (Joueur + Deck). Tout est recalculé à la volée depuis le log.

import { getModel, saisons as listeSaisons } from '../store.js';
import { classementElo, classementCommander, statsCouleurs, eloTimeline, saisonActive } from '../ranking.js';
import { esc, pct, r0, sparkline } from '../util.js';

let saisonSel = null;      // mémorisé entre rendus
let montrerInactifs = false;

// Retire les joueurs inactifs (sauf si la case est cochée). `cle` pointe vers
// l'objet joueur de chaque ligne ('joueur' pour l'ELO, 'entite' pour Commander).
function filtreActifs(lignes, cle) {
  if (montrerInactifs) return lignes;
  return lignes.filter((l) => { const j = l[cle]; return j && j.actif !== false; });
}

export function renderClassement(container, ctx) {
  const model = getModel();
  const saisons = listeSaisons();
  if (saisonSel === null) { const a = saisonActive(model); saisonSel = a ? a.id : ''; }
  const sid = saisonSel || null;

  const eloC = filtreActifs(classementElo(model, 'construit', sid), 'joueur');
  const eloL = filtreActifs(classementElo(model, 'limite', sid), 'joueur');
  const cmd = classementCommander(model, sid);
  const cmdJ = filtreActifs(cmd.joueurs, 'entite');

  const soireesSaison = model.soirees.filter((e) => !sid || e.saison_id === sid);
  const partiesSaison = model.parties.filter((p) => !sid || p.saison_id === sid);
  const podsN = partiesSaison.filter((p) => p.type === 'pod').length;
  const resume = {
    soirees: soireesSaison.length,
    parties: partiesSaison.length,
    pods: podsN,
    duels: partiesSaison.length - podsN,
    topCmd: cmdJ[0],
    topConstruit: eloC[0],
    topLimite: eloL[0],
  };

  container.innerHTML = `
    <div class="titre-ligne">
      <h1>Classement</h1>
      <div class="tl-controls">
        <label class="chk"><input type="checkbox" id="c-inactifs" ${montrerInactifs ? 'checked' : ''}> Afficher inactifs</label>
        <select id="c-saison">
          <option value="">Toutes saisons</option>
          ${saisons.map((s) => `<option value="${s.id}" ${s.id === saisonSel ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}
        </select>
      </div>
    </div>
    <p class="sub">Classements recalculés en direct depuis les résultats. L'ELO Construit et l'ELO Limité sont indépendants.</p>

    ${resumeSaison(resume)}

    <div class="deux-col">
      <div>${tableElo('⚔️ ELO — Construit', eloC, 'u', eloTimeline(model, 'construit', sid), 'var(--u)')}</div>
      <div>${tableElo('🎲 ELO — Limité', eloL, 'g', eloTimeline(model, 'limite', sid), 'var(--g)')}</div>
    </div>

    <h2>Commander — Joueurs</h2>
    ${tableCmdJoueurs(cmdJ)}

    <h2>Commander — Decks</h2>
    ${tableCmdDecks(cmd.decks)}

    <h2>Commander — Couleurs</h2>
    <p class="sub">Winrate par couleur de mana (chaque participation compte pour chaque couleur du deck joué).</p>
    ${tableCouleurs(statsCouleurs(model, sid))}

    <h2>🏅 Récompenses de la saison</h2>
    ${blocRecompenses(recompenses(model, sid))}
  `;

  container.querySelector('#c-saison').onchange = (e) => { saisonSel = e.target.value; ctx.refresh(); };
  container.querySelector('#c-inactifs').onchange = (e) => { montrerInactifs = e.target.checked; ctx.refresh(); };
}

function medaille(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1; }

// Bandeau de synthèse de la saison sélectionnée.
function resumeSaison(r) {
  const leader = (l, metric) => l
    ? `${esc((l.joueur || l.entite).nom)} <small>${metric}</small>`
    : '<span class="rc-vide">—</span>';
  const cards = [
    { lib: 'Soirées', val: r.soirees },
    { lib: 'Parties', val: r.parties, sub: `${r.pods} Commander · ${r.duels} 1v1` },
    { lib: '👑 Commander', val: leader(r.topCmd, r.topCmd ? `${r.topCmd.points} pts` : '') },
    { lib: '⚔️ ELO Construit', val: leader(r.topConstruit, r.topConstruit ? r0(r.topConstruit.rating) : '') },
    { lib: '🎲 ELO Limité', val: leader(r.topLimite, r.topLimite ? r0(r.topLimite.rating) : '') },
  ];
  return `<div class="resume">${cards.map((c) => `<div class="rcard">
    <span class="rc-lib">${c.lib}</span>
    <b class="rc-val">${c.val}</b>
    ${c.sub ? `<span class="rc-sub">${c.sub}</span>` : ''}
  </div>`).join('')}</div>`;
}

function tableElo(titre, lignes, cls = '', series = {}, stroke = 'currentColor') {
  const corps = lignes.length ? lignes.map((l, i) => `
    <tr class="${i < 3 ? 'podium podium-' + (i + 1) : ''}">
      <td class="num rang">${medaille(i)}</td>
      <td class="desig">${esc(l.joueur ? l.joueur.nom : '?')}</td>
      <td class="num elo">${r0(l.rating)}</td>
      <td class="spark-cell">${sparkline(series[l.joueur_id], stroke, 90, 26)}</td>
      <td class="num">${l.parties}</td>
      <td class="num bilan">${l.v}–${l.d}${l.n ? '–' + l.n : ''}</td>
      <td class="num">${pct(l.winrate)}</td>
    </tr>`).join('')
    : `<tr><td colspan="7" class="empty">Aucune partie enregistrée.</td></tr>`;
  return `<div class="bloc bloc-${cls}">
    <div class="bloc-head">${titre}</div>
    <div class="tablewrap"><table>
      <thead><tr><th>#</th><th>Joueur</th><th class="num">Rating</th><th>Évol.</th><th class="num">Parties</th><th class="num">V–D</th><th class="num">Winrate</th></tr></thead>
      <tbody>${corps}</tbody>
    </table></div>
  </div>`;
}

function tableCmdJoueurs(lignes) {
  const corps = lignes.length ? lignes.map((l, i) => `
    <tr class="${i < 3 ? 'podium podium-' + (i + 1) : ''}">
      <td class="num rang">${medaille(i)}</td>
      <td class="desig">${esc(l.entite ? l.entite.nom : '?')}</td>
      <td class="num pts">${l.points}</td>
      <td class="num">${l.parties}</td>
      <td class="num">${l.victoires}</td>
      <td class="num">${pct(l.winrate)}</td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">Aucun pod enregistré.</td></tr>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>#</th><th>Joueur</th><th class="num">Points</th><th class="num">Parties</th><th class="num">Victoires</th><th class="num">Winrate</th></tr></thead>
    <tbody>${corps}</tbody>
  </table></div>`;
}

function tableCmdDecks(lignes) {
  const corps = lignes.length ? lignes.map((l, i) => {
    const d = l.entite;
    const dots = d && d.couleurs ? d.couleurs.map((c) => `<span class="mana-dot mana-${c.toLowerCase()}"></span>`).join('') : '';
    return `<tr class="${i < 3 ? 'podium podium-' + (i + 1) : ''}">
      <td class="num rang">${medaille(i)}</td>
      <td class="desig">${esc(d ? d.nom : '?')}<small>${esc(d && d.commandant || '')}</small></td>
      <td>${esc(l.joueur ? l.joueur.nom : '—')}</td>
      <td>${dots || '—'}</td>
      <td class="num pts">${l.points}</td>
      <td class="num">${l.parties}</td>
      <td class="num">${l.victoires}</td>
      <td class="num">${pct(l.winrate)}</td>
    </tr>`;
  }).join('')
    : `<tr><td colspan="8" class="empty">Aucun pod enregistré.</td></tr>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>#</th><th>Deck</th><th>Joueur</th><th>Couleurs</th><th class="num">Points</th><th class="num">Parties</th><th class="num">Victoires</th><th class="num">Winrate</th></tr></thead>
    <tbody>${corps}</tbody>
  </table></div>`;
}

// Récompenses de saison : MVP (victoires), progression ELO, assiduité.
function recompenses(model, sid) {
  const parties = model.parties.filter((p) => !sid || p.saison_id === sid);
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j]));
  const stat = {};
  const S = (id) => stat[id] || (stat[id] = { parties: 0, victoires: 0 });
  for (const p of parties) {
    for (const part of p.participants) {
      if (!part.joueur_id) continue;
      const s = S(part.joueur_id);
      s.parties++;
      const win = p.type === 'pod' ? part.place === 1 : part.resultat === 'V';
      if (win) s.victoires++;
    }
  }
  const ids = Object.keys(stat);
  if (!ids.length) return null;

  const assidu = ids.reduce((a, b) => (stat[b].parties > stat[a].parties ? b : a));
  const mvp = ids.reduce((a, b) => {
    const wa = stat[a].victoires, wb = stat[b].victoires;
    if (wb !== wa) return wb > wa ? b : a;
    return (stat[b].victoires / stat[b].parties) > (stat[a].victoires / stat[a].parties) ? b : a;
  });
  // meilleure progression ELO (delta fin-début, meilleur des deux pools)
  const prog = {};
  for (const cat of ['construit', 'limite']) {
    const tl = eloTimeline(model, cat, sid);
    for (const id of Object.keys(tl)) {
      const s = tl[id], delta = s[s.length - 1] - s[0];
      if (!(id in prog) || delta > prog[id]) prog[id] = delta;
    }
  }
  const progIds = Object.keys(prog);
  const progId = progIds.length ? progIds.reduce((a, b) => (prog[b] > prog[a] ? b : a)) : null;

  return {
    mvp: { j: jn[mvp], v: stat[mvp].victoires },
    prog: progId ? { j: jn[progId], v: prog[progId] } : null,
    assidu: { j: jn[assidu], v: stat[assidu].parties },
  };
}

function blocRecompenses(r) {
  if (!r) return '<div class="empty">Pas encore de parties cette saison.</div>';
  const card = (emo, lib, w, metric) => `<div class="rcard award">
    <span class="rc-lib">${emo} ${lib}</span>
    <b class="rc-val" style="font-size:18px">${w && w.j ? esc(w.j.nom) : '<span class="rc-vide">—</span>'}</b>
    <span class="rc-sub">${w && w.j ? metric : ''}</span>
  </div>`;
  return `<div class="resume">
    ${card('🏆', 'MVP', r.mvp, r.mvp ? `${r.mvp.v} victoire${r.mvp.v > 1 ? 's' : ''}` : '')}
    ${card('📈', 'Progression ELO', r.prog, r.prog ? `${r.prog.v >= 0 ? '+' : ''}${r0(r.prog.v)} pts` : '')}
    ${card('🎖️', 'Plus assidu', r.assidu, r.assidu ? `${r.assidu.v} parties` : '')}
  </div>`;
}

function tableCouleurs(lignes) {
  const noms = { W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert' };
  const corps = lignes.length ? lignes.map((l) => `<tr>
      <td class="desig"><span class="mana-dot mana-${l.couleur.toLowerCase()}"></span> ${noms[l.couleur]}</td>
      <td class="num">${l.parties}</td>
      <td class="num">${l.victoires}</td>
      <td class="num">${pct(l.winrate)}</td>
    </tr>`).join('')
    : `<tr><td colspan="4" class="empty">Aucun pod enregistré.</td></tr>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>Couleur</th><th class="num">Parties</th><th class="num">Victoires</th><th class="num">Winrate</th></tr></thead>
    <tbody>${corps}</tbody>
  </table></div>`;
}
