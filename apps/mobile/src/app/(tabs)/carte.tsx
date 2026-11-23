import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { ArrowRight, ArrowUp, Plane, TrainFront } from 'lucide-react-native';
import {
  Card,
  ConfidenceBadge,
  Kpi,
  Pill,
  Row,
  Screen,
  Segmented,
  Skeleton,
  SourceNote,
} from '../../components/ui';
import { useDemo } from '../../demo/DemoContext';
import { currentZoneId, zones } from '../../demo/data';
import { bestZone, compareMove, eur, eurH } from '../../domain/decision';
import type { Horizon } from '../../domain/types';
import { colors, font, radius, revenueColor, spacing } from '../../theme';

const horizons: { value: Horizon; label: string }[] = [
  { value: 0, label: 'Maintenant' },
  { value: 15, label: '+15 min' },
  { value: 30, label: '+30 min' },
  { value: 60, label: '+60 min' },
];

const demandLabel = { faible: 'Faible', moyenne: 'Moyenne', elevee: 'Élevée' };

export default function MapScreen() {
  const { state, target } = useDemo();
  const [horizon, setHorizon] = useState<Horizon>(0);
  const current = zones.find((z) => z.id === currentZoneId)!;
  const best = bestZone(current, zones, horizon);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = zones.find((z) => z.id === (selectedId ?? best.zone.id))!;
  const cmp = compareMove(current, selected, horizon);
  const weak = state === 'insuffisant';

  return (
    <Screen title="Carte des opportunités" subtitle="Revenu net estimé par zone, après coûts">
      <Segmented label="Horizon de prévision" options={horizons} value={horizon} onChange={setHorizon} />

      {state === 'chargement' ? (
        <Skeleton height={340} />
      ) : (
        <View style={styles.map} accessibilityLabel="Carte schématique de Toulouse">
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <Defs>
              {zones.map((z) => (
                <RadialGradient key={z.id} id={`g-${z.id}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={revenueColor(z.netPerHour[horizon], target)} stopOpacity={0.75} />
                  <Stop offset="100%" stopColor={revenueColor(z.netPerHour[horizon], target)} stopOpacity={0} />
                </RadialGradient>
              ))}
            </Defs>
            {/* Périphérique */}
            <Ellipse cx={52} cy={50} rx={31} ry={29} stroke="#2A3A57" strokeWidth={1.2} fill="none" />
            {/* Garonne */}
            <Path
              d="M 34 100 C 42 82, 38 66, 45 54 S 40 28, 30 0"
              stroke="#2D5C8F"
              strokeWidth={2.2}
              fill="none"
            />
            {/* Canal du Midi */}
            <Path
              d="M 100 72 C 82 66, 66 60, 52 48 S 46 30, 58 0"
              stroke="#24476E"
              strokeWidth={0.8}
              strokeDasharray="2 1.5"
              fill="none"
            />
            {zones.map((z) => (
              <Circle key={z.id} cx={z.x} cy={z.y} r={z.tag === 'aeroport' ? 14 : 19} fill={`url(#g-${z.id})`} />
            ))}
            {/* Position actuelle */}
            <Circle cx={current.x} cy={current.y + 7} r={4} fill={colors.primary} opacity={0.25} />
            <Circle cx={current.x} cy={current.y + 7} r={1.8} fill={colors.primary} stroke="#fff" strokeWidth={0.6} />
          </Svg>

          {zones.map((z) => {
            const value = z.netPerHour[horizon];
            const isSel = z.id === selected.id;
            const isBest = z.id === best.zone.id;
            return (
              <Pressable
                key={z.id}
                onPress={() => setSelectedId(z.id)}
                accessibilityRole="button"
                accessibilityLabel={`${z.name}, ${value} euros de l'heure estimés`}
                style={[
                  styles.bubble,
                  { left: `${z.x}%`, top: `${z.y}%` },
                  isSel && { borderColor: '#fff', backgroundColor: colors.surfaceHigh },
                ]}
              >
                <Row style={{ gap: 4 }}>
                  {z.tag === 'aeroport' && <Plane size={11} color={colors.textMuted} />}
                  {z.tag === 'gare' && <TrainFront size={11} color={colors.textMuted} />}
                  <Text style={styles.bubbleName}>{z.name.replace('Toulouse ', '')}</Text>
                </Row>
                <Text style={[styles.bubbleValue, { color: revenueColor(value, target) }]}>
                  {value} €/h{isBest ? ' ★' : ''}
                </Text>
              </Pressable>
            );
          })}

          <View style={[styles.offMap, { top: 6, right: 8 }]}>
            <ArrowUp size={12} color={colors.textMuted} />
            <Text style={font.tiny}>Montauban · 45 min</Text>
          </View>
          <View style={[styles.offMap, { bottom: 6, right: 8 }]}>
            <ArrowRight size={12} color={colors.textMuted} />
            <Text style={font.tiny}>Lavaur · 45 min</Text>
          </View>
          <View style={[styles.offMap, { bottom: 6, left: 8 }]}>
            <View style={styles.youDot} />
            <Text style={font.tiny}>Vous</Text>
          </View>
        </View>
      )}

      <View style={styles.legend}>
        {[
          { c: colors.danger, l: '< 65 % objectif' },
          { c: colors.warning, l: '65–80 %' },
          { c: '#A6D13B', l: '80–95 %' },
          { c: colors.success, l: '≥ objectif' },
        ].map((x) => (
          <Row key={x.l} style={{ gap: 4 }}>
            <View style={[styles.legendDot, { backgroundColor: x.c }]} />
            <Text style={font.tiny}>{x.l}</Text>
          </Row>
        ))}
      </View>

      <Card accent={selected.id === best.zone.id ? colors.primary : undefined}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={font.h2}>{selected.name}</Text>
          {selected.id === current.id ? (
            <Pill label="Votre zone" color={colors.primary} />
          ) : selected.id === best.zone.id && best.gain >= 2 ? (
            <Pill label="Recommandée" color={colors.success} />
          ) : null}
        </Row>
        <View style={styles.kpis}>
          <Kpi
            label="Revenu net estimé"
            value={eurH(selected.netPerHour[horizon])}
            hint={`± ${weak ? selected.spread * 2 : selected.spread} €/h`}
          />
          <Kpi label="Accès" value={`${selected.accessMin} min`} hint={`${eur(selected.accessCost, 2)} de coûts`} />
          <Kpi label="Demande" value={demandLabel[selected.demand]} />
        </View>
        {selected.id !== current.id && (
          <Text style={[font.small, { marginTop: spacing.md }]}>
            Sur 1h30 : rester rapporte {eur(cmp.stay)}, y aller {eur(cmp.move)} →{' '}
            <Text style={{ color: cmp.gain >= 0 ? colors.success : colors.danger, fontWeight: '700' }}>
              {cmp.gain >= 0 ? '+' : ''}
              {eur(cmp.gain)}
            </Text>
            {cmp.gain >= 0 && cmp.gain < 2 ? ' (gain trop faible pour bouger)' : ''}
          </Text>
        )}
        <Text style={[font.small, { color: colors.text, marginTop: spacing.sm }]}>
          Car : {selected.reason}.
        </Text>
        <Row style={{ marginTop: spacing.sm }}>
          <Text style={font.small}>Confiance</Text>
          <ConfidenceBadge level={weak ? 'faible' : selected.confidence} />
        </Row>
        <SourceNote>
          Estimation VTC Profit AI, pas une donnée Uber. Les couleurs ne montrent pas la demande Uber réelle. Fond de
          carte définitif : prestataire à choisir.
        </SourceNote>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 340,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0D1628',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubble: {
    position: 'absolute',
    transform: [{ translateX: -38 }, { translateY: -20 }],
    width: 76,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(10,17,31,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleName: { color: colors.text, fontSize: 11, fontWeight: '600' },
  bubbleValue: { fontSize: 13, fontWeight: '800' },
  offMap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,17,31,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  youDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: '#fff',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  kpis: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
