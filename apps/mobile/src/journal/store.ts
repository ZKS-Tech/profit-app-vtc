// Journal de terrain : ce que le chauffeur vit réellement, pour le comparer aux prévisions de l'app.
// Stockage local sur le téléphone ; export manuel (partage) en attendant la synchronisation serveur.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cycles, waits } from './cycles';

export type EventType = 'debut' | 'course' | 'a-bord' | 'fin-course' | 'fin' | 'avis' | 'retour-conseil';
export type Platform = 'Uber' | 'Bolt' | 'Privé' | 'Autre';
export type Follow = 'oui' | 'non' | 'partiel';

export type JournalEvent = {
  id: string;
  ts: string; // ISO
  type: EventType;
  platform?: Platform;
  amount?: number; // € saisis par le chauffeur (facultatif), 2 décimales
  rating?: 'bonne' | 'moyenne' | 'mauvaise';
  lat?: number; // arrondi à ~100 m
  lon?: number;
  zoneId?: string;
  zoneName?: string;
  appScore?: number; // note de la zone dans l'app à ce moment
  appRank?: number; // rang de la zone dans l'app (toute la ville)
  appTop?: string; // zone n°1 de l'app à ce moment
  /** Retour sur un conseil de la carte : le conseil (texte + heure) et la réponse. */
  advice?: { ts: string; text: string };
  follow?: Follow;
};

const KEY = 'journal-terrain-v1';
const ADVICE_KEY = 'dernier-conseil-v1';

// Abonnés aux changements du journal (maintien de l'écran, carte).
const listeners = new Set<(events: JournalEvent[]) => void>();
export function onJournalChange(cb: (events: JournalEvent[]) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

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
  listeners.forEach((cb) => cb(events));
}

/** Dernier conseil affiché par la carte (« Aller vers X », « Restez vers Y »), pour le retour du chauffeur. */
export type ShownAdvice = { ts: string; text: string };
export async function saveShownAdvice(a: ShownAdvice) {
  try {
    await AsyncStorage.setItem(ADVICE_KEY, JSON.stringify(a));
  } catch {
    // sans conséquence : le retour sur conseil ne sera simplement pas proposé
  }
}
export async function loadShownAdvice(): Promise<ShownAdvice | null> {
  try {
    const raw = await AsyncStorage.getItem(ADVICE_KEY);
    return raw ? (JSON.parse(raw) as ShownAdvice) : null;
  } catch {
    return null;
  }
}

export type Status = 'hors-service' | 'disponible' | 'approche' | 'en-course';

/** Les avis et retours sur conseil ne changent pas l'état du service. */
const isStep = (e: JournalEvent) => e.type !== 'avis' && e.type !== 'retour-conseil';

export function statusOf(events: JournalEvent[]): { status: Status; since?: string } {
  const last = [...events].reverse().find(isStep);
  if (!last || last.type === 'fin') return { status: 'hors-service', since: last?.ts };
  if (last.type === 'course') return { status: 'approche', since: last.ts };
  if (last.type === 'a-bord') return { status: 'en-course', since: last.ts };
  return { status: 'disponible', since: last.ts };
}

export const sameDay = (iso: string, d: Date) => {
  const x = new Date(iso);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
};

export { cycles, perHour, serviceHours, waits, PAUSE_MIN, type Cycle } from './cycles';

export function todaySummary(events: JournalEvent[], now = new Date()) {
  const today = events.filter((e) => sameDay(e.ts, now));
  const w = waits(today);
  const amounts = today.filter((e) => e.type === 'fin-course' && e.amount !== undefined).map((e) => e.amount!);
  return {
    rides: today.filter((e) => e.type === 'course').length,
    avgWait: w.length ? Math.round(w.reduce((s, x) => s + x.waitMin, 0) / w.length) : null,
    revenue: amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100 : null,
    events: today,
  };
}

const LABEL: Record<EventType, string> = {
  debut: 'Début de service',
  course: 'Course acceptée',
  'a-bord': 'Client à bord',
  'fin-course': 'Fin de course',
  fin: 'Fin de service',
  avis: 'Avis sur la carte',
  'retour-conseil': 'Retour sur conseil',
};
export const eventLabel = (t: EventType) => LABEL[t];

/** Montant saisi (« 12,50 », « 12.5 ») → nombre à 2 décimales ; undefined si vide ou invalide. */
export function parseAmount(text: string) {
  const n = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
  return text.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}
export const formatEur = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const dec = (n: number | undefined, digits = 2) => (n === undefined ? '' : n.toFixed(digits).replace('.', ','));

/** Export tableur (séparateur « ; », lisible par Excel en français). Colonnes lues par nom par le script d'évaluation. */
export function toCsv(events: JournalEvent[]) {
  const cyc = new Map(cycles(events).map((c) => [c.course.id, c]));
  // Les durées et le €/h sont reportés sur la ligne « Fin de course » de chaque cycle.
  const byEnd = new Map<string, ReturnType<typeof cycles>[number]>();
  let open: string | null = null;
  for (const e of events) {
    if (e.type === 'course') open = e.id;
    if (e.type === 'fin-course' && open) {
      byEnd.set(e.id, cyc.get(open)!);
      open = null;
    }
  }
  const head =
    'date;heure;evenement;plateforme;montant_eur;attente_min;approche_min;trajet_min;km_approche;km_trajet;eur_h;' +
    'zone;note_app;rang_app;zone_1_app;avis;conseil;heure_conseil;conseil_suivi;lat;lon';
  const rows = events.map((e) => {
    const d = new Date(e.ts);
    const c = byEnd.get(e.id);
    return [
      d.toLocaleDateString('fr-FR'),
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      LABEL[e.type],
      e.platform ?? '',
      dec(e.amount),
      cyc.get(e.id)?.waitMin ?? '',
      c?.approachMin ?? '',
      c?.tripMin ?? '',
      dec(c?.approachKm, 1),
      dec(c?.tripKm, 1),
      c?.eurPerHour === undefined ? '' : Math.round(c.eurPerHour),
      e.zoneName ?? '',
      e.appScore ?? '',
      e.appRank ?? '',
      e.appTop ?? '',
      e.rating ?? '',
      e.advice?.text ?? '',
      e.advice ? new Date(e.advice.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '',
      e.follow ?? '',
      e.lat ?? '',
      e.lon ?? '',
    ].join(';');
  });
  return [head, ...rows].join('\n');
}
