import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Coffee,
  Home,
  Lock,
  Plane,
  TrainFront,
} from 'lucide-react-native';
import {
  Card,
  ConfidenceBadge,
  Kpi,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Skeleton,
  SourceNote,
} from '../../components/ui';
import { useDemo } from '../../demo/DemoContext';
import { demoDriver, externalSignals, planSlots } from '../../demo/data';
import { durationH, eur, eurH, planTotal } from '../../domain/decision';
import type { PlanSlot, Scenario } from '../../domain/types';
import { colors, font, radius, revenueColor, spacing } from '../../theme';

const days = ['Lun. 24 nov.', 'Mar. 25 nov.', 'Mer. 26 nov.', 'Jeu. 27 nov.', 'Ven. 28 nov.'];

const scenarios: { value: Scenario; label: string }[] = [
  { value: 'prudent', label: 'Prudent' },
  { value: 'median', label: 'Médian' },
  { value: 'optimiste', label: 'Optimiste' },
];

const scenarioLabel: Record<Scenario, string> = {
  prudent: 'prudent',
  median: 'médian',
  optimiste: 'optimiste',
};

const signalIcon = {
  train: TrainFront,
  plane: Plane,
  rain: CloudRain,
  calendar: CalendarDays,
} as const;

export default function PlanningScreen() {
  const { state, target } = useDemo();
  const [day, setDay] = useState(0);
  const [scenario, setScenario] = useState<Scenario>('median');
  const t = planTotal(planSlots, scenario);

  return (
    <Screen title="Planification" subtitle="Préparez votre journée avant de partir">
      <Card style={styles.dayNav}>
        <Pressable
          onPress={() => setDay((d) => Math.max(0, d - 1))}
          accessibilityRole="button"
          accessibilityLabel="Jour précédent"
          hitSlop={12}
          disabled={day === 0}
          style={{ opacity: day === 0 ? 0.3 : 1 }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Row>
          <CalendarDays size={18} color={colors.primary} />
          <Text style={font.h3}>{days[day]}</Text>
        </Row>
        <Pressable
          onPress={() => setDay((d) => Math.min(days.length - 1, d + 1))}
          accessibilityRole="button"
          accessibilityLabel="Jour suivant"
          hitSlop={12}
          disabled={day === days.length - 1}
          style={{ opacity: day === days.length - 1 ? 0.3 : 1 }}
        >
          <ChevronRight size={22} color={colors.text} />
        </Pressable>
      </Card>

      <Segmented label="Scénario" options={scenarios} value={scenario} onChange={setScenario} />

      {state === 'chargement' ? (
        <Skeleton height={400} />
      ) : (
        <>
          <Card>
            <Text style={font.small}>
              Estimation de la journée · scénario {scenarioLabel[scenario]}
            </Text>
            <View style={styles.kpis}>
              <Kpi label="Revenu net estimé" value={eur(t.total)} />
              <Kpi
                label="Par heure"
                value={eurH(t.perHour)}
                hint={t.perHour >= target ? 'objectif atteint' : `objectif ${target} €/h`}
                tone={t.perHour >= target ? 'up' : 'down'}
              />
              <Kpi label="Heures" value={`${t.hours.toLocaleString('fr-FR')} h`} hint="trajets inclus" />
            </View>
            <View style={styles.constraints}>
              <Constraint icon={<Home size={14} color={colors.textMuted} />} text={`Départ ${demoDriver.start}`} />
              <Constraint icon={<Car size={14} color={colors.textMuted} />} text={`Fin ${demoDriver.end}`} />
              <Constraint icon={<Lock size={14} color={colors.textMuted} />} text="1 course privée" />
            </View>
          </Card>

          <SectionTitle>Créneaux</SectionTitle>
          <View>
            {planSlots.map((s, i) => (
              <SlotRow key={s.start} slot={s} scenario={scenario} target={target} last={i === planSlots.length - 1} />
            ))}
          </View>

          <SectionTitle>Ce qui influence la journée</SectionTitle>
          <Card style={{ gap: spacing.md }}>
            {externalSignals.map((e) => {
              const Icon = signalIcon[e.icon as keyof typeof signalIcon];
              return (
                <Row key={e.label}>
                  <Icon size={16} color={colors.primary} />
                  <Text style={[font.body, { flex: 1 }]}>{e.label}</Text>
                  <Text style={font.small}>{e.time}</Text>
                </Row>
              );
            })}
            <SourceNote>
              Événements fictifs. Les sources réelles (vols, trains, météo, événements) restent à choisir, en vérifiant
              leurs licences.
            </SourceNote>
          </Card>

          <SourceNote>
            Prévision mise à jour hier à 21h00 · 3 scénarios avec niveau de confiance · estimation, pas une garantie de
            gains.
          </SourceNote>
        </>
      )}
    </Screen>
  );
}

function Constraint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Row style={styles.constraint}>
      {icon}
      <Text style={font.small}>{text}</Text>
    </Row>
  );
}

function SlotRow({
  slot,
  scenario,
  target,
  last,
}: {
  slot: PlanSlot;
  scenario: Scenario;
  target: number;
  last: boolean;
}) {
  const value = slot.netPerHour?.[scenario];
  const color =
    slot.kind === 'pause'
      ? colors.textFaint
      : slot.kind === 'prive'
        ? '#7FB2FF'
        : value !== undefined
          ? revenueColor(value, target)
          : colors.textMuted;
  const h = durationH(slot.start, slot.end);

  return (
    <View style={styles.slot}>
      <View style={styles.timeCol}>
        <Text style={[font.h3, { fontSize: 13 }]}>{slot.start}</Text>
        <Text style={font.tiny}>{slot.end}</Text>
      </View>
      <View style={styles.rail}>
        <View style={[styles.railDot, { backgroundColor: color }]} />
        {!last && <View style={styles.railLine} />}
      </View>
      <Card style={[styles.slotCard, slot.kind === 'prive' && { borderColor: '#7FB2FF' }]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row style={{ flex: 1 }}>
            {slot.kind === 'pause' && <Coffee size={14} color={colors.textMuted} />}
            {slot.kind === 'prive' && <Lock size={14} color="#7FB2FF" />}
            {(slot.kind === 'trajet' || slot.kind === 'retour') && <Car size={14} color={colors.textMuted} />}
            <Text style={font.h3} numberOfLines={1}>
              {slot.area}
            </Text>
          </Row>
          {slot.fixedAmount ? (
            <Text style={[font.h3, { color }]}>{eur(slot.fixedAmount)}</Text>
          ) : value !== undefined ? (
            <Text style={[font.h3, { color }]}>{eurH(value)}</Text>
          ) : null}
        </Row>
        <Text style={[font.small, { marginTop: 4 }]}>{slot.advice}</Text>
        {slot.confidence && slot.kind !== 'prive' && (
          <Row style={{ marginTop: 6, justifyContent: 'space-between' }}>
            <ConfidenceBadge level={slot.confidence} />
            {value !== undefined && <Text style={font.tiny}>≈ {eur(value * h)} sur le créneau</Text>}
          </Row>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  kpis: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  constraints: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  constraint: {
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  slot: { flexDirection: 'row', gap: spacing.sm },
  timeCol: { width: 44, paddingTop: spacing.md, alignItems: 'flex-end' },
  rail: { width: 14, alignItems: 'center' },
  railDot: { width: 10, height: 10, borderRadius: 5, marginTop: spacing.lg },
  railLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4 },
  slotCard: { flex: 1, padding: spacing.md, marginBottom: spacing.sm },
});
