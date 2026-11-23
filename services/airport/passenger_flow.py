"""Estimation des flux de voyageurs sortant de l'aéroport, par tranche de 30 minutes.

⚠️ Un passager n'est PAS une course VTC. Ce module estime des voyageurs qui sortent ; la part
qui prendra un taxi ou un VTC, la concurrence entre chauffeurs et l'attente restent à modéliser
(champ `vtcRides` volontairement nul).

Toutes les hypothèses sont regroupées dans HYPOTHESES et recopiées dans chaque fichier produit.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import median

from flights import FlightMovement

HYPOTHESES = {
    "defaultSeats": {
        "value": 180,
        "why": "Type d'avion inconnu : famille A320 (180 sièges), majoritaire sur les lignes moyen-courrier de Toulouse.",
    },
    "seatsByAircraft": {
        "value": {"A319": 144, "A320": 180, "A20N": 186, "A321": 220, "A21N": 220, "B738": 189, "B38M": 189,
                  "BCS3": 145, "AT76": 70, "AT75": 70, "E190": 100, "E195": 120, "CRJ9": 90, "A332": 290, "A333": 300},
        "why": "Capacités moyennes approximatives par type (codes OACI), à affiner selon les compagnies.",
    },
    "loadFactor": {"value": 0.80, "why": "Taux de remplissage moyen supposé de 80 % (ordre de grandeur des compagnies européennes)."},
    "exitWindowMin": {
        "value": {"schengen": [15, 35], "non_schengen": [30, 60], "unknown": [15, 45]},
        "why": "Délai entre l'atterrissage et la sortie : bagages cabine et soute ; contrôle aux frontières hors Schengen.",
    },
    "peakRule": {"value": "≥ 300 voyageurs sortants et ≥ 1,5 × la médiane des tranches non vides", "why": "Seuil de départ, à calibrer avec l'historique de Fabrice."},
}

# Codes pays ISO des États de l'espace Schengen (+ France) — sert si la provenance est connue.
SCHENGEN = {"FR", "DE", "AT", "BE", "BG", "CH", "CZ", "DK", "EE", "ES", "FI", "GR", "HR", "HU", "IS", "IT",
            "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK"}

SLOT_MIN = 30


def seats_for(m: FlightMovement) -> tuple[int, bool]:
    """(sièges, connus ?)"""
    if m.seats:
        return m.seats, True
    table = HYPOTHESES["seatsByAircraft"]["value"]
    if m.aircraft_type and m.aircraft_type.upper() in table:
        return table[m.aircraft_type.upper()], True
    return HYPOTHESES["defaultSeats"]["value"], False


def exit_window(m: FlightMovement, origin_country: str | None = None) -> tuple[int, int]:
    w = HYPOTHESES["exitWindowMin"]["value"]
    if origin_country is None:
        return tuple(w["unknown"])
    return tuple(w["schengen"] if origin_country.upper() in SCHENGEN else w["non_schengen"])


def flight_confidence(m: FlightMovement, seats_known: bool) -> float:
    score = {"reelle": 1.0, "estimee": 0.8, "programmee": 0.55}[m.time_quality]
    return score - (0 if seats_known else 0.15)


def level(score: float | None) -> str:
    if score is None:
        return "moyenne"  # aucun vol : l'absence de vol programmé est une information assez sûre
    return "elevee" if score >= 0.75 else "moyenne" if score >= 0.5 else "faible"


def slots_for_day(
    movements: list[FlightMovement], day: datetime, origin_country: dict[str, str] | None = None
) -> dict:
    """`day` : minuit (heure de Paris) du jour étudié. `origin_country` : code aéroport → pays, si connu."""
    origin_country = origin_country or {}
    n = 24 * 60 // SLOT_MIN
    slots = [
        {"start": (day + timedelta(minutes=i * SLOT_MIN)).strftime("%H:%M"), "landings": 0, "departures": 0,
         "cancelled": 0, "paxExiting": 0.0, "_conf": [], "vtcRides": None}
        for i in range(n)
    ]

    def index(t: datetime) -> int | None:
        i = int((t - day).total_seconds() // 60 // SLOT_MIN)
        return i if 0 <= i < n else None

    for m in movements:
        i = index(m.best_time)
        if m.direction == "departure":
            if i is not None and not m.cancelled:
                slots[i]["departures"] += 1
            continue
        if m.cancelled:
            if i is not None:
                slots[i]["cancelled"] += 1
            continue
        if i is not None:
            slots[i]["landings"] += 1
        seats, known = seats_for(m)
        pax = seats * HYPOTHESES["loadFactor"]["value"]
        lo, hi = exit_window(m, origin_country.get(m.other_airport or ""))
        a, b = m.best_time + timedelta(minutes=lo), m.best_time + timedelta(minutes=hi)
        conf = flight_confidence(m, known)
        # Répartition uniforme des sorties sur la fenêtre [a, b].
        for j in range(n):
            s = day + timedelta(minutes=j * SLOT_MIN)
            e = s + timedelta(minutes=SLOT_MIN)
            overlap = (min(b, e) - max(a, s)).total_seconds()
            if overlap > 0:
                share = pax * overlap / (b - a).total_seconds()
                slots[j]["paxExiting"] += share
                slots[j]["_conf"].append((share, conf))

    nonzero = [s["paxExiting"] for s in slots if s["paxExiting"] > 0]
    threshold = max(300.0, 1.5 * median(nonzero)) if nonzero else float("inf")
    for s in slots:
        c = s.pop("_conf")
        total = sum(w for w, _ in c)
        s["confidence"] = level(sum(w * v for w, v in c) / total if total else None)
        s["paxExiting"] = round(s["paxExiting"])
        s["isPeak"] = s["paxExiting"] >= threshold
    peaks = sorted((s for s in slots if s["isPeak"]), key=lambda s: -s["paxExiting"])[:3]
    return {
        "date": day.date().isoformat(),
        "slotMinutes": SLOT_MIN,
        "hypotheses": HYPOTHESES,
        "warning": "Voyageurs estimés en sortie d'aéroport, pas des courses VTC.",
        "slots": slots,
        "peaks": [p["start"] for p in sorted(peaks, key=lambda p: p["start"])],
        # Facteurs prévus pour la suite : à alimenter par le pilote terrain et l'historique.
        "future": {"vtcShare": None, "waitingTimeMin": None, "driverCompetition": None, "emptyKm": None, "netPerHour": None},
    }
