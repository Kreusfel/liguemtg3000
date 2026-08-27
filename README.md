# La Jurande — ligue Magic

Application **statique** (PWA) de suivi d'une ligue Magic entre amis : classements
recalculés en direct, hébergeable sur **GitHub Pages**, sans serveur.

- **ELO 1v1** en deux pools **indépendants** : *Construit* et *Limité*.
- **Classement Commander** multi-joueurs en **points**, par **Joueur** et par **Deck**.
- Un **organisateur** saisit tout ; les résultats sont publiés dans le dépôt via
  l'API GitHub ; tout le monde consulte le site en lecture seule.

## Comment ça marche

- **Données** : un seul fichier versionné, `data/ligue.json` (le *log* brut :
  joueurs, decks, saisons, soirées, parties). Aucun classement n'est stocké.
- **Lecture** (tout le monde) : le site charge `data/ligue.json` et **recalcule**
  les classements dans le navigateur (`js/ranking.js`).
- **Écriture** (organisateur) : l'onglet *Saisie* édite un brouillon local, puis
  **Publier** commit `data/ligue.json` dans le dépôt via l'**API GitHub**, avec
  un **token personnel** stocké uniquement dans le navigateur (onglet *Réglages*).

## Mettre en ligne (GitHub Pages)

1. Créer un dépôt GitHub (ex. `jurande`) et y pousser ce dossier.
2. **Settings → Pages** : source = branche `main`, dossier `/root`.
3. Ouvrir l'URL publiée (`https://<pseudo>.github.io/jurande/`).
4. Onglet **Réglages** :
   - Dépôt : *owner* = ton pseudo, *repo* = `jurande`, branche `main`,
     chemin `data/ligue.json`.
   - Token : créer un **fine-grained token** GitHub limité à ce dépôt avec la
     permission **Contents : Read and write**, le coller, *Vérifier*.
5. Saisir une soirée / des parties → **Publier**. Après ~30 s (reconstruction
   Pages), tout le monde voit la mise à jour.

> Le token n'est nécessaire qu'à **toi** (l'organisateur), sur ton navigateur.
> Les autres membres n'ont qu'à ouvrir l'URL.

## Développer / tester en local

```bash
cd jurande
python -m http.server 8020
# http://localhost:8020
```

En local, la publication GitHub fonctionne dès que le token est configuré ;
sinon, l'app reste utilisable (édition en brouillon local, non publiée).

## Modèle de données (`data/ligue.json`)

```jsonc
{
  "joueurs":  [{ "id", "nom", "actif" }],
  "decks":    [{ "id", "joueur_id", "nom", "commandant", "couleurs":[], "format" }],
  "saisons":  [{ "id", "nom", "debut", "fin", "active" }],
  "soirees":  [{ "id", "saison_id", "date", "lieu", "notes" }],
  "parties": [
    // 1v1 : alimente l'ELO de sa catégorie
    { "type":"1v1", "categorie":"construit|limite", "format",
      "participants":[{ "joueur_id", "deck_id", "resultat":"V|D|N" }] },
    // pod : alimente le classement Commander (joueur + deck)
    { "type":"pod", "format":"commander",
      "participants":[{ "joueur_id", "deck_id", "place" }] }
  ]
}
```

## Calcul des classements (`js/ranking.js`)

- **ELO** : départ 1000, K=24, espérance logistique classique. Parties traitées
  dans l'ordre chronologique, **par catégorie** (les deux ELO ne se mélangent
  jamais).
- **Commander** : par participant de pod, `participation (1 pt)` + `victoire
  (3 pts)` si `place = 1`. Cumulé par joueur **et** par deck ; winrate =
  victoires / parties. Constantes ajustables en tête du fichier.

## Structure

```
jurande/
├── index.html            # coquille + navigation
├── manifest.webmanifest / sw.js
├── data/
│   ├── ligue.json        # le log (source de vérité, versionnée)
│   ├── scryfall.json     # cache commandants (illustration + nom FR), généré hors-ligne
│   └── cards/            # illustrations téléchargées (embarquées dans le dépôt)
├── css/styles.css        # thème « guilde » + accents mana WUBRG
├── icons/icon.svg
├── tools/
│   └── scryfall-fetch.py # pré-résout les commandants via Scryfall (à lancer hors proxy)
└── js/
    ├── main.js           # navigation, contexte
    ├── store.js          # état, brouillon local, mutations
    ├── github.js         # publication via API GitHub (token, Contents API)
    ├── ranking.js        # ELO ×2 + points Commander (joueur/deck)
    ├── scryfall.js       # cache embarqué des commandants (+ repli live)
    ├── util.js           # helpers + sparkline SVG
    └── views/            # shared (briques communes) + classement, historique,
                          #   joueurs, decks, rivalites, saisie, reglages
```

## Illustrations + noms FR des commandants (Scryfall, hors-ligne)

La page **Decks** affiche l'illustration de chaque commandant et son nom
français. Ces données viennent de [Scryfall](https://scryfall.com), mais l'app
**n'appelle jamais l'API à l'exécution** : sur un réseau filtré (proxy) les
appels vers `api.scryfall.com` / `cards.scryfall.io` sont bloqués. À la place,
tout est **pré-résolu et embarqué dans le dépôt** :

- `data/scryfall.json` — table `commandant → { img, card, fr, en, uri }`.
- `data/cards/*.jpg` — les visuels, servis en **même origine** (donc non bloqués
  par le proxy) : `<slug>.jpg` = illustration du bandeau, `<slug>-full.jpg` =
  carte entière (version FR si elle existe).

Le navigateur charge ce cache local au démarrage (`js/scryfall.js` → `prime()`).
L'API en direct ne sert plus que de **repli** pour un commandant absent du
fichier, et uniquement depuis un réseau libre.

### Mettre à jour le cache (après ajout / modif de decks)

Depuis un réseau **avec accès libre à Scryfall** (chez soi, partage 4G — pas
derrière le proxy) :

```bash
python tools/scryfall-fetch.py          # ne résout que les commandants manquants
python tools/scryfall-fetch.py --force  # refait tout (ré-télécharge les images)
```

Le script lit `data/ligue.json`, résout chaque commandant, télécharge les
illustrations dans `data/cards/` et écrit `data/scryfall.json`. Il ne reste plus
qu'à **commiter** `data/scryfall.json` + `data/cards/` (aucune dépendance : Python 3 stdlib).

## Où se fait quoi

- **Saisie** : publication, création de soirée, saisie des parties (onglets
  Commander / Construit / Limité) et gestion des saisons.
- **Joueurs** : cartes + fiche détaillée ; ajout/édition/suppression des joueurs.
- **Decks** : une carte par deck (un deck cumule ses stats même *prêté* à
  d'autres joueurs) ; ajout/édition/suppression.
- **Historique** : soirées et parties, avec édition/suppression sur place.

## Pistes suivantes

- Génération de pods / pairings pour la soirée.
- Export CSV d'un classement / de l'historique.
- Saisie rapide « qui a gagné » et ELO prévisionnel avant match.
