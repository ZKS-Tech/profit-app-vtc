import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  Kpi,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Skeleton,
  SourceNote,
} from '../../components/ui';
import { useDemo } from '../../demo/DemoContext';
import { monthStats, platformYield, weekStats, zoneYield } from '../../demo/data';
import { eur, eurH } from '../../domain/decision';
import type { DayStats } from '../../domain/types';
import { colors, font, platformColors, radius, revenueColor, spacing } from '../../theme';

type Period = 'semaine' | 'mois';

export default function StatsScreen() {
  const { state, target } = useDemo();
  const [period, setPeriod] = useState<Period>('semaine');
  const data = period === 'semaine' ? weekStats : monthStats;
  const sum = (k: keyof Omit<DayStats, 'label'>) => data.reduce((a, d) => a + d[k], 0);
  const hours = sum('hours');
  const contribution = sum('contribution');
  const predicted = sum('predicted');
  const gap = ((contribution - predicted) / predicted) * 100;

  return (
    <Screen
      title="Mes performances"
      subtitle={period === 'semaine' ? 'Semaine du 17 au 21 novembre 2026' : 'Novembre 2026 · 4 semaines'}
    >
      <Segmented
        label="Période"
        options={[
          { value: 'semaine', label: 'Semaine' },
          { value: 'mois', label: 'Mois' },
        ]}
        value={period}
        onChange={setPeriod}
      />

      {state === 'chargement' ? (
        <>
          <Skeleton height={180} />
          <Skeleton height={220} />
        </>
      ) : state === 'insuffisant' ? (
        <EmptyState
          title="Pas encore assez de données"
          text="Importez au moins 2 semaines de relevés pour voir vos indicateurs de rentabilité."
          action={<Button label="Importer un relevé" onPress={() => router.push('/connexions')} />}
        />
      ) : (
        <>
          <View style={styles.grid}>
            <Kpi style={styles.cell} label="Chiffre d’affaires" value={eur(sum('grossRevenue'))} />
            <Kpi style={styles.cell} label="Après commission" value={eur(sum('afterCommission'))} />
            <Kpi
              style={styles.cell}
              label="Après coûts variables"
              value={eur(contribution)}
              hint={`${gap >= 0 ? '+' : ''}${gap.toFixed(1).replace('.', ',')} % vs prévision`}
              tone={gap >= 0 ? 'up' : 'down'}
            />
            <Kpi
              style={styles.cell}
              label="Revenu net / heure"
              value={eurH(contribution / hours)}
              hint={`objectif ${target} €/h`}
              tone={contribution / hours >= target ? 'up' : 'down'}
            />
            <Kpi
              style={styles.cell}
              label="Heures réellement travaillées"
              value={`${hours.toLocaleString('fr-FR')} h`}
              hint="comptées une seule fois"
            />
            <Kpi
              style={styles.cell}
              label="Km à vide"
              value={`${Math.round((sum('emptyKm') / sum('totalKm')) * 100)} %`}
              hint={`${sum('emptyKm')} km sur ${sum('totalKm')}`}
            />
          </View>

          <SectionTitle>Revenu après coûts variables : réel et prévu</SectionTitle>
          <Card>
            <BarChart data={data} />
            <Row style={{ marginTop: spacing.md, gap: spacing.lg }}>
              <Row style={{ gap: 6 }}>
                <View style={[styles.legendSwatch, { backgroundColor: colors.primary }]} />
                <Text style={font.tiny}>Réel</Text>
              </Row>
              <Row style={{ gap: 6 }}>
                <View style={styles.legendTick} />
                <Text style={font.tiny}>Prévu la veille</Text>
              </Row>
            </Row>
          </Card>

          <SectionTitle>Rendement par plateforme</SectionTitle>
          <Card style={{ gap: spacing.md }}>
            {platformYield.map((p) => (
              <HBar
                key={p.id}
                label={p.name}
                value={p.contribution / p.hours}
                max={45}
                color={platformColors[p.id]}
                detail={`${eur(p.contribution)} · ${p.hours.toLocaleString('fr-FR')} h`}
              />
            ))}
            <SourceNote>
              Quand plusieurs applications sont ouvertes en même temps, l’heure n’est comptée qu’une fois et attribuée à
              la plateforme de la course.
            </SourceNote>
          </Card>

          <SectionTitle>Rendement par zone</SectionTitle>
          <Card style={{ gap: spacing.md }}>
            {zoneYield.map((z) => (
              <HBar key={z.name} label={z.name} value={z.perHour} max={45} color={revenueColor(z.perHour, target)} />
            ))}
          </Card>
          <SourceNote>Données fictives. Les vrais calculs viendront des relevés importés et du GPS consenti.</SourceNote>
        </>
      )}
    </Screen>
  );
}

function BarChart({ data }: { data: DayStats[] }) {
  const max = Math.max(...data.map((d) => Math.max(d.contribution, d.predicted))) * 1.1;
  const H = 150;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H + 36, gap: spacing.sm }}>
      {data.map((d) => (
        <View key={d.label} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[font.tiny, { color: colors.textMuted, marginBottom: 4 }]}>{Math.round(d.contribution)}</Text>
          <View style={{ height: H, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
            <View
              style={{
                width: '62%',
                height: (d.contribution / max) * H,
                backgroundColor: colors.primary,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
              }}
              accessibilityLabel={`${d.label} : ${d.contribution} euros réels, ${d.predicted} prévus`}
            />
            <View style={[styles.tick, { bottom: (d.predicted / max) * H }]} />
          </View>
          <Text style={[font.tiny, { marginTop: 4 }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function HBar({
  label,
  value,
  max,
  color,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  detail?: string;
}) {
  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={font.body}>{label}</Text>
        <Text style={font.h3}>{eurH(value)}</Text>
      </Row>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }]} />
      </View>
      {detail ? <Text style={[font.tiny, { marginTop: 3 }]}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '48%', flexGrow: 1 },
  tick: { position: 'absolute', width: '80%', height: 2, backgroundColor: colors.text, borderRadius: 1 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendTick: { width: 12, height: 2, backgroundColor: colors.text },
  track: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
});
