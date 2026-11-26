import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CloudRain, PartyPopper, TrainFront, TrendingDown, TrendingUp, Minus as Flat } from 'lucide-react-native';
import { Card, EmptyState, Kpi, Row, Screen, SectionTitle, Segmented, SourceNote } from '../../components/ui';
import { byDay, bySlot, journalStats } from '../../journal/stats';
import { gaugeColor } from '../../components/Gauge';
import { HourBars } from '../../components/HourBars';
import { useLiveData } from '../../data/live';
import { activity, events, zones } from '../../data/zones';
import { hm as hmEvent } from '../../domain/events';
import { FILL_RATE, forecastDays, type DayForecast } from '../../domain/forecast';
import { useSettings } from '../../settings/store';
import { loadJournal, type JournalEvent } from '../../journal/store';
import { colors, font, spacing } from '../../theme';

type Period = '7' | '30' | 'tout';
const fmtH = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const longDay = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const n0 = (n: number) => Math.round(n).toLocaleString('fr-FR');

type View_ = 'previsions' | 'resultats';

export default function StatsScreen() {
  const [view, setView] = useState<View_>('previsions');
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const { settings } = useSettings();
  // Relit le journal à chaque ouverture de l'onglet.
  useFocusEffect(
    useCallback(() => {
      loadJournal().then(setEvents);
    }, []),
  );
  return (
    <Screen title="Statistiques" subtitle="Prévisions pour Toulouse et vos résultats" realData>
      <Segmented<View_>
        label="Affichage"
        value={view}
        onChange={setView}
        options={[
          { value: 'previsions', label: 'Prévisions' },
          { value: 'resultats', label: 'Mes résultats' },
        ]}
      />
      {view === 'previsions' ? <ForecastView /> : <ResultsView events={events} target={settings.targetEurH} />}
    </Screen>
  );
}

const LABEL_COLOR: Record<DayForecast['label'], string> = {
  'Bonne journée': '#2FCB74',
  'Journée moyenne': '#F2D13A',
  'Journée calme': '#7FB2FF',
};

function ForecastView() {
  const live = useLiveData();
  const today = ymd(new Date());
  const upcoming = live.days.filter((d) => d >= today);
  // Comparaison sur les jours à venir (au moins 3), sinon sur tous les jours disponibles.
  const days = upcoming.length >= 3 ? upcoming : live.days;
  const forecasts = useMemo(
    () =>
      forecastDays({
        days,
        zones,
        arrivals: live.hubArrivals,
        activity,
        weather: live.weather.hourly,
        alerts: live.tisseo.alerts,
        events,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days.join(), live.hubArrivals, live.weather, live.tisseo],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState(false);
  // Liste complète à venir (au-delà des jours couverts par les prévisions).
  const upcomingEvents = events.list
    .map((e) => ({ e, when: e.debut ?? e.creneaux?.[0]?.debut ?? e.quotidien?.du ?? e.date ?? '' }))
    .filter((x) => (x.e.quotidien ? x.e.quotidien.au : x.when.slice(0, 10)) >= today)
    .sort((a, b) => (a.when < b.when ? -1 : 1));
  const f = forecasts.find((x) => x.date === picked) ?? forecasts.find((x) => x.date === today) ?? forecasts[0];
  if (!f) return <EmptyState title="Pas de prévision" text="Les données de la semaine ne sont pas encore chargées." />;
  const nowHour = f.date === today ? new Date().getHours() : undefined;
  const Trend = f.vsWeek >= 3 ? TrendingUp : f.vsWeek <= -3 ? TrendingDown : Flat;
  const slots2h = groupBy2h(f);
  const maxSlot = Math.max(1, ...slots2h.map((x) => x.total));

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {forecasts.map((x) => {
          const active = x.date === f.date;
          return (
            <Pressable
              key={x.date}
              onPress={() => setPicked(x.date)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{x.date === today ? 'Aujourd’hui' : longDay(x.date)}</Text>
              <View style={[styles.dot, { backgroundColor: LABEL_COLOR[x.label] }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Card accent={LABEL_COLOR[f.label]} style={{ gap: spacing.sm }}>
        <Text style={font.small}>
          {longDay(f.date)}
          {f.dayType === 'jour de semaine' || f.dayType === 'samedi' || f.dayType === 'dimanche' ? '' : ` · ${f.dayType}`}
        </Text>
        <Row style={{ gap: spacing.sm }}>
          <Trend size={24} color={LABEL_COLOR[f.label]} />
          <Text style={[font.h1, { color: LABEL_COLOR[f.label] }]}>{f.label}</Text>
        </Row>
        <Text style={font.small}>
          {f.vsWeek === 0 ? 'Dans la moyenne' : `${f.vsWeek > 0 ? '+' : '−'}${Math.abs(f.vsWeek)} % par rapport à la moyenne`} des{' '}
          {forecasts.length} jours affichés.
        </Text>
        <Text style={font.h3}>
          Meilleurs créneaux : {f.bestSlots.map((s) => `${s.from} h–${s.to} h`).join(', ')}
        </Text>
        {f.reasons.map((r) => (
          <Text key={r} style={font.small}>
            • {r}
          </Text>
        ))}
      </Card>

      <SectionTitle>Heures d’affluence prévues</SectionTitle>
      <Card style={{ gap: spacing.sm }}>
        <HourBars
          bars={f.hours.map((h) => ({ hour: h.hour, value: h.index, rain: (h.rainMm ?? 0) >= 0.5 }))}
          nowHour={nowHour}
          detail={(hour) => {
            const h = f.hours.find((x) => x.hour === hour)!;
            return [
              `affluence ${Math.round(h.index * 100)} / 100`,
              h.travellers.total ? `≈ ${n0(h.travellers.total)} voyageurs grandes lignes` : 'pas d’arrivée grandes lignes',
              ...(h.leaving ? [`≈ ${n0(h.leaving)} personnes sortent d’un événement`] : []),
              h.rainMm === null ? 'météo pas encore prévue' : h.rainMm >= 0.2 ? `pluie ${h.rainMm.toLocaleString('fr-FR')} mm/h` : 'sec',
            ].join(' · ');
          }}
        />
        <Text style={font.tiny}>
          Touchez une barre pour le détail. 100 = heure la plus chargée de la semaine affichée. Activité de la ville
          (emplois, habitants, lieux selon l’heure et le jour) 50 %, arrivées grandes lignes 25 %, sorties
          d’événements 15 %, pluie 10 %.
        </Text>
      </Card>

      <SectionTitle>Voyageurs attendus (trains et cars grandes lignes)</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {slots2h.map((x, i) => (
          <View key={x.from} style={[styles.row, i < slots2h.length - 1 && styles.rowBorder, { gap: 4 }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={font.h3}>
                {x.from} h–{x.to} h
              </Text>
              <Text style={font.h3}>{x.total ? `≈ ${n0(x.total)}` : '—'}</Text>
            </Row>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(x.total / maxSlot) * 100}%` }]} />
            </View>
            {x.total > 0 && (
              <Text style={font.tiny}>
                Matabiau {n0(x.matabiau)} · gare routière {n0(x.gareRoutiere)} · cars aéroport {n0(x.aeroport)}
              </Text>
            )}
          </View>
        ))}
      </Card>
      <Text style={font.tiny}>
        Total de la journée : ≈ {n0(f.travellersTotal)} voyageurs. Estimation : places des trains et cars × {Math.round(FILL_RATE * 100)} % de
        remplissage (hypothèse). Horaires SNCF, FlixBus et BlaBlaCar Bus (open data).
      </Text>

      <SectionTitle>Événements du jour</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        {f.events.length === 0 ? (
          <Text style={font.small}>Aucun match, concert ou salon dans la liste pour ce jour.</Text>
        ) : (
          f.events.map((o) => {
            const allDay = o.event.type === 'salon' || o.event.type === 'marche';
            return (
              <View key={`${o.event.id}-${o.start}`} style={{ gap: 2 }}>
                <Row style={{ gap: spacing.sm }}>
                  <PartyPopper size={16} color={colors.primary} />
                  <Text style={[font.h3, { flex: 1 }]}>{o.event.nom}</Text>
                  <Text style={font.small}>{o.start < 0 ? '—' : allDay ? `${hmEvent(o.start)}–${hmEvent(o.end)}` : hmEvent(o.start)}</Text>
                </Row>
                <Text style={font.small}>
                  {o.venue ? `${o.venue.nom} · ` : ''}
                  {o.event.affluence ? `≈ ${n0(o.event.affluence)} personnes · ` : ''}
                  {o.start < 0 ? 'heure à confirmer' : allDay ? `fermeture ${hmEvent(o.end)}` : `sortie vers ${hmEvent(o.end)}`}
                </Text>
                {o.event.aConfirmer && <Text style={[font.tiny, { color: colors.warning }]}>À confirmer : {o.event.aConfirmer}</Text>}
              </View>
            );
          })
        )}
        <Pressable onPress={() => setAllEvents((v) => !v)} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={[font.small, { color: colors.primary, fontWeight: '700' }]}>
            {allEvents ? 'Masquer la liste' : `Voir tous les événements à venir (${upcomingEvents.length})`}
          </Text>
        </Pressable>
        {allEvents &&
          upcomingEvents.map(({ e, when }) => (
            <Text key={e.id} style={font.small}>
              <Text style={{ fontWeight: '700', color: colors.text }}>
                {e.quotidien
                  ? `${shortD(e.quotidien.du)} → ${shortD(e.quotidien.au)}`
                  : e.creneaux && e.creneaux.length > 1
                    ? `${shortD(e.creneaux[0].debut)} → ${shortD(e.creneaux[e.creneaux.length - 1].debut)}`
                    : `${longDay(when.slice(0, 10))}${when.length > 10 ? ` ${when.slice(11, 16).replace(':', ' h ')}` : ''}`}
              </Text>
              {` · ${e.nom}`}
              {e.aConfirmer ? ` (à confirmer : ${e.aConfirmer})` : ''}
            </Text>
          ))}
        <Text style={font.tiny}>
          Liste saisie à la main (mise à jour le {events.updated.split('-').reverse().join('/')}). Affluences estimées ;
          durée supposée : match ≈ 2 h, concert ≈ 2 h 30.
        </Text>
      </Card>

      {f.peaks.length > 0 && (
        <>
          <SectionTitle>Pics à la gare Matabiau</SectionTitle>
          <Card style={{ gap: spacing.sm }}>
            {f.peaks.map((p) => (
              <Row key={p.start} style={{ gap: spacing.sm }}>
                <TrainFront size={16} color={colors.primary} />
                <Text style={[font.small, { flex: 1 }]}>
                  Sorties {hm(p.exitFrom)}–{hm(p.exitTo)} : {p.trains.length} train(s) grandes lignes, ≈ {n0(p.seats * FILL_RATE)} voyageurs
                </Text>
              </Row>
            ))}
          </Card>
        </>
      )}

      {!f.rainKnown && (
        <Row style={{ gap: 6 }}>
          <CloudRain size={14} color={colors.textMuted} />
          <Text style={[font.tiny, { flex: 1 }]}>Météo pas encore prévue pour ce jour (Météo-France publie environ 2 jours à l’avance).</Text>
        </Row>
      )}

      <SectionTitle>Pas encore pris en compte</SectionTitle>
      <Card style={{ gap: spacing.sm }}>
        <Text style={font.small}>• Vols de l’aéroport (accès demandé à Aéroport Toulouse-Blagnac).</Text>
        <Text style={font.small}>
          • Événements hors de la liste saisie (autres salles, fêtes privées, matchs de handball ou de basket).
        </Text>
        <Text style={font.small}>• Demande réelle des plateformes (Uber, Bolt) : non publique.</Text>
      </Card>
      <SourceNote>
        Prévision estimée, non calibrée : elle compare les jours entre eux et ne garantit aucun revenu. Elle sera
        ajustée avec vos journaux et votre historique de courses.
      </SourceNote>
    </>
  );
}

const shortD = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;

/** Voyageurs par tranche de 2 h (5–7 h, 7–9 h, … 23–24 h). */
function groupBy2h(f: DayForecast) {
  const out: { from: number; to: number; matabiau: number; gareRoutiere: number; aeroport: number; total: number }[] = [];
  for (const h of f.hours) {
    const from = h.hour === 5 ? 5 : h.hour % 2 === 1 ? h.hour : h.hour - 1;
    let slot = out.find((x) => x.from === from);
    if (!slot) {
      slot = { from, to: Math.min(24, from + 2), matabiau: 0, gareRoutiere: 0, aeroport: 0, total: 0 };
      out.push(slot);
    }
    slot.matabiau += h.travellers.matabiau;
    slot.gareRoutiere += h.travellers.gareRoutiere;
    slot.aeroport += h.travellers.aeroport;
    slot.total += h.travellers.total;
  }
  return out;
}

function ResultsView({ events, target }: { events: JournalEvent[]; target: number }) {
  const [period, setPeriod] = useState<Period>('7');
  const slots = bySlot(events);
  const days = byDay(events).slice(0, 14);

  const s = journalStats(events, period === 'tout' ? null : Number(period));

  return (
    <>
      <Segmented<Period>
        label="Période"
        value={period}
        onChange={setPeriod}
        options={[
          { value: '7', label: '7 jours' },
          { value: '30', label: '30 jours' },
          { value: 'tout', label: 'Tout' },
        ]}
      />

      {s.services === 0 ? (
        <EmptyState
          title="Pas encore de données"
          text="Utilisez l’onglet Journal pendant vos services : vos statistiques réelles apparaîtront ici."
        />
      ) : (
        <>
          <View style={styles.grid}>
            <Kpi style={styles.cell} label="Heures de service" value={fmtH(s.hours)} hint={`${s.services} service(s)`} />
            <Kpi
              style={styles.cell}
              label="Courses"
              value={`${s.rides}`}
              hint={s.ridesPerHour === null ? undefined : `${s.ridesPerHour.toFixed(1).replace('.', ',')} par heure`}
            />
            <Kpi style={styles.cell} label="Attente moyenne" value={s.avgWait === null ? '—' : `${s.avgWait} min`} hint="avant chaque course" />
            <Kpi
              style={styles.cell}
              label="Montants saisis"
              value={s.revenue === null ? '—' : eur(s.revenue)}
              hint={s.revenuePerHour === null ? `${s.amountsCount} course(s) renseignée(s)` : `≈ ${eur(s.revenuePerHour)} / h de service`}
            />
          </View>

          <SectionTitle>La carte et la réalité</SectionTitle>
          <Card style={{ gap: spacing.sm }}>
            {s.app.rated === 0 ? (
              <Text style={font.small}>Pas encore de course avec une note de l’app enregistrée.</Text>
            ) : (
              <>
                <Compare label="Course prise dans une zone du top 10 de l’app" {...s.app.inTop} />
                <Compare label="Course prise ailleurs" {...s.app.outTop} />
                <Text style={font.tiny}>
                  €/h = montant ÷ (attente + course). Si le top 10 rapporte plus par heure, la carte va dans le bon
                  sens. Il faut plusieurs jours et une vingtaine de courses de chaque côté pour conclure.
                </Text>
              </>
            )}
            <Text style={font.small}>
              Avis de fin de service : {s.ratings.bonne} « oui », {s.ratings.moyenne} « un peu », {s.ratings.mauvaise}{' '}
              « non »
            </Text>
          </Card>

          <SectionTitle>Par plateforme</SectionTitle>
          <Table rows={s.byPlatform} />

          <SectionTitle>Par zone (où la course a été acceptée)</SectionTitle>
          <Table rows={s.byZone.slice(0, 10)} />
        </>
      )}

      {days.length > 0 && (
        <>
          <SectionTitle>Vos journées</SectionTitle>
          <Card style={{ paddingVertical: spacing.xs }}>
            {days.map((d, i) => (
              <Row key={d.date} style={[styles.row, i < days.length - 1 && styles.rowBorder]}>
                <Text style={[font.body, { flex: 1 }]}>{longDay(d.date)}</Text>
                <Text style={font.small}>
                  {fmtH(d.hours)} · {d.rides} course(s){d.revenue !== null ? ` · ${eur(d.revenue)}` : ''}
                </Text>
                <Text style={[font.h3, { width: 70, textAlign: 'right', color: d.eurPerHour === null ? colors.textMuted : gaugeColor(d.eurPerHour, target) }]}>
                  {d.eurPerHour === null ? '—' : `${Math.round(d.eurPerHour)} €/h`}
                </Text>
              </Row>
            ))}
          </Card>
        </>
      )}

      {slots.length > 0 && (
        <>
          <SectionTitle>Vos créneaux (tous jours confondus)</SectionTitle>
          <Card style={{ paddingVertical: spacing.xs }}>
            {slots.map((r, i) => (
              <Row key={r.from} style={[styles.row, i < slots.length - 1 && styles.rowBorder]}>
                <Text style={[font.body, { width: 90 }]}>
                  {r.from} h–{r.to} h
                </Text>
                <Text style={[font.small, { flex: 1 }]}>
                  {r.rides} course(s) · attente {r.avgWait === null ? '—' : `${r.avgWait} min`}
                </Text>
                <Text style={[font.h3, { width: 70, textAlign: 'right', color: r.eurPerHour === null ? colors.textMuted : gaugeColor(r.eurPerHour, target) }]}>
                  {r.eurPerHour === null ? '—' : `${r.eurPerHour} €/h`}
                </Text>
              </Row>
            ))}
          </Card>
          <Text style={font.tiny}>
            €/h = montants ÷ (attente + approche + trajet). Un créneau n’est fiable qu’à partir d’une dizaine de courses.
          </Text>
        </>
      )}

      <SourceNote>
        L’attente compte le temps depuis la fin de la course précédente (ou le début du service), trajets à vide
        compris. Un arrêt de service de moins de 45 min compte comme de l’attente ; au-delà, c’est une pause.
      </SourceNote>
    </>
  );
}

type Side = { rides: number; avgWait: number | null; eurPerHour: number | null };

function Compare({ label, rides, avgWait, eurPerHour }: Side & { label: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={font.body}>{label}</Text>
        <Text style={font.tiny}>
          {rides} course(s) · attente {avgWait === null ? '—' : `${avgWait} min`}
        </Text>
      </View>
      <Text style={font.h3}>{eurPerHour === null ? '—' : `${eurPerHour} €/h`}</Text>
    </Row>
  );
}

function Table({ rows }: { rows: (Side & { name: string })[] }) {
  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      {rows.length === 0 ? (
        <Text style={[font.small, { paddingVertical: spacing.md }]}>Aucune course.</Text>
      ) : (
        rows.map((r, i) => (
          <Row key={r.name} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
            <Text style={[font.body, { flex: 1 }]}>{r.name}</Text>
            <Text style={font.small}>
              {r.rides} course(s) · {r.avgWait === null ? '—' : `${r.avgWait} min`}
            </Text>
            <Text style={[font.h3, { width: 76, textAlign: 'right' }]}>{r.eurPerHour === null ? '—' : `${r.eurPerHour} €/h`}</Text>
          </Row>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    minHeight: 36,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '48%', flexGrow: 1 },
  row: { paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
});

// Affiché à la place de l'écran en cas d'erreur (au lieu d'un écran vide).
export { ErrorScreen as ErrorBoundary } from '../../components/ErrorScreen';
