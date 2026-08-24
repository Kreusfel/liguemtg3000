// classement.js — écran public. Sélecteur de saison, puis les DEUX classements
// ELO 1v1 (Construit / Limité, jamais mêlés) et le classement Commander en
// points (Joueur + Deck). Tout est recalculé à la volée depuis le log.

import { getModel, saisons as listeSaisons } from '../store.js';
import { classementElo, classementCommander, saisonActive } from '../ranking.js';
import { esc, pct, r0 } from '../util.js';

let saisonSel = null;   // mémorisé entre rendus

export function renderClassement(container, ctx) {
  const model = getModel();
  const saisons = listeSaisons();
  if (saisonSel === null) { const a = saisonActive(model); saisonSel = a ? a.id : ''; }

  container.innerHTML = `
    <div class="titre-ligne">
      <h1>Classement</h1>
      <select id="c-saison">
        <option value="">Toutes saisons</option>
        ${saisons.map((s) => `<option value="${s.id}" ${s.id === saisonSel ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}
      </select>
    </div>
    <p class="sub">Classements recalculés en direct depuis les résultats. L'ELO Construit et l'ELO Limité sont indépendants.</p>

    <div class="deux-col">
      <div>${tableElo('⚔️ ELO — Construit', classementElo(model, 'construit', saisonSel || null), 'u')}</div>
      <div>${tableElo('🎲 ELO — Limité', classementElo(model, 'limite', saisonSel || null), 'g')}</div>
    </div>

    <h2>Commander — Joueurs</h2>
    ${tableCmdJoueurs(classementCommander(model, saisonSel || null).joueurs)}

    <h2>Commander — Decks</h2>
    ${tableCmdDecks(classementCommander(model, saisonSel || null).decks)}
  `;

  container.querySelector('#c-saison').onchange = (e) => { saisonSel = e.target.value; ctx.refresh(); };
}

function medaille(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1; }

function tableElo(titre, lignes, cls = '') {
  const corps = lignes.length ? lignes.map((l, i) => `
    <tr class="${i < 3 ? 'podium podium-' + (i + 1) : ''}">
      <td class="num rang">${medaille(i)}</td>
      <td class="desig">${esc(l.joueur ? l.joueur.nom : '?')}</td>
      <td class="num elo">${r0(l.rating)}</td>
      <td class="num">${l.parties}</td>
      <td class="num bilan">${l.v}–${l.d}${l.n ? '–' + l.n : ''}</td>
      <td class="num">${pct(l.winrate)}</td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">Aucune partie enregistrée.</td></tr>`;
  return `<div class="bloc bloc-${cls}">
    <div class="bloc-head">${titre}</div>
    <div class="tablewrap"><table>
      <thead><tr><th>#</th><th>Joueur</th><th class="num">Rating</th><th class="num">Parties</th><th class="num">V–D</th><th class="num">Winrate</th></tr></thead>
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
    return `<tr class="${i < 3 ? 'podium podium-' + (i + 1) : ''}">
      <td class="num rang">${medaille(i)}</td>
      <td class="desig">${esc(d ? d.nom : '?')}<small>${esc(d && d.commandant || '')}</small></td>
      <td>${esc(l.joueur ? l.joueur.nom : '—')}</td>
      <td class="num pts">${l.points}</td>
      <td class="num">${l.parties}</td>
      <td class="num">${l.victoires}</td>
      <td class="num">${pct(l.winrate)}</td>
    </tr>`;
  }).join('')
    : `<tr><td colspan="7" class="empty">Aucun pod enregistré.</td></tr>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>#</th><th>Deck</th><th>Joueur</th><th class="num">Points</th><th class="num">Parties</th><th class="num">Victoires</th><th class="num">Winrate</th></tr></thead>
    <tbody>${corps}</tbody>
  </table></div>`;
}
