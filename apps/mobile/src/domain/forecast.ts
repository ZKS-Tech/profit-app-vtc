// Prévisions de la journée pour l'agglomération : heures d'affluence, voyageurs attendus, indice de journée.
//
// v0 — modèle explicite, NON calibré, construit à partir des mêmes données que la carte :
// activité (emplois, habitants, lieux) selon l'heure et le type de jour, arrivées grandes lignes (trains, cars),
// pluie prévue. Ce n'est pas la demande réelle des plateformes : c'est une estimation, comparée aux autres
// jours de la semaine. À calibrer avec les journaux de terrain et l'historique de courses.
import { activityAt, dayInfo, dayLabelOf, type Activity, type Calendar } from './activity';
import { int } from './format';
import { findPeaks, type ArrivalDay, type Peak } from './arrivals';
import type { HubArrivals, TisseoAlert, WeatherHour, Zone } from './zoneScore';

/** Taux de remplissage moyen supposé des trains et cars grandes lignes (hypothèse). */
export const FILL_RATE = 0.7;
/** Délai entre l'arrivée et la sortie des voyageurs (minutes, milieu de la fourchette 5–15). */
const EXIT_MIN = 10;
/** Voyageurs arrivant en une heure qui donnent la contribution « transport » maximale (hypothèse). */
const TRAVELLERS_REF = 2000;
/** Pluie (mm/h) qui donne la contribution « météo » maximale. */
const RAIN_REF_MM = 2;
/** Poids de l'indice horaire (hypothèses v0). */
const W = { activity: 0.6, transport: 0.3, rain: 0.1 };
/** Heures couvertes par une « journée » (5 h → minuit). */
export const DAY_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

export type HourForecast = {
  hour: number;
  /** Indice d'affluence 0–1 (relatif : 1 = heure la plus chargée de la semaine affichée). */
  index: number;
  activity: number; // 0–1, relatif à la semaine
  travellers: { matabiau: number; gareRoutiere: number; aeroport: number; total: number };
  rainMm: number | null; // null = pas encore de prévision
};

export type DayForecast = {
  date: string;
  hours: HourForecast[];
  /** Moyenne des indices horaires. */
  index: number;
  label: 'Bonne journée' | 'Journée moyenne' | 'Journée calme';
  /** Écart à la moyenne des jours affichés (%). */
  vsWeek: number;
  dayType: string;
  travellersTotal: number;
  /** Créneaux les plus chargés (heures de début, regroupées). */
  bestSlots: { from: number; to: number }[];
  reasons: string[];
  peaks: Peak[];
  rainKnown: boolean;
};

const HUBS: { id: string; key: keyof Omit<HourForecast['travellers'], 'total'> }[] = [
  { id: 'matabiau', key: 'matabiau' },
  { id: 'gare-routiere', key: 'gareRoutiere' },
  { id: 'aeroport', key: 'aeroport' },
];

/** Voyageurs grandes lignes sortant d'un pôle pendant l'heure [h, h+1). */
function travellersAt(day: ArrivalDay | undefined, hour: number) {
  if (!day) return 0;
  const seats = day.arrivals
    .filter((a) => a.longDistance && Math.floor((a.minutes + EXIT_MIN) / 60) === hour)
    .reduce((s, a) => s + a.capacity, 0);
  return Math.round(seats * FILL_RATE);
}

function rainAt(weather: WeatherHour[] | undefined, date: string, hour: number) {
  if (!weather?.length) return null;
  // Cumul AROME sur l'heure qui se termine à `time` : l'heure [h, h+1) = valeur datée h+1.
  const end = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime() + 3600_000;
  const hit = weather.find((w) => Math.abs(new Date(w.time).getTime() - end) < 1800_000);
  return hit ? hit.rainMeanMm : null;
}

const fmtH = (h: number) => `${h} h`;

export function forecastDays(params: {
  days: string[];
  zones: Zone[];
  arrivals: HubArrivals[];
  activity: { data: Record<string, Activity>; calendar: Calendar };
  weather?: WeatherHour[];
  alerts?: TisseoAlert[];
}): DayForecast[] {
  const { days, zones, arrivals, activity } = params;
  // 1. Valeurs brutes par jour et par heure.
  const raw = days.map((date) =>
    DAY_HOURS.map((hour) => {
      const act = activityAt(activity.data, zones, date, hour * 60 + 30, activity.calendar, { detail: false }).total;
      const t = { matabiau: 0, gareRoutiere: 0, aeroport: 0, total: 0 };
      for (const h of HUBS) {
        t[h.key] = travellersAt(arrivals.find((a) => a.hubId === h.id)?.days[date], hour);
        t.total += t[h.key];
      }
      return { hour, act, travellers: t, rainMm: rainAt(params.weather, date, hour) };
    }),
  );
  // 2. Activité relative à l'heure la plus active de la semaine affichée.
  const actMax = Math.max(1e-6, ...raw.flat().map((r) => r.act));
  const perDay = raw.map((hours, i) => {
    const hs: HourForecast[] = hours.map((r) => {
      const activityN = r.act / actMax;
      const index =
        W.activity * activityN +
        W.transport * Math.min(1, r.travellers.total / TRAVELLERS_REF) +
        W.rain * (r.rainMm === null ? 0 : Math.min(1, r.rainMm / RAIN_REF_MM));
      return { hour: r.hour, index, activity: activityN, travellers: r.travellers, rainMm: r.rainMm };
    });
    const index = hs.reduce((s, h) => s + h.index, 0) / hs.length;
    return { date: days[i], hs, index };
  });
  // 3. Rang de chaque jour dans la semaine affichée → libellé.
  const mean = perDay.reduce((s, d) => s + d.index, 0) / Math.max(1, perDay.length);
  const sorted = [...perDay].map((d) => d.index).sort((a, b) => b - a);
  const third = Math.max(1, Math.round(sorted.length / 3));
  const hourMax = Math.max(1e-6, ...perDay.flatMap((d) => d.hs.map((h) => h.index)));

  return perDay.map(({ date, hs, index }) => {
    const rank = sorted.indexOf(index);
    // Libellé : rang dans la semaine affichée, et écart à la moyenne d'au moins 3 % (sinon « moyenne »).
    const vs = (index - mean) / Math.max(1e-6, mean);
    const label =
      perDay.length >= 3 && rank < third && vs >= 0.03
        ? 'Bonne journée'
        : perDay.length >= 3 && rank >= sorted.length - third && vs <= -0.03
          ? 'Journée calme'
          : 'Journée moyenne';
    const hours = hs.map((h) => ({ ...h, index: h.index / hourMax }));
    const d = dayInfo(date, activity.calendar);
    const travellersTotal = hours.reduce((s, h) => s + h.travellers.total, 0);
    // Créneaux : les 4 heures les plus chargées, regroupées quand elles se suivent.
    const top = [...hours].sort((a, b) => b.index - a.index).slice(0, 4).map((h) => h.hour).sort((a, b) => a - b);
    const bestSlots: { from: number; to: number }[] = [];
    for (const h of top) {
      const last = bestSlots[bestSlots.length - 1];
      if (last && last.to === h) last.to = h + 1;
      else bestSlots.push({ from: h, to: h + 1 });
    }
    const rainy = hours.filter((h) => (h.rainMm ?? 0) >= 0.5);
    const rainKnown = hours.some((h) => h.rainMm !== null);
    const matabiau = arrivals.find((a) => a.hubId === 'matabiau')?.days[date];
    const peaks = matabiau ? findPeaks(matabiau, 3) : [];
    const reasons: string[] = [];
    if (d.ferie) reasons.push(`Jour férié (${d.ferie}) : peu de trajets domicile–travail`);
    else if (d.dow === 5) reasons.push('Vendredi : sorties du soir et départs en week-end');
    else if (d.dow === 6) reasons.push('Samedi : commerces l’après-midi, vie nocturne le soir');
    else if (d.dow === 0) reasons.push('Dimanche : activité faible, retours de week-end en gare');
    if (d.vacances) reasons.push(`${d.vacances} : moins de trajets vers les écoles et facs`);
    if (travellersTotal) {
      const busiest = [...hours].sort((a, b) => b.travellers.total - a.travellers.total)[0];
      reasons.push(
        `≈ ${int(travellersTotal)} voyageurs grandes lignes attendus (pic ${fmtH(busiest.hour)}–${fmtH(busiest.hour + 1)} : ≈ ${int(busiest.travellers.total)})`,
      );
    }
    if (rainy.length) reasons.push(`Pluie prévue ${fmtH(rainy[0].hour)}–${fmtH(rainy[rainy.length - 1].hour + 1)} : la demande monte`);
    else if (rainKnown) reasons.push('Pas de pluie prévue');
    const dayAlerts = (params.alerts ?? []).filter(
      (a) =>
        a.impact >= 0.5 &&
        a.activePeriods.some((p) => (!p.from || p.from.slice(0, 10) <= date) && (!p.to || p.to.slice(0, 10) >= date)),
    );
    if (dayAlerts.length)
      reasons.push(
        `Perturbations Tisséo : ${[...new Set(dayAlerts.flatMap((a) => a.lines.map((l) => l.name)))].slice(0, 4).join(', ')}`,
      );
    return {
      date,
      hours,
      index,
      label,
      vsWeek: Math.round(((index - mean) / Math.max(1e-6, mean)) * 100),
      dayType: dayLabelOf(d),
      travellersTotal,
      bestSlots,
      reasons,
      peaks,
      rainKnown,
    };
  });
}
