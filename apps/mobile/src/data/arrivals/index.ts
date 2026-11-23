// Données RÉELLES : arrivées planifiées extraites du GTFS SNCF (open data, licence ODbL)
// par services/arrivals/build_arrivals.py. Ne pas modifier à la main.
import type { ArrivalDay } from '../../domain/arrivals';
import d1 from './matabiau-2026-11-24.json';
import d2 from './matabiau-2026-11-27.json';
import d3 from './matabiau-2026-12-01.json';

export const matabiauDays: { label: string; data: ArrivalDay }[] = [
  { label: 'Mar. 24 nov.', data: d1 as ArrivalDay },
  { label: 'Ven. 27 nov.', data: d2 as ArrivalDay },
  { label: 'Mar. 1er déc.', data: d3 as ArrivalDay },
];
