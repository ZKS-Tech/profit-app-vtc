"""Tests de la logique du connecteur aéroport.

Aucun test n'appelle la vraie API ni ne reproduit son format de réponse (non documenté) :
les enregistrements ci-dessous utilisent des noms de champs de TEST, déclarés dans un
field_map de test, pour vérifier la mécanique de normalisation.
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from atb_client import AtbClient, AtbConfig, ConfigError  # noqa: E402
from flights import PARIS, FlightMovement, deduplicate, normalize, parse_time  # noqa: E402
from passenger_flow import slots_for_day  # noqa: E402

TEST_MAP = {
    "flight_number": "num",
    "scheduled": "prevu",
    "estimated": "estime",
    "actual": "reel",
    "status": "etat",
    "cancelled_status_values": ["ANNULE"],
    "aircraft_type": "avion",
}


def mv(num, sched, **kw):
    return FlightMovement(direction=kw.pop("direction", "arrival"), flight_number=num,
                          scheduled=datetime.fromisoformat(sched).replace(tzinfo=PARIS), **kw)


class TimeTests(unittest.TestCase):
    def test_utc_converted_to_paris(self):
        self.assertEqual(parse_time("2026-11-24T09:00:00Z").hour, 10)  # UTC+1 en hiver

    def test_naive_is_paris(self):
        self.assertEqual(parse_time("2026-11-24T09:00:00").hour, 9)

    def test_summer_offset(self):
        self.assertEqual(parse_time("2026-07-01T09:00:00Z").hour, 11)  # UTC+2 en été


class NormalizeTests(unittest.TestCase):
    def test_requires_field_map(self):
        with self.assertRaises(ValueError):
            normalize({"x": 1}, "arrival", {})

    def test_delay_and_cancel(self):
        m = normalize({"num": "AF6120", "prevu": "2026-11-24T10:00:00", "estime": "2026-11-24T10:25:00",
                       "etat": "RETARDE"}, "arrival", TEST_MAP)
        self.assertEqual(m.delay_min, 25)
        self.assertFalse(m.cancelled)
        c = normalize({"num": "U21234", "prevu": "2026-11-24T11:00:00", "etat": "annule"}, "arrival", TEST_MAP)
        self.assertTrue(c.cancelled)

    def test_dedup_keeps_realtime(self):
        planned = mv("AF 6120", "2026-11-24T10:00:00", fetched_at=1)
        realtime = mv("af6120", "2026-11-24T10:00:00", fetched_at=2,
                      estimated=datetime(2026, 11, 24, 10, 20, tzinfo=PARIS))
        out = deduplicate([realtime, planned])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].time_quality, "estimee")


class FlowTests(unittest.TestCase):
    day = datetime(2026, 11, 24, tzinfo=PARIS)

    def test_passengers_spread_and_not_rides(self):
        # A320 (180 sièges × 80 % = 144 voyageurs), atterrissage 10h05, fenêtre inconnue 15–45 min
        r = slots_for_day([mv("X1", "2026-11-24T10:05:00", aircraft_type="A320")], self.day)
        total = sum(s["paxExiting"] for s in r["slots"])
        self.assertAlmostEqual(total, 144, delta=1)
        s = {x["start"]: x for x in r["slots"]}
        self.assertEqual(s["10:00"]["landings"], 1)
        self.assertEqual(s["10:00"]["paxExiting"], 48)  # 10h20–10h30 : 10 min sur 30
        self.assertEqual(s["10:30"]["paxExiting"], 96)  # 10h30–10h50 : 20 min sur 30
        self.assertTrue(all(x["vtcRides"] is None for x in r["slots"]))
        self.assertIn("pas des courses VTC", r["warning"])

    def test_cancelled_flights_bring_nobody(self):
        r = slots_for_day([mv("X2", "2026-11-24T12:00:00", cancelled=True)], self.day)
        self.assertEqual(sum(s["paxExiting"] for s in r["slots"]), 0)
        self.assertEqual(r["slots"][24]["cancelled"], 1)

    def test_confidence_levels(self):
        sched = slots_for_day([mv("X3", "2026-11-24T14:00:00")], self.day)
        real = slots_for_day([mv("X4", "2026-11-24T14:00:00", aircraft_type="A321",
                                 actual=datetime(2026, 11, 24, 14, 3, tzinfo=PARIS))], self.day)
        conf = lambda r: {s["confidence"] for s in r["slots"] if s["paxExiting"]}
        self.assertEqual(conf(sched), {"faible"})  # horaire programmé + type d'avion inconnu
        self.assertEqual(conf(real), {"elevee"})

    def test_peak_detection(self):
        flights = [mv(f"P{i}", "2026-11-24T08:00:00", aircraft_type="A321") for i in range(4)]
        flights.append(mv("Q1", "2026-11-24T15:00:00", aircraft_type="AT76"))
        r = slots_for_day(flights, self.day)
        self.assertTrue(r["peaks"])
        self.assertTrue(all(p.startswith("08") for p in r["peaks"]))


class ClientTests(unittest.TestCase):
    def test_missing_credentials(self):
        with self.assertRaises(ConfigError):
            AtbClient(AtbConfig.from_env({}))

    def test_token_and_cache(self):
        calls = []

        def fake_transport(method, url, headers, body):  # doublure de test, pas une réponse ATB
            calls.append((method, url))
            if method == "POST":
                return 200, json.dumps({"access_token": "t", "expires_in": 600}).encode()
            return 200, json.dumps([{"k": 1}]).encode()

        with tempfile.TemporaryDirectory() as d:
            cfg = AtbConfig.from_env({"ATB_TOKEN_URL": "https://token.test", "ATB_CLIENT_ID": "id",
                                      "ATB_CLIENT_SECRET": "s", "ATB_CACHE_DIR": d})
            c = AtbClient(cfg, transport=fake_transport)
            self.assertEqual(len(c.fetch("arrival", "planned", "2026-11-24", "2026-11-24")), 1)
            c.fetch("arrival", "planned", "2026-11-24", "2026-11-24")  # servi par le cache
            self.assertEqual([m for m, _ in calls], ["POST", "GET"])
            self.assertIn("/planned-arrivals?startDate=2026-11-24", calls[1][1])


if __name__ == "__main__":
    unittest.main()
