// Statistiques calculées à partir du journal de terrain (données réelles saisies par le chauffeur).
import { cycles, PAUSE_MIN, type Cycle } from './cycles';
import type { JournalEvent } from './store';

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/**
 * Heures de service : de chaque « début » au « fin » suivant (ou à maintenant si le service est en cours).
 * Les arrêts de moins de PAUSE_MIN minutes comptent comme du service (attente entre deux courses).
 */
function serviceHours(events: JournalEvent[], now: number) {
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
  if (start !== null) total += now - start;
  return total / 3_600_000;
}

/** € par heure mobilisée (attente + course) sur des cycles dont le montant est saisi. */
function eurPerHour(cs: Cycle[]) {
  const ok = cs.filter((c) => c.amount !== undefined && c.rideMin !== undefined);
  const min = ok.reduce((s, c) => s + c.waitMin + c.rideMin!, 0);
  return ok.length && min >= 30 ? Math.round((ok.reduce((s, c) => s + c.amount!, 0) / min) * 60) : null;
}

export function journalStats(all: JournalEvent[], days: number | null, now = Date.now()) {
  const since = days === null ? 0 : now - days * 86_400_000;
  const events = all.filter((e) => +new Date(e.ts) >= since);
  const w = cycles(events);
  const rides = events.filter((e) => e.type === 'course');
  const amounts = events.filter((e) => e.type === 'fin-course' && e.amount !== undefined).map((e) => e.amount!);
  const hours = serviceHours(events, now);
  const revenue = amounts.reduce((s, a) => s + a, 0);

  const group = (key: (e: JournalEvent) => string | undefined) => {
    const m = new Map<string, Cycle[]>();
    for (const x of w) {
      const k = key(x.course) ?? 'Inconnue';
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    return [...m.entries()]
      .map(([name, cs]) => ({ name, rides: cs.length, avgWait: avg(cs.map((c) => c.waitMin)), eurPerHour: eurPerHour(cs) }))
      .sort((a, b) => b.rides - a.rides);
  };

  // L'app avait-elle raison ? Attente et €/h quand la course est prise dans une zone du top 10 de l'app, ou ailleurs.
  const ranked = w.filter((x) => x.course.appRank !== undefined);
  const inTop = ranked.filter((x) => x.course.appRank! <= 10);
  const outTop = ranked.filter((x) => x.course.appRank! > 10);
  const side = (cs: Cycle[]) => ({ rides: cs.length, avgWait: avg(cs.map((c) => c.waitMin)), eurPerHour: eurPerHour(cs) });
  const ratings = events.filter((e) => e.type === 'avis');

  return {
    // Une reprise moins de PAUSE_MIN minutes après une fin de service ne compte pas comme un nouveau service.
    services: events.filter((e, i) => {
      if (e.type !== 'debut') return false;
      const prevEnd = events.slice(0, i).reverse().find((x) => x.type === 'fin');
      return !prevEnd || +new Date(e.ts) - +new Date(prevEnd.ts) > PAUSE_MIN * 60_000;
    }).length,
    hours,
    rides: rides.length,
    // Moyennes horaires seulement à partir de 30 min de service, sinon elles n'ont pas de sens.
    ridesPerHour: hours >= 0.5 ? rides.length / hours : null,
    avgWait: avg(w.map((x) => x.waitMin)),
    revenue: amounts.length ? revenue : null,
    revenuePerHour: amounts.length && hours >= 0.5 ? revenue / hours : null,
    amountsCount: amounts.length,
    byPlatform: group((e) => e.platform),
    byZone: group((e) => e.zoneName),
    app: {
      rated: ranked.length,
      inTop: side(inTop),
      outTop: side(outTop),
    },
    ratings: {
      bonne: ratings.filter((r) => r.rating === 'bonne').length,
      moyenne: ratings.filter((r) => r.rating === 'moyenne').length,
      mauvaise: ratings.filter((r) => r.rating === 'mauvaise').length,
    },
  };
}
