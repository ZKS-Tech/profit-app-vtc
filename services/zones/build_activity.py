#!/usr/bin/env python3
"""Activité de chaque zone : emplois, habitants et lieux qui génèrent des courses.

Sources (open data) :
- emplois : « Base SIRENE Toulouse Métropole » (data.toulouse-metropole.fr, Licence Ouverte) —
  établissements employeurs actifs, effectif = milieu de la tranche INSEE ;
  communes hors Toulouse Métropole (Sicoval) : estimation à partir de la population (signalée) ;
- lieux : OpenStreetMap via Overpass (ODbL) — hôtels, santé, études, centres commerciaux,
  vie nocturne, salles et stades ;
- habitants : déjà dans toulouse-zones.json (INSEE 2019 / geo.api.gouv.fr).

    python3 build_activity.py --zones ../../apps/mobile/src/data/zones/toulouse-zones.json \
        --quartiers gq.geojson --communes communes31.geojson --sirene employeurs.json --osm poi.json \
        --out ../../apps/mobile/src/data/zones/activite.json
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict

# Milieu des tranches d'effectif INSEE (code « triable » de la base SIRENE).
TRANCHE = {1: 1.5, 2: 4, 3: 7.5, 11: 15, 12: 35, 21: 75, 22: 150, 31: 225, 32: 375,
           41: 750, 42: 1500, 51: 3500, 52: 7500, 53: 10000}

# Poids d'un lieu OSM dans sa catégorie (un hôpital pèse plus qu'une clinique, etc.). Hypothèses.
def poi_kind(tags: dict) -> tuple[str, float] | None:
    a = tags.get("amenity", "")
    t = tags.get("tourism", "")
    if t in ("hotel", "hostel", "apartment"):
        return "hotels", 1.0
    if a == "hospital":
        return "sante", 5.0
    if a == "clinic":
        return "sante", 1.0
    if a == "university":
        return "etudes", 5.0
    if a == "college":
        return "etudes", 1.0
    if tags.get("shop") == "mall":
        return "commerces", 3.0
    if a == "nightclub":
        return "nuit", 3.0
    if a in ("bar", "pub"):
        return "nuit", 1.0
    if a in ("theatre", "cinema", "events_venue", "conference_centre"):
        return "spectacles", 1.0
    if tags.get("leisure") == "stadium":
        return "spectacles", 4.0
    return None


def point_in_ring(lon, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def load_polygons(quartiers, communes):
    out = []
    for f in json.load(open(quartiers, encoding="utf-8"))["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        out.append((f["properties"]["grd_quart"], [[tuple(p[:2]) for p in poly[0]] for poly in polys]))
    for f in json.load(open(communes, encoding="utf-8"))["features"]:
        code = f["properties"]["code"]
        if code == "31555":
            continue
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        out.append(("c" + code, [[tuple(p[:2]) for p in poly[0]] for poly in polys]))
    return out


def main():
    p = argparse.ArgumentParser()
    for k in ("zones", "quartiers", "communes", "sirene", "osm", "out"):
        p.add_argument(f"--{k}", required=True)
    a = p.parse_args()

    zones = json.load(open(a.zones, encoding="utf-8"))["zones"]
    ids = {z["id"] for z in zones}
    polys = [(zid, rings) for zid, rings in load_polygons(a.quartiers, a.communes) if zid in ids]
    # Boîtes englobantes pour accélérer la recherche.
    boxes = [(zid, rings, min(x for r in rings for x, _ in r), max(x for r in rings for x, _ in r),
              min(y for r in rings for _, y in r), max(y for r in rings for _, y in r)) for zid, rings in polys]

    def zone_of(lon, lat):
        for zid, rings, x0, x1, y0, y1 in boxes:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and any(point_in_ring(lon, lat, r) for r in rings):
                return zid
        return None

    stats = defaultdict(lambda: defaultdict(float))

    # Emplois (SIRENE Toulouse Métropole)
    sirene = json.load(open(a.sirene, encoding="utf-8"))
    covered_communes = {e["codecommuneetablissement"] for e in sirene}
    for e in sirene:
        g = e.get("geolocetablissement")
        if not g:
            continue
        zid = zone_of(g["lon"], g["lat"])
        if zid:
            stats[zid]["emplois"] += TRANCHE.get(e["trancheeffectifsetablissementtriable"], 0)

    # Communes hors SIRENE Toulouse Métropole : emplois ≈ habitants × rapport médian des communes couvertes.
    ratios = [stats[z["id"]]["emplois"] / z["population2019"] for z in zones
              if z.get("kind") == "commune" and z["id"][1:] in covered_communes and z["population2019"]]
    ratio = statistics.median(ratios) if ratios else 0.5
    estimated = []
    for z in zones:
        if z.get("kind") == "commune" and z["id"][1:] not in covered_communes:
            stats[z["id"]]["emplois"] = z["population2019"] * ratio
            estimated.append(z["name"])

    # Lieux OpenStreetMap
    for el in json.load(open(a.osm, encoding="utf-8"))["elements"]:
        k = poi_kind(el.get("tags", {}))
        if not k:
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None:
            continue
        zid = zone_of(lon, lat)
        if zid:
            stats[zid][k[0]] += k[1]

    out = {
        "sources": {
            "emplois": "Base SIRENE Toulouse Métropole (Licence Ouverte), établissements employeurs actifs",
            "lieux": "© contributeurs OpenStreetMap (ODbL)",
        },
        "emploisEstimes": {"communes": estimated, "ratioEmploisParHabitant": round(ratio, 3)},
        "zones": {
            z["id"]: {
                "emplois": round(stats[z["id"]]["emplois"]),
                "habitants": z["population2019"],
                **{c: round(stats[z["id"]][c], 1) for c in ("hotels", "sante", "etudes", "commerces", "nuit", "spectacles")},
            }
            for z in zones
        },
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    top = sorted(out["zones"].items(), key=lambda kv: -kv[1]["emplois"])[:8]
    names = {z["id"]: z["name"] for z in zones}
    print(f"{len(out['zones'])} zones → {a.out} ; emplois estimés pour : {', '.join(estimated) or 'aucune'} (×{ratio:.2f})")
    for zid, v in top:
        print(f"  {names[zid]:<28} emplois {v['emplois']:>7}  hôtels {v['hotels']:>4}  nuit {v['nuit']:>5}  santé {v['sante']:>4}")


if __name__ == "__main__":
    main()
