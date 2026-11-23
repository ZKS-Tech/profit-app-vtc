#!/usr/bin/env python3
"""Prépare le découpage de Toulouse en zones pour la carte de l'app.

Source : « Recensement population 2019 - Grands quartiers - Population », Toulouse Métropole
(data.toulouse-metropole.fr, Licence Ouverte v2.0) — 60 grands quartiers (INSEE) avec contours.

Sortie : un JSON avec, pour chaque quartier, son tracé SVG simplifié (repère 0–1000), son centre,
sa surface, sa population 2019 et sa densité, plus la position des pôles de transport.

    curl -o gq.geojson "https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/recensement-population-2019-grands-quartiers-population/exports/geojson"
    python3 build_zones.py --geojson gq.geojson --out ../../apps/mobile/src/data/zones/toulouse-zones.json
"""
from __future__ import annotations

import argparse
import json
import math

# Pôles de transport (coordonnées issues des fichiers GTFS utilisés dans services/arrivals).
HUBS = [
    {"id": "matabiau", "name": "Gare Matabiau", "lat": 43.611206, "lon": 1.453616},
    {"id": "gare-routiere", "name": "Gare routière Pierre-Sémard", "lat": 43.612522, "lon": 1.452612},
    {"id": "aeroport", "name": "Aéroport Toulouse-Blagnac", "lat": 43.630438, "lon": 1.374500},
]

SIZE = 1000  # côté du repère SVG
MARGIN = 0.02


def ring_area_km2(ring):
    # Surface approchée (projection équirectangulaire locale).
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    kx, ky = 111.32 * math.cos(lat0), 110.57
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return abs(a) / 2


def simplify(points, tol):
    """Douglas-Peucker."""
    if len(points) < 3:
        return points

    def dist(p, a, b):
        if a == b:
            return math.dist(p, a)
        (x, y), (x1, y1), (x2, y2) = p, a, b
        return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / math.dist(a, b)

    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        d = dist(points[i], points[0], points[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        return simplify(points[: idx + 1], tol)[:-1] + simplify(points[idx:], tol)
    return [points[0], points[-1]]


def point_in_ring(lon, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--geojson", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    feats = json.load(open(a.geojson, encoding="utf-8"))["features"]

    rings = []
    for f in feats:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        outer = max((poly[0] for poly in polys), key=len)  # contour principal
        rings.append((f["properties"], [tuple(pt[:2]) for pt in outer]))

    lons = [x for _, r in rings for x, _ in r] + [h["lon"] for h in HUBS]
    lats = [y for _, r in rings for _, y in r] + [h["lat"] for h in HUBS]
    lat0 = math.radians((min(lats) + max(lats)) / 2)
    kx = math.cos(lat0)  # compense l'écrasement des longitudes
    w, h = (max(lons) - min(lons)) * kx, max(lats) - min(lats)
    span = max(w, h) * (1 + 2 * MARGIN)
    ox = min(lons) * kx - (span - w) / 2
    oy = max(lats) + (span - h) / 2

    def proj(lon, lat):
        return round((lon * kx - ox) / span * SIZE, 1), round((oy - lat) / span * SIZE, 1)

    zones = []
    for props, ring in rings:
        pts = simplify([proj(x, y) for x, y in ring], tol=1.2)
        d = "M" + " L".join(f"{x} {y}" for x, y in pts) + " Z"
        cx = sum(x for x, _ in pts) / len(pts)
        cy = sum(y for _, y in pts) / len(pts)
        clon, clat = json.loads(props["geo_point_2d"].replace("'", '"')).values() if isinstance(props.get("geo_point_2d"), str) else (None, None)
        area = ring_area_km2(ring)
        pop = float(props.get("p19_pop") or 0)
        zones.append(
            {
                "id": props["grd_quart"],
                "name": props["lib_grd_quart"],
                "path": d,
                "cx": round(cx, 1),
                "cy": round(cy, 1),
                "lat": clat,
                "lon": clon,
                "areaKm2": round(area, 2),
                "population2019": round(pop),
                "density": round(pop / area) if area else 0,
                "_ring": ring,
            }
        )

    hubs = []
    for hb in HUBS:
        x, y = proj(hb["lon"], hb["lat"])
        zone = next((z["id"] for z in zones if point_in_ring(hb["lon"], hb["lat"], z["_ring"])), None)
        hubs.append({**hb, "x": x, "y": y, "zoneId": zone})
    for z in zones:
        z.pop("_ring")

    out = {
        "source": {
            "name": "Recensement population 2019 - Grands quartiers (Toulouse Métropole)",
            "url": "https://data.toulouse-metropole.fr/explore/dataset/recensement-population-2019-grands-quartiers-population/",
            "licence": "Licence Ouverte v2.0",
        },
        "viewBox": SIZE,
        "zones": sorted(zones, key=lambda z: z["name"]),
        "hubs": hubs,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(zones)} zones, {len(hubs)} pôles → {a.out}")
    for hb in hubs:
        print(" ", hb["name"], "→", next((z["name"] for z in zones if z["id"] == hb["zoneId"]), "hors Toulouse"))


if __name__ == "__main__":
    main()
