import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Card, Row, Screen, SectionTitle, Segmented, SourceNote } from '../../components/ui';
import type { RankMode } from '../../domain/ranking';
import { useSettings, type NavApp } from '../../settings/store';
import { colors, font, radius, spacing } from '../../theme';

export default function ProfileScreen() {
  const { settings, update } = useSettings();

  return (
    <Screen title="Réglages" subtitle="Enregistrés sur ce téléphone" realData>
      <SectionTitle>Carte</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={font.h3}>Mode à l’ouverture</Text>
          <Segmented<RankMode>
            label="Mode à l’ouverture"
            value={settings.defaultMode}
            onChange={(m) => update({ defaultMode: m })}
            options={[
              { value: 'ville', label: 'Toute la ville' },
              { value: 'hors-centre', label: 'Hors centre' },
              { value: 'pres', label: 'Près de moi' },
            ]}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={font.h3}>Trajet maximum vers une zone</Text>
          <Text style={font.tiny}>
            En mode « Près de moi », les zones plus loin que ça ne sont pas proposées.
          </Text>
          <Row style={{ justifyContent: 'center', gap: spacing.lg }}>
            <Stepper label="Moins" onPress={() => update({ maxTripMin: Math.max(5, settings.maxTripMin - 5) })}>
              <Minus size={20} color={colors.text} />
            </Stepper>
            <Text style={[font.h1, { minWidth: 90, textAlign: 'center' }]}>{settings.maxTripMin} min</Text>
            <Stepper label="Plus" onPress={() => update({ maxTripMin: Math.min(60, settings.maxTripMin + 5) })}>
              <Plus size={20} color={colors.text} />
            </Stepper>
          </Row>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={font.h3}>Objectif de revenu horaire</Text>
          <Text style={font.small}>
            Cible des jauges du journal (revenu par heure, attente et approche comprises ; pas un bénéfice net).
          </Text>
          <Row style={{ justifyContent: 'center', gap: spacing.lg }}>
            <Stepper label="Moins" onPress={() => update({ targetEurH: Math.max(10, settings.targetEurH - 1) })}>
              <Minus size={20} color={colors.text} />
            </Stepper>
            <Text style={[font.h1, { minWidth: 90, textAlign: 'center' }]}>{settings.targetEurH} €/h</Text>
            <Stepper label="Plus" onPress={() => update({ targetEurH: Math.min(80, settings.targetEurH + 1) })}>
              <Plus size={20} color={colors.text} />
            </Stepper>
          </Row>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={font.h3}>Application GPS pour « Y aller »</Text>
          <Segmented<NavApp>
            label="Application GPS"
            value={settings.nav}
            onChange={(n) => update({ nav: n })}
            options={[
              { value: 'choix', label: 'Au choix' },
              { value: 'waze', label: 'Waze' },
              { value: 'google', label: 'Google Maps' },
            ]}
          />
        </View>
      </Card>

      <SectionTitle>Confidentialité</SectionTitle>
      <Card style={{ gap: spacing.sm }}>
        <Text style={font.small}>
          • La position n’est lue que lorsque l’app est ouverte, pour « Près de moi » et le journal.
        </Text>
        <Text style={font.small}>• Le journal et ces réglages restent sur ce téléphone.</Text>
        <Text style={font.small}>
          • Le journal n’est transmis que si vous appuyez sur « Envoyer le journal ». Il peut être effacé à tout
          moment depuis l’onglet Journal.
        </Text>
      </Card>

      <SourceNote>
        Profil complet (véhicule, coûts, plateformes) : à venir, une fois l’historique de vos courses intégré.
      </SourceNote>
    </Screen>
  );
}

function Stepper({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.stepper}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Affiché à la place de l'écran en cas d'erreur (au lieu d'un écran vide).
export { ErrorScreen as ErrorBoundary } from '../../components/ErrorScreen';
