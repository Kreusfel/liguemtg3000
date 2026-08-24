// ranking.js — LE cerveau. Rien n'est stocké : tous les classements sont
// recalculés à la volée depuis le log brut (model.parties).
//
// Deux systèmes, comme cadré avec la Jurande :
//   1) ELO 1v1, DEUX pools indépendants : « construit » et « limité ».
//      Un joueur a donc un rating Construit ET un rating Limité, jamais mêlés.
//   2) Commander multi (pods) : classement en POINTS, par Joueur et par Deck.

export const ELO_DEBUT = 1000;   // rating de départ
export const ELO_K = 24;         // facteur K (amplitude d'ajustement)

export const PTS_VICTOIRE = 3;   // points d'une victoire de pod
export const PTS_PARTICIPATION = 1;

// --- index pratiques --------------------------------------------------------
function index(model) {
  const j = Object.fromEntries(model.joueurs.map((x) => [x.id, x]));
  const d = Object.fromEntries(model.decks.map((x) => [x.id, x]));
  const s = Object.fromEntries(model.soirees.map((x) => [x.id, x]));
  return { j, d, s };
}

// Date d'une partie (via sa soirée) — pour l'ordre chronologique de l'ELO.
function dateDe(idx, p) {
  const so = idx.s[p.soiree_id];
  return so ? so.date : '9999-99-99';
}

// --- ELO 1v1 (par catégorie) ------------------------------------------------
function esperance(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

// Classement ELO d'une catégorie ('construit' | 'limite'), pour une saison
// (saisonId null = toutes saisons confondues).
export function classementElo(model, categorie, saisonId = null) {
  const idx = index(model);
  const parties = model.parties
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.type === '1v1' && p.categorie === categorie
      && (!saisonId || p.saison_id === saisonId) && p.participants.length === 2)
    .sort((a, b) => {
      const da = dateDe(idx, a.p), db = dateDe(idx, b.p);
      return da < db ? -1 : da > db ? 1 : a.i - b.i;   // date puis ordre de saisie
    });

  const rating = {};
  const stat = {};   // joueur_id -> {parties, v, d, n}
  const get = (id) => (id in rating ? rating[id] : ELO_DEBUT);
  const st = (id) => (stat[id] || (stat[id] = { parties: 0, v: 0, d: 0, n: 0 }));

  for (const { p } of parties) {
    const [A, B] = p.participants;
    const sa = A.resultat === 'V' ? 1 : A.resultat === 'N' ? 0.5 : 0;
    const sb = 1 - sa;
    const ra = get(A.joueur_id), rb = get(B.joueur_id);
    rating[A.joueur_id] = ra + ELO_K * (sa - esperance(ra, rb));
    rating[B.joueur_id] = rb + ELO_K * (sb - esperance(rb, ra));
    for (const [part, sc] of [[A, sa], [B, sb]]) {
      const s = st(part.joueur_id);
      s.parties++;
      if (sc === 1) s.v++; else if (sc === 0.5) s.n++; else s.d++;
    }
  }

  return Object.keys(stat).map((id) => {
    const s = stat[id];
    return {
      joueur: idx.j[id], joueur_id: id,
      rating: rating[id], parties: s.parties, v: s.v, d: s.d, n: s.n,
      winrate: s.parties ? s.v / s.parties : 0,
    };
  }).sort((a, b) => b.rating - a.rating);
}

// --- Commander multi (points, Joueur & Deck) --------------------------------
function agrege(map, cle, entite, win) {
  const e = map[cle] || (map[cle] = { entite, parties: 0, victoires: 0, points: 0 });
  e.parties++;
  if (win) e.victoires++;
  e.points += PTS_PARTICIPATION + (win ? PTS_VICTOIRE : 0);
}

// Classement Commander d'une saison : { joueurs:[...], decks:[...] }.
export function classementCommander(model, saisonId = null) {
  const idx = index(model);
  const parJoueur = {};
  const parDeck = {};

  const pods = model.parties.filter((p) => p.type === 'pod'
    && (!saisonId || p.saison_id === saisonId));

  for (const p of pods) {
    for (const part of p.participants) {
      const win = part.place === 1;
      if (part.joueur_id) agrege(parJoueur, part.joueur_id, idx.j[part.joueur_id], win);
      if (part.deck_id) agrege(parDeck, part.deck_id, idx.d[part.deck_id], win);
    }
  }

  const fin = (map, avecJoueur) => Object.entries(map).map(([id, e]) => ({
    id,
    entite: e.entite,
    joueur: avecJoueur && e.entite ? idx.j[e.entite.joueur_id] : null,
    parties: e.parties, victoires: e.victoires, points: e.points,
    winrate: e.parties ? e.victoires / e.parties : 0,
  })).sort((a, b) => b.points - a.points || b.winrate - a.winrate);

  return { joueurs: fin(parJoueur, false), decks: fin(parDeck, true) };
}

// Saison active (ou la plus récente), pratique pour les vues.
export function saisonActive(model) {
  return model.saisons.find((s) => s.active)
    || model.saisons.slice().sort((a, b) => (b.debut || '').localeCompare(a.debut || ''))[0]
    || null;
}
