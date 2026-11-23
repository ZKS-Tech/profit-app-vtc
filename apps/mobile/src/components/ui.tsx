import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudOff, Database, Info, TriangleAlert } from 'lucide-react-native';
import { colors, font, radius, spacing } from '../theme';
import { useDemo } from '../demo/DemoContext';
import type { Confidence } from '../domain/types';

/* ---------- Mise en page ---------- */

export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  realData = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  /** Écran alimenté par de vraies données (sinon badge « DÉMO »). */
  realData?: boolean;
}) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={font.h1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={[font.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
        </View>
        {realData ? <RealDataBadge /> : <DemoBadge />}
        {right}
      </View>
      <StateBanner />
      <Body
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? styles.content : undefined}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Body>
    </SafeAreaView>
  );
}

export function DemoBadge() {
  return (
    <View
      style={styles.demoBadge}
      accessibilityLabel="Données fictives de démonstration"
    >
      <Text style={styles.demoBadgeText}>DÉMO</Text>
    </View>
  );
}

export function RealDataBadge() {
  return (
    <View style={[styles.demoBadge, { backgroundColor: colors.successSoft }]} accessibilityLabel="Données réelles">
      <Text style={[styles.demoBadgeText, { color: colors.success }]}>DONNÉES RÉELLES</Text>
    </View>
  );
}

/** Bandeau d'état global : hors ligne, données insuffisantes, chargement. */
export function StateBanner() {
  const { state } = useDemo();
  if (state === 'normal') return null;
  const conf = {
    'hors-ligne': {
      icon: <CloudOff size={16} color={colors.warning} />,
      text: 'Hors ligne : estimations du jour figées à 08h47. Elles se mettront à jour au retour du réseau.',
      bg: colors.warningSoft,
    },
    insuffisant: {
      icon: <Database size={16} color={colors.primary} />,
      text: 'Pas assez d’historique : les estimations reposent sur des moyennes de la ville. Importez vos relevés pour les affiner.',
      bg: colors.primarySoft,
    },
    chargement: {
      icon: <ActivityIndicator size="small" color={colors.primary} />,
      text: 'Calcul des estimations en cours…',
      bg: colors.primarySoft,
    },
  }[state];
  return (
    <View style={[styles.banner, { backgroundColor: conf.bg }]} accessibilityRole="alert">
      {conf.icon}
      <Text style={[font.small, { color: colors.text, flex: 1 }]}>{conf.text}</Text>
    </View>
  );
}

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
}) {
  return (
    <View style={[styles.card, accent ? { borderColor: accent } : null, style]}>{children}</View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={[font.h3, { color: colors.textMuted, flex: 1 }]} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

/* ---------- Contrôles ---------- */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'success';
  icon?: ReactNode;
}) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'success' ? colors.success : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      {icon}
      <Text style={[font.h3, { color: variant === 'ghost' ? colors.text : '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={10}
      style={[styles.toggle, { backgroundColor: value ? colors.primary : colors.surfaceHigh }]}
    >
      <View style={[styles.toggleKnob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

/* ---------- Affichage de données ---------- */

export function Kpi({
  label,
  value,
  hint,
  tone,
  style,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'up' | 'down';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.kpi, style]}>
      <Text style={font.small} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[font.kpi, { fontSize: 22, marginTop: 4 }]}>{value}</Text>
      {hint ? (
        <Text
          style={[
            font.tiny,
            { marginTop: 2 },
            tone === 'up' && { color: colors.success },
            tone === 'down' && { color: colors.danger },
          ]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const confMeta: Record<Confidence, { label: string; color: string; bars: number }> = {
  faible: { label: 'Faible', color: colors.danger, bars: 1 },
  moyenne: { label: 'Moyenne', color: colors.warning, bars: 2 },
  elevee: { label: 'Élevée', color: colors.success, bars: 3 },
};

export function ConfidenceBadge({ level, compact }: { level: Confidence; compact?: boolean }) {
  const m = confMeta[level];
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      accessibilityLabel={`Confiance ${m.label.toLowerCase()}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 4,
              height: 4 + i * 4,
              borderRadius: 1,
              backgroundColor: i <= m.bars ? m.color : colors.surfaceHigh,
            }}
          />
        ))}
      </View>
      {!compact && <Text style={[font.small, { color: m.color }]}>{m.label}</Text>}
    </View>
  );
}

export function Pill({ label, color = colors.primary }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[font.tiny, { color, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

/** Provenance des données : obligatoire sous chaque estimation. */
export function SourceNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.source}>
      <Info size={12} color={colors.textFaint} />
      <Text style={[font.tiny, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
      <TriangleAlert size={28} color={colors.warning} />
      <Text style={[font.h3, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[font.small, { textAlign: 'center' }]}>{text}</Text>
      {action}
    </Card>
  );
}

export function Skeleton({ height = 80 }: { height?: number }) {
  return <View style={[styles.skeleton, { height }]} accessibilityLabel="Chargement" />;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  demoBadge: {
    backgroundColor: colors.demoSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  demoBadgeText: { color: colors.demo, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  toggle: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  kpi: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    minWidth: 100,
  },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  source: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: spacing.sm },
  skeleton: { backgroundColor: colors.surface, borderRadius: radius.lg, opacity: 0.6 },
});
