// Moteur de la carte : potentiel de demande par quartier, pour un jour et une heure.
//
// v0 — modèle explicite, NON calibré. Chaque facteur est une hypothèse documentée qui sera
// remplacée ou pondérée à partir de l'historique de courses de Fabrice.
// Le résultat est un potentiel de demande (0–100), pas un revenu ni un nombre de courses.

import type { ArrivalDay } from './arrivals';
import { activityAt, dayLabelOf, type Activity, type Calendar } from './activity';

export type Zone = {
  id: string;
  name: string;
  path: string;
  cx: number;
  cy: number;
  areaKm2: number;
  population2019: number;
  density: number;
  kind?: 'quartier' | 'commune';
};

export type Hub = { id: string; name: string; x: number; y: number; zoneId: string | null };

export type TisseoAlert = {
  id: string;
  title: string;
  effect: string;
  lines: { id: string; name: string; mode: string }[];
  activePeriods: { from: string | null; to: string | null }[];
  impact: number;
  zones: string[];
};

export type Factor = { key: FactorKey; label: string; value: number; detail: string };
export type FactorKey = 'transport' | 'activity' | 'disruption' | 'events' | 'weather';

export type ZoneScore = { zoneId: string; score: number; factors: Factor[] };

/** Poids des facteurs (hypothèse v0). Les facteurs sans source connectée ne comptent pas. */
export const WEIGHTS: Record<FactorKey, number> = {
  transport: 0.35,
  activity: 0.35, // emplois, habitants et lieux, selon l'heure et le type de jour
  disruption: 0.1,
  events: 0.1,
  weather: 0.1, // même valeur pour tous les quartiers : la pluie fait monter la demande partout
};

/** Pluie (mm/h, moyenne sur Toulouse) qui donne le score météo maximal (hypothèse). */
const RAIN_REF_MM = 2;

export type WeatherHour = { time: string; rainMeanMm: number; rainMaxMm: number };

/** Pluie prévue sur [t, t + 60 min] ; null si la prévision ne couvre pas ce créneau. */
export function rainFor(hourly: WeatherHour[], at: Date) {
  const end = at.getTime() + HORIZON_MIN * 60_000;
  // Chaque valeur AROME est un cumul sur l'heure qui se termine à `time`.
  const hits = hourly.filter((h) => {
    const t = new Date(h.time).getTime();
    return t > at.getTime() && t - 3600_000 < end;
  });
  if (!hits.length) return null;
  return {
    mean: Math.max(...hits.map((h) => h.rainMeanMm)),
    max: Math.max(...hits.map((h) => h.rainMaxMm)),
  };
}

/** Places arrivant en une heure qui donnent le score transport maximal (hypothèse). */
const TRANSPORT_REF = 1500;
/** Rayon d'influence d'un pôle sur les quartiers voisins (hypothèse). */
const HUB_RADIUS_KM = 1.0;
const EXIT = { min: 5, max: 15 };
const HORIZON_MIN = 60;

export type HubArrivals = { hubId: string; days: Record<string, ArrivalDay> };

/** Places arrivant au pôle et sortant dans [t, t + 60 min]. */
export function hubInflow(day: ArrivalDay | undefined, t: number) {
  if (!day) return { seats: 0, items: [] as ArrivalDay['arrivals'] };
  const items = day.arrivals.filter(
    (a) => a.longDistance && a.minutes + EXIT.max >= t && a.minutes + EXIT.min <= t + HORIZON_MIN,
  );
  return { seats: items.reduce((s, a) => s + a.capacity, 0), items };
}

function isActive(alert: TisseoAlert, at: Date, snapshot: Date) {
  if (!alert.activePeriods.length) {
    // Sans période indiquée, l'alerte ne vaut qu'au moment du relevé (± 3 h).
    return Math.abs(at.getTime() - snapshot.getTime()) < 3 * 3600_000;
  }
  return alert.activePeriods.some(
    (p) => (!p.from || new Date(p.from) <= at) && (!p.to || at <= new Date(p.to)),
  );
}

export function scoreZones(params: {
  zones: Zone[];
  hubs: Hub[];
  arrivals: HubArrivals[];
  date: string; // AAAA-MM-JJ
  minutes: number; // heure de la journée
  alerts: TisseoAlert[];
  alertsFetchedAt: string;
  weather?: WeatherHour[];
  /** Échelle de la carte (km par unité), pour le rayon d'influence des pôles. */
  kmPerUnit: number;
  /** Emplois, habitants et lieux par zone + calendrier ; sans eux, on retombe sur la densité. */
  activity?: { data: Record<string, Activity>; calendar: Calendar };
}): ZoneScore[] {
  const { zones, hubs, arrivals, date, minutes, alerts } = params;
  const at = new Date(`${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+01:00`);
  const maxDensity = Math.max(...zones.map((z) => z.density));

  const inflows = hubs.map((h) => {
    const days = arrivals.find((a) => a.hubId === h.id)?.days ?? {};
    return { hub: h, ...hubInflow(days[date], minutes) };
  });
  const active = alerts.filter((a) => a.impact >= 0.3 && isActive(a, at, new Date(params.alertsFetchedAt)));
  const rain = params.weather ? rainFor(params.weather, at) : null;
  const act = params.activity
    ? activityAt(params.activity.data, zones, date, minutes, params.activity.calendar)
    : null;

  return zones
    .map((z) => {
      // Transport : pôle dans le quartier (100 %) ou à proximité (50 %).
      let seats = 0;
      const near: string[] = [];
      for (const f of inflows) {
        if (!f.seats) continue;
        const inZone = f.hub.zoneId === z.id;
        const close = Math.hypot(f.hub.x - z.cx, f.hub.y - z.cy) * params.kmPerUnit < HUB_RADIUS_KM;
        if (inZone || close) {
          seats += f.seats * (inZone ? 1 : 0.5);
          near.push(`${f.hub.name} : ${f.items.length} arrivée${f.items.length > 1 ? 's' : ''} (≈ ${f.seats} places)`);
        }
      }
      const zoneAlerts = active.filter((a) => a.zones.includes(z.id));
      const disruption = Math.max(0, ...zoneAlerts.map((a) => a.impact));

      const factors: Factor[] = [
        {
          key: 'transport',
          label: 'Trains et cars qui arrivent',
          value: Math.min(1, seats / TRANSPORT_REF),
          detail: near.length ? near.join(' · ') : 'Aucune arrivée longue distance dans l’heure',
        },
        act
          ? {
              key: 'activity',
              label: 'Activité du quartier à cette heure',
              value: act.value[z.id] ?? 0,
              detail: `${act.detail[z.id]} — profil ${dayLabelOf(act.day)}`,
            }
          : {
              key: 'activity',
              label: 'Densité de population',
              // Racine carrée : la demande ne croît pas proportionnellement au nombre d'habitants (hypothèse).
              value: Math.sqrt(z.density / maxDensity),
              detail: `${z.density.toLocaleString('fr-FR')} hab./km² (INSEE 2019)`,
            },
        {
          key: 'disruption',
          label: 'Perturbations Tisséo',
          value: disruption,
          detail: zoneAlerts.length
            ? zoneAlerts.map((a) => `${a.lines.map((l) => l.name).join(', ')} : ${a.title.split(':').slice(1).join(':').trim() || a.effect}`).join(' · ')
            : 'Aucune perturbation métro, tram ou Linéo',
        },
      ];
      if (rain) {
        factors.push({
          key: 'weather',
          label: 'Météo',
          value: Math.min(1, rain.mean / RAIN_REF_MM),
          detail:
            rain.mean < 0.2
              ? 'Pas de pluie prévue (Météo-France AROME)'
              : `Pluie prévue : ${rain.mean.toLocaleString('fr-FR')} mm/h en moyenne, jusqu’à ${rain.max.toLocaleString('fr-FR')} mm/h (Météo-France AROME)`,
        });
      }
      const totalW = factors.reduce((s, f) => s + WEIGHTS[f.key], 0);
      const score = Math.round((100 * factors.reduce((s, f) => s + WEIGHTS[f.key] * f.value, 0)) / totalW);
      return { zoneId: z.id, score, factors };
    })
    .sort((a, b) => b.score - a.score);
}

/** Échelle séquentielle à 5 classes (potentiel faible → fort). */
export const SCORE_COLORS = ['#1B2A44', '#1F4D6B', '#1F7A7A', '#2FA77A', '#7BD88F'];
export const scoreColor = (s: number) => SCORE_COLORS[Math.min(4, Math.floor(s / 20))];
