import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { ChevronLeft, ChevronRight, CloudRain, PartyPopper, Plane, Sun } from 'lucide-react-native';
import { Card, Row, Screen, SectionTitle, SourceNote } from '../../components/ui';
import { hubArrivals, hubs, mapDays, tisseo, weather, zones, zonesSource } from '../../data/zones';
import { hubInflow, rainFor, SCORE_COLORS, scoreColor, scoreZones, WEIGHTS, type ZoneScore } from '../../domain/zoneScore';
import { colors, font, radius, spacing } from '../../theme';

const STEP = 30;
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;

export default function MapHome() {
  const [dayIdx, setDayIdx] = useState(0);
  const [minutes, setMinutes] = useState(17 * 60);
  const [selected, setSelected] = useState<string | null>(null);
  const date = mapDays[dayIdx].date;

  const scores = useMemo(
    () =>
      scoreZones({
        zones,
        hubs,
        arrivals: hubArrivals,
        date,
        minutes,
        alerts: tisseo.alerts,
        alertsFetchedAt: tisseo.fetchedAt,
        weather: weather.hourly,
      }),
    [date, minutes],
  );
  const byId = useMemo(() => Object.fromEntries(scores.map((s) => [s.zoneId, s])), [scores]);
  const top = scores.slice(0, 5);
  // Couleurs relatives : le quartier le plus favorable du moment prend la teinte la plus forte.
  const maxScore = Math.max(1, scores[0].score);
  const rel = (score: number) => scoreColor((score / maxScore) * 99);
  const current: ZoneScore = byId[selected ?? top[0].zoneId];
  const currentZone = zones.find((z) => z.id === current.zoneId)!;
  const rank = scores.findIndex((s) => s.zoneId === current.zoneId) + 1;

  const rain = rainFor(weather.hourly, new Date(`${date}T${fmt(minutes).replace('h', ':')}:00+01:00`));
  const airport = hubs.find((h) => h.id === 'aeroport')!;
  const airportIn = hubInflow(hubArrivals.find((h) => h.hubId === 'aeroport')?.days[date], minutes);

  return (
    <Screen title="Carte de Toulouse" subtitle="Où la demande devrait être la plus forte" realData>
      <Row>
        {mapDays.map((d, i) => {
          const active = i === dayIdx;
          return (
            <Pressable
              key={d.date}
              onPress={() => setDayIdx(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{d.label}</Text>
            </Pressable>
          );
        })}
      </Row>

      <Card style={styles.timeBar}>
        <Pressable
          onPress={() => setMinutes((m) => Math.max(5 * 60, m - STEP))}
          accessibilityRole="button"
          accessibilityLabel="30 minutes plus tôt"
          hitSlop={10}
          style={styles.stepBtn}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={font.h2}>{fmt(minutes)}</Text>
          <Text style={font.tiny}>prévision pour l’heure qui suit</Text>
          <Row style={{ gap: 4, marginTop: 2 }}>
            {rain && rain.mean >= 0.2 ? (
              <CloudRain size={14} color={colors.primary} />
            ) : (
              <Sun size={14} color={colors.textMuted} />
            )}
            <Text style={font.tiny}>
              {!rain
                ? 'Météo : prévision pas encore disponible'
                : rain.mean >= 0.2
                  ? `Pluie ${rain.mean.toLocaleString('fr-FR')} mm/h`
                  : 'Pas de pluie prévue'}
            </Text>
          </Row>
        </View>
        <Pressable
          onPress={() => setMinutes((m) => Math.min(23 * 60 + 30, m + STEP))}
          accessibilityRole="button"
          accessibilityLabel="30 minutes plus tard"
          hitSlop={10}
          style={styles.stepBtn}
        >
          <ChevronRight size={22} color={colors.text} />
        </Pressable>
      </Card>

      <View style={styles.map}>
        <Svg width="100%" height="100%" viewBox="40 60 920 880">
          <G>
            {zones.map((z) => {
              const s = byId[z.id];
              const isSel = z.id === current.zoneId;
              return (
                <Path
                  key={z.id}
                  d={z.path}
                  fill={rel(s.score)}
                  stroke={isSel ? '#FFFFFF' : '#0A111F'}
                  strokeWidth={isSel ? 4 : 1.5}
                  onPress={() => setSelected(z.id)}
                />
              );
            })}
          </G>
          {/* Aéroport : hors commune de Toulouse */}
          <Circle
            cx={airport.x}
            cy={airport.y}
            r={26}
            fill={rel(Math.min(100, Math.round((airportIn.seats / 1500) * 100)))}
            stroke="#F5C451"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          <SvgText x={airport.x} y={airport.y + 46} fill={colors.textMuted} fontSize={22} textAnchor="middle">
            Aéroport
          </SvgText>
          {top.slice(0, 3).map((s, i) => {
            const z = zones.find((x) => x.id === s.zoneId)!;
            return (
              <G key={s.zoneId}>
                <Circle cx={z.cx} cy={z.cy} r={17} fill="#0A111F" stroke="#7BD88F" strokeWidth={2} />
                <SvgText x={z.cx} y={z.cy + 7} fill="#7BD88F" fontSize={20} fontWeight="700" textAnchor="middle">
                  {i + 1}
                </SvgText>
              </G>
            );
          })}
          {hubs
            .filter((h) => h.id === 'matabiau')
            .map((h) => (
              <Circle key={h.id} cx={h.x} cy={h.y} r={7} fill="#fff" stroke="#0A111F" strokeWidth={2} />
            ))}
        </Svg>
      </View>

      <View style={styles.legend}>
        <Text style={font.tiny}>Moins favorable</Text>
        {SCORE_COLORS.map((c) => (
          <View key={c} style={[styles.legendBox, { backgroundColor: c }]} />
        ))}
        <Text style={font.tiny}>plus favorable (à cette heure)</Text>
      </View>

      <Card accent={colors.primary}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={font.small}>
              {rank === 1 ? 'Zone la plus favorable' : `${rank}ᵉ zone sur ${zones.length}`} · {fmt(minutes)}–
              {fmt(minutes + 60)}
            </Text>
            <Text style={font.h2}>{currentZone.name}</Text>
          </View>
          <View style={[styles.scoreBadge, { backgroundColor: rel(current.score) }]}>
            <Text style={styles.scoreText}>{current.score}</Text>
          </View>
        </Row>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {current.factors.map((f) => (
            <View key={f.key}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={font.h3}>{f.label}</Text>
                <Text style={font.tiny}>poids {Math.round(WEIGHTS[f.key] * 100)} %</Text>
              </Row>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(f.value * 100)}%` }]} />
              </View>
              <Text style={[font.small, { marginTop: 2 }]}>{f.detail}</Text>
            </View>
          ))}
        </View>
        <SourceNote>
          Potentiel de demande sur 100, pas un revenu garanti. Modèle v0 non calibré : confiance faible tant que
          l’historique de Fabrice n’est pas intégré.
        </SourceNote>
      </Card>

      <SectionTitle>Top 5 des quartiers</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {top.map((s, i) => {
          const z = zones.find((x) => x.id === s.zoneId)!;
          const main = [...s.factors].sort((a, b) => WEIGHTS[b.key] * b.value - WEIGHTS[a.key] * a.value)[0];
          return (
            <Pressable
              key={s.zoneId}
              onPress={() => setSelected(s.zoneId)}
              style={[styles.topRow, i < top.length - 1 && styles.topBorder]}
              accessibilityRole="button"
            >
              <Text style={[font.h3, { width: 22, color: colors.textMuted }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{z.name}</Text>
                <Text style={font.tiny} numberOfLines={1}>
                  {main.label}
                </Text>
              </View>
              <View style={[styles.miniBadge, { backgroundColor: rel(s.score) }]}>
                <Text style={styles.miniText}>{s.score}</Text>
              </View>
            </Pressable>
          );
        })}
      </Card>

      <SectionTitle>Pas encore pris en compte</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <Row>
          <Plane size={16} color={colors.warning} />
          <Text style={[font.small, { flex: 1 }]}>
            Vols de l’aéroport : accès demandé à Aéroport Toulouse-Blagnac. Seuls les cars sont comptés
            ({airportIn.items.length} dans l’heure).
          </Text>
        </Row>
        <Row>
          <PartyPopper size={16} color={colors.warning} />
          <Text style={[font.small, { flex: 1 }]}>
            Événements (matchs, concerts, salons) : aucune source ouverte à jour. Calendrier à constituer.
          </Text>
        </Row>
      </Card>

      <SourceNote>
        Quartiers : {zonesSource.name}, {zonesSource.licence}. Trains : horaires SNCF ; cars : FlixBus et BlaBlaCar Bus
        (ODbL). Perturbations : Tisséo temps réel (ODbL), relevé du{' '}
        {new Date(tisseo.fetchedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. Météo :
        Météo-France (Licence Ouverte), modèle AROME du{' '}
        {new Date(weather.aromeRun).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.
      </SourceNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
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
  timeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    aspectRatio: 920 / 880,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0D1628',
    borderWidth: 1,
    borderColor: colors.border,
  },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  legendBox: { width: 22, height: 10, borderRadius: 2 },
  scoreBadge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  scoreText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  track: { height: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, backgroundColor: colors.primary, borderRadius: radius.pill },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  topBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  miniBadge: { minWidth: 36, paddingVertical: 4, borderRadius: radius.pill, alignItems: 'center' },
  miniText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
