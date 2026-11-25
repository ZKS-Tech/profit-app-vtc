// Statistiques calculées à partir du journal de terrain (données réelles saisies par le chauffeur).
import { waits, type JournalEvent } from './store';

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/** Heures de service : de chaque « début » au « fin » suivant (ou à maintenant si le service est en cours). */
function serviceHours(events: JournalEvent[], now: number) {
  let total = 0;
  let start: number | null = null;
  for (const e of events) {
    if (e.type === 'debut') start = +new Date(e.ts);
    else if (e.type === 'fin' && start !== null) {
      total += +new Date(e.ts) - start;
      start = null;
    }
  }
  if (start !== null) total += now - start;
  return total / 3_600_000;
}

export function journalStats(all: JournalEvent[], days: number | null, now = Date.now()) {
  const since = days === null ? 0 : now - days * 86_400_000;
  const events = all.filter((e) => +new Date(e.ts) >= since);
  const w = waits(events);
  const rides = events.filter((e) => e.type === 'course');
  const amounts = events.filter((e) => e.type === 'fin-course' && e.amount !== undefined).map((e) => e.amount!);
  const hours = serviceHours(events, now);
  const revenue = amounts.reduce((s, a) => s + a, 0);

  const group = (key: (e: JournalEvent) => string | undefined) => {
    const m = new Map<string, number[]>();
    for (const x of w) {
      const k = key(x.course) ?? 'Inconnue';
      m.set(k, [...(m.get(k) ?? []), x.waitMin]);
    }
    return [...m.entries()]
      .map(([name, ws]) => ({ name, rides: ws.length, avgWait: avg(ws) }))
      .sort((a, b) => b.rides - a.rides);
  };

  // L'app avait-elle raison ? Attente quand la course est prise dans une zone du top 10 de l'app, ou en dehors.
  const ranked = w.filter((x) => x.course.appRank !== undefined);
  const inTop = ranked.filter((x) => x.course.appRank! <= 10).map((x) => x.waitMin);
  const outTop = ranked.filter((x) => x.course.appRank! > 10).map((x) => x.waitMin);
  const ratings = events.filter((e) => e.type === 'avis');

  return {
    services: events.filter((e) => e.type === 'debut').length,
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
      inTop: { rides: inTop.length, avgWait: avg(inTop) },
      outTop: { rides: outTop.length, avgWait: avg(outTop) },
    },
    ratings: {
      bonne: ratings.filter((r) => r.rating === 'bonne').length,
      moyenne: ratings.filter((r) => r.rating === 'moyenne').length,
      mauvaise: ratings.filter((r) => r.rating === 'mauvaise').length,
    },
  };
}
