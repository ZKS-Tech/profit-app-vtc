// Données de la carte : version à jour publiée par le serveur (GitHub Actions → Supabase Storage),
// avec repli sur les données intégrées à l'app si le réseau ou le serveur est indisponible.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ArrivalDay } from '../domain/arrivals';
import type { HubArrivals, TisseoAlert, WeatherHour } from '../domain/zoneScore';
import { hubArrivals as bundledHubs, tisseo as bundledTisseo, weather as bundledWeather } from './zones';

/** Adresse publique des fichiers, ex. https://<projet>.supabase.co/storage/v1/object/public/donnees/carte */
const DATA_URL = process.env.EXPO_PUBLIC_DATA_URL?.replace(/\/$/, '');
const REFRESH_MS = 10 * 60_000;
const HUB_FILES = [
  { hubId: 'matabiau', prefix: 'matabiau' },
  { hubId: 'gare-routiere', prefix: 'gare-routiere' },
  { hubId: 'aeroport', prefix: 'aeroport-cars' },
];

type Weather = typeof bundledWeather;
type Tisseo = { fetchedAt: string; alerts: TisseoAlert[] };

export type LiveData = {
  origin: 'serveur' | 'integrees';
  checkedAt: Date | null;
  updated: Record<string, string>; // date de mise à jour par source
  days: string[];
  hubArrivals: HubArrivals[];
  tisseo: Tisseo;
  weather: Weather;
};

const bundledDays = Object.keys(bundledHubs[0].days).sort();

const bundled: LiveData = {
  origin: 'integrees',
  checkedAt: null,
  updated: { tisseo: bundledTisseo.fetchedAt, meteo: bundledWeather.fetchedAt },
  days: bundledDays,
  hubArrivals: bundledHubs,
  tisseo: { fetchedAt: bundledTisseo.fetchedAt, alerts: bundledTisseo.alerts },
  weather: bundledWeather,
};

async function getJson<T>(name: string): Promise<T> {
  const r = await fetch(`${DATA_URL}/${name}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${name} : HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function loadFromServer(): Promise<LiveData> {
  const manifest = await getJson<{ updated: Record<string, string>; days?: string[]; files: string[] }>(
    'manifest.json',
  );
  const files = new Set(manifest.files);
  const days = (manifest.days ?? []).filter((d) => HUB_FILES.every((h) => files.has(`${h.prefix}-${d}.json`)));
  const [tisseo, weather, hubs] = await Promise.all([
    files.has('tisseo-perturbations.json') ? getJson<Tisseo>('tisseo-perturbations.json') : bundled.tisseo,
    files.has('meteo-toulouse.json') ? getJson<Weather>('meteo-toulouse.json') : bundled.weather,
    Promise.all(
      HUB_FILES.map(async (h) => {
        const entries = await Promise.all(
          days.map(async (d) => [d, await getJson<ArrivalDay>(`${h.prefix}-${d}.json`)] as const),
        );
        return { hubId: h.hubId, days: Object.fromEntries(entries) } as HubArrivals;
      }),
    ),
  ]);
  if (!days.length) throw new Error('Aucun jour disponible sur le serveur');
  return { origin: 'serveur', checkedAt: new Date(), updated: manifest.updated, days, hubArrivals: hubs, tisseo, weather };
}

const LiveContext = createContext<LiveData>(bundled);

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LiveData>(bundled);
  useEffect(() => {
    if (!DATA_URL) return; // pas de serveur configuré : données intégrées
    let alive = true;
    const refresh = () =>
      loadFromServer()
        .then((d) => alive && setData(d))
        .catch(() => alive && setData((cur) => ({ ...cur, checkedAt: new Date() })));
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return <LiveContext.Provider value={data}>{children}</LiveContext.Provider>;
}

export const useLiveData = () => useContext(LiveContext);

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
/** « Mar 24 » ; « Mar 1/12 » pour un autre mois que le premier jour affiché. */
export function dayLabel(date: string, firstMonth: number) {
  const d = new Date(`${date}T12:00:00`);
  const month = d.getMonth() + 1;
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}${month !== firstMonth ? `/${month}` : ''}`;
}
