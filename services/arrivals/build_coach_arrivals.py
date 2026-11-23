#!/usr/bin/env python3
"""Arrivées planifiées de cars longue distance (FlixBus, BlaBlaCar Bus) à un arrêt donné.

Sources (transport.data.gouv.fr, licence ODbL) :
- « Réseau européen FlixBus et FlixTrain » — horaires exprimés en UTC (fuseau de l'agence) ;
- « Réseau européen BlaBlaCar Bus » — horaires en Europe/Paris.
Les heures sont converties en heure de Paris, puis regroupées par jour local.

Usage :
    python3 build_coach_arrivals.py \
        --feed FlixBus:<dossier GTFS>:dcc0e74b-9603-11e6-9066-549f350fcb0c \
        --feed "BlaBlaCar Bus:<dossier GTFS>:XTS" \
        --dates 2026-11-24,2026-12-01 --name "Gare routière Pierre-Sémard" \
        --slug gare-routiere --out-dir <dossier>
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import date as Date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
COACH_CAPACITY = 50  # places indicatives par car (hypothèse)
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def read_csv(path: str):
    if not os.path.exists(path):
        return
    with open(path, newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)


def active_services(gtfs: str, day: Date) -> set[str]:
    ymd = day.strftime("%Y%m%d")
    wd = WEEKDAYS[day.weekday()]
    active = {
        r["service_id"]
        for r in read_csv(os.path.join(gtfs, "calendar.txt"))
        if r["start_date"] <= ymd <= r["end_date"] and r[wd] == "1"
    }
    for r in read_csv(os.path.join(gtfs, "calendar_dates.txt")):
        if r["date"] == ymd:
            (active.add if r["exception_type"] == "1" else active.discard)(r["service_id"])
    return active


def gtfs_time(service_day: Date, hhmmss: str, tz: ZoneInfo) -> datetime:
    # Règle GTFS : l'heure est comptée depuis « midi moins 12 h » du jour de service.
    noon = datetime(service_day.year, service_day.month, service_day.day, 12, tzinfo=tz)
    h, m, s = (int(x) for x in hhmmss.split(":"))
    return (noon - timedelta(hours=12) + timedelta(hours=h, minutes=m, seconds=s)).astimezone(PARIS)


def feed_arrivals(
    operator: str, gtfs: str, stop_ids: set[str], days: list[Date], exclude_from: list[str]
) -> list[tuple[datetime, dict]]:
    agency_tz = ZoneInfo(next(read_csv(os.path.join(gtfs, "agency.txt")))["agency_timezone"])
    stops = {r["stop_id"]: r["stop_name"] for r in read_csv(os.path.join(gtfs, "stops.txt"))}
    # Jours de service à examiner : la veille et le lendemain couvrent les décalages horaires.
    service_days = sorted({d + timedelta(days=k) for d in days for k in (-1, 0, 1)})
    services = {d: active_services(gtfs, d) for d in service_days}
    trips = {r["trip_id"]: r for r in read_csv(os.path.join(gtfs, "trips.txt"))}

    first: dict[str, tuple[int, str]] = {}
    hits = []
    for r in read_csv(os.path.join(gtfs, "stop_times.txt")):
        tid = r["trip_id"]
        seq = int(r["stop_sequence"])
        if tid not in first or seq < first[tid][0]:
            first[tid] = (seq, r["stop_id"])
        if r["stop_id"] in stop_ids and r.get("drop_off_type", "0") != "1":
            hits.append(r)

    out = []
    for r in hits:
        tid = r["trip_id"]
        if first[tid][1] == r["stop_id"] or tid not in trips:
            continue  # départ depuis cet arrêt : personne n'arrive
        origin = stops.get(first[tid][1], "?")
        if any(x.lower() in origin.lower() for x in exclude_from):
            continue  # ex. navette centre-ville → aéroport : des voyageurs qui partent, pas qui arrivent
        for sd in service_days:
            if trips[tid]["service_id"] in services[sd]:
                when = gtfs_time(sd, r["arrival_time"], agency_tz)
                out.append(
                    (
                        when,
                        {
                            "type": operator,
                            "longDistance": True,
                            "train": trips[tid].get("trip_short_name") or "",
                            "from": origin,
                            "capacity": COACH_CAPACITY,
                        },
                    )
                )
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--feed", action="append", required=True, help="Opérateur:dossier GTFS:stop_id[,stop_id]")
    p.add_argument("--dates", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--slug", required=True)
    p.add_argument("--out-dir", required=True)
    p.add_argument("--exclude-from", default="", help="Origines à ignorer (sous-chaînes, séparées par des virgules)")
    a = p.parse_args()

    days = [datetime.strptime(d, "%Y-%m-%d").date() for d in a.dates.split(",")]
    found: list[tuple[datetime, dict]] = []
    for spec in a.feed:
        operator, gtfs, ids = spec.split(":", 2)
        excl = [x for x in a.exclude_from.split(",") if x]
        found += feed_arrivals(operator, gtfs, set(ids.split(",")), days, excl)

    os.makedirs(a.out_dir, exist_ok=True)
    for day in days:
        arrivals = []
        for when, info in found:
            if when.date() == day:
                minutes = when.hour * 60 + when.minute
                arrivals.append({"time": f"{when:%H:%M}", "minutes": minutes, **info})
        arrivals.sort(key=lambda x: (x["minutes"], x["type"]))
        data = {
            "station": {"name": a.name, "uic": ""},
            "date": day.isoformat(),
            "source": {
                "name": "Horaires FlixBus et BlaBlaCar Bus (horaires théoriques)",
                "url": "https://transport.data.gouv.fr/datasets?type=public-transit",
                "licence": "ODbL",
                "feedVersion": datetime.now(timezone.utc).date().isoformat(),
            },
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "capacityNote": "Capacité indicative de 50 places par car (hypothèse), pas l'occupation réelle.",
            "arrivals": arrivals,
        }
        out = os.path.join(a.out_dir, f"{a.slug}-{day.isoformat()}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        by_op = {}
        for x in arrivals:
            by_op[x["type"]] = by_op.get(x["type"], 0) + 1
        print(f"{a.name} {day} : {len(arrivals)} arrivées {by_op} → {out}")


if __name__ == "__main__":
    main()
