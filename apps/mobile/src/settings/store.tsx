// Réglages du chauffeur, mémorisés sur le téléphone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RankMode } from '../domain/ranking';

export type NavApp = 'choix' | 'waze' | 'google';

export type Settings = {
  defaultMode: RankMode;
  /** En mode « Près de moi », zones au-delà de ce temps de trajet écartées (minutes). */
  maxTripMin: number;
  nav: NavApp;
  /** Cible de revenu horaire pour les jauges du journal (€/h). */
  targetEurH: number;
};

export const DEFAULT_SETTINGS: Settings = { defaultMode: 'ville', maxTripMin: 25, nav: 'choix', targetEurH: 30 };
const KEY = 'reglages-v1';

const Ctx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void; loaded: boolean }>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  loaded: false,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  const update = (p: Partial<Settings>) =>
    setSettings((cur) => {
      const next = { ...cur, ...p };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  return <Ctx.Provider value={{ settings, update, loaded }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
