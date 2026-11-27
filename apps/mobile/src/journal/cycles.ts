// Cycles « attente → approche → client à bord → dépose » du journal : logique pure, partagée par l'app
// et le script d'évaluation (scripts/evaluer-journal.ts).
import type { JournalEvent } from './store';

/** Pause plus courte que ça entre « fin » et « début » de service = attente, pas une vraie pause. */
export const PAUSE_MIN = 45;
/** Montant en dessous duquel une course sans client à bord est une annulation facturée (hypothèse, €). */
const CANCEL_FEE_MAX = 7;
/** Détour routier moyen par rapport à la ligne droite entre deux positions du journal (hypothèse). */
const ROAD_FACTOR = 1.3;

export type Cycle = {
  course: JournalEvent;
  /** Attente avant l'acceptation, depuis la dernière dépose (ou le début de service). */
  waitMin: number;
  /** Approche : de l'acceptation à « Client à bord ». Absente si l'étape n'a pas été saisie. */
  approachMin?: number;
  /** Trajet avec le client : de « Client à bord » à la dépose. */
  tripMin?: number;
  /** De l'acceptation à la dépose (approche + trajet). */
  rideMin?: number;
  approachKm?: number;
  tripKm?: number;
  amount?: number;
  /** Course annulée (sans « Client à bord », fin en moins de 4 min ou montant < 7 €) : montant = frais éventuels. */
  cancelled?: boolean;
  /** € par heure sur ce cycle : montant ÷ (attente + approche + trajet). Absent si la durée est nulle. */
  eurPerHour?: number;
};

const minutesBetween = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 60000);

/** Distance routière estimée entre deux événements géolocalisés (km, 1 décimale). */
function roadKm(a?: JournalEvent, b?: JournalEvent) {
  if (a?.lat === undefined || a.lon === undefined || b?.lat === undefined || b.lon === undefined) return undefined;
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.round(Math.hypot(x, y) * 6371 * ROAD_FACTOR * 10) / 10;
}

/** € par heure ; null si la durée est nulle (pas de division par zéro). */
export function perHour(amount: number, minutes: number) {
  return minutes > 0 ? (amount / minutes) * 60 : undefined;
}

/**
 * Découpe le journal en cycles. Un arrêt de service suivi d'une reprise en moins de PAUSE_MIN minutes compte
 * comme de l'attente : certains chauffeurs coupent le service après chaque course.
 */
export function cycles(events: JournalEvent[]): Cycle[] {
  const out: Cycle[] = [];
  let availableSince: string | null = null;
  let stopped: { at: string; available: string | null } | null = null;
  // L'attente ne continue à travers un arrêt court que si elle a commencé à une dépose : un « début » suivi
  // d'une « fin » sans course (appui par erreur, trajet depuis le domicile) ne compte pas comme attente.
  let sinceDrop = false;
  let current: (Cycle & { onboard?: JournalEvent }) | null = null;
  for (const e of events) {
    if (e.type === 'debut') {
      const resume: string | null =
        stopped && stopped.available && minutesBetween(stopped.at, e.ts) <= PAUSE_MIN ? stopped.available : null;
      availableSince = resume ?? e.ts;
      sinceDrop = resume !== null;
      stopped = null;
    } else if (e.type === 'course') {
      current = { course: e, waitMin: availableSince ? minutesBetween(availableSince, e.ts) : 0 };
      out.push(current);
      availableSince = null;
    } else if (e.type === 'a-bord' && current) {
      current.onboard = e;
      current.approachMin = minutesBetween(current.course.ts, e.ts);
      current.approachKm = roadKm(current.course, e);
    } else if (e.type === 'fin-course') {
      if (current) {
        current.rideMin = minutesBetween(current.course.ts, e.ts);
        if (current.onboard) {
          current.tripMin = minutesBetween(current.onboard.ts, e.ts);
          current.tripKm = roadKm(current.onboard, e);
        }
        current.amount = e.amount;
        // Sans « Client à bord » : fin presque immédiate, ou montant sous le minimum d'une course (frais d'annulation).
        current.cancelled = !current.onboard && (current.rideMin < 4 || (e.amount !== undefined && e.amount < CANCEL_FEE_MAX));
        // Pas de €/h pour une annulation (5 € en 1 min ferait 300 €/h) ; le montant compte dans la journée.
        if (e.amount !== undefined && !current.cancelled)
          current.eurPerHour = perHour(e.amount, current.waitMin + current.rideMin);
        delete current.onboard;
        current = null;
      }
      availableSince = e.ts;
      sinceDrop = true;
    } else if (e.type === 'fin') {
      stopped = { at: e.ts, available: sinceDrop ? availableSince : null };
      availableSince = null;
      current = null;
    }
  }
  return out;
}

/** Attente avant chaque course (voir `cycles`). */
export const waits = (events: JournalEvent[]) => cycles(events).map((c) => ({ course: c.course, waitMin: c.waitMin }));

/**
 * Heures de service : de chaque « début » au « fin » suivant (ou à maintenant si le service est en cours).
 * Les arrêts de moins de PAUSE_MIN minutes comptent comme du service (attente entre deux courses).
 */
export function serviceHours(events: JournalEvent[], now: number) {
  let total = 0;
  let start: number | null = null;
  let lastEnd: number | null = null;
  for (const e of events) {
    const t = +new Date(e.ts);
    if (e.type === 'debut') {
      if (lastEnd !== null && t - lastEnd <= PAUSE_MIN * 60_000) total += t - lastEnd;
      start = t;
    } else if (e.type === 'fin' && start !== null) {
      total += t - start;
      start = null;
      lastEnd = t;
    }
  }
  if (start !== null) total += Math.max(0, now - start);
  return total / 3_600_000;
}
