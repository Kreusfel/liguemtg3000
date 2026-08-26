// rivalites.js — met en avant les rivalités 1v1 : paires les plus disputées,
// les plus serrées, et les dominations. Lecture seule, recalculé depuis le log.

import { getModel } from '../store.js';
import { faceAFace } from '../ranking.js';
import { esc } from '../util.js';

export function renderRivalites(container, ctx) {
  const model = getModel();
  const noms = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));
  const h = faceAFace(model);

  // Paires non ordonnées (a < b dans l'ordre des joueurs) avec au moins 1 match.
  const ordre = Object.fromEntries(model.joueurs.map((j, i) => [j.id, i]));
  const paires = [];
  for (const a of Object.keys(h)) {
    for (const b of Object.keys(h[a])) {
      if (!(a in ordre) || !(b in ordre) || ordre[a] >= ordre[b]) continue;
      const r = h[a][b];               // du point de vue de a
      if (!r.total) continue;
      paires.push({ a, b, va: r.v, vb: r.d, n: r.n, total: r.total, diff: Math.abs(r.v - r.d) });
    }
  }

  if (!paires.length) {
    container.innerHTML = `<h1>Rivalités</h1>
      <p class="sub">Les duels 1v1 les plus marquants entre membres de la ligue.</p>
      <div class="empty">Aucun match 1v1 disputé pour l'instant.</div>`;
    return;
  }

  // Intensité = nombre de matchs ; à égalité, le plus serré d'abord.
  const parIntensite = paires.slice().sort((x, y) => y.total - x.total || x.diff - y.diff);
  // Serrés : au moins 2 matchs, écart faible, le plus disputé d'abord.
  const serres = paires.filter((p) => p.total >= 2 && p.diff <= 1).sort((x, y) => y.total - x.total || x.diff - y.diff);
  // Dominations : écart net.
  const dominations = paires.filter((p) => p.diff >= 2).sort((x, y) => y.diff - x.diff || y.total - x.total);

  container.innerHTML = `
    <h1>Rivalités</h1>
    <p class="sub">Les duels 1v1 les plus marquants (toutes catégories confondues), recalculés depuis les résultats.</p>

    <h2>🔝 Les plus disputées</h2>
    <div class="riv-grid">${parIntensite.slice(0, 6).map((p) => carte(p, noms)).join('')}</div>

    ${serres.length ? `<h2>🔥 Les plus serrées</h2>
      <div class="riv-grid">${serres.slice(0, 6).map((p) => carte(p, noms)).join('')}</div>` : ''}

    ${dominations.length ? `<h2>💪 Dominations</h2>
      <div class="riv-grid">${dominations.slice(0, 6).map((p) => carte(p, noms)).join('')}</div>` : ''}
  `;
}

function tag(p) {
  if (p.total >= 3 && p.va === p.vb) return '<span class="riv-tag riv-eq">⚖️ parfaitement équilibré</span>';
  if (p.diff <= 1 && p.total >= 2) return '<span class="riv-tag riv-serre">🔥 serré</span>';
  if (p.diff >= 3) return '<span class="riv-tag riv-domin">💪 domination</span>';
  return '';
}

function carte(p, noms) {
  const leader = p.va === p.vb ? null : (p.va > p.vb ? p.a : p.b);
  const fa = p.va || 0.001, fb = p.vb || 0.001, fn = p.n || 0;
  return `<div class="rivalry">
    <div class="riv-noms">
      <b class="${leader === p.a ? 'riv-lead' : ''}">${esc(noms[p.a] || '?')}</b>
      <span class="vs">vs</span>
      <b class="${leader === p.b ? 'riv-lead' : ''}">${esc(noms[p.b] || '?')}</b>
    </div>
    <div class="riv-bar">
      <span class="riv-a" style="flex:${fa}"></span>
      ${fn ? `<span class="riv-n" style="flex:${fn}"></span>` : ''}
      <span class="riv-b" style="flex:${fb}"></span>
    </div>
    <div class="riv-detail">
      <span class="mono">${p.va}–${p.vb}${p.n ? '–' + p.n : ''}</span>
      · ${p.total} match${p.total > 1 ? 's' : ''}
      ${tag(p)}
    </div>
  </div>`;
}
