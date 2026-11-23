"""Client de l'API officielle d'Aéroport Toulouse-Blagnac (ATB) — https://api.toulouse.aeroport.fr

État vérifié le 23/11/2026 :
- toutes les routes exigent `Authorization: Bearer <jeton>` (réponse 401 sans jeton) ;
- le jeton s'obtient auprès d'un serveur Keycloak/OIDC en `grant_type=client_credentials`
  (client confidentiel + secret) — l'URL du serveur de jetons n'est PAS publiée : elle sera
  fournie par ATB avec les identifiants ;
- aucune procédure publique d'inscription, aucun tarif, quota ni condition d'utilisation
  pour un usage tiers n'est documenté.
Ce client ne fonctionne donc qu'une fois des identifiants obtenus auprès d'ATB.

Les secrets ne vivent QUE côté serveur (variables d'environnement), jamais dans l'app mobile.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

ENDPOINTS = {
    ("arrival", "planned"): "/planned-arrivals",
    ("arrival", "realtime"): "/realtime-arrivals",
    ("departure", "planned"): "/planned-departures",
    ("departure", "realtime"): "/realtime-departures",
}
PAGE_LIMIT = 300  # maximum documenté
# Durée de validité du cache local : le programme change peu, le temps réel souvent.
CACHE_TTL = {"planned": 6 * 3600, "realtime": 120}


class ConfigError(RuntimeError):
    pass


@dataclass
class AtbConfig:
    base_url: str
    token_url: str | None
    client_id: str | None
    client_secret: str | None
    cache_dir: str

    @classmethod
    def from_env(cls, env=os.environ) -> "AtbConfig":
        return cls(
            base_url=env.get("ATB_API_BASE", "https://api.toulouse.aeroport.fr").rstrip("/"),
            token_url=env.get("ATB_TOKEN_URL"),
            client_id=env.get("ATB_CLIENT_ID"),
            client_secret=env.get("ATB_CLIENT_SECRET"),
            cache_dir=env.get("ATB_CACHE_DIR", os.path.join(os.path.dirname(__file__), ".cache")),
        )

    def missing(self) -> list[str]:
        return [
            name
            for name, value in (
                ("ATB_TOKEN_URL", self.token_url),
                ("ATB_CLIENT_ID", self.client_id),
                ("ATB_CLIENT_SECRET", self.client_secret),
            )
            if not value
        ]


# Transport HTTP injectable (tests) : (méthode, url, en-têtes, corps) -> (statut, octets)
Transport = Callable[[str, str, dict, bytes | None], tuple[int, bytes]]


def urllib_transport(method: str, url: str, headers: dict, body: bytes | None) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class AtbClient:
    def __init__(self, config: AtbConfig, transport: Transport = urllib_transport, clock=time.time):
        missing = config.missing()
        if missing:
            raise ConfigError(
                "Accès à l'API ATB non configuré. Variables manquantes : "
                + ", ".join(missing)
                + ". Ces identifiants doivent être demandés à Aéroport Toulouse-Blagnac."
            )
        self.config = config
        self.transport = transport
        self.clock = clock
        self._token: str | None = None
        self._token_expiry = 0.0

    # --- Authentification (OAuth2 client_credentials) ---
    def token(self) -> str:
        if self._token and self.clock() < self._token_expiry - 30:
            return self._token
        body = urllib.parse.urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
            }
        ).encode()
        status, raw = self.transport(
            "POST",
            self.config.token_url or "",
            {"Content-Type": "application/x-www-form-urlencoded"},
            body,
        )
        if status != 200:
            raise RuntimeError(f"Échec d'obtention du jeton ATB (HTTP {status}).")
        data = json.loads(raw)
        self._token = data["access_token"]
        self._token_expiry = self.clock() + float(data.get("expires_in", 300))
        return self._token

    # --- Cache disque : évite de re-demander les mêmes pages ---
    def _cache_path(self, url: str) -> str:
        return os.path.join(self.config.cache_dir, hashlib.sha256(url.encode()).hexdigest()[:24] + ".json")

    def _get_json(self, url: str, ttl: int) -> dict | list:
        path = self._cache_path(url)
        if os.path.exists(path) and self.clock() - os.path.getmtime(path) < ttl:
            with open(path, encoding="utf-8") as f:
                return json.load(f)["body"]
        status, raw = self.transport(
            "GET", url, {"Authorization": f"Bearer {self.token()}", "Accept": "application/json"}, None
        )
        if status != 200:
            raise RuntimeError(f"Erreur API ATB HTTP {status} sur {url}")
        body = json.loads(raw)
        os.makedirs(self.config.cache_dir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"url": url, "fetchedAt": self.clock(), "body": body}, f, ensure_ascii=False)
        return body

    def fetch(self, direction: str, kind: str, start_date: str, end_date: str) -> list[dict]:
        """Toutes les pages d'une collection, entre deux dates (AAAA-MM-JJ)."""
        endpoint = ENDPOINTS[(direction, kind)]
        items: list[dict] = []
        page = 1
        while True:
            qs = urllib.parse.urlencode(
                {
                    "startDate": start_date,
                    "endDate": end_date,
                    "limit": PAGE_LIMIT,
                    "page": page,
                    "order": "ascending",
                }
            )
            body = self._get_json(f"{self.config.base_url}{endpoint}?{qs}", CACHE_TTL[kind])
            # Le format exact de la réponse n'est pas documenté : on accepte une liste
            # ou une collection Hydra (`member` / `hydra:member`).
            batch = body if isinstance(body, list) else body.get("member") or body.get("hydra:member") or []
            items.extend(batch)
            if len(batch) < PAGE_LIMIT:
                return items
            page += 1
