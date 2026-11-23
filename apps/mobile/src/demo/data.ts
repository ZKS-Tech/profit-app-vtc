// ⚠️ DONNÉES FICTIVES DE DÉMONSTRATION — aucune valeur ici n'est une prévision réelle ni une donnée Uber.
// Gardées séparées des futures données réelles (consigne du cahier des charges, §25).
import type { DataSource, DayStats, Platform, PlanSlot, Zone } from '../domain/types';

export const demoDriver = {
  firstName: 'Fabrice',
  city: 'Toulouse',
  homeArea: 'Secteur Lavaur (zone agrégée)',
  targetPerHour: 35,
  workDays: [true, true, true, true, true, false, false], // L → D
  start: '05:00',
  end: '15:00',
  commuteMin: 60,
  vehicle: { model: 'Tesla Model 3 Performance', energy: 'Électrique', seats: 4, year: 2020 },
  costs: { energyPerKm: 0.05, maintenancePerKm: 0.04, tolls: 0, parkingPerDay: 0 },
  airport: true,
  privateRides: true,
  dateLabel: 'Lundi 24 novembre 2026',
  nowLabel: '09:12',
};

export const currentZoneId = 'sud';

export const zones: Zone[] = [
  {
    id: 'ouest', name: 'Toulouse Ouest', x: 26, y: 56,
    netPerHour: { 0: 36, 15: 35, 30: 34, 60: 32 }, spread: 5,
    demand: 'elevee', confidence: 'moyenne', accessMin: 14, accessCost: 1.3,
    reason: 'arrivées de bureaux à Purpan et Saint-Cyprien, peu de chauffeurs disponibles sur le secteur',
  },
  {
    id: 'centre', name: 'Toulouse Centre', x: 52, y: 50,
    netPerHour: { 0: 33, 15: 34, 30: 35, 60: 31 }, spread: 4,
    demand: 'elevee', confidence: 'elevee', accessMin: 9, accessCost: 0.8, tag: 'gare',
    reason: 'arrivée d’un TGV à Matabiau à 9h48 et forte demande habituelle le lundi matin',
  },
  {
    id: 'blagnac', name: 'Blagnac Aéroport', x: 22, y: 22,
    netPerHour: { 0: 34, 15: 36, 30: 38, 60: 41 }, spread: 9,
    demand: 'moyenne', confidence: 'faible', accessMin: 24, accessCost: 2.1, tag: 'aeroport',
    reason: 'vague d’arrivées prévue vers 10h30, mais file d’attente aéroport inconnue',
  },
  {
    id: 'nord', name: 'Toulouse Nord', x: 56, y: 20,
    netPerHour: { 0: 28, 15: 28, 30: 27, 60: 27 }, spread: 5,
    demand: 'moyenne', confidence: 'moyenne', accessMin: 18, accessCost: 1.5,
    reason: 'demande stable, sans événement particulier',
  },
  {
    id: 'est', name: 'Toulouse Est', x: 80, y: 48,
    netPerHour: { 0: 27, 15: 27, 30: 28, 60: 29 }, spread: 6,
    demand: 'moyenne', confidence: 'moyenne', accessMin: 12, accessCost: 1.0,
    reason: 'demande correcte, mais trajets courts et beaucoup de km à vide',
  },
  {
    id: 'sud', name: 'Toulouse Sud', x: 54, y: 82,
    netPerHour: { 0: 26, 15: 26, 30: 27, 60: 28 }, spread: 4,
    demand: 'faible', confidence: 'elevee', accessMin: 0, accessCost: 0,
    reason: 'creux habituel en milieu de matinée sur Rangueil et Labège',
  },
];

export const offMapZones = [
  { name: 'Montauban', direction: 'nord', note: '≈ 45 min' },
  { name: 'Lavaur', direction: 'est', note: '≈ 45 min · domicile' },
];

export const sources: DataSource[] = [
  { label: 'Historique importé (fichier CSV, oct. 2026)', kind: 'import', updatedAt: '2026-11-15T18:20:00' },
  { label: 'Position GPS VTC Profit AI (consentie)', kind: 'gps', updatedAt: '2026-11-24T09:12:00' },
  { label: 'Horaires vols et trains (source à valider)', kind: 'externe', updatedAt: '2026-11-24T09:05:00' },
  { label: 'Météo (source à valider)', kind: 'externe', updatedAt: '2026-11-24T09:00:00' },
];

export const platforms: Platform[] = [
  {
    id: 'uber', name: 'Uber', enabled: true, loyaltyStatus: 'Diamond', commissionRate: 0.25,
    statuses: ['import-disponible', 'oauth-en-attente'], lastSync: '15/11/2026 à 18h20',
    importedFields: ['Date et heure', 'Durée', 'Distance', 'Revenu chauffeur', 'Catégorie'],
  },
  { id: 'bolt', name: 'Bolt', enabled: false, statuses: ['non-connecte'] },
  { id: 'heetch', name: 'Heetch', enabled: false, statuses: ['non-connecte'] },
  {
    id: 'prive', name: 'Courses privées', enabled: true, statuses: ['connecte'],
    lastSync: 'Saisie manuelle · 3 réservations à venir',
  },
];

export const planSlots: PlanSlot[] = [
  {
    start: '05:00', end: '06:00', area: 'Lavaur → Toulouse', kind: 'trajet',
    netPerHour: { prudent: 6, median: 12, optimiste: 22 }, confidence: 'faible',
    advice: 'Rester disponible sur l’itinéraire : une course vers Toulouse est possible.',
  },
  {
    start: '06:00', end: '08:00', area: 'Centre · gare Matabiau', kind: 'travail',
    netPerHour: { prudent: 24, median: 29, optimiste: 34 }, confidence: 'moyenne',
    advice: 'Premières arrivées TGV à 7h12 et 7h48 : se placer près de la gare.',
  },
  {
    start: '08:00', end: '10:00', area: 'Ouest · Blagnac', kind: 'travail',
    netPerHour: { prudent: 28, median: 34, optimiste: 40 }, confidence: 'moyenne',
    advice: 'Pic de demande aéroport et entreprises : meilleur créneau de la journée.',
  },
  {
    start: '10:30', end: '11:30', area: 'Blagnac → Labège', kind: 'prive',
    fixedAmount: 65, confidence: 'elevee',
    advice: 'Course privée réservée : créneau bloqué, avec 15 min de marge avant.',
  },
  {
    start: '11:30', end: '12:30', area: 'Sud · Labège', kind: 'travail',
    netPerHour: { prudent: 22, median: 27, optimiste: 31 }, confidence: 'elevee',
    advice: 'Sorties de bureaux à Labège : rester sur place après la course privée.',
  },
  {
    start: '12:30', end: '13:00', area: 'Pause', kind: 'pause',
    advice: 'Pause conseillée : la demande est au plus bas.',
  },
  {
    start: '13:00', end: '14:30', area: 'Centre', kind: 'travail',
    netPerHour: { prudent: 23, median: 28, optimiste: 33 }, confidence: 'moyenne',
    advice: 'Pluie prévue de 13h à 15h : la demande devrait augmenter.',
  },
  {
    start: '14:30', end: '15:00', area: 'Est', kind: 'retour',
    netPerHour: { prudent: 18, median: 24, optimiste: 30 }, confidence: 'moyenne',
    advice: 'Fin de journée : privilégier les courses vers l’est (direction Lavaur).',
  },
];

export const externalSignals = [
  { icon: 'train', label: 'TGV Paris → Toulouse Matabiau', time: '07:48' },
  { icon: 'plane', label: 'Vague d’arrivées à Blagnac (6 vols)', time: '08:20–09:40' },
  { icon: 'rain', label: 'Pluie modérée annoncée', time: '13:00–15:00' },
  { icon: 'calendar', label: 'Salon professionnel au MEETT', time: 'toute la journée' },
];

export const weekStats: DayStats[] = [
  { label: 'Lun', grossRevenue: 345, afterCommission: 262, contribution: 244, hours: 8.8, predicted: 235, emptyKm: 68, totalKm: 214, trips: 16 },
  { label: 'Mar', grossRevenue: 312, afterCommission: 237, contribution: 220, hours: 8.5, predicted: 240, emptyKm: 71, totalKm: 198, trips: 15 },
  { label: 'Mer', grossRevenue: 368, afterCommission: 280, contribution: 262, hours: 9.0, predicted: 250, emptyKm: 62, totalKm: 221, trips: 17 },
  { label: 'Jeu', grossRevenue: 298, afterCommission: 226, contribution: 208, hours: 8.2, predicted: 230, emptyKm: 75, totalKm: 189, trips: 14 },
  { label: 'Ven', grossRevenue: 385, afterCommission: 293, contribution: 275, hours: 9.1, predicted: 265, emptyKm: 58, totalKm: 228, trips: 18 },
];

export const monthStats: DayStats[] = [
  { label: 'S44', grossRevenue: 1612, afterCommission: 1225, contribution: 1138, hours: 42.5, predicted: 1100, emptyKm: 352, totalKm: 1032, trips: 74 },
  { label: 'S45', grossRevenue: 1580, afterCommission: 1201, contribution: 1112, hours: 43.0, predicted: 1150, emptyKm: 340, totalKm: 1018, trips: 72 },
  { label: 'S46', grossRevenue: 1655, afterCommission: 1258, contribution: 1170, hours: 42.0, predicted: 1160, emptyKm: 331, totalKm: 1040, trips: 76 },
  { label: 'S47', grossRevenue: 1708, afterCommission: 1298, contribution: 1209, hours: 43.6, predicted: 1220, emptyKm: 334, totalKm: 1050, trips: 80 },
];

/** Rendement par plateforme sur la semaine. Les heures communes ne sont comptées qu'une fois. */
export const platformYield = [
  { id: 'uber', name: 'Uber', hours: 39.1, contribution: 1044 },
  { id: 'prive', name: 'Courses privées', hours: 4.5, contribution: 165 },
];

export const zoneYield = [
  { name: 'Blagnac Aéroport', perHour: 33 },
  { name: 'Toulouse Ouest', perHour: 31 },
  { name: 'Toulouse Centre', perHour: 29 },
  { name: 'Toulouse Nord', perHour: 24 },
  { name: 'Toulouse Est', perHour: 23 },
  { name: 'Toulouse Sud', perHour: 22 },
];

export const today = {
  contribution: 118,
  hours: 4.2,
  emptyKm: 31,
  trips: 7,
};
