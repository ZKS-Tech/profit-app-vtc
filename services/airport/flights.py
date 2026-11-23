"""Modèle normalisé des vols et conversion depuis les réponses brutes de l'API.

Le schéma des réponses ATB (/planned-arrivals, /realtime-arrivals…) n'est PAS décrit dans la
documentation publique. La correspondance champ API → champ normalisé est donc un fichier de
configuration (`field_map.json`) à compléter après la première réponse réelle. Sans lui,
aucune normalisation n'est tentée : rien n'est deviné.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")

REQUIRED_KEYS = ["flight_number", "scheduled"]
OPTIONAL_KEYS = ["airline", "other_airport", "other_city", "estimated", "actual", "status", "aircraft_type", "seats"]


@dataclass
class FlightMovement:
    direction: str  # "arrival" | "departure"
    flight_number: str
    scheduled: datetime  # heure programmée, en heure de Paris
    airline: str | None = None
    other_airport: str | None = None  # provenance (arrivée) ou destination (départ)
    other_city: str | None = None
    estimated: datetime | None = None
    actual: datetime | None = None
    status: str | None = None  # libellé brut de la source
    cancelled: bool = False
    aircraft_type: str | None = None
    seats: int | None = None
    source: str = "ATB"
    fetched_at: float = 0.0
    raw_keys: list[str] = field(default_factory=list)

    @property
    def best_time(self) -> datetime:
        """Heure la plus fiable disponible : réelle > estimée > programmée."""
        return self.actual or self.estimated or self.scheduled

    @property
    def time_quality(self) -> str:
        return "reelle" if self.actual else "estimee" if self.estimated else "programmee"

    @property
    def delay_min(self) -> int | None:
        t = self.actual or self.estimated
        return None if t is None else round((t - self.scheduled).total_seconds() / 60)

    def key(self) -> tuple:
        """Clé d'unicité : même vol, même sens, même horaire programmé."""
        return (self.direction, self.flight_number.replace(" ", "").upper(), self.scheduled.isoformat())

    def to_json(self) -> dict:
        d = asdict(self)
        for k in ("scheduled", "estimated", "actual"):
            d[k] = d[k].isoformat() if d[k] else None
        d.update(best_time=self.best_time.isoformat(), time_quality=self.time_quality, delay_min=self.delay_min)
        d.pop("raw_keys")
        return d


def _get(record: dict, path: str | None):
    if not path:
        return None
    cur = record
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def parse_time(value, naive_tz: ZoneInfo = PARIS) -> datetime | None:
    """ISO 8601 avec ou sans fuseau ; sans fuseau → interprété dans `naive_tz`. Résultat en heure de Paris."""
    if value in (None, ""):
        return None
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=naive_tz)
    return dt.astimezone(PARIS)


def check_field_map(field_map: dict) -> list[str]:
    return [k for k in REQUIRED_KEYS if not field_map.get(k)]


def normalize(record: dict, direction: str, field_map: dict, fetched_at: float = 0.0) -> FlightMovement:
    missing = check_field_map(field_map)
    if missing:
        raise ValueError("field_map incomplet, champs requis non renseignés : " + ", ".join(missing))
    tz = ZoneInfo(field_map.get("naive_timezone") or "Europe/Paris")
    status = _get(record, field_map.get("status"))
    cancel_words = [w.lower() for w in field_map.get("cancelled_status_values", [])]
    seats = _get(record, field_map.get("seats"))
    return FlightMovement(
        direction=direction,
        flight_number=str(_get(record, field_map["flight_number"])),
        scheduled=parse_time(_get(record, field_map["scheduled"]), tz),
        airline=_get(record, field_map.get("airline")),
        other_airport=_get(record, field_map.get("other_airport")),
        other_city=_get(record, field_map.get("other_city")),
        estimated=parse_time(_get(record, field_map.get("estimated")), tz),
        actual=parse_time(_get(record, field_map.get("actual")), tz),
        status=None if status is None else str(status),
        cancelled=status is not None and str(status).lower() in cancel_words,
        aircraft_type=_get(record, field_map.get("aircraft_type")),
        seats=int(seats) if seats not in (None, "") else None,
        fetched_at=fetched_at,
        raw_keys=sorted(record.keys()),
    )


def deduplicate(movements: list[FlightMovement]) -> list[FlightMovement]:
    """Un seul enregistrement par vol : on garde le plus récent, puis le plus informatif."""
    best: dict[tuple, FlightMovement] = {}
    rank = {"programmee": 0, "estimee": 1, "reelle": 2}
    for m in movements:
        k = m.key()
        cur = best.get(k)
        if cur is None or (m.fetched_at, rank[m.time_quality]) >= (cur.fetched_at, rank[cur.time_quality]):
            best[k] = m
    return sorted(best.values(), key=lambda m: m.best_time)
