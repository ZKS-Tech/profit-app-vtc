import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bus, Plane, TrainFront, TriangleAlert, Users } from 'lucide-react-native';
import { Card, Pill, Row, Screen, SectionTitle, SourceNote, Toggle } from '../../components/ui';
import { aeroportCarsDays, gareRoutiereDays, matabiauDays, type DayEntry } from '../../data/arrivals';
import {
  EXIT_DELAY,
  findPeaks,
  hhmm,
  hourly,
  longDistanceCount,
  shortStation,
  type Arrival,
} from '../../domain/arrivals';
import { colors, font, radius, spacing } from '../../theme';

type Place = {
  id: string;
  label: string;
  icon: typeof TrainFront;
  days?: DayEntry[];
  note?: string;
  kind?: 'train' | 'car';
};

const places: Place[] = [
  { id: 'matabiau', label: 'Gare Matabiau', icon: TrainFront, days: matabiauDays, kind: 'train' },
  { id: 'routiere', label: 'Gare routière', icon: Bus, days: gareRoutiereDays, kind: 'car' },
  { id: 'aeroport', label: 'Aéroport', icon: Plane, days: aeroportCarsDays, kind: 'car' },
];

const typeColor = (a: Arrival) =>
  a.type === 'Avion'
    ? '#F5C451'
    : a.type === 'FlixBus'
    ? '#8BD43F'
    : a.type === 'BlaBlaCar Bus'
      ? '#F27B7D'
      : a.type.startsWith('TGV') || a.type === 'OUIGO'
        ? colors.primary
        : a.longDistance
          ? '#7FB2FF'
          : colors.textFaint;

export default function ArrivalsScreen() {
  const [placeId, setPlaceId] = useState('matabiau');
  const [dayIdx, setDayIdx] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [showRegional, setShowRegional] = useState(false);

  const place = places.find((p) => p.id === placeId)!;
  const days = place.days ?? matabiauDays;
  const isTrain = place.kind === 'train';
  const day = days[dayIdx].data;
  const peaks = useMemo(() => findPeaks(day), [day]);
  const hours = useMemo(() => (isTrain ? hourly(day) : hourly(day, 0, 23)), [day, isTrain]);
  const maxSeats = Math.max(...days.flatMap((d) => hourly(d.data, 0, 23).map((h) => h.longSeats + h.otherSeats)));

  const ldCount = longDistanceCount(day);
  const refCount = Math.max(...days.map((d) => longDistanceCount(d.data)));
  const coaches = day.arrivals.filter((a) => a.type === 'Car TER').length;
  // Alerte « service réduit » : seulement pour la gare SNCF (les cars varient fortement selon le jour).
  const reduced = isTrain && ldCount < refCount * 0.6;
  const normalCounts = days.map((d) => longDistanceCount(d.data)).filter((n) => n >= refCount * 0.6);
  const normalRange =
    Math.min(...normalCounts) === refCount ? `${refCount}` : `${Math.min(...normalCounts)} à ${refCount}`;

  const list = day.arrivals.filter(
    (a) => (showRegional || a.longDistance) && (hour === null || Math.floor(a.minutes / 60) === hour),
  );

  return (
    <Screen title="Arrivées" subtitle="Quand les voyageurs arrivent, où les attendre" realData={!!place.days}>
      <Row style={{ flexWrap: 'wrap' }}>
        {places.map((p) => {
          const active = p.id === placeId;
          const Icon = p.icon;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                setPlaceId(p.id);
                setHour(null);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Icon size={15} color={active ? '#fff' : colors.textMuted} />
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </Row>

      {placeId === 'aeroport' && (
        <Card style={styles.flightsCard}>
          <Plane size={18} color={colors.warning} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={font.h3}>Vols : pas encore de données</Text>
            <Text style={font.small}>
              L’API officielle de l’aéroport exige une autorisation, à demander à Aéroport Toulouse-Blagnac. Le
              connecteur est prêt : arrivées et départs, retards, annulations, voyageurs estimés par tranche de 30
              min. En attendant, seuls les cars longue distance sont affichés ci-dessous.
            </Text>
          </View>
        </Card>
      )}

      {!place.days ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
          <place.icon size={28} color={colors.textMuted} />
          <Text style={font.h3}>Pas encore de données</Text>
          <Text style={[font.small, { textAlign: 'center' }]}>{place.note}</Text>
        </Card>
      ) : (
        <>
          <Row>
            {days.map((d, i) => {
              const active = i === dayIdx;
              return (
                <Pressable
                  key={d.label}
                  onPress={() => {
                    setDayIdx(i);
                    setHour(null);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.dayChip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && { color: '#fff' }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </Row>

          {reduced && (
            <Card style={styles.alert}>
              <TriangleAlert size={18} color={colors.warning} />
              <Text style={[font.small, { color: colors.text, flex: 1 }]}>
                <Text style={{ fontWeight: '700' }}>Service réduit ce jour. </Text>
                {ldCount} trains grandes lignes, contre {normalRange} les jours normaux, et {coaches} cars TER
                de remplacement. Travaux probables : à vérifier sur place.
              </Text>
            </Card>
          )}

          <SectionTitle>{isTrain ? 'Pics grandes lignes' : 'Pics d’arrivées de cars'}</SectionTitle>
          {peaks.length === 0 ? (
            <Card>
              <Text style={font.small}>Aucune arrivée longue distance ce jour.</Text>
            </Card>
          ) : (
            peaks.map((p) => (
              <Card key={p.start} style={{ gap: spacing.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={font.h2}>
                    {p.start === p.end ? hhmm(p.start) : `${hhmm(p.start)} – ${hhmm(p.end)}`}
                  </Text>
                  <Pill label={`≈ ${p.seats} places`} color={colors.success} />
                </Row>
                <Row style={{ gap: 6 }}>
                  <Users size={14} color={colors.textMuted} />
                  <Text style={font.small}>
                    Sortie des voyageurs vers {hhmm(p.exitFrom)} – {hhmm(p.exitTo)}
                  </Text>
                </Row>
                {p.trains.map((t) => (
                  <TrainRow key={t.train + t.time} a={t} />
                ))}
              </Card>
            ))
          )}

          <SectionTitle>Capacité arrivant par heure</SectionTitle>
          <Card>
            <View style={styles.chart}>
              {hours.map((h) => {
                const active = hour === h.hour;
                const H = 120;
                return (
                  <Pressable
                    key={h.hour}
                    onPress={() => setHour(active ? null : h.hour)}
                    style={styles.barCol}
                    accessibilityRole="button"
                    accessibilityLabel={`${h.hour} heures : ${h.longCount} grandes lignes, ${h.count} trains au total`}
                  >
                    <View style={{ height: H, justifyContent: 'flex-end', width: '70%' }}>
                      <View
                        style={{
                          height: (h.longSeats / maxSeats) * H,
                          backgroundColor: active ? '#fff' : colors.primary,
                          borderTopLeftRadius: 2,
                          borderTopRightRadius: 2,
                        }}
                      />
                      <View
                        style={{
                          height: (h.otherSeats / maxSeats) * H,
                          backgroundColor: active ? colors.textMuted : colors.surfaceHigh,
                        }}
                      />
                    </View>
                    <Text style={[styles.barLabel, active && { color: colors.text }]}>
                      {h.hour % 3 === 0 ? `${h.hour}h` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Row style={{ marginTop: spacing.sm, gap: spacing.lg }}>
              <Row style={{ gap: 6 }}>
                <View style={[styles.swatch, { backgroundColor: colors.primary }]} />
                <Text style={font.tiny}>{isTrain ? 'Grandes lignes' : 'Cars longue distance'}</Text>
              </Row>
              {isTrain && (
                <Row style={{ gap: 6 }}>
                  <View style={[styles.swatch, { backgroundColor: colors.surfaceHigh }]} />
                  <Text style={font.tiny}>TER et cars</Text>
                </Row>
              )}
            </Row>
            <Text style={[font.tiny, { marginTop: 6 }]}>
              Touchez une heure pour voir ses {isTrain ? 'trains' : 'cars'}.
            </Text>
          </Card>

          <SectionTitle
            right={
              isTrain ? (
                <Row style={{ gap: 6 }}>
                  <Text style={font.tiny}>TER et cars</Text>
                  <Toggle value={showRegional} onChange={setShowRegional} label="Afficher aussi les TER et cars" />
                </Row>
              ) : undefined
            }
          >
            {hour === null ? 'Toutes les arrivées' : `Arrivées de ${hour}h à ${hour + 1}h`}
          </SectionTitle>
          <Card style={{ paddingVertical: spacing.xs }}>
            {list.length === 0 ? (
              <Text style={[font.small, { paddingVertical: spacing.md }]}>
                Aucune arrivée longue distance sur ce créneau.
              </Text>
            ) : (
              list.map((a, i) => <TrainRow key={a.train + a.time + i} a={a} border={i < list.length - 1} />)
            )}
          </Card>

          <SourceNote>
            {day.source.name}, open data, licence {day.source.licence}, version du{' '}
            {day.source.feedVersion?.split('-').reverse().join('/')}. Retards en temps réel : prochaine étape.{' '}
            {day.capacityNote} Sortie estimée {EXIT_DELAY.min} à {EXIT_DELAY.max} min après l’arrivée (à vérifier
            avec Fabrice).
          </SourceNote>
        </>
      )}
    </Screen>
  );
}

function TrainRow({ a, border }: { a: Arrival; border?: boolean }) {
  return (
    <View style={[styles.train, border && styles.trainBorder]}>
      <Text style={[font.h3, styles.time]}>{a.time.replace(':', 'h')}</Text>
      <View style={[styles.typeTag, { borderColor: typeColor(a) }]}>
        <Text style={[styles.typeText, { color: typeColor(a) }]} numberOfLines={1}>
          {a.type}
        </Text>
      </View>
      <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>
        {shortStation(a.from)}
      </Text>
      {a.train ? <Text style={font.tiny}>n° {a.train}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChip: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  flightsCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    borderColor: colors.warning,
    borderStyle: 'dashed',
  },
  alert: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  chart: { flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center' },
  barLabel: { fontSize: 10, color: colors.textFaint, height: 16, marginTop: 2 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  train: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  trainBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  time: { width: 48, fontVariant: ['tabular-nums'] },
  typeTag: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 110 },
  typeText: { fontSize: 11, fontWeight: '700' },
});
