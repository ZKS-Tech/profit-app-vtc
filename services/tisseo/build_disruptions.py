#!/usr/bin/env python3
"""Perturbations du réseau Tisséo (métro, tram, Téléo, Linéo, bus) rattachées aux quartiers.

Sources (open data, licence ODbL, sans clé) :
- temps réel GTFS-RT : https://api.tisseo.fr/opendata/gtfsrt/GtfsRt.pb (alertes + trajets annulés) ;
- offre théorique GTFS : jeu « Tisséo » de data.toulouse-metropole.fr (lignes, arrêts).
Contours des quartiers : voir services/zones.

    pip install gtfs-realtime-bindings
    python3 build_disruptions.py --gtfs <dossier GTFS Tisséo> --rt GtfsRt.pb \
        --quartiers gq.geojson --out ../../apps/mobile/src/data/zones/tisseo-perturbations.json
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from google.transit import gtfs_realtime_pb2

PARIS = ZoneInfo("Europe/Paris")
# Poids d'une perturbation selon le mode : un métro en panne reporte beaucoup plus de voyageurs
# vers les taxis/VTC qu'un bus dévié (hypothèse à calibrer).
MODE = {"1": "metro", "0": "tram", "6": "teleo", "3": "bus"}
IMPACT = {"metro": 1.0, "tram": 0.7, "teleo": 0.4, "lineo": 0.3, "bus": 0.1}


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)


def point_in_ring(lon, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def load_quartiers(path):
    out = []
    for f in json.load(open(path, encoding="utf-8"))["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        out.append((f["properties"]["grd_quart"], [[tuple(p[:2]) for p in poly[0]] for poly in polys]))
    return out


def zone_of(lon, lat, quartiers):
    for zid, rings in quartiers:
        if any(point_in_ring(lon, lat, r) for r in rings):
            return zid
    return None


def text(ts):
    return ts.translation[0].text if ts.translation else ""


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gtfs", required=True)
    p.add_argument("--rt", required=True)
    p.add_argument("--quartiers", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    routes = {r["route_id"]: r for r in read_csv(os.path.join(a.gtfs, "routes.txt"))}

    def mode(rid):
        r = routes.get(rid, {})
        m = MODE.get(r.get("route_type"), "bus")
        return "lineo" if m == "bus" and r.get("route_short_name", "").startswith("L") else m

    # Quartiers desservis par chaque ligne structurante (métro, tram, Téléo, Linéo).
    quartiers = load_quartiers(a.quartiers)
    stops = {s["stop_id"]: s for s in read_csv(os.path.join(a.gtfs, "stops.txt"))}
    trip_route = {t["trip_id"]: t["route_id"] for t in read_csv(os.path.join(a.gtfs, "trips.txt"))}
    strong = {rid for rid in routes if mode(rid) != "bus"}
    line_stops = defaultdict(set)
    for st in read_csv(os.path.join(a.gtfs, "stop_times.txt")):
        rid = trip_route.get(st["trip_id"])
        if rid in strong:
            line_stops[rid].add(st["stop_id"])
    line_zones = {}
    for rid, sids in line_stops.items():
        zs = {zone_of(float(stops[s]["stop_lon"]), float(stops[s]["stop_lat"]), quartiers) for s in sids if s in stops}
        line_zones[rid] = sorted(z for z in zs if z)

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(open(a.rt, "rb").read())
    fetched = datetime.fromtimestamp(feed.header.timestamp, PARIS)

    def line_info(rid):
        r = routes.get(rid, {})
        return {"id": rid, "name": r.get("route_short_name", rid), "mode": mode(rid)}

    alerts = []
    cancelled = Counter()
    for e in feed.entity:
        if e.HasField("trip_update") and e.trip_update.trip.schedule_relationship == gtfs_realtime_pb2.TripDescriptor.CANCELED:
            cancelled[e.trip_update.trip.route_id] += 1
        if not e.HasField("alert"):
            continue
        al = e.alert
        rids = sorted({i.route_id for i in al.informed_entity if i.route_id})
        periods = [
            {
                "from": datetime.fromtimestamp(ap.start, PARIS).isoformat() if ap.start else None,
                "to": datetime.fromtimestamp(ap.end, PARIS).isoformat() if ap.end else None,
            }
            for ap in al.active_period
        ]
        lines = [line_info(r) for r in rids]
        impact = max((IMPACT[l["mode"]] for l in lines), default=0.0)
        alerts.append(
            {
                "id": e.id,
                "title": text(al.header_text),
                "description": text(al.description_text)[:300],
                "effect": gtfs_realtime_pb2.Alert.Effect.Name(al.effect),
                "lines": lines,
                "activePeriods": periods,
                "impact": impact,
                "zones": sorted({z for r in rids for z in line_zones.get(r, [])}),
            }
        )

    out = {
        "source": {
            "name": "Tisséo – temps réel GTFS-RT et offre GTFS",
            "url": "https://transport.data.gouv.fr/datasets/tisseo-reseau-transport-urbain-toulousain",
            "licence": "ODbL",
        },
        "fetchedAt": fetched.isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "impactByMode": IMPACT,
        "alerts": sorted(alerts, key=lambda x: -x["impact"]),
        "cancelledTrips": [
            {**line_info(rid), "count": n, "zones": line_zones.get(rid, [])} for rid, n in cancelled.most_common()
        ],
        "lineZones": {routes[r]["route_short_name"]: z for r, z in line_zones.items() if r in routes},
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    strong_alerts = [x for x in alerts if x["impact"] >= 0.3]
    print(f"Relevé {fetched:%d/%m %H:%M} : {len(alerts)} alertes dont {len(strong_alerts)} sur lignes structurantes → {a.out}")
    for x in strong_alerts[:10]:
        print("  -", [l["name"] for l in x["lines"]], x["effect"], x["title"][:70], "| zones:", len(x["zones"]))
    print("  annulations :", [(c["name"], c["mode"], c["count"]) for c in out["cancelledTrips"][:8]])


if __name__ == "__main__":
    main()
