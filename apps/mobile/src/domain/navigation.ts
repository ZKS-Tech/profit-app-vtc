// Lien de navigation vers une zone : à ouvrir à l'arrêt, dans l'appli GPS du chauffeur.
import { Linking, Platform } from 'react-native';
import type { NavApp } from '../settings/store';

export function navigationUrl(lat: number, lon: number, label: string, app: NavApp) {
  if (app === 'waze') return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
  if (app === 'google' || Platform.OS !== 'android')
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  // Android : « geo: » propose toutes les applis GPS installées (Waze, Google Maps…).
  return `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(label)})`;
}

export async function openNavigation(lat: number, lon: number, label: string, app: NavApp) {
  try {
    await Linking.openURL(navigationUrl(lat, lon, label, app));
  } catch {
    await Linking.openURL(navigationUrl(lat, lon, label, 'google'));
  }
}
