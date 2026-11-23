#!/usr/bin/env python3
"""Arrivées planifiées en gare à partir du GTFS national SNCF (TGV, Intercités, TER…).

Source : « Réseau SNCF TGV, Intercités et TER », transport.data.gouv.fr — licence ODbL.
Horaires théoriques : les retards (GTFS-RT) seront ajoutés plus tard.

Usage :
    python3 build_arrivals.py --gtfs <dossier GTFS dézippé> --dates 2026-11-24,2026-12-01 \
        --station 87611004 --name "Toulouse Matabiau" --slug matabiau --out-dir <dossier>
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

# Capacité indicative en places assises, par type de service (hypothèse de travail, à affiner).
# Elle sert à pondérer les arrivées, pas à estimer l'occupation réelle.
CAPACITY = {
    "TGV INOUI": 550,
    "OUIGO": 630,
    "INTERCITES": 400,
    "INTERCITES de nuit": 250,
    "Train TER": 200,
    "TramTrain": 150,
    "Car TER": 50,
    "Car à réservation": 30,
    "Navette": 30,
}
DEFAULT_CAPACITY = 200

# Services longue distance : les plus susceptibles de générer des courses taxi/VTC.
LONG_DISTANCE = {"TGV INOUI", "OUIGO", "INTERCITES", "INTERCITES de nuit", "ICE", "Lyria"}

LABELS = {
    "TGV INOUI": "TGV INOUI",
    "OUIGO": "OUIGO",
    "INTERCITES": "Intercités",
    "INTERCITES de nuit": "Intercités de nuit",
    "Train TER": "TER",
    "Car TER": "Car TER",
    "TramTrain": "Tram-train",
    "Car à réservation": "Car",
    "Navette": "Navette",
}


def service_type(stop_id: str) -> str:
    # ex. « StopPoint:OCETGV INOUI-87611004 » → « TGV INOUI »
    core = stop_id.split(":", 1)[-1]
    if core.startswith("OCE"):
        core = core[3:]
    return core.rsplit("-", 1)[0]


def read_csv(path: str):
    with open(path, newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)


def to_minutes(hhmmss: str) -> int:
    h, m, _ = hhmmss.split(":")
    return int(h) * 60 + int(m)


def fmt(minutes: int) -> str:
    return f"{(minutes // 60) % 24:02d}:{minutes % 60:02d}"


def build(gtfs: str, date: str, station: str, name: str) -> dict:
    # Une arrivée du jour J vient soit d'une course du jour J (avant minuit), soit d'une course
    # partie la veille qui arrive après minuit (horaire GTFS ≥ 24:00, ex. trains de nuit).
    day = datetime.strptime(date, "%Y-%m-%d")
    ymd = day.strftime("%Y%m%d")
    prev = (day - timedelta(days=1)).strftime("%Y%m%d")
    today_services, prev_services = set(), set()
    for r in read_csv(os.path.join(gtfs, "calendar_dates.txt")):
        if r["exception_type"] != "1":
            continue
        if r["date"] == ymd:
            today_services.add(r["service_id"])
        elif r["date"] == prev:
            prev_services.add(r["service_id"])
    trips = {
        r["trip_id"]: r
        for r in read_csv(os.path.join(gtfs, "trips.txt"))
        if r["service_id"] in today_services or r["service_id"] in prev_services
    }
    stops = {r["stop_id"]: r["stop_name"] for r in read_csv(os.path.join(gtfs, "stops.txt"))}

    # Un seul passage sur stop_times : premier arrêt de chaque course + passages à la gare visée.
    first_stop: dict[str, tuple[int, str]] = {}
    at_station: list[dict] = []
    suffix = f"-{station}"
    for r in read_csv(os.path.join(gtfs, "stop_times.txt")):
        tid = r["trip_id"]
        if tid not in trips:
            continue
        seq = int(r["stop_sequence"])
        if tid not in first_stop or seq < first_stop[tid][0]:
            first_stop[tid] = (seq, r["stop_id"])
        if r["stop_id"].endswith(suffix) and r["drop_off_type"] != "1":
            at_station.append(r)

    arrivals = []
    for r in at_station:
        tid = r["trip_id"]
        if first_stop[tid][1] == r["stop_id"]:
            continue  # la course part d'ici : aucun voyageur n'arrive
        kind = service_type(r["stop_id"])
        raw = to_minutes(r["arrival_time"])
        service = trips[tid]["service_id"]
        if raw < 1440 and service in today_services:
            minutes = raw
        elif raw >= 1440 and service in prev_services:
            minutes = raw - 1440
        else:
            continue
        arrivals.append(
            {
                "time": fmt(minutes),
                "minutes": minutes,
                "type": LABELS.get(kind, kind),
                "longDistance": kind in LONG_DISTANCE,
                "train": trips[tid]["trip_headsign"],
                "from": stops.get(first_stop[tid][1], "?"),
                "capacity": CAPACITY.get(kind, DEFAULT_CAPACITY),
            }
        )
    arrivals.sort(key=lambda a: (a["minutes"], a["train"]))

    # Agrégation par tranche de 15 minutes.
    bins: dict[int, dict] = defaultdict(lambda: {"trains": 0, "longDistance": 0, "seatsLong": 0, "seatsAll": 0})
    for a in arrivals:
        b = bins[a["minutes"] // 15 * 15]
        b["trains"] += 1
        b["seatsAll"] += a["capacity"]
        if a["longDistance"]:
            b["longDistance"] += 1
            b["seatsLong"] += a["capacity"]
    slots = [{"start": fmt(m), "minutes": m, **v} for m, v in sorted(bins.items())]

    feed = next(read_csv(os.path.join(gtfs, "feed_info.txt")), {})
    return {
        "station": {"name": name, "uic": station},
        "date": date,
        "source": {
            "name": "Réseau SNCF TGV, Intercités et TER (horaires théoriques)",
            "url": "https://transport.data.gouv.fr/datasets/horaires-sncf",
            "licence": "ODbL",
            "feedVersion": feed.get("feed_version"),
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "capacityNote": "Capacité indicative par type de train (hypothèse), pas l'occupation réelle.",
        "arrivals": arrivals,
        "slots": slots,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--gtfs", required=True)
    p.add_argument("--dates", required=True, help="AAAA-MM-JJ, séparées par des virgules")
    p.add_argument("--station", required=True, help="Code UIC de la gare, ex. 87611004")
    p.add_argument("--name", required=True)
    p.add_argument("--slug", required=True, help="Préfixe des fichiers, ex. matabiau")
    p.add_argument("--out-dir", required=True)
    a = p.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    for date in a.dates.split(","):
        data = build(a.gtfs, date, a.station, a.name)
        out = os.path.join(a.out_dir, f"{a.slug}-{date}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        n = len(data["arrivals"])
        ld = sum(x["longDistance"] for x in data["arrivals"])
        print(f"{a.name} {date} : {n} arrivées dont {ld} grandes lignes → {out}")


if __name__ == "__main__":
    main()
