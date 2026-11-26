// Évalue la carte sur des journaux de terrain réels (export CSV de l'onglet Journal).
//
//   npm run evaluer -- chemin/journal-1.csv chemin/journal-2.csv …
//
// Pour chaque course : attente, durée, €/h du cycle (attente + course), rang de la zone dans la version
// de l'app utilisée ce jour-là (colonne rang_app) et rang avec le modèle actuel, recalculé.
// Les journaux contiennent des données personnelles (montants, positions) : ne pas les mettre dans le dépôt.
import { readFileSync } from 'node:fs';
import { cycles, type Cycle } from '../src/journal/cycles';
import type { EventType, JournalEvent } from '../src/journal/store';
import { scoreZones } from '../src/domain/zoneScore';
import { activity, events, hubArrivals, hubs, kmPerUnit, tisseo, weather, zones } from '../src/data/zones';

const TYPES: Record<string, EventType> = {
  'Début de service': 'debut',
  'Course acceptée': 'course',
  'Client à bord': 'a-bord',
  'Fin de course': 'fin-course',
  'Fin de service': 'fin',
  'Avis sur la carte': 'avis',
  'Retour sur conseil': 'retour-conseil',
};

type Row = Cycle & { date: string; minutes: number; modelRank?: number };
const feedback: JournalEvent[] = [];

function load(file: string): Row[] {
  const [head, ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  // Colonnes lues par leur nom : l'export a gagné des colonnes au fil des versions.
  const col = head.split(';');
  const events: JournalEvent[] = lines.map((l, i) => {
    const cell: Record<string, string> = Object.fromEntries(l.split(';').map((v, j) => [col[j], v]));
    const [dd, mm, yyyy] = cell.date.split('/');
    return {
      id: `${file}:${i}`,
      ts: `${yyyy}-${mm}-${dd}T${cell.heure}:00`,
      type: TYPES[cell.evenement],
      platform: (cell.plateforme || undefined) as JournalEvent['platform'],
      amount: cell.montant_eur ? Number(cell.montant_eur.replace(',', '.')) : undefined,
      zoneName: cell.zone || undefined,
      zoneId: zones.find((z) => z.name === cell.zone)?.id,
      appRank: cell.rang_app ? Number(cell.rang_app) : undefined,
      lat: cell.lat ? Number(cell.lat) : undefined,
      lon: cell.lon ? Number(cell.lon) : undefined,
      advice: cell.conseil ? { ts: cell.heure_conseil ?? '', text: cell.conseil } : undefined,
      follow: (cell.conseil_suivi || undefined) as JournalEvent['follow'],
    };
  });
  feedback.push(...events.filter((e) => e.type === 'retour-conseil'));
  return cycles(events.filter((e) => e.type)).map((c) => {
    const [date, time] = c.course.ts.split('T');
    const [h, m] = time.split(':').map(Number);
    return { ...c, date, minutes: h * 60 + m };
  });
}

const rows = process.argv.slice(2).flatMap(load);
if (!rows.length) {
  console.error('Usage : npm run evaluer -- journal.csv [autres.csv…]');
  process.exit(1);
}

const days = new Set(rows.map((r) => r.date));
for (const r of rows) {
  if (!r.course.zoneId) continue;
  // Les arrivées de trains/cars ne sont disponibles que pour les jours embarqués dans l'app.
  const s = scoreZones({
    zones,
    hubs,
    arrivals: hubArrivals,
    date: r.date,
    minutes: r.minutes,
    alerts: tisseo.alerts,
    alertsFetchedAt: tisseo.fetchedAt,
    weather: weather.hourly,
    kmPerUnit,
    activity,
    events,
  });
  r.modelRank = s.findIndex((x) => x.zoneId === r.course.zoneId) + 1;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
console.log('date        heure zone                       attente approche trajet  montant   €/h  rang app  rang modèle');
for (const r of rows) {
  console.log(
    [
      r.date,
      hhmm(r.minutes),
      (r.course.zoneName ?? 'hors carte').padEnd(26),
      `${r.waitMin} min`.padStart(7),
      `${r.approachMin ?? '?'} min`.padStart(8),
      `${r.tripMin ?? r.rideMin ?? '?'} min`.padStart(6),
      `${r.amount?.toFixed(2) ?? '—'} €`.padStart(8),
      `${r.cancelled ? 'annul.' : r.eurPerHour === undefined ? '—' : Math.round(r.eurPerHour)}`.padStart(6),
      `${r.course.appRank ?? '—'}`.padStart(9),
      `${r.modelRank ?? '—'}`.padStart(12),
    ].join(' '),
  );
}

const paid = (xs: Row[]) => xs.filter((r) => r.amount !== undefined && r.rideMin !== undefined);
const eph = (xs: Row[]) => {
  const p = paid(xs);
  const min = p.reduce((s, r) => s + r.waitMin + r.rideMin!, 0);
  return min ? Math.round((p.reduce((s, r) => s + r.amount!, 0) / min) * 60) : null;
};
const avgWait = (xs: Row[]) => (xs.length ? Math.round(xs.reduce((s, r) => s + r.waitMin, 0) / xs.length) : null);

/** Corrélation de Spearman entre « bon rang » et €/h : > 0 = la carte classe mieux les zones qui rapportent. */
function spearman(xs: Row[], rank: (r: Row) => number | undefined) {
  const p = paid(xs).filter((r) => rank(r) && r.eurPerHour !== undefined);
  if (p.length < 5) return null;
  const ranks = (v: number[]) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length + 1) / 2);
  const a = ranks(p.map((r) => -rank(r)!));
  const b = ranks(p.map((r) => r.eurPerHour!));
  const m = (p.length + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < p.length; i++) {
    num += (a[i] - m) * (b[i] - m);
    da += (a[i] - m) ** 2;
    db += (b[i] - m) ** 2;
  }
  return Math.round((num / Math.sqrt(da * db)) * 100) / 100;
}

function verdict(label: string, rank: (r: Row) => number | undefined) {
  const withRank = rows.filter((r) => rank(r) !== undefined);
  const top = withRank.filter((r) => rank(r)! <= 10);
  const rest = withRank.filter((r) => rank(r)! > 10);
  console.log(
    `${label.padEnd(16)} top 10 : ${top.length} courses, ${eph(top) ?? '—'} €/h, attente ${avgWait(top) ?? '—'} min` +
      ` | ailleurs : ${rest.length} courses, ${eph(rest) ?? '—'} €/h, attente ${avgWait(rest) ?? '—'} min` +
      ` | corrélation rang/€h : ${spearman(withRank, rank) ?? 'trop peu de courses'}`,
  );
}

console.log(`\n${rows.length} courses sur ${days.size} jour(s) · ${eph(rows) ?? '—'} €/h mobilisée en moyenne`);
verdict('Version du jour', (r) => r.course.appRank);
verdict('Modèle actuel', (r) => r.modelRank);
if (feedback.length) {
  const n = (f: string) => feedback.filter((e) => e.follow === f).length;
  console.log(`Conseils notés : ${feedback.length} (suivis ${n('oui')}, en partie ${n('partiel')}, non suivis ${n('non')})`);
}
console.log(
  '\nLecture : corrélation proche de 0 = la carte ne distingue pas encore les bonnes zones ; il faut cumuler\n' +
    'plusieurs jours (≥ 50 courses) avant de changer les poids sur la foi de ces chiffres.',
);
