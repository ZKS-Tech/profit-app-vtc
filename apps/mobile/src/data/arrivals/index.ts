// Données RÉELLES : arrivées planifiées extraites des GTFS open data (licence ODbL) par
// services/arrivals/build_arrivals.py (SNCF) et build_coach_arrivals.py (FlixBus, BlaBlaCar Bus).
// Les vols (services/airport) s'ajouteront ici quand l'accès à l'API de l'aéroport sera obtenu.
// Ne pas modifier à la main.
import type { ArrivalDay } from '../../domain/arrivals';
import m1 from './matabiau-2026-11-24.json';
import m2 from './matabiau-2026-11-27.json';
import m3 from './matabiau-2026-12-01.json';
import g1 from './gare-routiere-2026-11-24.json';
import g2 from './gare-routiere-2026-11-27.json';
import g3 from './gare-routiere-2026-12-01.json';
import a1 from './aeroport-cars-2026-11-24.json';
import a2 from './aeroport-cars-2026-11-27.json';
import a3 from './aeroport-cars-2026-12-01.json';

export type DayEntry = { label: string; data: ArrivalDay };

const labels = ['Mar. 24 nov.', 'Ven. 27 nov.', 'Mar. 1er déc.'];

export const matabiauDays: DayEntry[] = [m1, m2, m3].map((d, i) => ({ label: labels[i], data: d as ArrivalDay }));
export const gareRoutiereDays: DayEntry[] = [g1, g2, g3].map((d, i) => ({ label: labels[i], data: d as ArrivalDay }));
export const aeroportCarsDays: DayEntry[] = [a1, a2, a3].map((d, i) => ({ label: labels[i], data: d as ArrivalDay }));
