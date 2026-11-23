import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Clock, Home, MapPin, Navigation, Pause } from 'lucide-react-native';
import {
  Button,
  Card,
  ConfidenceBadge,
  Kpi,
  Pill,
  Row,
  Screen,
  SectionTitle,
  Skeleton,
  SourceNote,
  Toggle,
} from '../../components/ui';
import { useDemo } from '../../demo/DemoContext';
import { currentZoneId, demoDriver, today, zones } from '../../demo/data';
import { bestZone, compareMove, eur, eurH } from '../../domain/decision';
import { colors, font, radius, revenueColor, spacing } from '../../theme';

const MIN_GAIN = 2; // € : en dessous, bouger ne vaut pas le risque

export default function Dashboard() {
  const { state, target, onTrip, setOnTrip } = useDemo();
  const current = zones.find((z) => z.id === currentZoneId)!;
  const best = bestZone(current, zones, 0);
  const shouldMove = best.zone.id !== current.id && best.gain >= MIN_GAIN;
  const reco = shouldMove ? best.zone : current;
  const weak = state === 'insuffisant';
  const spread = weak ? reco.spread * 2 : reco.spread;
  const others = zones
    .filter((z) => z.id !== current.id && z.id !== reco.id)
    .map((z) => ({ zone: z, ...compareMove(current, z, 0) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 2);

  return (
    <Screen
      title={`Bonjour ${demoDriver.firstName}`}
      subtitle={`${demoDriver.dateLabel} · ${demoDriver.nowLabel} · ${demoDriver.city}`}
    >
      <Card style={styles.statusCard}>
        <View style={{ flex: 1 }}>
          <Row>
            <View style={[styles.dot, { backgroundColor: onTrip ? colors.warning : colors.success }]} />
            <Text style={font.h3}>{onTrip ? 'En course' : 'Disponible · mode En activité'}</Text>
          </Row>
          <Text style={[font.tiny, { marginTop: 4 }]}>
            État déclaré par vous : l’app ne déduit pas votre statut Uber du GPS.
          </Text>
        </View>
        <Toggle value={onTrip} onChange={setOnTrip} label="Je suis en course" />
      </Card>

      {state === 'chargement' ? (
        <>
          <Skeleton height={230} />
          <Skeleton height={120} />
        </>
      ) : onTrip ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
          <Pause size={28} color={colors.warning} />
          <Text style={[font.h2, { textAlign: 'center' }]}>Course en cours</Text>
          <Text style={[font.small, { textAlign: 'center' }]}>
            Pas de recommandation pendant la course. On reprend dès que vous repassez « Disponible ».
          </Text>
        </Card>
      ) : (
        <>
          <Card accent={shouldMove ? colors.primary : colors.border}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={[font.small, { textTransform: 'uppercase', letterSpacing: 0.6 }]}>
                Recommandation
              </Text>
              <Pill
                label={shouldMove ? `+${eur(best.gain)} sur 1h30` : 'Rester sur place'}
                color={shouldMove ? colors.success : colors.textMuted}
              />
            </Row>
            <Row style={{ marginTop: spacing.sm }}>
              <MapPin size={22} color={colors.primary} />
              <Text style={[font.h1, { fontSize: 26 }]}>
                {shouldMove ? `Rejoindre ${reco.name}` : `Rester · ${current.name}`}
              </Text>
            </Row>

            <View style={styles.kpiRow}>
              <Kpi
                label="Revenu net estimé"
                value={eurH(reco.netPerHour[0])}
                hint={`entre ${reco.netPerHour[0] - spread} et ${reco.netPerHour[0] + spread} €/h`}
              />
              <Kpi
                label="Votre objectif"
                value={eurH(target)}
                hint={reco.netPerHour[0] >= target ? 'atteint' : `${reco.netPerHour[0] - target} €/h`}
                tone={reco.netPerHour[0] >= target ? 'up' : 'down'}
              />
            </View>

            <View style={styles.why}>
              <Text style={[font.small, { color: colors.text }]}>
                <Text style={{ fontWeight: '700' }}>Pourquoi ? </Text>
                {shouldMove ? 'Zone recommandée car ' : 'Bouger ne rapporterait pas assez : '}
                {reco.reason}.
              </Text>
              {shouldMove && (
                <Text style={[font.small, { marginTop: 6 }]}>
                  Rester : {eur(best.stay)} · Y aller : {eur(best.move)} (trajet {reco.accessMin} min,{' '}
                  {eur(reco.accessCost, 2)} de coûts)
                </Text>
              )}
              <Row style={{ marginTop: 8 }}>
                <Text style={font.small}>Confiance</Text>
                <ConfidenceBadge level={weak ? 'faible' : reco.confidence} />
              </Row>
            </View>

            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                label="Voir sur la carte"
                icon={<ArrowRight size={18} color="#fff" />}
                onPress={() => router.push('/carte')}
              />
            </View>
            <SourceNote>
              Estimation VTC Profit AI (pas une donnée Uber) · historique importé + GPS + vols/trains · mise à jour
              il y a 4 min
            </SourceNote>
          </Card>

          <SectionTitle>Autres options</SectionTitle>
          <Card style={{ paddingVertical: spacing.sm }}>
            {shouldMove && (
              <Option
                icon={<Navigation size={18} color={colors.textMuted} />}
                title={`Rester · ${current.name}`}
                detail={`${eurH(current.netPerHour[0])} · aucun trajet`}
                value={eur(0)}
              />
            )}
            {others.map((o) => (
              <Option
                key={o.zone.id}
                icon={<View style={[styles.dot, { backgroundColor: revenueColor(o.zone.netPerHour[0], target) }]} />}
                title={o.zone.name}
                detail={`${eurH(o.zone.netPerHour[0])} · ${o.zone.accessMin} min · ${eur(o.zone.accessCost, 2)}`}
                value={`${o.gain >= 0 ? '+' : ''}${eur(o.gain)}`}
                negative={o.gain < 0}
              />
            ))}
            <Option
              icon={<Home size={18} color={colors.textMuted} />}
              title="Anticiper le retour"
              detail="Fin prévue à 15h00 · courses vers l’est à privilégier à partir de 14h30"
              last
            />
          </Card>

          <Card style={styles.nextSlot}>
            <Clock size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={font.h3}>Prochain créneau favorable · 13h00–14h30</Text>
              <Text style={font.small}>Centre · pluie annoncée, demande en hausse</Text>
            </View>
          </Card>
        </>
      )}

      <SectionTitle>Aujourd’hui</SectionTitle>
      <View style={styles.kpiRow}>
        <Kpi label="Après coûts variables" value={eur(today.contribution)} />
        <Kpi label="Revenu net / h" value={eurH(today.contribution / today.hours)} />
        <Kpi label="Km à vide" value={`${today.emptyKm} km`} />
      </View>
    </Screen>
  );
}

function Option({
  icon,
  title,
  detail,
  value,
  negative,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  value?: string;
  negative?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.option, !last && styles.optionBorder]}>
      <View style={{ width: 22, alignItems: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={font.h3}>{title}</Text>
        <Text style={font.small}>{detail}</Text>
      </View>
      {value ? (
        <Text style={[font.h3, { color: negative ? colors.danger : colors.textMuted }]}>{value}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  why: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  nextSlot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
