#!/usr/bin/env python3
"""Chaîne de mise à jour des données de la carte (exécutée par GitHub Actions ou à la main).

Tâches :
  transport : arrivées SNCF (Matabiau), cars (gare routière, aéroport) pour les 7 prochains jours
  tisseo    : perturbations Tisséo en temps réel
  meteo     : observation + prévisions AROME (clé METEOFRANCE_API_KEY ou relais réseau)
  zones     : contours des quartiers (rarement nécessaire)

    python3 services/pipeline.py --jobs transport,tisseo,meteo --out build/data

Les fichiers produits sont publiés tels quels (voir publish_supabase.py) ; `manifest.json`
liste les fichiers disponibles et la date de chaque source.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable

SOURCES = {
    "sncf": "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip",
    "flix": "https://gtfs.gis.flix.tech/gtfs_generic_eu.zip",
    "blabla": "https://drive.google.com/uc?export=download&id=1VXd01yQl2Mb67C9bkrx0P8sqNIL532_o",
    "tisseo_gtfs": "https://www.data.gouv.fr/api/1/datasets/r/64318177-f5b5-4144-a6be-2d0f22d26c77",
    "tisseo_rt": "https://api.tisseo.fr/opendata/gtfsrt/GtfsRt.pb",
    "quartiers": "https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/"
    "recensement-population-2019-grands-quartiers-population/exports/geojson",
}
STOPS = {
    "flix_routiere": "dcc0e74b-9603-11e6-9066-549f350fcb0c",
    "blabla_routiere": "XTS",
    "flix_aeroport": "7f44b7dd-da4d-4e7e-a3a2-ef0356ee358f",
    "blabla_aeroport": "TLA",
}
DAYS_AHEAD = 7


def download(url: str, dest: str, retries: int = 4) -> str:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = None
    for attempt in range(retries):
        if attempt:
            time.sleep(10 * attempt)  # réseau instable : pause croissante avant de réessayer
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "vtc-profit-ai-pipeline"})
            with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
                shutil.copyfileobj(r, f)
            return dest
        except Exception as e:
            last = e
    raise RuntimeError(f"Téléchargement impossible : {url} ({last})")


def fresh(path: str, max_age_h: float) -> bool:
    return os.path.exists(path) and (datetime.now().timestamp() - os.path.getmtime(path)) < max_age_h * 3600


def unzip(zip_path: str, dest: str) -> str:
    if os.path.isdir(dest):
        shutil.rmtree(dest)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(dest)
    return dest


def run(*args: str) -> None:
    print("→", " ".join(os.path.basename(a) if a.endswith(".py") else a for a in args[1:3]), flush=True)
    subprocess.run([PY, *args], check=True)


def gtfs(cache: str, name: str, max_age_h: float = 20) -> str:
    z = os.path.join(cache, f"{name}.zip")
    if not fresh(z, max_age_h):
        download(SOURCES[name], z)
    return unzip(z, os.path.join(cache, name))


def quartiers(cache: str) -> str:
    path = os.path.join(cache, "quartiers.geojson")
    if not fresh(path, 24 * 30):
        download(SOURCES["quartiers"], path)
    return path


def job_transport(cache: str, out: str, days: list[str]) -> dict:
    dates = ",".join(days)
    sncf, flix, blabla = gtfs(cache, "sncf"), gtfs(cache, "flix"), gtfs(cache, "blabla")
    a = os.path.join(HERE, "arrivals")
    run(f"{a}/build_arrivals.py", "--gtfs", sncf, "--dates", dates, "--station", "87611004",
        "--name", "Toulouse Matabiau", "--slug", "matabiau", "--out-dir", out)
    run(f"{a}/build_coach_arrivals.py", "--feed", f"FlixBus:{flix}:{STOPS['flix_routiere']}",
        "--feed", f"BlaBlaCar Bus:{blabla}:{STOPS['blabla_routiere']}", "--dates", dates,
        "--name", "Gare routière Pierre-Sémard", "--slug", "gare-routiere", "--out-dir", out)
    run(f"{a}/build_coach_arrivals.py", "--feed", f"FlixBus:{flix}:{STOPS['flix_aeroport']}",
        "--feed", f"BlaBlaCar Bus:{blabla}:{STOPS['blabla_aeroport']}", "--dates", dates,
        "--name", "Aéroport Toulouse-Blagnac (cars)", "--slug", "aeroport-cars", "--exclude-from", "Toulouse",
        "--out-dir", out)
    return {"days": days}


def job_tisseo(cache: str, out: str) -> dict:
    static = gtfs(cache, "tisseo_gtfs")
    rt = download(SOURCES["tisseo_rt"], os.path.join(cache, "tisseo_rt.pb"))
    run(f"{HERE}/tisseo/build_disruptions.py", "--gtfs", static, "--rt", rt,
        "--quartiers", quartiers(cache), "--out", os.path.join(out, "tisseo-perturbations.json"))
    return {}


def job_meteo(cache: str, out: str) -> dict:
    if os.environ.get("GITHUB_ACTIONS") and not os.environ.get("METEOFRANCE_API_KEY"):
        print("Météo ignorée : secret METEOFRANCE_API_KEY absent.")
        return {"skip": True}
    run(f"{HERE}/weather/build_weather.py", "--hours", "48", "--out", os.path.join(out, "meteo-toulouse.json"))
    return {}


def job_zones(cache: str, out: str) -> dict:
    run(f"{HERE}/zones/build_zones.py", "--geojson", quartiers(cache), "--out", os.path.join(out, "toulouse-zones.json"))
    return {}


def write_manifest(out: str, jobs: list[str], extra: dict) -> None:
    path = os.path.join(out, "manifest.json")
    try:
        manifest = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):  # absent ou vide (premier lancement)
        manifest = {}
    manifest.setdefault("updated", {})
    now = datetime.now(PARIS).isoformat(timespec="seconds")
    for j in jobs:
        manifest["updated"][j] = now
    if "days" in extra:
        manifest["days"] = extra["days"]
    # Union avec le manifeste précédent (récupéré avant l'exécution) : chaque tâche ne produit
    # qu'une partie des fichiers.
    current = {f for f in os.listdir(out) if f.endswith(".json") and f != "manifest.json"}
    manifest["files"] = sorted(current | set(manifest.get("files", [])))
    manifest["generatedAt"] = now
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--jobs", default="transport,tisseo,meteo")
    p.add_argument("--out", required=True)
    p.add_argument("--cache", default=os.path.join(HERE, ".cache"))
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    today = datetime.now(PARIS).date()
    days = [(today + timedelta(days=k)).isoformat() for k in range(DAYS_AHEAD)]

    jobs = [j.strip() for j in a.jobs.split(",") if j.strip()]
    done, extra, failed = [], {}, []
    for j in jobs:
        try:
            if j == "transport":
                extra.update(job_transport(a.cache, a.out, days))
            elif j == "tisseo":
                job_tisseo(a.cache, a.out)
            elif j == "meteo":
                if job_meteo(a.cache, a.out).get("skip"):
                    continue
            elif j == "zones":
                job_zones(a.cache, a.out)
            else:
                raise ValueError(f"tâche inconnue : {j}")
            done.append(j)
        except Exception as e:  # une source en panne ne bloque pas les autres
            print(f"✗ {j} : {e}", file=sys.stderr)
            failed.append(j)
    write_manifest(a.out, done, extra)
    print(f"Terminé : {done or 'rien'}" + (f" — en échec : {failed}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
