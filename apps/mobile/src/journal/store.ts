// Journal de terrain : ce que le chauffeur vit réellement, pour le comparer aux prévisions de l'app.
// Stockage local sur le téléphone ; export manuel (partage) en attendant la synchronisation serveur.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type EventType = 'debut' | 'course' | 'fin-course' | 'fin' | 'avis';
export type Platform = 'Uber' | 'Bolt' | 'Privé' | 'Autre';

export type JournalEvent = {
  id: string;
  ts: string; // ISO
  type: EventType;
  platform?: Platform;
  amount?: number; // € saisis par le chauffeur (facultatif)
  rating?: 'bonne' | 'moyenne' | 'mauvaise';
  lat?: number; // arrondi à ~100 m
  lon?: number;
  zoneId?: string;
  zoneName?: string;
  appScore?: number; // note de la zone dans l'app à ce moment
  appRank?: number; // rang de la zone dans l'app (toute la ville)
  appTop?: string; // zone n°1 de l'app à ce moment
};

const KEY = 'journal-terrain-v1';

export async function loadJournal(): Promise<JournalEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as JournalEvent[]) : [];
  } catch {
    return [];
  }
}

export async function saveJournal(events: JournalEvent[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(events));
}

export type Status = 'hors-service' | 'disponible' | 'en-course';

export function statusOf(events: JournalEvent[]): { status: Status; since?: string } {
  const last = [...events].reverse().find((e) => e.type !== 'avis');
  if (!last || last.type === 'fin') return { status: 'hors-service', since: last?.ts };
  if (last.type === 'course') return { status: 'en-course', since: last.ts };
  return { status: 'disponible', since: last.ts };
}

const sameDay = (iso: string, d: Date) => {
  const x = new Date(iso);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
};

/** Attente avant chaque course = temps depuis le dernier « début » ou la dernière « fin de course ». */
export function waits(events: JournalEvent[]) {
  const out: { course: JournalEvent; waitMin: number }[] = [];
  let availableSince: string | null = null;
  for (const e of events) {
    if (e.type === 'debut' || e.type === 'fin-course') availableSince = e.ts;
    else if (e.type === 'course' && availableSince) {
      out.push({ course: e, waitMin: Math.round((+new Date(e.ts) - +new Date(availableSince)) / 60000) });
      availableSince = null;
    } else if (e.type === 'fin') availableSince = null;
  }
  return out;
}

export function todaySummary(events: JournalEvent[], now = new Date()) {
  const today = events.filter((e) => sameDay(e.ts, now));
  const w = waits(today);
  const amounts = today.filter((e) => e.type === 'fin-course' && e.amount !== undefined).map((e) => e.amount!);
  return {
    rides: today.filter((e) => e.type === 'course').length,
    avgWait: w.length ? Math.round(w.reduce((s, x) => s + x.waitMin, 0) / w.length) : null,
    revenue: amounts.length ? amounts.reduce((s, a) => s + a, 0) : null,
    events: today,
  };
}

const LABEL: Record<EventType, string> = {
  debut: 'Début de service',
  course: 'Course acceptée',
  'fin-course': 'Fin de course',
  fin: 'Fin de service',
  avis: 'Avis sur la carte',
};
export const eventLabel = (t: EventType) => LABEL[t];

/** Export tableur (séparateur « ; », lisible par Excel en français). */
export function toCsv(events: JournalEvent[]) {
  const waitById = new Map(waits(events).map((w) => [w.course.id, w.waitMin]));
  const head = 'date;heure;evenement;plateforme;montant_eur;attente_min;zone;note_app;rang_app;zone_1_app;avis;lat;lon';
  const rows = events.map((e) => {
    const d = new Date(e.ts);
    return [
      d.toLocaleDateString('fr-FR'),
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      LABEL[e.type],
      e.platform ?? '',
      e.amount?.toString().replace('.', ',') ?? '',
      waitById.get(e.id) ?? '',
      e.zoneName ?? '',
      e.appScore ?? '',
      e.appRank ?? '',
      e.appTop ?? '',
      e.rating ?? '',
      e.lat ?? '',
      e.lon ?? '',
    ].join(';');
  });
  return [head, ...rows].join('\n');
}
