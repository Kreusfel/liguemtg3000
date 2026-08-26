// decks.js — page des decks Commander : une carte par deck (identité couleur,
// propriétaire, stats agrégées par deck_id — prêts inclus — et détail « joué
// par » quand un deck est emprunté). Ajout / édition / suppression ici même.

import { getModel, upsertDeck, removeDeck, refsDeck } from '../store.js';
import { classementCommander } from '../ranking.js';
import { esc, pct } from '../util.js';
import { optJoueurs, optJoueursSel, parseCouleurs, deckPlays, manaGradient } from './shared.js';
import { getCached, resoudreManquants } from '../scryfall.js';

let editDeck = null;   // id du deck en cours d'édition (null = aucun)

export function renderDecks(container, ctx) {
  const model = getModel();
  const stat = Object.fromEntries(classementCommander(model).decks.map((d) => [d.id, d]));
  const plays = deckPlays(model);
  const jn = Object.fromEntries(model.joueurs.map((j) => [j.id, j.nom]));

  const cartes = model.decks.map((d) => carteDeck(d, model, stat[d.id], plays, jn)).join('');

  container.innerHTML = `
    <h1>Decks — ${model.decks.length}</h1>
    <p class="sub">Chaque deck cumule ses stats même prêté à d'autres joueurs. Illustrations et noms FR via Scryfall.</p>
    ${formAjout(model)}
    <div class="joueur-grid">${cartes || '<div class="empty">Aucun deck.</div>'}</div>
  `;

  wire(container, ctx, model);
  enrichScryfall(container);
}

// Récupère illustration + nom FR pour les commandants pas encore en cache,
// puis applique au DOM (sans re-render). Les cartes déjà en cache sont peintes
// directement par carteDeck().
function enrichScryfall(container) {
  const cards = [...container.querySelectorAll('.deck-card[data-cmd]')];
  const noms = cards.map((c) => c.dataset.cmd).filter(Boolean);
  resoudreManquants(noms, (k, e) => {
    cards.filter((c) => String(c.dataset.cmd).trim().toLowerCase() === k).forEach((c) => appliquerScryfall(c, e));
  });
}

function appliquerScryfall(card, e) {
  if (!e || e.notFound) return;
  if (e.img) {
    const h = card.querySelector('.deck-head');
    if (h) { h.classList.add('has-art'); h.style.backgroundImage = artFond(e.img); }
  }
  if (e.fr) {
    const c = card.querySelector('.deck-commandant');
    const stored = String(card.dataset.cmd || '');
    if (c && !c.querySelector('.cmd-fr') && e.fr.toLowerCase() !== stored.toLowerCase()) {
      c.insertAdjacentHTML('beforeend', ` <span class="cmd-fr">🇫🇷 ${esc(e.fr)}</span>`);
    }
  }
}

function artFond(img) {
  return `linear-gradient(to top, rgba(20,10,30,.78), rgba(20,10,30,.15)), url('${img}')`;
}

function formAjout(model) {
  return `<div class="form-card">
    <div class="fgrid">
      <div><label>Propriétaire</label><select id="de-joueur">${optJoueurs(model, true)}</select></div>
      <div><label>Nom du deck</label><input type="text" id="de-nom" placeholder="ex. Krenko Gobelins"></div>
      <div><label>Commandant</label><input type="text" id="de-cmd" placeholder="ex. Krenko, Mob Boss"></div>
      <div><label>Couleurs</label><input type="text" id="de-couleurs" placeholder="WUBRG (ex. RG)"></div>
    </div>
    <div style="margin-top:12px"><button class="btn btn-noir" id="de-add">Ajouter le deck</button></div>
  </div>`;
}

function carteDeck(d, model, s, plays, jn) {
  const grad = manaGradient(d.couleurs || []);
  const style = grad
    ? ` style="border:3px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box, ${grad} border-box"`
    : '';

  if (editDeck === d.id) {
    return `<div class="joueur-card"${style}>
      <div class="jc-head"><b>Modifier le deck</b></div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px" data-id="${d.id}">
        <div><label>Propriétaire</label><select class="e-joueur">${optJoueursSel(model, d.joueur_id)}</select></div>
        <div><label>Nom</label><input type="text" class="e-nom" value="${esc(d.nom)}"></div>
        <div><label>Commandant</label><input type="text" class="e-cmd" value="${esc(d.commandant || '')}"></div>
        <div><label>Couleurs</label><input type="text" class="e-couleurs" value="${esc((d.couleurs || []).join(''))}"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-mini btn-noir" data-act="de-save">Enregistrer</button>
          <button class="btn btn-mini" data-act="de-cancel">Annuler</button>
        </div>
      </div>
    </div>`;
  }

  const usage = usageDeck(model, d.id);
  const emprunteurs = Object.keys(usage).filter((jid) => jid !== d.joueur_id);
  const joueParHtml = Object.keys(usage).length
    ? Object.entries(usage).sort((a, b) => b[1].parties - a[1].parties).map(([jid, u]) =>
      `<div class="deck-pill">${esc(jn[jid] || '?')}${jid === d.joueur_id ? ' <small>propriétaire</small>' : ' <small>emprunt</small>'}
        <small>${u.parties} partie${u.parties > 1 ? 's' : ''} · ${u.victoires} V</small></div>`).join('')
    : '<span class="empty">jamais joué</span>';

  // Illustration + nom FR depuis le cache Scryfall (le reste est chargé ensuite).
  const sc = getCached(d.commandant);
  const art = sc && sc.img ? sc.img : null;
  const fr = sc && sc.fr ? sc.fr : null;
  const headStyle = art ? ` style="background-image:${artFond(art)}"` : '';
  const frTag = fr && fr.toLowerCase() !== String(d.commandant || '').toLowerCase()
    ? ` <span class="cmd-fr">🇫🇷 ${esc(fr)}</span>` : '';

  return `<div class="joueur-card deck-card" data-cmd="${esc(d.commandant || '')}"${style}>
    <div class="jc-head deck-head${art ? ' has-art' : ''}"${headStyle}><b>${esc(d.nom)}</b>${emprunteurs.length ? ' <span class="jc-pret" title="deck prêté">🤝</span>' : ''}</div>
    <div class="jc-stats">
      <div class="jc-stat"><span>Propriétaire</span><b style="font-size:15px">${esc(jn[d.joueur_id] || '?')}</b></div>
      <div class="jc-stat"><span>Parties</span><b>${plays[d.id] || 0}</b></div>
      <div class="jc-stat"><span>Victoires</span><b>${s ? s.victoires : 0}</b></div>
      <div class="jc-stat"><span>Winrate</span><b>${s ? pct(s.winrate) : '—'}</b></div>
    </div>
    <div class="jc-decks">
      ${d.commandant ? `<div class="deck-commandant">${esc(d.commandant)}${frTag}</div>` : ''}
      <div class="deck-jouepar"><span class="jp-lib">Joué par</span>${joueParHtml}</div>
    </div>
    <div class="deck-actions">
      <button class="btn btn-mini" data-act="de-edit" data-id="${d.id}">Modifier</button>
      <button class="btn btn-mini" data-act="de-del" data-id="${d.id}">Supprimer</button>
    </div>
  </div>`;
}

// Usage d'un deck par joueur : { joueur_id: {parties, victoires} } (prêts inclus).
function usageDeck(model, deckId) {
  const u = {};
  for (const p of model.parties) {
    for (const x of (p.participants || [])) {
      if (x.deck_id !== deckId) continue;
      const e = u[x.joueur_id] || (u[x.joueur_id] = { parties: 0, victoires: 0 });
      e.parties++;
      if (p.type === 'pod' ? x.place === 1 : x.resultat === 'V') e.victoires++;
    }
  }
  return u;
}

function wire(container, ctx, model) {
  const add = () => {
    const joueur_id = container.querySelector('#de-joueur').value;
    const nom = container.querySelector('#de-nom').value.trim();
    if (!joueur_id || !nom) return ctx.toast('Propriétaire + nom du deck requis.');
    upsertDeck({
      joueur_id, nom,
      commandant: container.querySelector('#de-cmd').value.trim(),
      couleurs: parseCouleurs(container.querySelector('#de-couleurs').value),
      format: 'commander',
    });
    ctx.toast('Deck ajouté.'); ctx.refresh();
  };
  container.querySelector('#de-add').onclick = add;

  container.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => action(b, container, ctx);
  });
}

function action(btn, container, ctx) {
  const id = btn.dataset.id || (btn.closest('[data-id]') && btn.closest('[data-id]').dataset.id);
  switch (btn.dataset.act) {
    case 'de-edit': editDeck = id; ctx.refresh(); break;
    case 'de-cancel': editDeck = null; ctx.refresh(); break;
    case 'de-save': {
      const box = btn.closest('[data-id]');
      const joueur_id = box.querySelector('.e-joueur').value;
      const nom = box.querySelector('.e-nom').value.trim();
      if (!joueur_id || !nom) return ctx.toast('Propriétaire + nom requis.');
      upsertDeck({
        id, joueur_id, nom,
        commandant: box.querySelector('.e-cmd').value.trim(),
        couleurs: parseCouleurs(box.querySelector('.e-couleurs').value),
      });
      editDeck = null; ctx.toast('Deck modifié.'); ctx.refresh(); break;
    }
    case 'de-del': {
      const n = refsDeck(id);
      if (n) return ctx.toast(`Impossible : deck utilisé dans ${n} partie(s).`);
      if (!confirm('Supprimer ce deck ?')) return;
      removeDeck(id); ctx.toast('Deck supprimé.'); ctx.refresh(); break;
    }
  }
}
