import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { ChevronLeft, ChevronRight, CloudRain, Navigation, PartyPopper, Plane, Sun } from 'lucide-react-native';
import { Card, Row, Screen, SectionTitle, Segmented, SourceNote } from '../../components/ui';
import { hubs, kmPerUnit, projection, zones, zonesSource } from '../../data/zones';
import { centreIds, project, rankZones, type RankMode } from '../../domain/ranking';
import { useDriverPosition } from '../../hooks/useDriverPosition';
import { dayLabel, useLiveData } from '../../data/live';
import { hubInflow, rainFor, SCORE_COLORS, scoreColor, scoreZones, WEIGHTS } from '../../domain/zoneScore';
import { colors, font, radius, spacing } from '../../theme';

const STEP = 30;
const hhmm = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
const shortDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const CENTRE = centreIds(zones, kmPerUnit);
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;

export default function MapHome() {
  const live = useLiveData();
  const { hubArrivals, tisseo, weather } = live;
  const firstMonth = Number(live.days[0].slice(5, 7));
  const mapDays = live.days.map((d) => ({ date: d, label: dayLabel(d, firstMonth) }));

  // Ouverture sur aujourd'hui et l'heure actuelle (arrondie à la demi-heure).
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(() =>
    Math.min(23 * 60 + 30, Math.max(5 * 60, Math.floor((now.getHours() * 60 + now.getMinutes()) / STEP) * STEP)),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<RankMode>('ville');
  const pos = useDriverPosition(mode === 'pres');
  const from = pos.status === 'ok' ? project(pos.lat, pos.lon, projection) : null;
  const date =
    pickedDate && live.days.includes(pickedDate)
      ? pickedDate
      : live.days.includes(todayStr)
        ? todayStr
        : live.days[0];
  const dayIdx = live.days.indexOf(date);

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
        kmPerUnit,
      }),
    [date, minutes, hubArrivals, tisseo, weather],
  );
  const ranked = useMemo(
    () => rankZones(scores, zones, { mode, kmPerUnit, centre: CENTRE, from }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scores, mode, from?.x, from?.y],
  );
  const byId = useMemo(() => Object.fromEntries(ranked.map((s) => [s.zoneId, s])), [ranked]);
  const eligible = ranked.filter((s) => !s.excluded);
  const top = eligible.slice(0, 5);
  // Couleurs relatives : le quartier le plus favorable du moment prend la teinte la plus forte.
  const maxScore = Math.max(1, eligible[0].rankScore);
  const rel = (score: number) => scoreColor((score / maxScore) * 99);
  const current = byId[selected && !byId[selected].excluded ? selected : top[0].zoneId];
  const currentZone = zones.find((z) => z.id === current.zoneId)!;
  const rank = eligible.findIndex((s) => s.zoneId === current.zoneId) + 1;
  const adjusted = mode === 'pres' && current.accessMin !== undefined;

  const rain = rainFor(weather.hourly, new Date(`${date}T${fmt(minutes).replace('h', ':')}:00+01:00`));
  const airport = hubs.find((h) => h.id === 'aeroport')!;
  const airportIn = hubInflow(hubArrivals.find((h) => h.hubId === 'aeroport')?.days[date], minutes);

  return (
    <Screen title="Carte de Toulouse" subtitle="Où la demande devrait être la plus forte" realData>
      <Text style={[font.tiny, { marginTop: -spacing.sm }]}>
        {live.origin === 'serveur'
          ? `Mis à jour · Tisséo ${live.updated.tisseo ? hhmm(live.updated.tisseo) : `du ${shortDate(live.tisseo.fetchedAt)}`} · météo ${hhmm(live.updated.meteo)} · trains et cars ${hhmm(live.updated.transport)}`
          : `Données intégrées à l’app (Tisséo du ${shortDate(live.tisseo.fetchedAt)}, météo du ${shortDate(live.weather.fetchedAt)})${live.checkedAt ? ' · serveur injoignable' : ''}`}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {mapDays.map((d, i) => {
          const active = i === dayIdx;
          return (
            <Pressable
              key={d.date}
              onPress={() => setPickedDate(d.date)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{d.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

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

      <Segmented<RankMode>
        label="Quartiers proposés"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setSelected(null);
        }}
        options={[
          { value: 'ville', label: 'Toute la ville' },
          { value: 'hors-centre', label: 'Hors centre' },
          { value: 'pres', label: 'Près de moi' },
        ]}
      />
      {mode === 'hors-centre' && (
        <Text style={[font.tiny, { marginTop: -spacing.xs }]}>
          Hypercentre exclu ({CENTRE.size} quartiers à moins de 1,45 km du Capitole), grisé sur la carte.
        </Text>
      )}
      {mode === 'pres' && (
        <Row style={{ marginTop: -spacing.xs, gap: 6 }}>
          <Navigation size={13} color={pos.status === 'ok' ? colors.success : colors.textMuted} />
          <Text style={[font.tiny, { flex: 1 }]}>
            {pos.status === 'ok'
              ? 'Note ajustée au temps de trajet depuis votre position (non enregistrée).'
              : pos.status === 'pending'
                ? 'Recherche de votre position…'
                : pos.status === 'refused'
                  ? 'Position refusée : autorisez la localisation pour ce mode. Classement de toute la ville en attendant.'
                  : 'Position indisponible pour le moment. Classement de toute la ville en attendant.'}
          </Text>
        </Row>
      )}

      <View style={styles.map}>
        <Svg width="100%" height="100%" viewBox="0 0 1000 1000">
          <G>
            {zones.map((z) => {
              const s = byId[z.id];
              const isSel = z.id === current.zoneId;
              return (
                <Path
                  key={z.id}
                  d={z.path}
                  fill={s.excluded ? '#141C2B' : rel(s.rankScore)}
                  stroke={isSel ? '#FFFFFF' : '#0A111F'}
                  strokeWidth={isSel ? 3 : 1}
                  onPress={() => !s.excluded && setSelected(z.id)}
                />
              );
            })}
          </G>
          {/* Aéroport : hors commune de Toulouse */}
          <Circle
            cx={airport.x}
            cy={airport.y}
            r={11}
            fill="#0A111F"
            stroke="#F5C451"
            strokeWidth={2}
          />
          <SvgText x={airport.x} y={airport.y + 30} fill="#F5C451" fontSize={17} textAnchor="middle">
            Aéroport
          </SvgText>
          {top.slice(0, 3).map((s, i) => {
            const z = zones.find((x) => x.id === s.zoneId)!;
            return (
              <G key={s.zoneId}>
                <Circle cx={z.cx} cy={z.cy} r={14} fill="#0A111F" stroke="#7BD88F" strokeWidth={2} />
                <SvgText x={z.cx} y={z.cy + 6} fill="#7BD88F" fontSize={16} fontWeight="700" textAnchor="middle">
                  {i + 1}
                </SvgText>
              </G>
            );
          })}
          {from && (
            <G>
              <Circle cx={from.x} cy={from.y} r={16} fill={colors.primary} opacity={0.25} />
              <Circle cx={from.x} cy={from.y} r={8} fill={colors.primary} stroke="#fff" strokeWidth={3} />
            </G>
          )}
          {hubs
            .filter((h) => h.id === 'matabiau')
            .map((h) => (
              <Circle key={h.id} cx={h.x} cy={h.y} r={5} fill="#fff" stroke="#0A111F" strokeWidth={2} />
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

      <Text style={[font.tiny, { textAlign: 'center', marginTop: -spacing.xs }]}>
        Toulouse (60 quartiers) et {zones.filter((z) => z.kind === 'commune').length} communes voisines · touchez une zone
        pour le détail
      </Text>

      <Card accent={colors.primary}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={font.small}>
              {rank === 1 ? 'Zone la plus favorable' : `${rank}ᵉ zone sur ${zones.length}`} · {fmt(minutes)}–
              {fmt(minutes + 60)}
            </Text>
            <Text style={font.h2}>{currentZone.name}</Text>
          </View>
          <View style={[styles.scoreBadge, { backgroundColor: rel(current.rankScore) }]}>
            <Text style={styles.scoreText}>{current.rankScore}</Text>
          </View>
        </Row>
        {adjusted && (
          <View style={styles.access}>
            <Navigation size={16} color={colors.primary} />
            <Text style={[font.small, { color: colors.text, flex: 1 }]}>
              Trajet estimé ≈ {current.accessMin} min ({current.km?.toLocaleString('fr-FR')} km)
              {CENTRE.has(current.zoneId) ? ', dont 5 min pour entrer dans l’hypercentre' : ''}. Note du quartier{' '}
              {current.score} × {Math.max(0, 60 - (current.accessMin ?? 0))}/60 min utiles = {current.rankScore}.
            </Text>
          </View>
        )}
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

      <SectionTitle>
        {mode === 'hors-centre' ? 'Top 5 hors centre' : mode === 'pres' && from ? 'Top 5 près de vous' : 'Top 5 des quartiers'}
      </SectionTitle>
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
                  {s.accessMin !== undefined ? `≈ ${s.accessMin} min · ` : ''}
                  {main.label}
                </Text>
              </View>
              <View style={[styles.miniBadge, { backgroundColor: rel(s.rankScore) }]}>
                <Text style={styles.miniText}>{s.rankScore}</Text>
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
    paddingHorizontal: 14,
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
    aspectRatio: 1,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0D1628',
    borderWidth: 1,
    borderColor: colors.border,
  },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  legendBox: { width: 22, height: 10, borderRadius: 2 },
  access: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  scoreBadge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  scoreText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  track: { height: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, backgroundColor: colors.primary, borderRadius: radius.pill },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  topBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  miniBadge: { minWidth: 36, paddingVertical: 4, borderRadius: radius.pill, alignItems: 'center' },
  miniText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
