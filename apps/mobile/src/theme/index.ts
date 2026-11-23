// Jetons de design — thème sombre (usage de jour comme de nuit, au volant).
export const colors = {
  bg: '#0A111F',
  surface: '#111B2E',
  surfaceAlt: '#16233A',
  surfaceHigh: '#1D2D48',
  border: '#24344F',
  text: '#EAF0F8',
  textMuted: '#97A6BD',
  textFaint: '#66768F',
  primary: '#3D8BFD',
  primarySoft: 'rgba(61,139,253,0.16)',
  success: '#2FCB74',
  successSoft: 'rgba(47,203,116,0.15)',
  warning: '#F5A524',
  warningSoft: 'rgba(245,165,36,0.15)',
  danger: '#F0524F',
  dangerSoft: 'rgba(240,82,79,0.15)',
  demo: '#B98CFF',
  demoSoft: 'rgba(185,140,255,0.14)',
};

// Couleurs de marque utilisées uniquement comme repères visuels (pas de logos officiels).
export const platformColors: Record<string, string> = {
  uber: '#F4F4F4',
  bolt: '#34D186',
  heetch: '#F2457D',
  prive: '#7FB2FF',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const font = {
  h1: { fontSize: 24, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 14, color: colors.text },
  small: { fontSize: 12, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textFaint },
  kpi: { fontSize: 26, fontWeight: '800' as const, color: colors.text },
};

/** Couleur d'une zone selon le revenu net horaire attendu, relativement à l'objectif. */
export function revenueColor(eurPerHour: number, target: number): string {
  const r = eurPerHour / target;
  if (r >= 0.95) return colors.success;
  if (r >= 0.8) return '#A6D13B';
  if (r >= 0.65) return colors.warning;
  return colors.danger;
}
