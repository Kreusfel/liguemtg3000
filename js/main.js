// main.js — orchestrateur : chargement du log, navigation, contexte partagé.

import { load, isDirty } from './store.js';
import { renderClassement } from './views/classement.js';
import { renderHistorique } from './views/historique.js';
import { renderJoueurs } from './views/joueurs.js';
import { renderDecks } from './views/decks.js';
import { renderRivalites } from './views/rivalites.js';
import { renderSaisie } from './views/saisie.js';
import { renderReglages } from './views/reglages.js';

const VIEWS = {
  classement: renderClassement,
  historique: renderHistorique,
  joueurs: renderJoueurs,
  decks: renderDecks,
  rivalites: renderRivalites,
  saisie: renderSaisie,
  reglages: renderReglages,
};

const el = (id) => document.getElementById(id);
const state = { view: 'classement' };

const ctx = { toast, refresh, goto };

function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2600);
}

function goto(view) {
  const b = document.querySelector(`#nav button[data-p="${view}"]`);
  if (b) b.click();
}

function startUI() {
  document.querySelectorAll('#nav button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#nav button').forEach((x) => x.setAttribute('aria-selected', 'false'));
      b.setAttribute('aria-selected', 'true');
      state.view = b.dataset.p;
      renderView();
      window.scrollTo(0, 0);
    };
  });
  renderView();
  window.__appReady = true;   // signale au filet de secours (index.html) que l'app tourne
}

function renderView() {
  majBadge();
  const c = el('view');
  c.innerHTML = '';
  (VIEWS[state.view] || renderClassement)(c, ctx);
}

function refresh() { renderView(); }

function majBadge() {
  el('badge-saisie').textContent = isDirty() ? '●' : '';
}

load()
  .then(startUI)
  .catch((e) => { console.error(e); toast('Erreur de chargement : ' + e.message); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
