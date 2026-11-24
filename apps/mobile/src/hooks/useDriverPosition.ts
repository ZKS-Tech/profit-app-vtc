// Position du chauffeur, uniquement au premier plan et seulement quand il active « Près de moi ».
// Rien n'est enregistré ni envoyé : la position sert au calcul local des temps de trajet.
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type DriverPosition =
  | { status: 'off' | 'pending' | 'refused' | 'unavailable' }
  | { status: 'ok'; lat: number; lon: number; at: number };

const REFRESH_MS = 2 * 60_000;

export function useDriverPosition(enabled: boolean): DriverPosition {
  const [pos, setPos] = useState<DriverPosition>({ status: 'off' });

  useEffect(() => {
    if (!enabled) {
      setPos({ status: 'off' });
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const read = async () => {
      try {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (alive) setPos({ status: 'ok', lat: p.coords.latitude, lon: p.coords.longitude, at: p.timestamp });
      } catch {
        if (alive) setPos((cur) => (cur.status === 'ok' ? cur : { status: 'unavailable' }));
      }
    };
    (async () => {
      setPos({ status: 'pending' });
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (status !== 'granted') {
          setPos({ status: 'refused' });
          return;
        }
        await read();
        timer = setInterval(read, REFRESH_MS);
      } catch {
        if (alive) setPos({ status: 'unavailable' });
      }
    })();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [enabled]);

  return pos;
}
