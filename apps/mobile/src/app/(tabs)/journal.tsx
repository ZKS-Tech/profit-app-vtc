import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { CarFront, Flag, Play, Send, ThumbsDown, ThumbsUp, TriangleAlert, Undo2, Meh, UserCheck, X } from 'lucide-react-native';
import { AmountPad } from '../../components/AmountPad';
import { Gauge } from '../../components/Gauge';
import { useSettings } from '../../settings/store';
import { Card, Row, Screen, SectionTitle, SourceNote } from '../../components/ui';
import { activity, hubs, kmPerUnit, projection, zones } from '../../data/zones';
import { useLiveData } from '../../data/live';
import { zoneAt } from '../../domain/geo';
import { project } from '../../domain/ranking';
import { scoreZones } from '../../domain/zoneScore';
import {
  cycles,
  eventLabel,
  formatEur,
  loadJournal,
  loadShownAdvice,
  onJournalChange,
  parseAmount,
  sameDay,
  serviceHours,
  type Follow,
  type ShownAdvice,
  saveJournal,
  statusOf,
  todaySummary,
  toCsv,
  type JournalEvent,
  type Platform,
} from '../../journal/store';
import { colors, font, radius, spacing } from '../../theme';

const PLATFORMS: { id: Platform; color: string }[] = [
  { id: 'Uber', color: '#F4F4F4' },
  { id: 'Bolt', color: '#34D186' },
  { id: 'Privé', color: '#7FB2FF' },
];

const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Position pour le journal : la dernière position connue si elle date de moins de 2 min (immédiat),
 * sinon une nouvelle mesure (quelques secondes, au plus 8). Appelée APRÈS l'enregistrement de l'appui.
 */
async function position(): Promise<{ lat: number; lon: number } | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 300 });
    const p =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ])) ??
      (await Location.getLastKnownPositionAsync());
    return p ? { lat: p.coords.latitude, lon: p.coords.longitude } : null;
  } catch {
    return null;
  }
}

export default function JournalScreen() {
  const live = useLiveData();
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [noClient, setNoClient] = useState(false);
  const [shownAdvice, setShownAdvice] = useState<ShownAdvice | null>(null);
  const { settings } = useSettings();
  const [, tick] = useState(0);

  useEffect(() => {
    loadJournal().then((e) => {
      setEvents(e);
      setLoaded(true);
    });
    const refresh = () => {
      tick((n) => n + 1);
      loadShownAdvice().then(setShownAdvice);
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    // Retour au premier plan : compteurs et dernier conseil recalculés tout de suite.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    // Journal effacé depuis les Réglages : l'écran se met à jour.
    const off = onJournalChange(setEvents);
    return () => {
      clearInterval(id);
      sub.remove();
      off();
    };
  }, []);

  // Toujours la dernière version du journal, même dans les tâches qui finissent après un autre appui.
  const eventsRef = useRef<JournalEvent[]>([]);
  eventsRef.current = events;
  const persist = useCallback(async (next: JournalEvent[]) => {
    eventsRef.current = next;
    setEvents(next);
    await saveJournal(next);
  }, []);

  /**
   * Ajoute un événement : enregistré et affiché tout de suite (heure de l'appui), puis complété en
   * arrière-plan avec la position, la zone et ce que l'app conseillait à cet instant.
   */
  const add = useCallback(
    async (partial: Omit<JournalEvent, 'id' | 'ts'>) => {
      setBusy(true);
      const now = new Date();
      const ev: JournalEvent = { id: `${now.getTime()}`, ts: now.toISOString(), ...partial };
      await persist([...eventsRef.current, ev]);
      // Court délai anti double appui, puis les boutons sont de nouveau actifs.
      setTimeout(() => setBusy(false), 400);

      const pos = await position();
      const extra: Partial<JournalEvent> = {};
      if (pos) {
        extra.lat = Math.round(pos.lat * 1000) / 1000;
        extra.lon = Math.round(pos.lon * 1000) / 1000;
        const z = zoneAt(project(pos.lat, pos.lon, projection), zones, kmPerUnit);
        if (z) {
          extra.zoneId = z.id;
          extra.zoneName = z.name;
        }
      }
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      if (live.days.includes(date)) {
        const scores = scoreZones({
          zones,
          hubs,
          arrivals: live.hubArrivals,
          date,
          minutes: now.getHours() * 60 + now.getMinutes(),
          alerts: live.tisseo.alerts,
          alertsFetchedAt: live.tisseo.fetchedAt,
          weather: live.weather.hourly,
          kmPerUnit,
          activity,
        });
        extra.appTop = zones.find((z) => z.id === scores[0].zoneId)?.name;
        const i = scores.findIndex((s) => s.zoneId === extra.zoneId);
        if (i >= 0) {
          extra.appScore = scores[i].score;
          extra.appRank = i + 1;
        }
      }
      // L'événement a pu être annulé entre-temps : on ne complète que s'il existe encore.
      if (Object.keys(extra).length && eventsRef.current.some((e) => e.id === ev.id)) {
        await persist(eventsRef.current.map((e) => (e.id === ev.id ? { ...e, ...extra } : e)));
      }
    },
    [live, persist],
  );

  const { status, since } = statusOf(events);
  const sinceMin = since ? Math.round((Date.now() - +new Date(since)) / 60000) : 0;
  const summary = todaySummary(events);
  const todayCycles = cycles(summary.events);
  const cycleByCourse = new Map(todayCycles.map((c) => [c.course.id, c]));
  const cycleByEnd = new Map<string, (typeof todayCycles)[number]>();
  {
    let open: string | null = null;
    for (const e of summary.events) {
      if (e.type === 'course') open = e.id;
      if (e.type === 'fin-course' && open) {
        const c = cycleByCourse.get(open);
        if (c) cycleByEnd.set(e.id, c);
        open = null;
      }
    }
  }
  const lastIsEnd = events.length > 0 && events[events.length - 1].type === 'fin';
  // Jauges : dernière course (attente + approche + trajet) et journée (revenus ÷ durée de service).
  const lastRide = [...todayCycles].reverse().find((c) => c.eurPerHour !== undefined);
  const dayHours = serviceHours(summary.events, Date.now());
  const dayRate = summary.revenue !== null && dayHours > 0 ? summary.revenue / dayHours : null;
  // Retour sur le dernier conseil de la carte : proposé pendant le service, une fois par conseil.
  const adviceToRate =
    shownAdvice &&
    status !== 'hors-service' &&
    sameDay(shownAdvice.ts, new Date()) &&
    Date.now() - +new Date(shownAdvice.ts) < 3 * 3600_000 &&
    !events.some((e) => e.type === 'retour-conseil' && e.advice?.ts === shownAdvice.ts)
      ? shownAdvice
      : null;
  const finishRide = async () => {
    await add({ type: 'fin-course', amount: parseAmount(amount) });
    setAmount('');
    setNoClient(false);
  };

  const exportJournal = async (which: 'jour' | 'tout') => {
    const today = new Date().toLocaleDateString('fr-FR');
    try {
      await Share.share({
        title: which === 'jour' ? `Journal VTC Profit AI du ${today}` : 'Journal VTC Profit AI (complet)',
        message: toCsv(which === 'jour' ? summary.events : events),
      });
    } catch {
      // Partage indisponible (ex. navigateur) : rien à faire, le journal reste sur l'appareil.
    }
  };
  const HISTORY = 6;
  const history = [...summary.events].reverse();
  const shown = showAll ? history : history.slice(0, HISTORY);
  const pastDays = new Set(events.filter((e) => !sameDay(e.ts, new Date())).map((e) => e.ts.slice(0, 10))).size;

  return (
    <Screen title="Journal" subtitle="Ce que vous vivez sur le terrain" realData>
      <Card style={styles.safety}>
        <TriangleAlert size={18} color={colors.warning} />
        <Text style={[font.small, { color: colors.text, flex: 1 }]}>
          À utiliser <Text style={{ fontWeight: '800' }}>uniquement à l’arrêt</Text>. Chaque appui enregistre l’heure,
          le quartier et ce que l’app conseillait à ce moment.
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.small}>
          {status === 'hors-service'
            ? 'Hors service'
            : status === 'disponible'
              ? `Disponible depuis ${sinceMin} min`
              : status === 'approche'
                ? `En approche depuis ${sinceMin} min`
                : `Client à bord depuis ${sinceMin} min`}
        </Text>

        {status === 'hors-service' && (
          <BigButton
            label="Commencer le service"
            icon={<Play size={22} color="#fff" />}
            color={colors.success}
            disabled={busy || !loaded}
            onPress={() => add({ type: 'debut' })}
          />
        )}

        {status === 'disponible' && (
          <>
            <Text style={font.h3}>Course acceptée sur :</Text>
            <Row style={{ gap: spacing.sm }}>
              {PLATFORMS.map((p) => (
                <Pressable
                  key={p.id}
                  disabled={busy}
                  onPress={() => add({ type: 'course', platform: p.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Course acceptée sur ${p.id}`}
                  style={({ pressed }) => [styles.platform, { borderColor: p.color, opacity: pressed || busy ? 0.6 : 1 }]}
                >
                  <CarFront size={22} color={p.color} />
                  <Text style={[font.h3, { color: p.color }]}>{p.id}</Text>
                </Pressable>
              ))}
            </Row>
            <Pressable onPress={() => add({ type: 'fin' })} disabled={busy} style={styles.secondary}>
              <Flag size={16} color={colors.textMuted} />
              <Text style={font.small}>Fin du service</Text>
            </Pressable>
          </>
        )}

        {status === 'approche' && !noClient && (
          <>
            <BigButton
              label="Client à bord"
              icon={<UserCheck size={22} color="#fff" />}
              color={colors.success}
              disabled={busy}
              onPress={() => add({ type: 'a-bord' })}
            />
            <Pressable onPress={() => setNoClient(true)} disabled={busy} style={styles.secondary}>
              <X size={16} color={colors.textMuted} />
              <Text style={font.small}>Course annulée ou terminée sans client</Text>
            </Pressable>
          </>
        )}

        {(status === 'en-course' || (status === 'approche' && noClient)) && (
          <>
            <AmountPad value={amount} onChange={setAmount} />
            <BigButton
              label={noClient && status === 'approche' ? 'Terminer (sans client)' : 'Course terminée'}
              icon={<Flag size={22} color="#fff" />}
              color={colors.primary}
              disabled={busy}
              onPress={finishRide}
            />
            {noClient && status === 'approche' && (
              <Pressable onPress={() => setNoClient(false)} style={styles.secondary}>
                <Text style={font.small}>Retour</Text>
              </Pressable>
            )}
          </>
        )}

        {lastIsEnd && (
          <View style={{ gap: spacing.sm }}>
            <Text style={font.h3}>La carte vous a-t-elle aidé pendant ce service ?</Text>
            <Row style={{ gap: spacing.sm }}>
              {(
                [
                  { r: 'bonne', label: 'Oui', Icon: ThumbsUp, c: colors.success },
                  { r: 'moyenne', label: 'Un peu', Icon: Meh, c: colors.warning },
                  { r: 'mauvaise', label: 'Non', Icon: ThumbsDown, c: colors.danger },
                ] as const
              ).map(({ r, label, Icon, c }) => (
                <Pressable
                  key={r}
                  onPress={() => add({ type: 'avis', rating: r })}
                  style={[styles.platform, { borderColor: c }]}
                  accessibilityRole="button"
                >
                  <Icon size={20} color={c} />
                  <Text style={[font.h3, { color: c }]}>{label}</Text>
                </Pressable>
              ))}
            </Row>
          </View>
        )}
      </Card>

      {adviceToRate && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={font.small}>
            Conseil de la carte à {hm(adviceToRate.ts)} : <Text style={{ fontWeight: '800' }}>{adviceToRate.text}</Text>
          </Text>
          <Text style={font.h3}>L’avez-vous suivi ?</Text>
          <Row style={{ gap: spacing.sm }}>
            {(
              [
                { f: 'oui', label: 'Oui', c: colors.success },
                { f: 'partiel', label: 'En partie', c: colors.warning },
                { f: 'non', label: 'Non', c: colors.danger },
              ] as { f: Follow; label: string; c: string }[]
            ).map(({ f, label, c }) => (
              <Pressable
                key={f}
                disabled={busy}
                onPress={() => add({ type: 'retour-conseil', advice: adviceToRate, follow: f })}
                style={[styles.answer, { borderColor: c }]}
                accessibilityRole="button"
                accessibilityLabel={`Conseil suivi : ${label}`}
              >
                <Text style={[font.h3, { color: c }]}>{label}</Text>
              </Pressable>
            ))}
          </Row>
          <Text style={font.tiny}>Ne change ni le service en cours ni les compteurs.</Text>
        </Card>
      )}

      <SectionTitle>Aujourd’hui</SectionTitle>
      <Row style={{ gap: spacing.sm }}>
        <Gauge
          label="Dernière course"
          value={lastRide?.eurPerHour ?? null}
          target={settings.targetEurH}
          hint="Attente, approche et trajet compris"
        />
        <Gauge label="Journée" value={dayRate} target={settings.targetEurH} hint="Revenus ÷ durée de service" />
      </Row>
      <Text style={[font.tiny, { marginTop: -spacing.xs }]}>
        Revenu horaire saisi, pas un bénéfice : les frais du véhicule ne sont pas déduits.
      </Text>
      <Row style={{ gap: spacing.sm }}>
        <Stat label="Courses" value={`${summary.rides}`} />
        <Stat label="Attente moyenne" value={summary.avgWait === null ? '—' : `${summary.avgWait} min`} />
        <Stat label="Montants saisis" value={summary.revenue === null ? '—' : formatEur(summary.revenue)} />
      </Row>

      <BigButton
        label="Envoyer le journal du jour"
        icon={<Send size={20} color="#fff" />}
        color={colors.primary}
        disabled={summary.events.length === 0}
        onPress={() => exportJournal('jour')}
      />
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => persist(events.slice(0, -1))}
          disabled={events.length === 0}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Undo2 size={16} color={colors.textMuted} />
          <Text style={font.small}>Annuler la dernière action</Text>
        </Pressable>
        {pastDays > 0 && (
          <Pressable onPress={() => exportJournal('tout')} style={styles.secondary} accessibilityRole="button">
            <Text style={font.small}>Envoyer tout ({pastDays + (summary.events.length ? 1 : 0)} jours)</Text>
          </Pressable>
        )}
      </Row>

      <Card style={{ paddingVertical: spacing.xs }}>
        {summary.events.length === 0 ? (
          <Text style={[font.small, { paddingVertical: spacing.md }]}>Aucun événement aujourd’hui.</Text>
        ) : (
          shown.map((e, i) => (
            <View key={e.id} style={[styles.row, i < shown.length - 1 && styles.rowBorder]}>
              <Text style={[font.h3, { width: 50 }]}>{hm(e.ts)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={font.body}>
                  {eventLabel(e.type)}
                  {e.platform ? ` · ${e.platform}` : ''}
                  {e.amount !== undefined ? ` · ${formatEur(e.amount)}` : ''}
                  {e.rating ? ` · ${e.rating}` : ''}
                  {e.follow ? ` · ${e.follow === 'partiel' ? 'en partie' : e.follow}` : ''}
                </Text>
                <Text style={font.tiny}>
                  {e.advice ? `${e.advice.text} (${hm(e.advice.ts)}) · ` : ''}
                  {e.zoneName ?? 'Position inconnue'}
                  {cycleByCourse.has(e.id) ? ` · attente ${cycleByCourse.get(e.id)!.waitMin} min` : ''}
                  {cycleByEnd.has(e.id) ? cycleText(cycleByEnd.get(e.id)!) : ''}
                  {e.appRank ? ` · rang app ${e.appRank} (n°1 : ${e.appTop})` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
        {history.length > HISTORY && (
          <Pressable onPress={() => setShowAll((v) => !v)} style={[styles.secondary, { justifyContent: 'center' }]} accessibilityRole="button">
            <Text style={[font.small, { color: colors.primary, fontWeight: '700' }]}>
              {showAll ? 'Réduire' : `Afficher toute la journée (${history.length} événements)`}
            </Text>
          </Pressable>
        )}
      </Card>

      <SourceNote>
        Inutile d’effacer le journal après l’envoi : seule la journée en cours s’affiche ici, et les jours précédents
        restent sur le téléphone pour l’onglet Stats. « Envoyer le journal du jour » le partage au format tableur
        (WhatsApp, e-mail…). La position est arrondie à environ 100 m. Effacement complet : Réglages.
      </SourceNote>
    </Screen>
  );
}

function cycleText(c: { approachMin?: number; tripMin?: number; rideMin?: number; eurPerHour?: number }) {
  const parts = [
    c.approachMin !== undefined ? `approche ${c.approachMin} min` : null,
    c.tripMin !== undefined ? `trajet ${c.tripMin} min` : c.rideMin !== undefined ? `course ${c.rideMin} min` : null,
    c.eurPerHour !== undefined ? `${Math.round(c.eurPerHour)} €/h` : null,
  ].filter(Boolean);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function BigButton({
  label,
  icon,
  color,
  onPress,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.big, { backgroundColor: color, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
    >
      {icon}
      <Text style={styles.bigText}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={font.small}>{label}</Text>
      <Text style={[font.h2, { marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safety: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  big: {
    minHeight: 64,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  bigText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  platform: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
  },
  answer: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm, minHeight: 44 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
});

// Affiché à la place de l'écran en cas d'erreur (au lieu d'un écran vide).
export { ErrorScreen as ErrorBoundary } from '../../components/ErrorScreen';
