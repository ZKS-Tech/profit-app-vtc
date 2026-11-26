// Événements (matchs, concerts, salons) : quand et où ils génèrent des courses.
//
// La demande VTC vient surtout de la SORTIE : fin d'un match ou d'un concert, fermeture d'un salon.
// Durées, fenêtres et affluences sont des hypothèses v0, à calibrer avec les journaux de terrain.
import { int } from './format';

export type EventType = 'match' | 'concert' | 'salon' | 'marche' | 'ville';

export type Venue = { id: string; nom: string; lat: number; lon: number };

export type CityEvent = {
  id: string;
  nom: string;
  type: EventType;
  lieu?: string;
  /** Heure de début connue (AAAA-MM-JJTHH:MM, heure locale). */
  debut?: string;
  /** Jour seulement : heure inconnue, l'événement est listé mais pas compté dans les notes. */
  date?: string;
  /** Plusieurs ouvertures (salons). */
  creneaux?: { debut: string; fin: string }[];
  /** Ouverture quotidienne sur une période (marché de Noël). */
  quotidien?: { du: string; au: string; ouverture: string; fermeture: string; fermetureVenSam?: string };
  affluence: number;
  aConfirmer?: string;
};

/** Une ouverture concrète : jour, début et fin en minutes depuis minuit (fin > 1440 = après minuit). */
export type Occurrence = { event: CityEvent; date: string; start: number; end: number; venue?: Venue };

/** Durée supposée d'un match (avec mi-temps) ou d'un concert (minutes). */
const DURATION: Partial<Record<EventType, number>> = { match: 115, concert: 150 };
/** Affluence qui donne l'impact maximal (sur une échelle en racine carrée). */
const AFFLUENCE_REF = 30_000;
/** Rayon autour du lieu où l'événement compte aussi (moitié de l'effet), en km. */
export const EVENT_RADIUS_KM = 1.2;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Toutes les ouvertures d'un jour donné (y compris celles de la veille qui finissent après minuit, décalées). */
export function occurrencesOn(events: CityEvent[], venues: Venue[], date: string): Occurrence[] {
  const venue = (id?: string) => venues.find((v) => v.id === id);
  const out: Occurrence[] = [];
  const add = (event: CityEvent, d: string, start: number, end: number) => {
    if (d === date) out.push({ event, date: d, start, end, venue: venue(event.lieu) });
    else if (d === addDays(date, -1) && end > 1440) out.push({ event, date: d, start: start - 1440, end: end - 1440, venue: venue(event.lieu) });
  };
  for (const e of events) {
    if (e.debut) {
      const [d, t] = e.debut.split('T');
      const start = toMin(t);
      add(e, d, start, start + (DURATION[e.type] ?? 120));
    }
    for (const c of e.creneaux ?? []) {
      const [d, t] = c.debut.split('T');
      add(e, d, toMin(t), toMin(c.fin.split('T')[1]) + (c.fin.split('T')[0] > d ? 1440 : 0));
    }
    if (e.quotidien) {
      for (const d of [addDays(date, -1), date]) {
        if (d < e.quotidien.du || d > e.quotidien.au) continue;
        const dow = new Date(`${d}T12:00:00`).getDay();
        const close = (dow === 5 || dow === 6) && e.quotidien.fermetureVenSam ? e.quotidien.fermetureVenSam : e.quotidien.fermeture;
        add(e, d, toMin(e.quotidien.ouverture), toMin(close));
      }
    }
  }
  return out;
}

/** Événements du jour à afficher (y compris ceux dont l'heure n'est pas connue). */
export function eventsOfDay(events: CityEvent[], venues: Venue[], date: string) {
  const timed = occurrencesOn(events, venues, date).filter((o) => o.date === date);
  const undated = events
    .filter((e) => e.date === date)
    .map((e) => ({ event: e, date, start: -1, end: -1, venue: venues.find((v) => v.id === e.lieu) }) as Occurrence);
  return [...timed, ...undated].sort((a, b) => a.start - b.start);
}

/** Est-ce un événement « longue ouverture » (salon, marché) plutôt qu'un spectacle avec une sortie groupée ? */
const isOpenAllDay = (o: Occurrence) => o.event.type === 'salon' || o.event.type === 'marche';

/**
 * Impact 0–1 d'une ouverture à la minute t : arrivée du public (avant), sortie (après la fin, le plus fort),
 * ou pendant l'ouverture pour les salons et marchés.
 */
export function impactAt(o: Occurrence, t: number) {
  const size = Math.sqrt(Math.min(1, o.event.affluence / AFFLUENCE_REF));
  let p = 0;
  if (isOpenAllDay(o)) {
    if (t >= o.end - 30 && t < o.end + 45) p = 0.8; // fermeture : départs groupés
    else if (t >= o.start && t < o.end) p = 0.35;
  } else if (t >= o.end && t < o.end + 60) p = 1; // sortie
  else if (t >= o.end + 60 && t < o.end + 90) p = 0.4;
  else if (t >= o.start - 90 && t < o.start) p = 0.35; // arrivée du public
  else if (t >= o.start && t < o.end) p = 0.1;
  return size * p;
}

/** Spectateurs qui sortent pendant l'heure [h, h+1) (sortie groupée, ou départs à la fermeture). */
export function leavingDuring(o: Occurrence, hour: number) {
  const from = hour * 60;
  const exit = isOpenAllDay(o) ? o.end - 15 : o.end + 10;
  return exit >= from && exit < from + 60 ? o.event.affluence * (isOpenAllDay(o) ? 0.4 : 1) : 0;
}

export const hm = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${Math.floor(x / 60)} h ${String(x % 60).padStart(2, '0')}`;
};

/** Texte court : « TFC – PSG : sortie vers 21 h 55 (≈ 32 000 personnes, heure à confirmer) ». */
export function describe(o: Occurrence, t: number) {
  const when =
    o.start < 0
      ? 'heure à confirmer'
      : isOpenAllDay(o)
        ? t >= o.end - 30
          ? `fermeture à ${hm(o.end)}`
          : `ouvert jusqu’à ${hm(o.end)}`
        : t < o.start
          ? `début à ${hm(o.start)}`
          : `sortie vers ${hm(o.end)}`;
  return `${o.event.nom} : ${when} (≈ ${int(o.event.affluence)} personnes${o.event.aConfirmer ? `, ${o.event.aConfirmer}` : ''})`;
}
