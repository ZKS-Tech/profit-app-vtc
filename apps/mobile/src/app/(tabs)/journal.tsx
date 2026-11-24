import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { CarFront, Flag, Play, Send, ThumbsDown, ThumbsUp, TriangleAlert, Undo2, Meh } from 'lucide-react-native';
import { Card, Row, Screen, SectionTitle, SourceNote } from '../../components/ui';
import { hubs, kmPerUnit, projection, zones } from '../../data/zones';
import { useLiveData } from '../../data/live';
import { zoneAt } from '../../domain/geo';
import { project } from '../../domain/ranking';
import { scoreZones } from '../../domain/zoneScore';
import {
  eventLabel,
  loadJournal,
  saveJournal,
  statusOf,
  todaySummary,
  toCsv,
  waits,
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

async function position(): Promise<{ lat: number; lon: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    const last = p ?? (await Location.getLastKnownPositionAsync());
    return last ? { lat: last.coords.latitude, lon: last.coords.longitude } : null;
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    loadJournal().then((e) => {
      setEvents(e);
      setLoaded(true);
    });
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback(async (next: JournalEvent[]) => {
    setEvents(next);
    await saveJournal(next);
  }, []);

  /** Ajoute un événement avec la position et ce que l'app conseillait à cet instant. */
  const add = useCallback(
    async (partial: Omit<JournalEvent, 'id' | 'ts'>) => {
      setBusy(true);
      const now = new Date();
      const ev: JournalEvent = { id: `${now.getTime()}`, ts: now.toISOString(), ...partial };
      const pos = await position();
      if (pos) {
        ev.lat = Math.round(pos.lat * 1000) / 1000;
        ev.lon = Math.round(pos.lon * 1000) / 1000;
        const z = zoneAt(project(pos.lat, pos.lon, projection), zones, kmPerUnit);
        if (z) {
          ev.zoneId = z.id;
          ev.zoneName = z.name;
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
        });
        ev.appTop = zones.find((z) => z.id === scores[0].zoneId)?.name;
        const i = scores.findIndex((s) => s.zoneId === ev.zoneId);
        if (i >= 0) {
          ev.appScore = scores[i].score;
          ev.appRank = i + 1;
        }
      }
      await persist([...events, ev]);
      setBusy(false);
    },
    [events, live, persist],
  );

  const { status, since } = statusOf(events);
  const sinceMin = since ? Math.round((Date.now() - +new Date(since)) / 60000) : 0;
  const summary = todaySummary(events);
  const waitById = new Map(waits(events).map((w) => [w.course.id, w.waitMin]));
  const lastIsEnd = events.length > 0 && events[events.length - 1].type === 'fin';

  const exportJournal = async () => {
    try {
      await Share.share({ title: 'Journal VTC Profit AI', message: toCsv(events) });
    } catch {
      // Partage indisponible (ex. navigateur) : rien à faire, le journal reste sur l'appareil.
    }
  };

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
              : `En course depuis ${sinceMin} min`}
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

        {status === 'en-course' && (
          <>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Montant de la course en € (facultatif)"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              style={styles.input}
              accessibilityLabel="Montant de la course en euros"
            />
            <BigButton
              label="Course terminée"
              icon={<Flag size={22} color="#fff" />}
              color={colors.primary}
              disabled={busy}
              onPress={async () => {
                const n = parseFloat(amount.replace(',', '.'));
                await add({ type: 'fin-course', amount: Number.isFinite(n) ? n : undefined });
                setAmount('');
              }}
            />
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

      <SectionTitle>Aujourd’hui</SectionTitle>
      <Row style={{ gap: spacing.sm }}>
        <Stat label="Courses" value={`${summary.rides}`} />
        <Stat label="Attente moyenne" value={summary.avgWait === null ? '—' : `${summary.avgWait} min`} />
        <Stat label="Montants saisis" value={summary.revenue === null ? '—' : `${Math.round(summary.revenue)} €`} />
      </Row>

      <Card style={{ paddingVertical: spacing.xs }}>
        {summary.events.length === 0 ? (
          <Text style={[font.small, { paddingVertical: spacing.md }]}>Aucun événement aujourd’hui.</Text>
        ) : (
          [...summary.events].reverse().map((e, i) => (
            <View key={e.id} style={[styles.row, i < summary.events.length - 1 && styles.rowBorder]}>
              <Text style={[font.h3, { width: 50 }]}>{hm(e.ts)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={font.body}>
                  {eventLabel(e.type)}
                  {e.platform ? ` · ${e.platform}` : ''}
                  {e.amount !== undefined ? ` · ${e.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : ''}
                  {e.rating ? ` · ${e.rating}` : ''}
                </Text>
                <Text style={font.tiny}>
                  {e.zoneName ?? 'Position inconnue'}
                  {waitById.has(e.id) ? ` · attente ${waitById.get(e.id)} min` : ''}
                  {e.appRank ? ` · rang app ${e.appRank} (n°1 : ${e.appTop})` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <BigButton
        label="Envoyer le journal"
        icon={<Send size={20} color="#fff" />}
        color={colors.primary}
        disabled={events.length === 0}
        onPress={exportJournal}
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
        <Pressable
          onPress={async () => {
            if (!confirmClear) return setConfirmClear(true);
            await persist([]);
            setConfirmClear(false);
          }}
          disabled={events.length === 0}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Text style={[font.small, { color: confirmClear ? colors.danger : colors.textMuted }]}>
            {confirmClear ? 'Confirmer l’effacement' : 'Effacer le journal'}
          </Text>
        </Pressable>
      </Row>

      <SourceNote>
        Le journal reste sur ce téléphone. « Envoyer le journal » le partage au format tableur (WhatsApp, e-mail…). La
        position est arrondie à environ 100 m.
      </SourceNote>
    </Screen>
  );
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
