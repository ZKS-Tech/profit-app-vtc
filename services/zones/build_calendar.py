#!/usr/bin/env python3
"""Calendrier pour la carte : vacances scolaires (académie de Toulouse) et jours fériés.

Source vacances : « Calendrier scolaire » du ministère de l'Éducation nationale
(data.education.gouv.fr, Licence Ouverte). Jours fériés : calculés (dont Pâques, Ascension, Pentecôte).

    python3 build_calendar.py --out ../../apps/mobile/src/data/zones/calendrier.json
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from datetime import date, datetime, timedelta

API = ("https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records"
       "?where=location%3D%22Toulouse%22%20and%20end_date%3E%3D%22{since}%22&limit=100")


def easter(y: int) -> date:
    """Dimanche de Pâques (algorithme de Meeus/Jones/Butcher)."""
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(y, month, day)


def public_holidays(y: int) -> dict[str, str]:
    e = easter(y)
    days = {
        date(y, 1, 1): "Jour de l'an",
        e + timedelta(days=1): "Lundi de Pâques",
        date(y, 5, 1): "Fête du travail",
        date(y, 5, 8): "Victoire 1945",
        e + timedelta(days=39): "Ascension",
        e + timedelta(days=50): "Lundi de Pentecôte",
        date(y, 7, 14): "Fête nationale",
        date(y, 8, 15): "Assomption",
        date(y, 11, 1): "Toussaint",
        date(y, 11, 11): "Armistice",
        date(y, 12, 25): "Noël",
    }
    return {d.isoformat(): n for d, n in sorted(days.items())}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    a = p.parse_args()
    since = (date.today() - timedelta(days=120)).isoformat()
    req = urllib.request.Request(API.format(since=since), headers={"User-Agent": "vtc-profit-ai"})
    for attempt in range(4):  # réseau parfois instable : on réessaie
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                records = json.load(r)["results"]
            break
        except OSError:
            if attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))
    vacances = {}
    for rec in records:
        if rec.get("population") not in ("-", "Élèves", None):
            continue  # on garde le calendrier des élèves
        # Les dates de début sont publiées la veille à 23 h UTC : on prend la date locale.
        start = (datetime.fromisoformat(rec["start_date"]) + timedelta(hours=2)).date().isoformat()
        end = (datetime.fromisoformat(rec["end_date"]) + timedelta(hours=2)).date().isoformat()
        vacances[(rec["description"], start)] = {"nom": rec["description"], "debut": start, "fin": end}
    years = range(date.today().year - 1, date.today().year + 3)
    out = {
        "sources": {
            "vacances": "Calendrier scolaire, académie de Toulouse (data.education.gouv.fr, Licence Ouverte)",
            "feries": "Jours fériés calculés",
        },
        "vacances": sorted(vacances.values(), key=lambda v: v["debut"]),
        "feries": {k: v for y in years for k, v in public_holidays(y).items()},
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{len(out['vacances'])} périodes de vacances, {len(out['feries'])} jours fériés → {a.out}")
    for v in out["vacances"][:6]:
        print("  ", v["nom"], v["debut"], "→", v["fin"])


if __name__ == "__main__":
    main()
