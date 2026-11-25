// Cycles « attente + course » du journal : logique pure, partagée par l'app et le script d'évaluation.
import type { JournalEvent } from './store';

/** Pause plus courte que ça entre « fin » et « début » de service = attente, pas une vraie pause. */
export const PAUSE_MIN = 45;

export type Cycle = {
  course: JournalEvent;
  waitMin: number; // depuis la dernière dépose (ou le début de service)
  rideMin?: number; // de l'acceptation à la fin de course
  amount?: number;
  /** € par heure mobilisée sur ce cycle (attente + course). */
  eurPerHour?: number;
};

const minutesBetween = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 60000);

/**
 * Découpe le journal en cycles « attente + course ». Un arrêt de service suivi d'une reprise en moins de
 * PAUSE_MIN minutes compte comme de l'attente : certains chauffeurs coupent le service après chaque course.
 */
export function cycles(events: JournalEvent[]): Cycle[] {
  const out: Cycle[] = [];
  let availableSince: string | null = null;
  let stopped: { at: string; available: string | null } | null = null;
  let current: Cycle | null = null;
  for (const e of events) {
    if (e.type === 'debut') {
      const resume: string | null =
        stopped && stopped.available && minutesBetween(stopped.at, e.ts) <= PAUSE_MIN ? stopped.available : null;
      availableSince = resume ?? e.ts;
      stopped = null;
    } else if (e.type === 'course') {
      current = { course: e, waitMin: availableSince ? minutesBetween(availableSince, e.ts) : 0 };
      out.push(current);
      availableSince = null;
    } else if (e.type === 'fin-course') {
      if (current) {
        current.rideMin = minutesBetween(current.course.ts, e.ts);
        current.amount = e.amount;
        if (e.amount !== undefined) current.eurPerHour = (e.amount / Math.max(5, current.waitMin + current.rideMin)) * 60;
        current = null;
      }
      availableSince = e.ts;
    } else if (e.type === 'fin') {
      stopped = { at: e.ts, available: availableSince };
      availableSince = null;
      current = null;
    }
  }
  return out;
}

/** Attente avant chaque course (voir `cycles`). */
export const waits = (events: JournalEvent[]) => cycles(events).map((c) => ({ course: c.course, waitMin: c.waitMin }));
