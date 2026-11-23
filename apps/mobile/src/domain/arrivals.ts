// Logique « affluence » : regrouper les arrivées planifiées en pics exploitables par un chauffeur.

export type Arrival = {
  time: string; // HH:mm
  minutes: number; // minutes depuis minuit
  type: string; // TGV INOUI, OUIGO, Intercités, TER…
  longDistance: boolean;
  train: string;
  from: string;
  capacity: number; // capacité indicative (hypothèse)
};

export type ArrivalDay = {
  station: { name: string; uic: string };
  date: string; // AAAA-MM-JJ
  source: { name: string; url: string; licence: string; feedVersion?: string };
  generatedAt: string;
  capacityNote: string;
  arrivals: Arrival[];
};

export type Peak = {
  start: number; // première arrivée du pic (minutes)
  end: number; // dernière arrivée du pic
  exitFrom: number; // sortie probable des voyageurs
  exitTo: number;
  seats: number;
  trains: Arrival[];
};

/** Délai entre l'arrivée d'un train et la sortie des voyageurs (hypothèse à calibrer). */
export const EXIT_DELAY = { min: 5, max: 15 };

/**
 * Pics d'arrivées grandes lignes : fenêtres de `windowMin` minutes qui cumulent le plus de
 * capacité, sans chevauchement, triées par heure.
 */
export function findPeaks(day: ArrivalDay, count = 3, windowMin = 30): Peak[] {
  const ld = day.arrivals.filter((a) => a.longDistance);
  const used = new Set<Arrival>();
  const peaks: Peak[] = [];
  while (peaks.length < count) {
    let best: Arrival[] = [];
    let bestSeats = 0;
    for (const a of ld) {
      if (used.has(a)) continue;
      const group = ld.filter((b) => !used.has(b) && b.minutes >= a.minutes && b.minutes < a.minutes + windowMin);
      const seats = group.reduce((s, b) => s + b.capacity, 0);
      if (seats > bestSeats) {
        best = group;
        bestSeats = seats;
      }
    }
    if (!best.length) break;
    best.forEach((b) => used.add(b));
    const start = best[0].minutes;
    const end = best[best.length - 1].minutes;
    peaks.push({
      start,
      end,
      exitFrom: start + EXIT_DELAY.min,
      exitTo: end + EXIT_DELAY.max,
      seats: bestSeats,
      trains: best,
    });
  }
  return peaks.sort((a, b) => a.start - b.start);
}

/** Capacité arrivant par heure, grandes lignes et trains régionaux séparés. */
export function hourly(day: ArrivalDay, fromHour = 5, toHour = 23) {
  const rows = [];
  for (let h = fromHour; h <= toHour; h++) {
    const inHour = day.arrivals.filter((a) => Math.floor(a.minutes / 60) === h);
    rows.push({
      hour: h,
      longSeats: inHour.filter((a) => a.longDistance).reduce((s, a) => s + a.capacity, 0),
      otherSeats: inHour.filter((a) => !a.longDistance).reduce((s, a) => s + a.capacity, 0),
      longCount: inHour.filter((a) => a.longDistance).length,
      count: inHour.length,
    });
  }
  return rows;
}

export const longDistanceCount = (day: ArrivalDay) => day.arrivals.filter((a) => a.longDistance).length;

export const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;

/** Nom de gare lisible : « Paris Montparnasse Hall 1 - 2 » → « Paris Montparnasse ». */
export const shortStation = (name: string) => name.replace(/\s+Hall.*$/i, '').replace(/\s+Saint-Charles$/, ' St-Charles');
