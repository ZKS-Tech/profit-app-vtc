#!/usr/bin/env python3
"""Météo de Toulouse pour la carte : observation actuelle + pluie prévue heure par heure.

Sources Météo-France (portail-api.meteofrance.fr, gratuites avec compte, Licence Ouverte) :
- API Données d'observation v2 : station Toulouse-Blagnac (31069001), dernière observation horaire ;
- API Modèle AROME 1.0 (WCS) : cumul de précipitations sur 1 h, grille 0,01° sur Toulouse,
  pour chaque échéance de la dernière exécution du modèle.

La clé est envoyée dans l'en-tête `apikey`. Côté serveur, elle se lit dans la variable
METEOFRANCE_API_KEY ; dans l'environnement cloud du projet, le relais réseau l'ajoute lui-même.

    pip install -r requirements.txt
    python3 build_weather.py --hours 36 --out ../../apps/mobile/src/data/zones/meteo-toulouse.json
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import tifffile  # lecture des GeoTIFF renvoyés par le WCS

PARIS = ZoneInfo("Europe/Paris")
BASE = "https://public-api.meteofrance.fr/public"
STATION = "31069001"  # Toulouse-Blagnac
WCS = f"{BASE}/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS"
BOX = {"long": (1.35, 1.52), "lat": (43.53, 43.67)}  # commune de Toulouse
PAUSE_S = 0.7  # quota : 100 requêtes/minute
MIN_HOURS = 30  # une exécution AROME complète couvre environ 2 jours


def get(url: str) -> bytes:
    headers = {}
    key = os.environ.get("METEOFRANCE_API_KEY")
    if key:
        headers["apikey"] = key
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def observation() -> dict:
    data = json.loads(get(f"{BASE}/DPObs/v2/station/horaire?id_station={STATION}&format=json"))[0]
    return {
        "station": "Toulouse-Blagnac",
        "time": datetime.fromisoformat(data["validity_time"].replace("Z", "+00:00")).astimezone(PARIS).isoformat(),
        "tempC": round(data["t"] - 273.15, 1) if data.get("t") is not None else None,
        "rainMm1h": data.get("rr1"),
        "windKmh": round(data["ff"] * 3.6) if data.get("ff") is not None else None,
        "gustKmh": round(data["raf"] * 3.6) if data.get("raf") is not None else None,
    }


def latest_run_coverage() -> tuple[str, list[str]]:
    caps = get(f"{WCS}/GetCapabilities?service=WCS&version=2.0.1&language=fre").decode("utf-8", "replace")
    ids = sorted(i for i in re.findall(r"<wcs:CoverageId>([^<]+)</wcs:CoverageId>", caps)
                 if i.startswith("TOTAL_PRECIPITATION__") and i.endswith("_PT1H"))
    # Exécution la plus récente COMPLÈTE : une exécution en cours de publication n'a que
    # quelques échéances. On garde la première qui couvre au moins MIN_HOURS, sinon la plus longue.
    best = None
    for cov in list(reversed(ids))[:4]:
        desc = get(f"{WCS}/DescribeCoverage?service=WCS&version=2.0.1&coverageid={cov}").decode("utf-8", "replace")
        b = re.search(r"<gml:beginPosition[^>]*>\s*([^<\s]+)", desc)
        e = re.search(r"<gml:endPosition[^>]*>\s*([^<\s]+)", desc)
        time.sleep(PAUSE_S)
        if not (b and e):
            continue
        t0 = datetime.fromisoformat(b.group(1).replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(e.group(1).replace("Z", "+00:00"))
        hours = (t1 - t0).total_seconds() / 3600
        if best is None or hours > best[3]:
            best = (cov, t0, t1, hours)
        if hours >= MIN_HOURS:
            best = (cov, t0, t1, hours)
            break
    if best is None:
        raise RuntimeError("Aucune exécution AROME exploitable dans GetCapabilities.")
    cov, t0, t1, _ = best
    steps = [t0.replace(minute=0)]
    while steps[-1] < t1:
        steps.append(datetime.fromtimestamp(steps[-1].timestamp() + 3600, timezone.utc))
    return cov, [s.strftime("%Y-%m-%dT%H:%M:%SZ") for s in steps]


def rain_at(cov: str, when: str) -> tuple[float, float]:
    url = (f"{WCS}/GetCoverage?service=WCS&version=2.0.1&coverageid={cov}"
           f"&subset=long({BOX['long'][0]},{BOX['long'][1]})&subset=lat({BOX['lat'][0]},{BOX['lat'][1]})"
           f"&subset=time({when})&format=image/tiff")
    grid = tifffile.imread(io.BytesIO(get(url)))
    return round(float(grid.mean()), 2), round(float(grid.max()), 2)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--hours", type=int, default=36)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    obs = observation()
    cov, steps = latest_run_coverage()
    run = re.search(r"___(.*?)Z", cov).group(1).replace(".", ":")
    hourly = []
    for when in steps[: a.hours]:
        mean, mx = rain_at(cov, when)
        hourly.append({
            "time": datetime.fromisoformat(when.replace("Z", "+00:00")).astimezone(PARIS).isoformat(),
            "rainMeanMm": mean,
            "rainMaxMm": mx,
        })
        time.sleep(PAUSE_S)

    out = {
        "source": {
            "name": "Météo-France – API Données d'observation et Modèle AROME",
            "url": "https://portail-api.meteofrance.fr",
            "licence": "Licence Ouverte v2.0",
        },
        "fetchedAt": datetime.now(PARIS).isoformat(timespec="seconds"),
        "aromeRun": datetime.fromisoformat(run + "+00:00").astimezone(PARIS).isoformat(),
        "observation": obs,
        "hourly": hourly,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    wet = [h for h in hourly if h["rainMeanMm"] >= 0.2]
    print(f"Observation {obs['time'][11:16]} : {obs['tempC']} °C, pluie {obs['rainMm1h']} mm/h, vent {obs['windKmh']} km/h")
    print(f"AROME {out['aromeRun'][:16]} : {len(hourly)} h, dont {len(wet)} h avec pluie ≥ 0,2 mm → {a.out}")
    for h in wet[:8]:
        print("  ", h["time"][:16], h["rainMeanMm"], "mm (max", h["rainMaxMm"], ")")


if __name__ == "__main__":
    main()
