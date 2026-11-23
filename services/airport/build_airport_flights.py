#!/usr/bin/env python3
"""Récupère les vols de Toulouse-Blagnac (API officielle ATB) et produit, par jour :
les vols normalisés et les flux de voyageurs par tranche de 30 min.

    python3 build_airport_flights.py --check
    python3 build_airport_flights.py --date 2026-11-24 --days 2 --out-dir ../../apps/mobile/src/data/arrivals

Nécessite des identifiants ATB (voir README.md). Sans eux, le script s'arrête proprement :
aucune donnée n'est simulée.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from atb_client import AtbClient, AtbConfig, ConfigError  # noqa: E402
from flights import PARIS, check_field_map, deduplicate, normalize  # noqa: E402
from passenger_flow import slots_for_day  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FIELD_MAP = os.path.join(HERE, "field_map.json")


def load_field_map() -> dict:
    if not os.path.exists(FIELD_MAP):
        return {}
    with open(FIELD_MAP, encoding="utf-8") as f:
        return json.load(f)


def check() -> int:
    cfg = AtbConfig.from_env()
    missing = cfg.missing()
    fm_missing = check_field_map(load_field_map())
    print(f"API : {cfg.base_url}")
    print("Identifiants : " + ("OK" if not missing else "manquants → " + ", ".join(missing)))
    print("field_map.json : " + ("OK" if not fm_missing else "à compléter → " + ", ".join(fm_missing)))
    return 0 if not missing and not fm_missing else 1


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--check", action="store_true", help="Vérifie la configuration sans appel réseau")
    p.add_argument("--date", help="Premier jour, AAAA-MM-JJ")
    p.add_argument("--days", type=int, default=1)
    p.add_argument("--out-dir")
    a = p.parse_args()
    if a.check:
        return check()
    if not (a.date and a.out_dir):
        p.error("--date et --out-dir sont requis")

    try:
        client = AtbClient(AtbConfig.from_env())
    except ConfigError as e:
        print(e, file=sys.stderr)
        return 2

    start = datetime.strptime(a.date, "%Y-%m-%d")
    end = start + timedelta(days=a.days - 1)
    s, e = start.date().isoformat(), end.date().isoformat()

    raw: dict[tuple[str, str], list[dict]] = {}
    for direction in ("arrival", "departure"):
        for kind in ("planned", "realtime"):  # le temps réel en dernier : il prime en cas de doublon
            raw[(direction, kind)] = client.fetch(direction, kind, s, e)

    field_map = load_field_map()
    if check_field_map(field_map):
        sample = os.path.join(client.config.cache_dir, "echantillon-reponse.json")
        with open(sample, "w", encoding="utf-8") as f:
            json.dump({f"{d}/{k}": v[:3] for (d, k), v in raw.items()}, f, ensure_ascii=False, indent=1)
        print(
            f"Réponse réelle enregistrée dans {sample}. Complétez field_map.json (modèle : field_map.example.json) "
            "à partir de cet échantillon, puis relancez.",
            file=sys.stderr,
        )
        return 3

    movements = []
    for (direction, _kind), records in raw.items():
        fetched = time.time()
        movements += [normalize(r, direction, field_map, fetched) for r in records]
    movements = deduplicate(movements)

    os.makedirs(a.out_dir, exist_ok=True)
    for k in range(a.days):
        day = (start + timedelta(days=k)).replace(tzinfo=PARIS)
        of_day = [m for m in movements if m.best_time.date() == day.date()]
        out = {
            "station": {"name": "Aéroport Toulouse-Blagnac", "iata": "TLS", "icao": "LFBO"},
            "source": {"name": "API Aéroport Toulouse-Blagnac", "url": client.config.base_url},
            "generatedAt": datetime.now(PARIS).isoformat(timespec="seconds"),
            "flights": [m.to_json() for m in of_day],
            **slots_for_day(of_day, day),
        }
        path = os.path.join(a.out_dir, f"aeroport-vols-{day.date().isoformat()}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{day.date()} : {len(of_day)} mouvements → {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
