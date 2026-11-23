import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { demoDriver, platforms as demoPlatforms } from './data';
import type { Platform } from '../domain/types';

/** États d'écran à prévoir (cahier des charges §25) — simulables depuis le profil. */
export type DemoState = 'normal' | 'insuffisant' | 'hors-ligne' | 'chargement';

type Ctx = {
  state: DemoState;
  setState: (s: DemoState) => void;
  target: number;
  setTarget: (n: number) => void;
  platforms: Platform[];
  togglePlatform: (id: string) => void;
  onTrip: boolean;
  setOnTrip: (b: boolean) => void;
};

const DemoContext = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>('normal');
  const [target, setTarget] = useState(demoDriver.targetPerHour);
  const [platforms, setPlatforms] = useState(demoPlatforms);
  const [onTrip, setOnTrip] = useState(false);

  const value = useMemo<Ctx>(
    () => ({
      state,
      setState,
      target,
      setTarget,
      platforms,
      togglePlatform: (id) =>
        setPlatforms((ps) => ps.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))),
      onTrip,
      setOnTrip,
    }),
    [state, target, platforms, onTrip],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo doit être utilisé dans <DemoProvider>');
  return ctx;
}
