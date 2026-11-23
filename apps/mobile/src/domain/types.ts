// Types métier minimaux pour la maquette. Ils préfigurent les entités du cahier des charges
// (Driver, Vehicle, PlatformAccount, Zone, Prediction, Recommendation…) sans les figer.

export type Confidence = 'faible' | 'moyenne' | 'elevee';
export type Scenario = 'prudent' | 'median' | 'optimiste';
export type Horizon = 0 | 15 | 30 | 60; // minutes

/** Provenance d'une valeur affichée : jamais présenter une estimation comme une donnée plateforme. */
export type DataSource = {
  label: string;
  kind: 'import' | 'gps' | 'estimation' | 'externe' | 'saisie';
  updatedAt: string; // ISO
};

export type Zone = {
  id: string;
  name: string;
  /** Position schématique sur la carte de maquette (0–100). */
  x: number;
  y: number;
  /** Revenu net horaire attendu une fois sur zone (après commission et coûts variables), par horizon. */
  netPerHour: Record<Horizon, number>;
  /** Incertitude ± en €/h. */
  spread: number;
  demand: 'faible' | 'moyenne' | 'elevee';
  confidence: Confidence;
  accessMin: number; // temps d'accès depuis la position actuelle
  accessCost: number; // coût variable du déplacement (€)
  tag?: 'aeroport' | 'gare';
  reason: string;
};

export type ConnectionStatus =
  | 'non-connecte'
  | 'import-disponible'
  | 'oauth-en-attente'
  | 'oauth-disponible'
  | 'connecte';

export type Platform = {
  id: string;
  name: string;
  enabled: boolean;
  loyaltyStatus?: string;
  commissionRate?: number;
  statuses: ConnectionStatus[];
  lastSync?: string;
  importedFields?: string[];
};

export type PlanSlot = {
  start: string; // HH:mm
  end: string;
  area: string;
  kind: 'trajet' | 'travail' | 'pause' | 'prive' | 'retour';
  /** Revenu net horaire estimé selon le scénario (absent pour pause). */
  netPerHour?: Record<Scenario, number>;
  /** Montant fixe connu (course privée réservée). */
  fixedAmount?: number;
  confidence?: Confidence;
  advice: string;
};

export type DayStats = {
  label: string;
  grossRevenue: number; // chiffre d'affaires
  afterCommission: number; // revenu après commission
  contribution: number; // après coûts variables
  hours: number; // heures réellement mobilisées (comptées une seule fois)
  predicted: number; // contribution prévue la veille
  emptyKm: number;
  totalKm: number;
  trips: number;
};
