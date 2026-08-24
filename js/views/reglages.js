// reglages.js — configuration du dépôt GitHub et du token de publication.
// Le token ne quitte JAMAIS le navigateur (localStorage) et n'est utilisé que
// pour les appels directs à api.github.com.

import * as gh from '../github.js';
import * as store from '../store.js';
import { esc } from '../util.js';

export function renderReglages(container, ctx) {
  const cfg = gh.getConfig() || { owner: '', repo: '', branch: 'main', path: 'data/ligue.json' };
  const aToken = !!gh.getToken();

  container.innerHTML = `
    <h1>Réglages</h1>
    <p class="sub">Où publier le log de la ligue, et avec quel jeton. Tout reste local à ce navigateur.</p>

    <div class="form-card">
      <h2>Dépôt GitHub</h2>
      <div class="fgrid">
        <div><label>Propriétaire (owner)</label><input type="text" id="rg-owner" value="${esc(cfg.owner)}" placeholder="ton-pseudo-github"></div>
        <div><label>Dépôt (repo)</label><input type="text" id="rg-repo" value="${esc(cfg.repo)}" placeholder="jurande"></div>
        <div><label>Branche</label><input type="text" id="rg-branch" value="${esc(cfg.branch || 'main')}"></div>
        <div><label>Chemin du fichier</label><input type="text" id="rg-path" value="${esc(cfg.path || 'data/ligue.json')}"></div>
      </div>
      <div style="margin-top:14px"><button class="btn btn-noir" id="rg-save-cfg">Enregistrer le dépôt</button></div>
    </div>

    <div class="form-card">
      <h2>Jeton d'accès (token)</h2>
      <p class="mini">Crée un <b>fine-grained token</b> GitHub limité à ce dépôt, avec la permission
        <b>Contents : Read and write</b>. Colle-le ci-dessous — il est stocké uniquement dans ce navigateur.</p>
      <div class="ajout-inline">
        <input type="password" id="rg-token" placeholder="${aToken ? '•••••••• (un token est déjà enregistré)' : 'github_pat_…'}" autocomplete="off">
        <button class="btn" id="rg-save-token">Enregistrer</button>
        <button class="btn" id="rg-verif">Vérifier</button>
        ${aToken ? '<button class="btn" id="rg-clear-token">Oublier</button>' : ''}
      </div>
      <div class="hint" id="rg-token-etat">${aToken ? 'Un token est enregistré.' : 'Aucun token enregistré.'}</div>
    </div>

    <div class="form-card">
      <h2>Synchronisation</h2>
      <p class="mini">Récupère la dernière version publiée directement via l'API (plus fraîche que le site,
        qui attend la reconstruction de GitHub Pages).</p>
      <button class="btn" id="rg-pull">Charger depuis le dépôt (API)</button>
    </div>
  `;

  container.querySelector('#rg-save-cfg').onclick = () => {
    gh.setConfig({
      owner: val(container, '#rg-owner'), repo: val(container, '#rg-repo'),
      branch: val(container, '#rg-branch') || 'main', path: val(container, '#rg-path') || 'data/ligue.json',
    });
    ctx.toast('Dépôt enregistré.');
  };

  container.querySelector('#rg-save-token').onclick = () => {
    const t = val(container, '#rg-token');
    if (!t) return ctx.toast('Colle un token.');
    gh.setToken(t);
    ctx.toast('Token enregistré.');
    ctx.refresh();
  };

  container.querySelector('#rg-verif').onclick = async () => {
    const etat = container.querySelector('#rg-token-etat');
    const t = val(container, '#rg-token');
    if (t) gh.setToken(t);
    etat.textContent = 'Vérification…';
    try {
      const login = await gh.verifierToken();
      etat.textContent = `✓ Token valide — connecté en tant que ${login}.`;
    } catch (e) {
      etat.textContent = '✗ ' + e.message;
    }
  };

  const clear = container.querySelector('#rg-clear-token');
  if (clear) clear.onclick = () => { gh.setToken(''); ctx.toast('Token oublié.'); ctx.refresh(); };

  container.querySelector('#rg-pull').onclick = async () => {
    try {
      const model = await gh.lireDepuisApi();
      store.remplacer(model);
      ctx.toast('Chargé depuis le dépôt.');
      ctx.refresh();
    } catch (e) {
      ctx.toast('Échec : ' + e.message);
    }
  };
}

function val(c, sel) { return c.querySelector(sel).value.trim(); }
