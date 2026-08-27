#!/usr/bin/env python3
# tools/scryfall-fetch.py — pre-resout les commandants de data/ligue.json via
# l'API Scryfall et EMBARQUE le resultat dans le depot (images + noms FR), pour
# que « La Jurande » fonctionne derriere le proxy SEMINOR sans jamais appeler
# Scryfall a l'execution.
#
# A lancer depuis un reseau AVEC acces libre a Scryfall (maison, partage 4G) :
#     python tools/scryfall-fetch.py            # ne resout que les manquants
#     python tools/scryfall-fetch.py --force     # refait tout
# Puis commiter  data/scryfall.json  et  data/cards/.
#
# Python 3 — stdlib uniquement (urllib), aucune dependance a installer.

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIGUE = os.path.join(ROOT, 'data', 'ligue.json')
OUT_JSON = os.path.join(ROOT, 'data', 'scryfall.json')
CARDS_DIR = os.path.join(ROOT, 'data', 'cards')
FORCE = '--force' in sys.argv[1:]
UA = 'la-jurande/1.0 (ligue MTG interne; contact hanot@seminor.fr)'


def cle(s):
    return (s or '').strip().lower()


def slug(s):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', cle(s))).strip('-')


def http_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:      # recherche sans resultat : normal, on renvoie vide
            return None
        raise


def http_bytes(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def _uris(card):
    return card.get('image_uris') or (card.get('card_faces') or [{}])[0].get('image_uris') or {}


def image_de(card):
    # Illustration recadree (art_crop), pour le bandeau — recto-verso gere.
    u = _uris(card)
    return u.get('art_crop') or u.get('normal') or u.get('small')


def full_de(card):
    # Carte entiere (format portrait).
    u = _uris(card)
    return u.get('normal') or u.get('large') or u.get('small')


def main():
    with open(LIGUE, encoding='utf-8') as f:
        ligue = json.load(f)
    noms = list(dict.fromkeys(
        d.get('commandant') for d in ligue.get('decks', []) if d.get('commandant')))
    os.makedirs(CARDS_DIR, exist_ok=True)

    out = {}
    if os.path.exists(OUT_JSON):
        try:
            with open(OUT_JSON, encoding='utf-8') as f:
                out = json.load(f)
        except Exception:
            out = {}

    for nom in noms:
        k = cle(nom)
        prev = out.get(k, {})
        if not FORCE and (prev.get('card') or prev.get('notFound')):
            print('.', nom, '(deja en cache)')
            continue
        print('->', nom, '...', end=' ', flush=True)
        try:
            en = http_json('https://api.scryfall.com/cards/named?fuzzy='
                           + urllib.parse.quote(nom))
            if not en:
                out[k] = {'notFound': True}
                print('introuvable')
                time.sleep(0.12)
                continue

            time.sleep(0.12)   # poli avec l'API

            # Nom francais : correspondance de nom exacte filtree sur la langue FR.
            fr, fr_card = None, None
            q = '!"%s" lang:fr' % en['name']
            rf = http_json('https://api.scryfall.com/cards/search?unique=prints&q='
                           + urllib.parse.quote(q))
            if rf and rf.get('data'):
                fr_card = rf['data'][0]
                fr = fr_card.get('printed_name')

            base = slug(en['name'])
            # Bandeau : illustration recadree (langue indifferente).
            img_rel = None
            img_url = image_de(en)
            if img_url:
                with open(os.path.join(CARDS_DIR, base + '.jpg'), 'wb') as f:
                    f.write(http_bytes(img_url))
                img_rel = 'data/cards/' + base + '.jpg'

            # Carte entiere : version FR si elle existe, sinon EN.
            card_rel = None
            full_url = full_de(fr_card) if fr_card else None
            if not full_url:
                full_url = full_de(en)
            if full_url:
                with open(os.path.join(CARDS_DIR, base + '-full.jpg'), 'wb') as f:
                    f.write(http_bytes(full_url))
                card_rel = 'data/cards/' + base + '-full.jpg'

            out[k] = {
                'img': img_rel,
                'card': card_rel,
                'en': en['name'],
                'fr': fr,
                'uri': en.get('scryfall_uri'),
            }
            print('ok', ('(FR: %s)' % fr) if fr else '(pas de nom FR)')
        except Exception as e:
            print('ERREUR', e)
        time.sleep(0.12)

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('\nEcrit %s — %d entrees.' % (OUT_JSON, len(out)))


if __name__ == '__main__':
    main()
