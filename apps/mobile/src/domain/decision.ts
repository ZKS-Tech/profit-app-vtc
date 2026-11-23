import type { Horizon, PlanSlot, Scenario, Zone } from './types';

/**
 * Compare « rester » et « rejoindre une zone » sur un horizon donné.
 * Rester : revenu net attendu sur place pendant tout l'horizon.
 * Bouger : revenu net attendu dans la zone cible, déduction faite du temps d'accès
 * (non productif) et du coût variable du déplacement.
 */
export function compareMove(
  current: Zone,
  target: Zone,
  horizon: Horizon,
  windowMin = 90,
): { stay: number; move: number; gain: number } {
  const stay = (current.netPerHour[horizon] * windowMin) / 60;
  const productive = Math.max(0, windowMin - target.accessMin);
  const move = (target.netPerHour[horizon] * productive) / 60 - target.accessCost;
  return { stay, move, gain: move - stay };
}

/** Zone recommandée : meilleur gain net sur l'horizon (la zone actuelle a un gain nul). */
export function bestZone(current: Zone, zones: Zone[], horizon: Horizon) {
  return zones
    .map((z) => ({ zone: z, ...compareMove(current, z, horizon) }))
    .sort((a, b) => b.gain - a.gain)[0];
}

/** Estimation de la journée planifiée, pour un scénario. */
export function planTotal(slots: PlanSlot[], scenario: Scenario) {
  let total = 0;
  let hours = 0;
  for (const s of slots) {
    const h = durationH(s.start, s.end);
    hours += h;
    if (s.fixedAmount) total += s.fixedAmount;
    else if (s.netPerHour) total += s.netPerHour[scenario] * h;
  }
  return { total, hours, perHour: hours ? total / hours : 0 };
}

export function durationH(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

export const eur = (n: number, digits = 0) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;

export const eurH = (n: number) => `${Math.round(n)} €/h`;
