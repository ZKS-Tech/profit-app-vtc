#!/usr/bin/env python3
"""Publie le dossier de données dans Supabase Storage (bucket public en lecture).

Variables d'environnement (secrets GitHub, jamais dans l'app) :
  SUPABASE_URL               ex. https://<projet>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  clé « service_role » (écriture)
  SUPABASE_BUCKET            facultatif, « donnees » par défaut

L'app lit ensuite : <SUPABASE_URL>/storage/v1/object/public/<bucket>/carte/<fichier>

    python3 services/publish_supabase.py build/data
"""
from __future__ import annotations

import os
import sys
import urllib.request

PREFIX = "carte"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    folder = sys.argv[1]
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    bucket = os.environ.get("SUPABASE_BUCKET", "donnees")
    if not url or not key:
        print("Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) : publication ignorée.")
        return 0
    files = sorted(f for f in os.listdir(folder) if f.endswith(".json"))
    # manifest.json en dernier : l'app ne le voit qu'une fois tous les fichiers en place.
    files = [f for f in files if f != "manifest.json"] + (["manifest.json"] if "manifest.json" in files else [])
    for name in files:
        with open(os.path.join(folder, name), "rb") as f:
            body = f.read()
        req = urllib.request.Request(
            f"{url}/storage/v1/object/{bucket}/{PREFIX}/{name}",
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
                raise RuntimeError(f"{name} : HTTP {r.status}")
        print(f"publié : {PREFIX}/{name} ({len(body) // 1024} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
