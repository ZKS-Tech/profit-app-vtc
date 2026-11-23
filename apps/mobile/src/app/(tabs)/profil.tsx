import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, Minus, Plus } from 'lucide-react-native';
import { Card, Row, Screen, SectionTitle, Segmented, Toggle } from '../../components/ui';
import { useDemo, type DemoState } from '../../demo/DemoContext';
import { demoDriver } from '../../demo/data';
import { colors, font, platformColors, radius, spacing } from '../../theme';

const dayLetters = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const dayNames = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export default function ProfileScreen() {
  const { state, setState, target, setTarget, platforms, togglePlatform } = useDemo();
  const [days, setDays] = useState(demoDriver.workDays);
  const [prefs, setPrefs] = useState({
    airport: true,
    longRides: true,
    voice: true,
    gps: true,
    importData: true,
    shareAggregated: false,
  });
  const set = (k: keyof typeof prefs) => (v: boolean) => setPrefs((p) => ({ ...p, [k]: v }));

  return (
    <Screen title="Mon profil chauffeur" subtitle="Tout est modifiable à tout moment">
      <Card style={{ borderStyle: 'dashed', borderColor: colors.demo }}>
        <Text style={[font.h3, { color: colors.demo }]}>Outil de maquette : simuler un état</Text>
        <Text style={[font.tiny, { marginVertical: spacing.sm }]}>
          Pour vérifier l’affichage en chargement, sans données ou hors ligne.
        </Text>
        <Segmented<DemoState>
          label="État simulé"
          value={state}
          onChange={setState}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'insuffisant', label: 'Peu de données' },
            { value: 'hors-ligne', label: 'Hors ligne' },
            { value: 'chargement', label: 'Chargement' },
          ]}
        />
      </Card>

      <SectionTitle>Activité</SectionTitle>
      <Card style={styles.list}>
        <Item label="Zone principale" value={demoDriver.city} />
        <Item label="Domicile" value={demoDriver.homeArea} />
        <Item label="Trajet domicile ↔ zone" value="≈ 1 h · compté à part" last />
      </Card>

      <SectionTitle right={<Link label="Connexions" onPress={() => router.push('/connexions')} />}>
        Plateformes
      </SectionTitle>
      <Card style={styles.list}>
        {platforms.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => togglePlatform(p.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: p.enabled }}
            style={[styles.item, styles.itemBorder]}
          >
            <View style={[styles.check, p.enabled && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {p.enabled && <Check size={14} color="#fff" />}
            </View>
            <View style={[styles.brandDot, { backgroundColor: platformColors[p.id] }]} />
            <Text style={[font.body, { flex: 1 }]}>{p.name}</Text>
            {p.loyaltyStatus ? <Text style={font.small}>Statut {p.loyaltyStatus}</Text> : null}
          </Pressable>
        ))}
        <Pressable style={styles.item} accessibilityRole="button">
          <Plus size={18} color={colors.primary} />
          <Text style={[font.body, { color: colors.primary }]}>Ajouter une plateforme</Text>
        </Pressable>
      </Card>

      <SectionTitle>Horaires</SectionTitle>
      <Card>
        <Text style={font.small}>Jours travaillés</Text>
        <Row style={{ marginTop: spacing.sm, justifyContent: 'space-between' }}>
          {dayLetters.map((d, i) => (
            <Pressable
              key={i}
              onPress={() => setDays((ds) => ds.map((v, j) => (j === i ? !v : v)))}
              accessibilityRole="checkbox"
              accessibilityLabel={dayNames[i]}
              accessibilityState={{ checked: days[i] }}
              style={[styles.day, days[i] && styles.dayOn]}
            >
              <Text style={[font.h3, { color: days[i] ? '#fff' : colors.textFaint }]}>{d}</Text>
            </Pressable>
          ))}
        </Row>
        <View style={[styles.list, { marginTop: spacing.md }]}>
          <Item label="Plage de travail" value={`${demoDriver.start} – ${demoDriver.end}`} />
          <Item label="Pauses" value="Variables · 30 min conseillées" last />
        </View>
      </Card>

      <SectionTitle>Véhicule</SectionTitle>
      <Card style={styles.list}>
        <Item label={demoDriver.vehicle.model} value={`${demoDriver.vehicle.energy} · ${demoDriver.vehicle.seats} places`} />
        <Item label="Catégories" value="UberX, UberX Priority, Uber Pet" />
        <Item label="Ajouter un véhicule" value="Ford 9 places…" last />
      </Card>

      <SectionTitle>Coûts variables</SectionTitle>
      <Card style={styles.list}>
        <Item label="Énergie (recharge)" value="0,05 €/km" />
        <Item label="Entretien et pneus" value="0,04 €/km" />
        <Item label="Péages, stationnement" value="Au réel" last />
      </Card>

      <SectionTitle>Objectifs</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={font.body}>Revenu net horaire visé</Text>
            <Text style={font.tiny}>Sert à colorer la carte et les créneaux</Text>
          </View>
          <Row>
            <Stepper icon={<Minus size={18} color={colors.text} />} label="Baisser" onPress={() => setTarget(Math.max(15, target - 1))} />
            <Text style={[font.h2, { minWidth: 70, textAlign: 'center' }]}>{target} €/h</Text>
            <Stepper icon={<Plus size={18} color={colors.text} />} label="Augmenter" onPress={() => setTarget(Math.min(80, target + 1))} />
          </Row>
        </Row>
        <View style={[styles.list, { marginTop: spacing.md }]}>
          <Item label="Km à vide maximum" value="30 %" />
          <Item label="Repositionnement maximum" value="20 min" last />
        </View>
      </Card>

      <SectionTitle>Préférences</SectionTitle>
      <Card style={styles.list}>
        <ToggleItem label="Inclure l’aéroport" value={prefs.airport} onChange={set('airport')} />
        <ToggleItem label="Accepter les longues courses" value={prefs.longRides} onChange={set('longRides')} last />
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <Card style={styles.list}>
        <ToggleItem label="Annonces vocales" hint="Pas d’action demandée en conduisant" value={prefs.voice} onChange={set('voice')} />
        <Item label="Alerter seulement si" value="gain > 5 € sur 1h30" />
        <Item label="Heures silencieuses" value="15:00 – 05:00" last />
      </Card>

      <SectionTitle>Consentements et données</SectionTitle>
      <Card style={styles.list}>
        <ToggleItem label="Position GPS pendant l’activité" value={prefs.gps} onChange={set('gps')} />
        <ToggleItem label="Analyse des relevés importés" value={prefs.importData} onChange={set('importData')} />
        <ToggleItem
          label="Partager des statistiques anonymes"
          hint="Agrégées, jamais vos trajets précis"
          value={prefs.shareAggregated}
          onChange={set('shareAggregated')}
        />
        <Item label="Exporter mes données" value="" />
        <Item label="Supprimer mes données" value="" danger last />
      </Card>
    </Screen>
  );
}

function Item({ label, value, last, danger }: { label: string; value: string; last?: boolean; danger?: boolean }) {
  return (
    <Pressable style={[styles.item, !last && styles.itemBorder]} accessibilityRole="button">
      <Text style={[font.body, { flex: 1 }, danger && { color: colors.danger }]}>{label}</Text>
      <Text style={[font.small, { maxWidth: '55%', textAlign: 'right' }]} numberOfLines={1}>
        {value}
      </Text>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
}

function ToggleItem({
  label,
  hint,
  value,
  onChange,
  last,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.item, !last && styles.itemBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={font.body}>{label}</Text>
        {hint ? <Text style={font.tiny}>{hint}</Text> : null}
      </View>
      <Toggle value={value} onChange={onChange} label={label} />
    </View>
  );
}

function Stepper({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.stepper}>
      {icon}
    </Pressable>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[font.small, { color: colors.primary, fontWeight: '600' }]}>{label}</Text>
      <ChevronRight size={14} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 0, paddingHorizontal: 0 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDot: { width: 10, height: 10, borderRadius: 5 },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  dayOn: { backgroundColor: colors.primary },
  stepper: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
