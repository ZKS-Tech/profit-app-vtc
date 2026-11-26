// Activité d'une zone à une heure donnée : emplois, habitants et lieux générateurs de courses,
// chacun pondéré par un profil horaire selon le type de jour (semaine, samedi, dimanche/férié, vacances).
//
// Profils et poids = hypothèses v0, à calibrer avec l'historique Uber/Bolt et le journal de terrain.

export type Activity = {
  emplois: number;
  habitants: number;
  hotels: number;
  sante: number;
  etudes: number;
  commerces: number;
  nuit: number;
  spectacles: number;
};
export type Category = keyof Activity;

export type Calendar = {
  vacances: { nom: string; debut: string; fin: string }[];
  feries: Record<string, string>;
};

export type DayInfo = { dow: number; ferie?: string; vacances?: string };

/** Poids relatif de chaque catégorie dans l'activité (hypothèse). */
const WEIGHT: Record<Category, number> = {
  emplois: 1.0,
  habitants: 0.6,
  hotels: 0.5,
  sante: 0.4,
  etudes: 0.4,
  commerces: 0.5,
  nuit: 0.7,
  spectacles: 0.3,
};

const LABEL: Record<Category, string> = {
  emplois: 'emplois',
  habitants: 'habitants',
  hotels: 'hébergements',
  sante: 'santé',
  etudes: 'études',
  commerces: 'centres commerciaux',
  nuit: 'vie nocturne',
  spectacles: 'salles et stades',
};

export function dayInfo(date: string, cal: Calendar): DayInfo {
  const dow = new Date(`${date}T12:00:00`).getDay(); // 0 = dimanche
  const vac = cal.vacances.find((v) => date >= v.debut && (date < v.fin || (v.debut === v.fin && date === v.debut)));
  return { dow, ferie: cal.feries[date], vacances: vac?.nom };
}

/** Profil horaire 0–1 d'une catégorie (h = heure 0–23). */
export function profile(cat: Category, h: number, d: DayInfo): number {
  const sunday = d.dow === 0 || !!d.ferie;
  const saturday = d.dow === 6 && !sunday;
  const weekday = !sunday && !saturday;
  const between = (a: number, b: number) => h >= a && h < b;
  switch (cat) {
    case 'emplois': {
      const base = between(7, 9) ? 0.5 : between(9, 12) ? 0.4 : between(12, 14) ? 0.5 : between(14, 17) ? 0.4
        : between(17, 19) ? 1.0 : between(19, 20) ? 0.5 : between(20, 22) ? 0.15 : between(6, 7) ? 0.3 : 0.03;
      return base * (weekday ? (d.vacances ? 0.8 : 1) : saturday ? 0.25 : 0.1);
    }
    case 'habitants':
      return between(6, 9) ? (weekday ? 0.9 : 0.4) : between(9, 16) ? 0.35 : between(16, 19) ? 0.5
        : between(19, 23) ? 0.6 : between(23, 24) ? 0.4 : between(5, 6) ? 0.3 : 0.15;
    case 'hotels':
      return between(6, 10) ? 1.0 : between(10, 16) ? 0.35 : between(16, 20) ? 0.6 : between(20, 23) ? 0.5
        : between(23, 24) ? 0.3 : 0.1;
    case 'sante':
      return (between(7, 18) ? 1.0 : between(18, 21) ? 0.4 : 0.12) * (weekday ? 1 : 0.4);
    case 'etudes': {
      const base = between(7, 9) ? 0.6 : between(9, 12) ? 0.4 : between(12, 14) ? 0.5 : between(14, 17) ? 0.4
        : between(17, 20) ? 0.8 : between(20, 23) ? 0.3 : 0.05;
      return base * (weekday ? (d.vacances ? 0.2 : 1) : saturday ? 0.15 : 0.05);
    }
    case 'commerces': {
      const base = between(10, 12) ? 0.5 : between(12, 14) ? 0.6 : between(14, 19) ? 0.8 : between(19, 21) ? 0.7
        : between(9, 10) ? 0.2 : between(21, 22) ? 0.2 : 0;
      return base * (saturday ? 1.3 : sunday ? 0.3 : d.vacances ? 1.1 : 1);
    }
    case 'nuit': {
      // Les heures 0–5 prolongent la soirée de la veille : fortes le samedi et le dimanche matin.
      if (between(0, 3)) return d.dow === 6 || d.dow === 0 ? 1.0 : d.dow === 5 ? 0.6 : 0.3;
      if (between(3, 5)) return d.dow === 6 || d.dow === 0 ? 0.6 : 0.1;
      if (between(21, 24)) return d.dow === 5 || d.dow === 6 ? 0.9 : d.dow === 4 ? 0.6 : 0.35;
      if (between(18, 21)) return 0.35;
      return 0.02;
    }
    case 'spectacles':
      return between(21, 24) ? 0.8 : between(0, 1) ? 0.5 : between(18, 21) ? 0.35 : 0.05;
  }
}

const CATS = Object.keys(WEIGHT) as Category[];

/**
 * Activité relative de chaque zone (0–1, la plus active = 1) pour l'heure donnée,
 * avec une explication des deux principales contributions.
 */
export function activityAt(
  data: Record<string, Activity>,
  zones: { id: string; areaKm2: number }[],
  date: string,
  minutes: number,
  cal: Calendar,
): { value: Record<string, number>; detail: Record<string, string>; day: DayInfo; total: number } {
  const d = dayInfo(date, cal);
  const h = Math.floor(minutes / 60) % 24;
  const zoneIds = zones.map((z) => z.id);
  // Emplois et habitants : total ÷ √surface, compromis entre volume (grande commune = plus de demandes)
  // et concentration (petite zone dense = prise en charge plus rapide). Les lieux restent en nombre.
  const area = Object.fromEntries(zones.map((z) => [z.id, Math.sqrt(Math.max(0.5, z.areaKm2))]));
  const level = (id: string, c: Category) =>
    (data[id]?.[c] ?? 0) / (c === 'emplois' || c === 'habitants' ? area[id] : 1);
  const max = Object.fromEntries(CATS.map((c) => [c, Math.max(1e-6, ...zoneIds.map((id) => level(id, c)))]));
  const raw: Record<string, number> = {};
  const parts: Record<string, { cat: Category; v: number }[]> = {};
  for (const id of zoneIds) {
    const a = data[id];
    if (!a) {
      raw[id] = 0;
      continue;
    }
    // Racine carrée : rendements décroissants (deux fois plus d'emplois ≠ deux fois plus de courses).
    parts[id] = CATS.map((c) => ({ cat: c, v: WEIGHT[c] * Math.sqrt(level(id, c) / max[c]) * profile(c, h, d) }));
    raw[id] = parts[id].reduce((s, p) => s + p.v, 0);
  }
  const top = Math.max(1e-6, ...Object.values(raw));
  const value: Record<string, number> = {};
  const detail: Record<string, string> = {};
  for (const id of zoneIds) {
    value[id] = raw[id] / top;
    const a = data[id];
    const main = (parts[id] ?? []).filter((p) => p.v > 0.01).sort((x, y) => y.v - x.v).slice(0, 2);
    detail[id] = main.length
      ? main
          .map((p) =>
            p.cat === 'emplois' || p.cat === 'habitants'
              ? `≈ ${Math.round(a![p.cat]).toLocaleString('fr-FR')} ${LABEL[p.cat]}`
              : `${LABEL[p.cat]} (${Math.round(a![p.cat])})`,
          )
          .join(' · ')
      : 'Peu d’activité à cette heure';
  }
  // total : activité cumulée de l'agglomération à cette heure (sert aux prévisions de la journée).
  return { value, detail, day: d, total: Object.values(raw).reduce((x, y) => x + y, 0) };
}

export const dayLabelOf = (d: DayInfo) =>
  d.ferie ? `jour férié (${d.ferie})` : d.vacances ? d.vacances.toLowerCase() : d.dow === 0 ? 'dimanche' : d.dow === 6 ? 'samedi' : 'jour de semaine';
