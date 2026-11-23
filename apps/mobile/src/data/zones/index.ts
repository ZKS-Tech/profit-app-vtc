// Données RÉELLES de la carte (ne pas modifier à la main) :
// - toulouse-zones.json : 60 grands quartiers INSEE (Toulouse Métropole, Licence Ouverte) — services/zones
// - tisseo-perturbations.json : relevé temps réel Tisséo (ODbL) — services/tisseo
import type { Hub, TisseoAlert, Zone } from '../../domain/zoneScore';
import type { HubArrivals } from '../../domain/zoneScore';
import type { ArrivalDay } from '../../domain/arrivals';
import zonesFile from './toulouse-zones.json';
import tisseoFile from './tisseo-perturbations.json';
import { aeroportCarsDays, gareRoutiereDays, matabiauDays } from '../arrivals';

export const zones = zonesFile.zones as Zone[];
export const hubs = zonesFile.hubs as Hub[];
export const zonesSource = zonesFile.source;

export const tisseo = {
  fetchedAt: tisseoFile.fetchedAt,
  source: tisseoFile.source,
  alerts: tisseoFile.alerts as TisseoAlert[],
  cancelled: tisseoFile.cancelledTrips as { name: string; mode: string; count: number }[],
};

const byDate = (days: { data: ArrivalDay }[]) => Object.fromEntries(days.map((d) => [d.data.date, d.data]));

export const hubArrivals: HubArrivals[] = [
  { hubId: 'matabiau', days: byDate(matabiauDays) },
  { hubId: 'gare-routiere', days: byDate(gareRoutiereDays) },
  { hubId: 'aeroport', days: byDate(aeroportCarsDays) },
];

export const mapDays = matabiauDays.map((d) => ({ label: d.label, date: d.data.date }));
