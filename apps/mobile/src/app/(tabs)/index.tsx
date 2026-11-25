import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, ChevronLeft, ChevronRight, CloudRain, Navigation, PartyPopper, Plane, Sun, X, Zap } from 'lucide-react-native';
import { Card, Row, Screen, SectionTitle, Segmented, SourceNote } from '../../components/ui';
import { ZoneMap } from '../../components/ZoneMap';
import { activity, activitySources, hubs, jobsEstimated, kmPerUnit, projection, zones, zonesSource } from '../../data/zones';
import { centreIds, project, rankZones, relaunchAdvice, unproject, type RankMode } from '../../domain/ranking';
import { zoneAt } from '../../domain/geo';
import { loadJournal, statusOf } from '../../journal/store';
import { openNavigation } from '../../domain/navigation';
import { useSettings } from '../../settings/store';
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
  const timeTouched = useRef(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (timeTouched.current) return;
    const d = new Date(clock);
    setMinutes(Math.min(23 * 60 + 30, Math.max(5 * 60, Math.floor((d.getHours() * 60 + d.getMinutes()) / STEP) * STEP)));
  }, [clock]);
  // Temps sans course, d'après le journal (relu à chaque retour sur la carte et chaque minute).
  const [idleSince, setIdleSince] = useState<string | null>(null);
  const refreshIdle = useCallback(() => {
    loadJournal().then((ev) => {
      const st = statusOf(ev);
      setIdleSince(st.status === 'disponible' && st.since ? st.since : null);
    });
  }, []);
  useFocusEffect(refreshIdle);
  useEffect(refreshIdle, [clock, refreshIdle]);
  const [selected, setSelected] = useState<string | null>(null);
  const { settings, loaded: settingsLoaded } = useSettings();
  const [mode, setMode] = useState<RankMode>('ville');
  // Mode par défaut choisi dans le Profil, appliqué une fois les réglages chargés.
  const modeTouched = useRef(false);
  useEffect(() => {
    if (settingsLoaded && !modeTouched.current) setMode(settings.defaultMode);
  }, [settingsLoaded, settings.defaultMode]);
  const [full, setFull] = useState(false);
  const date =
    pickedDate && live.days.includes(pickedDate)
      ? pickedDate
      : live.days.includes(todayStr)
        ? todayStr
        : live.days[0];
  const dayIdx = live.days.indexOf(date);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isNow = date === todayStr && Math.abs(minutes - nowMin) <= STEP;
  // Position utilisée pour « Près de moi » et pour le conseil en temps réel.
  const pos = useDriverPosition(mode === 'pres' || isNow);
  const from = pos.status === 'ok' ? project(pos.lat, pos.lon, projection) : null;

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
        activity,
      }),
    [date, minutes, hubArrivals, tisseo, weather],
  );
  const { ranked, allTooFar } = useMemo(() => {
    const opts = { mode, kmPerUnit, centre: CENTRE, from, maxTripMin: settings.maxTripMin };
    const r = rankZones(scores, zones, opts);
    // Aucune zone à portée (chauffeur hors de l'agglomération) : on garde les plus proches plutôt que rien.
    if (r.every((s) => s.excluded)) {
      const near = rankZones(scores, zones, { ...opts, maxTripMin: undefined }).sort(
        (a, b) => (a.accessMin ?? 0) - (b.accessMin ?? 0) || b.score - a.score,
      );
      return { ranked: near, allTooFar: true };
    }
    return { ranked: r, allTooFar: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, mode, from?.x, from?.y, settings.maxTripMin]);
  const byId = useMemo(() => Object.fromEntries(ranked.map((s) => [s.zoneId, s])), [ranked]);
  const eligibleRaw = ranked.filter((s) => !s.excluded);
  // Garde-fou : jamais de liste vide (sinon l'écran ne peut pas s'afficher).
  const eligible = eligibleRaw.length ? eligibleRaw : ranked;
  const top = eligible.slice(0, 5);
  // Couleurs relatives : le quartier le plus favorable du moment prend la teinte la plus forte.
  const maxScore = Math.max(1, eligible[0].rankScore);
  const rel = (score: number) => scoreColor((score / maxScore) * 99);
  const current = byId[selected && !byId[selected].excluded ? selected : top[0].zoneId];
  const currentZone = zones.find((z) => z.id === current.zoneId)!;
  const rank = eligible.findIndex((s) => s.zoneId === current.zoneId) + 1;
  const adjusted = mode === 'pres' && current.accessMin !== undefined;
  const best = eligible[0];

  // Conseil de relance : depuis la position, maintenant. Rester ou aller ailleurs ?
  const idleMin = idleSince ? Math.max(0, Math.round((clock - +new Date(idleSince)) / 60000)) : null;
  const hereZone = from ? zoneAt(from, zones, kmPerUnit) : null;
  const advice = useMemo(() => {
    if (!isNow || !from) return null;
    const near = rankZones(scores, zones, { mode: 'pres', kmPerUnit, centre: CENTRE, from, maxTripMin: settings.maxTripMin });
    return relaunchAdvice(near, hereZone?.id ?? null, idleMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNow, scores, from?.x, from?.y, hereZone?.id, idleMin, settings.maxTripMin]);
  const target = advice ? advice.best : best;
  const targetZone = target ? zones.find((z) => z.id === target.zoneId) : undefined;
  const reasonOf = (r: typeof best) =>
    r ? [...r.factors].sort((a, b) => WEIGHTS[b.key] * b.value - WEIGHTS[a.key] * a.value)[0]?.detail : '';

  const rain = rainFor(weather.hourly, new Date(`${date}T${fmt(minutes).replace('h', ':')}:00+01:00`));
  const airport = hubs.find((h) => h.id === 'aeroport')!;
  const station = hubs.find((h) => h.id === 'matabiau');
  const fillOf = (id: string) => (byId[id].excluded ? '#141C2B' : rel(byId[id].rankScore));
  const airportIn = hubInflow(hubArrivals.find((h) => h.hubId === 'aeroport')?.days[date], minutes);

  return (
    <Screen title="Carte de Toulouse" subtitle="Où la demande devrait être la plus forte" realData>
      <Text style={[font.tiny, { marginTop: -spacing.sm }]}>
        {live.origin === 'serveur'
          ? `Mis à jour · Tisséo ${live.updated.tisseo ? hhmm(live.updated.tisseo) : `du ${shortDate(live.tisseo.fetchedAt)}`} · météo ${hhmm(live.updated.meteo)} · trains et cars ${hhmm(live.updated.transport)}`
          : `Données intégrées à l’app (Tisséo du ${shortDate(live.tisseo.fetchedAt)}, météo du ${shortDate(live.weather.fetchedAt)})${live.checkedAt ? ' · serveur injoignable' : ''}`}
      </Text>

      {advice?.kind === 'stay' ? (
        <Card accent={colors.success} style={{ gap: spacing.sm }}>
          <Row style={{ gap: 6 }}>
            <Zap size={16} color={colors.success} />
            <Text style={[font.small, { color: colors.success, fontWeight: '700' }]}>QUE FAIRE MAINTENANT</Text>
            {idleMin !== null && idleMin >= 5 && <Text style={font.tiny}>· sans course depuis {idleMin} min</Text>}
          </Row>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[font.h1, { fontSize: 22 }]}>Restez vers {hereZone?.name}</Text>
              <Text style={font.small} numberOfLines={2}>
                Rien de nettement mieux à moins de {settings.maxTripMin} min.
                {advice.best
                  ? ` Meilleure option proche : ${zones.find((z) => z.id === advice.best!.zoneId)?.name} (≈ ${advice.best.accessMin} min).`
                  : ''}
              </Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: rel(advice.stayValue) }]}>
              <Text style={styles.scoreText}>{advice.stayValue}</Text>
            </View>
          </Row>
          <Row style={{ gap: spacing.sm }}>
            {advice.best && (
              <Pressable onPress={() => setSelected(advice.best!.zoneId)} accessibilityRole="button" style={styles.detailBtn}>
                <Text style={[font.h3, { color: colors.text }]}>Voir l’option proche</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setSelected(advice.here.zoneId)} accessibilityRole="button" style={styles.detailBtn}>
              <Text style={[font.h3, { color: colors.text }]}>Détail</Text>
            </Pressable>
          </Row>
          <Text style={font.tiny}>
            Conseil depuis votre position, trajet compris. Après 10 min sans course, la note de votre zone baisse
            peu à peu. Potentiel estimé, pas un revenu garanti.
          </Text>
        </Card>
      ) : (
        target &&
        targetZone && (
          <Card accent={colors.success} style={{ gap: spacing.sm }}>
            <Row style={{ gap: 6 }}>
              <Zap size={16} color={colors.success} />
              <Text style={[font.small, { color: colors.success, fontWeight: '700' }]}>
                {isNow ? 'QUE FAIRE MAINTENANT' : `CONSEIL POUR ${fmt(minutes)}`}
              </Text>
              {isNow && idleMin !== null && idleMin >= 5 && (
                <Text style={font.tiny}>· sans course depuis {idleMin} min</Text>
              )}
            </Row>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                {advice?.kind === 'go' && !advice.here && target.excluded && (
                  <Text style={[font.small, { color: colors.warning }]}>
                    Vous êtes hors de la zone couverte (Toulouse et environs). Zone la plus proche :
                  </Text>
                )}
                <Text style={[font.h1, { fontSize: 22 }]}>Aller vers {targetZone.name}</Text>
                <Text style={font.small} numberOfLines={2}>
                  {reasonOf(target)}
                </Text>
                {target.accessMin !== undefined && (
                  <Text style={font.small}>
                    Trajet ≈ {target.accessMin} min ({target.km?.toLocaleString('fr-FR')} km)
                    {advice?.kind === 'go' && advice.here && hereZone
                      ? ` · mieux que ${hereZone.name} (${advice.stayValue})`
                      : ''}
                  </Text>
                )}
              </View>
              <View style={[styles.scoreBadge, { backgroundColor: rel(target.rankScore) }]}>
                <Text style={styles.scoreText}>{target.rankScore}</Text>
              </View>
            </Row>
            <Row style={{ gap: spacing.sm }}>
              <Pressable
                onPress={() => {
                  const g = unproject(targetZone.cx, targetZone.cy, projection);
                  openNavigation(g.lat, g.lon, targetZone.name, settings.nav);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.goBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Navigation size={18} color="#fff" />
                <Text style={styles.goText}>Y aller</Text>
              </Pressable>
              <Pressable onPress={() => setSelected(target.zoneId)} accessibilityRole="button" style={styles.detailBtn}>
                <Text style={[font.h3, { color: colors.text }]}>Détail</Text>
              </Pressable>
            </Row>
            <Text style={font.tiny}>
              {advice
                ? 'Conseil depuis votre position, trajet compris. Itinéraire à lancer à l’arrêt. Potentiel estimé, pas un revenu garanti.'
                : isNow && pos.status !== 'ok'
                  ? 'Autorisez la position pour un conseil depuis l’endroit où vous êtes. Potentiel estimé, pas un revenu garanti.'
                  : 'Itinéraire à lancer à l’arrêt. Potentiel estimé, pas un revenu garanti.'}
            </Text>
          </Card>
        )
      )}
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
          onPress={() => {
            timeTouched.current = true;
            setMinutes((m) => Math.max(5 * 60, m - STEP));
          }}
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
          onPress={() => {
            timeTouched.current = true;
            setMinutes((m) => Math.min(23 * 60 + 30, m + STEP));
          }}
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
          modeTouched.current = true;
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
              ? allTooFar
                ? `Aucune zone à moins de ${settings.maxTripMin} min de votre position : voici les plus proches (réglable dans Réglages).`
                : 'Note ajustée au temps de trajet depuis votre position (non enregistrée).'
              : pos.status === 'pending'
                ? 'Recherche de votre position…'
                : pos.status === 'refused'
                  ? 'Position refusée : autorisez la localisation pour ce mode. Classement de toute la ville en attendant.'
                  : 'Position indisponible pour le moment. Classement de toute la ville en attendant.'}
          </Text>
        </Row>
      )}

      <ZoneMap
        zones={zones}
        fillOf={fillOf}
        excluded={(id) => byId[id].excluded}
        selectedId={current.zoneId}
        onSelect={setSelected}
        topIds={top.map((s) => s.zoneId)}
        airport={airport}
        station={station}
        user={from}
        onExpand={() => setFull(true)}
      />

      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)}>
        <SafeAreaView style={styles.fullScreen}>
          <Row style={styles.fullHeader}>
            <View style={{ flex: 1 }}>
              <Text style={font.h2}>Carte de Toulouse</Text>
              <Text style={font.tiny}>
                {mapDays[dayIdx]?.label} · {fmt(minutes)} ·{' '}
                {mode === 'ville' ? 'toute la ville' : mode === 'hors-centre' ? 'hors centre' : 'près de moi'} · pincez
                pour zoomer
              </Text>
            </View>
            <Pressable
              onPress={() => setFull(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer le plein écran"
              hitSlop={10}
              style={styles.closeBtn}
            >
              <X size={22} color={colors.text} />
            </Pressable>
          </Row>
          <ZoneMap
            zones={zones}
            fillOf={fillOf}
            excluded={(id) => byId[id].excluded}
            selectedId={current.zoneId}
            onSelect={setSelected}
            topIds={top.map((s) => s.zoneId)}
            airport={airport}
            station={station}
            user={from}
            style={{ borderRadius: 0, borderLeftWidth: 0, borderRightWidth: 0 }}
          />
          <Card style={{ margin: spacing.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={font.small}>
                  {rank > 0 ? `${rank === 1 ? '1ʳᵉ' : `${rank}ᵉ`} zone sur ${eligible.length}` : 'Zone exclue'}
                  {current.accessMin !== undefined ? ` · trajet ≈ ${current.accessMin} min` : ''}
                </Text>
                <Text style={font.h2}>{currentZone.name}</Text>
                <Text style={font.tiny} numberOfLines={2}>
                  {[...current.factors].sort((a, b) => WEIGHTS[b.key] * b.value - WEIGHTS[a.key] * a.value)[0]?.detail}
                </Text>
              </View>
              <View style={[styles.scoreBadge, { backgroundColor: rel(current.rankScore) }]}>
                <Text style={styles.scoreText}>{current.rankScore}</Text>
              </View>
            </Row>
          </Card>
        </SafeAreaView>
      </Modal>

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
        {jobsEstimated.length > 0 && (
          <Row>
            <Building2 size={16} color={colors.warning} />
            <Text style={[font.small, { flex: 1 }]}>
              Emplois estimés d’après la population (hors base SIRENE de la Métropole) : {jobsEstimated.join(', ')}.
              Les zones d’activité comme Labège sont sans doute sous-évaluées.
            </Text>
          </Row>
        )}
      </Card>

      <SourceNote>
        Quartiers : {zonesSource.name}, {zonesSource.licence}. Trains : horaires SNCF ; cars : FlixBus et BlaBlaCar Bus
        (ODbL). Activité : {activitySources.emplois} ; lieux {activitySources.lieux} ; vacances scolaires et jours fériés
        (Éducation nationale). Perturbations : Tisséo temps réel (ODbL), relevé du{' '}
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
  fullScreen: { flex: 1, backgroundColor: colors.bg },
  goBtn: {
    flex: 2,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  goText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  detailBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullHeader: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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

// Affiché à la place de l'écran en cas d'erreur (au lieu d'un écran vide).
export { ErrorScreen as ErrorBoundary } from '../../components/ErrorScreen';
