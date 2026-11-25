// Données RÉELLES de la carte (ne pas modifier à la main) :
// - toulouse-zones.json : 60 grands quartiers INSEE (Toulouse Métropole, Licence Ouverte) — services/zones
// - tisseo-perturbations.json : relevé temps réel Tisséo (ODbL) — services/tisseo
// - activite.json : emplois (SIRENE) et lieux (OpenStreetMap) par zone — services/zones/build_activity.py
// - calendrier.json : vacances scolaires et jours fériés — services/zones/build_calendar.py
// - meteo-toulouse.json : Météo-France observation + AROME (Licence Ouverte) — services/weather
import type { Hub, TisseoAlert, WeatherHour, Zone } from '../../domain/zoneScore';
import type { HubArrivals } from '../../domain/zoneScore';
import type { ArrivalDay } from '../../domain/arrivals';
import zonesFile from './toulouse-zones.json';
import tisseoFile from './tisseo-perturbations.json';
import meteoFile from './meteo-toulouse.json';
import activiteFile from './activite.json';
import calendrierFile from './calendrier.json';
import type { Activity, Calendar } from '../../domain/activity';
import { aeroportCarsDays, gareRoutiereDays, matabiauDays } from '../arrivals';

export const zones = zonesFile.zones as Zone[];
export const hubs = zonesFile.hubs as Hub[];
export const zonesSource = zonesFile.source;
export const projection = zonesFile.projection;
export const kmPerUnit = zonesFile.kmPerUnit;

export const tisseo = {
  fetchedAt: tisseoFile.fetchedAt,
  source: tisseoFile.source,
  alerts: tisseoFile.alerts as TisseoAlert[],
  cancelled: tisseoFile.cancelledTrips as { name: string; mode: string; count: number }[],
};

export const weather = {
  fetchedAt: meteoFile.fetchedAt,
  aromeRun: meteoFile.aromeRun,
  source: meteoFile.source,
  observation: meteoFile.observation,
  hourly: meteoFile.hourly as WeatherHour[],
};

const byDate = (days: { data: ArrivalDay }[]) => Object.fromEntries(days.map((d) => [d.data.date, d.data]));

export const hubArrivals: HubArrivals[] = [
  { hubId: 'matabiau', days: byDate(matabiauDays) },
  { hubId: 'gare-routiere', days: byDate(gareRoutiereDays) },
  { hubId: 'aeroport', days: byDate(aeroportCarsDays) },
];


/** Activité par zone + calendrier, pour le facteur « activité du quartier ». */
export const activity = {
  data: activiteFile.zones as Record<string, Activity>,
  calendar: calendrierFile as Calendar,
};
export const activitySources = activiteFile.sources;
export const jobsEstimated = activiteFile.emploisEstimes.communes as string[];
