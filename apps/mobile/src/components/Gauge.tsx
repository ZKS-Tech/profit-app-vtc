// Jauge de revenu horaire : valeur, couleur selon la cible et écart à la cible.
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';

/** Seuils relatifs à la cible (pour 30 €/h : rouge < 20, orange < 25, jaune < 30, vert ≥ 30). */
export function gaugeColor(value: number, target: number) {
  if (value >= target) return '#2FCB74';
  if (value >= (target * 5) / 6) return '#F2D13A';
  if (value >= (target * 2) / 3) return '#F5A524';
  return '#F0524F';
}

export function Gauge({ label, value, target, hint }: { label: string; value: number | null; target: number; hint?: string }) {
  const max = target * 1.5;
  const c = value === null ? colors.textFaint : gaugeColor(value, target);
  const gap = value === null ? null : Math.round(value - target);
  return (
    <View style={styles.box} accessibilityLabel={`${label} : ${value === null ? 'pas encore de donnée' : `${Math.round(value)} euros par heure`}`}>
      <Text style={font.small}>{label}</Text>
      <Text style={[font.h1, { color: c }]}>{value === null ? '—' : `${Math.round(value)} €/h`}</Text>
      <View style={styles.track}>
        {/* Zones de couleur de la jauge */}
        <View style={[styles.seg, { flex: 2 / 3, backgroundColor: '#F0524F33' }]} />
        <View style={[styles.seg, { flex: 1 / 6, backgroundColor: '#F5A52433' }]} />
        <View style={[styles.seg, { flex: 1 / 6, backgroundColor: '#F2D13A33' }]} />
        <View style={[styles.seg, { flex: 1 / 2, backgroundColor: '#2FCB7433' }]} />
        {value !== null && (
          <View style={[styles.fill, { width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: c }]} />
        )}
        <View style={[styles.target, { left: `${(target / max) * 100}%` }]} />
      </View>
      <Text style={font.tiny}>
        {gap === null ? hint ?? 'Pas encore de donnée' : `${gap >= 0 ? '+' : '−'}${Math.abs(gap)} € vs cible ${target} €/h`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', marginVertical: 4 },
  seg: { height: '100%' },
  fill: { position: 'absolute', left: 0, top: 3, height: 4, borderRadius: 2 },
  target: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text },
});
