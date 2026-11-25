import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Kpi, Row, Screen, SectionTitle, Segmented, SourceNote } from '../../components/ui';
import { journalStats } from '../../journal/stats';
import { loadJournal, type JournalEvent } from '../../journal/store';
import { colors, font, spacing } from '../../theme';

type Period = '7' | '30' | 'tout';
const fmtH = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

export default function StatsScreen() {
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [period, setPeriod] = useState<Period>('7');

  // Relit le journal à chaque ouverture de l'onglet.
  useFocusEffect(
    useCallback(() => {
      loadJournal().then(setEvents);
    }, []),
  );

  const s = journalStats(events, period === 'tout' ? null : Number(period));

  return (
    <Screen title="Statistiques" subtitle="Calculées à partir de votre journal" realData>
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

      <SourceNote>
        L’attente compte le temps depuis la fin de la course précédente (ou le début du service), trajets à vide
        compris. Un arrêt de service de moins de 45 min compte comme de l’attente ; au-delà, c’est une pause.
      </SourceNote>
    </Screen>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '48%', flexGrow: 1 },
  row: { paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
});

// Affiché à la place de l'écran en cas d'erreur (au lieu d'un écran vide).
export { ErrorScreen as ErrorBoundary } from '../../components/ErrorScreen';
