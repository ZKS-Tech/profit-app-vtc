#!/usr/bin/env python3
"""Publie le dossier de données dans Supabase Storage (bucket public en lecture).

Variables d'environnement (secrets GitHub, jamais dans l'app) :
  SUPABASE_URL               ex. https://<projet>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  clé « service_role » (écriture)
  SUPABASE_BUCKET            facultatif, « donnees » par défaut

L'app lit ensuite : <SUPABASE_URL>/storage/v1/object/public/<bucket>/carte/<fichier>

Avec --archive, les relevés qui changent dans la journée (Tisséo, météo) sont aussi copiés dans
archives/AAAA-MM-JJ/HHhMM-<fichier>, pour pouvoir comparer plus tard ce que l'app prévoyait à ce qui
s'est passé. Les fichiers de trains et cars sont déjà datés et ne sont jamais écrasés d'un jour à l'autre.

    python3 services/publish_supabase.py build/data [--archive]
"""
from __future__ import annotations

import os
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

PREFIX = "carte"
ARCHIVED = ("tisseo-perturbations.json", "meteo-toulouse.json")


def upload(url: str, key: str, bucket: str, path: str, body: bytes) -> None:
    req = urllib.request.Request(
        f"{url}/storage/v1/object/{bucket}/{path}",
        data=body,
        method="POST",
        headers={
            # Nouvelles clés « sb_secret_… » : uniquement dans `apikey`.
            # Ancienne clé service_role (JWT) : dans `apikey` et `Authorization`.
            **({} if key.startswith("sb_secret_") else {"Authorization": f"Bearer {key}"}),
            "apikey": key,
            "Content-Type": "application/json",
            "x-upsert": "true",  # remplace le fichier existant
            "Cache-Control": "max-age=60",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        if r.status >= 300:
            raise RuntimeError(f"{path} : HTTP {r.status}")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    archive = "--archive" in sys.argv[1:]
    if len(args) != 1:
        print(__doc__)
        return 2
    folder = args[0]
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    bucket = os.environ.get("SUPABASE_BUCKET", "donnees")
    if not url or not key:
        print("Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) : publication ignorée.")
        return 0
    if not os.path.isdir(folder):
        print(f"Aucune donnée à publier ({folder} absent).")
        return 1
    files = sorted(f for f in os.listdir(folder) if f.endswith(".json"))
    # manifest.json en dernier : l'app ne le voit qu'une fois tous les fichiers en place.
    files = [f for f in files if f != "manifest.json"] + (["manifest.json"] if "manifest.json" in files else [])
    stamp = datetime.now(ZoneInfo("Europe/Paris"))
    for name in files:
        with open(os.path.join(folder, name), "rb") as f:
            body = f.read()
        upload(url, key, bucket, f"{PREFIX}/{name}", body)
        print(f"publié : {PREFIX}/{name} ({len(body) // 1024} Ko)")
        if archive and name in ARCHIVED:
            path = f"archives/{stamp:%Y-%m-%d}/{stamp:%Hh%M}-{name}"
            upload(url, key, bucket, path, body)
            print(f"archivé : {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
