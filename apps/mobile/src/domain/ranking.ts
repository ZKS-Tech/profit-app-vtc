// Classement des quartiers selon le choix du chauffeur : toute la ville, hors centre, ou près de lui.
//
// « Près de moi » : la note est multipliée par la part de l'heure réellement utile une fois sur place.
// Toutes les valeurs ci-dessous sont des hypothèses v0, à calibrer avec le GPS et l'historique.
import type { Zone, ZoneScore } from './zoneScore';

export type RankMode = 'ville' | 'hors-centre' | 'pres';

/** Rayon de l'hypercentre autour du Capitole (≈ intérieur des boulevards + Saint-Cyprien). */
export const CENTRE_RADIUS_KM = 1.45;
/** Détour routier moyen par rapport à la ligne droite. */
const ROAD_FACTOR = 1.35;
/** Temps perdu en plus pour entrer dans l'hypercentre (circulation, stationnement), hors heures de pointe. */
const CENTRE_EXTRA_MIN = 5;

/**
 * Trafic : vitesse moyenne selon l'heure et le jour (hypothèses, faute de données trafic en temps réel).
 * À remplacer par une source trafic (temps de parcours réels) quand elle sera choisie.
 */
export type Traffic = { speedKmh: number; centreExtraMin: number; label: string };
export function trafficAt(minutes: number, dow: number): Traffic {
  const h = minutes / 60;
  const weekday = dow >= 1 && dow <= 5;
  if (weekday && ((h >= 7 && h < 9.5) || (h >= 16.5 && h < 19.5)))
    return { speedKmh: 17, centreExtraMin: 10, label: 'heure de pointe' };
  if (h >= 22 || h < 6) return { speedKmh: 35, centreExtraMin: 2, label: 'circulation fluide (nuit)' };
  if (h >= 19.5) return { speedKmh: 28, centreExtraMin: 4, label: 'circulation fluide (soirée)' };
  return weekday
    ? { speedKmh: 23, centreExtraMin: CENTRE_EXTRA_MIN, label: 'circulation de journée' }
    : { speedKmh: 26, centreExtraMin: CENTRE_EXTRA_MIN, label: 'circulation de week-end' };
}
const NO_TRAFFIC: Traffic = { speedKmh: 25, centreExtraMin: CENTRE_EXTRA_MIN, label: '' };
const HORIZON_MIN = 60;

export type Projection = { kx: number; ox: number; oy: number; span: number };
export type Point = { x: number; y: number };

/** Position GPS → coordonnées de la carte (repère 0–1000). */
export function project(lat: number, lon: number, p: Projection, size = 1000): Point {
  return { x: ((lon * p.kx - p.ox) / p.span) * size, y: ((p.oy - lat) / p.span) * size };
}

export function centreIds(zones: Zone[], kmPerUnit: number): Set<string> {
  const cap = zones.find((z) => z.name === 'Capitole');
  if (!cap) return new Set();
  return new Set(
    zones.filter((z) => Math.hypot(z.cx - cap.cx, z.cy - cap.cy) * kmPerUnit <= CENTRE_RADIUS_KM).map((z) => z.id),
  );
}

/** Temps d'accès estimé (minutes) depuis une position jusqu'au centre d'un quartier, selon le trafic. */
export function accessMinutes(from: Point, z: Zone, kmPerUnit: number, centre: Set<string>, traffic = NO_TRAFFIC) {
  const km = Math.hypot(z.cx - from.x, z.cy - from.y) * kmPerUnit * ROAD_FACTOR;
  return Math.round((km / traffic.speedKmh) * 60 + (centre.has(z.id) ? traffic.centreExtraMin : 0));
}

export type Ranked = ZoneScore & {
  /** Note utilisée pour le classement (= note, ou note ajustée au trajet). */
  rankScore: number;
  accessMin?: number;
  km?: number;
  excluded: boolean;
};

export function rankZones(
  scores: ZoneScore[],
  zones: Zone[],
  opts: {
    mode: RankMode;
    kmPerUnit: number;
    centre: Set<string>;
    from?: Point | null;
    maxTripMin?: number;
    /** Trafic à l'heure considérée : une zone plus lente à rejoindre est pénalisée. */
    traffic?: Traffic;
  },
): Ranked[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  return scores
    .map((s) => {
      const z = byId.get(s.zoneId)!;
      const excluded = opts.mode === 'hors-centre' && opts.centre.has(s.zoneId);
      if (opts.mode === 'pres' && opts.from) {
        const accessMin = accessMinutes(opts.from, z, opts.kmPerUnit, opts.centre, opts.traffic);
        const useful = Math.max(0, HORIZON_MIN - accessMin) / HORIZON_MIN;
        const km = Math.round(Math.hypot(z.cx - opts.from.x, z.cy - opts.from.y) * opts.kmPerUnit * ROAD_FACTOR * 10) / 10;
        const tooFar = opts.maxTripMin !== undefined && accessMin > opts.maxTripMin;
        return { ...s, rankScore: Math.round(s.score * useful), accessMin, km, excluded: excluded || tooFar };
      }
      return { ...s, rankScore: s.score, excluded };
    })
    .sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.rankScore - a.rankScore);
}

/** Coordonnées de la carte → position GPS (inverse de `project`). */
export function unproject(x: number, y: number, p: Projection, size = 1000) {
  return { lat: p.oy - (y / size) * p.span, lon: ((x / size) * p.span + p.ox) / p.kx };
}

/** Gain minimal (points de note, ou part de la note actuelle) pour conseiller de bouger plutôt que rester. */
const MOVE_MIN_GAIN = 3;
const MOVE_MIN_RATIO = 0.15;
/** Après IDLE_FREE_MIN minutes sans course, la zone actuelle perd 1 % de sa note par minute (au plus 40 %). */
const IDLE_FREE_MIN = 10;

export type RelaunchAdvice =
  | { kind: 'go'; best: Ranked; here?: Ranked; stayValue?: number }
  | { kind: 'stay'; here: Ranked; best?: Ranked; stayValue: number };

/**
 * Temps mou : rester où l'on est, ou aller relancer ailleurs ?
 * `near` = classement « près de moi » depuis la position du chauffeur. On ne conseille de bouger que si le
 * gain, trajet compris, dépasse nettement la zone actuelle. Une longue attente sans course est un signe que la
 * zone actuelle est moins bonne que prévu : sa note baisse avec le temps d'attente.
 */
export function relaunchAdvice(near: Ranked[], hereId: string | null, idleMin: number | null): RelaunchAdvice | null {
  const here = hereId ? near.find((s) => s.zoneId === hereId) : undefined;
  const others = near.filter((s) => s.zoneId !== hereId);
  // Hors de portée (rien dans le rayon de trajet) : la zone la plus proche.
  const best =
    others.find((s) => !s.excluded) ?? [...others].sort((a, b) => (a.accessMin ?? 0) - (b.accessMin ?? 0))[0];
  if (!here) return best ? { kind: 'go', best } : null;
  const penalty = idleMin !== null && idleMin > IDLE_FREE_MIN ? Math.min(0.4, (idleMin - IDLE_FREE_MIN) / 100) : 0;
  const stayValue = Math.round(here.score * (1 - penalty));
  if (!best) return { kind: 'stay', here, stayValue };
  const gain = best.rankScore - stayValue;
  return gain >= Math.max(MOVE_MIN_GAIN, MOVE_MIN_RATIO * stayValue)
    ? { kind: 'go', best, here, stayValue }
    : { kind: 'stay', here, best, stayValue };
}
