import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, FileUp, Hourglass, Link2, PenLine, ShieldCheck } from 'lucide-react-native';
import { Button, Card, Pill, Row, Screen, SourceNote } from '../components/ui';
import { useDemo } from '../demo/DemoContext';
import type { ConnectionStatus } from '../domain/types';
import { colors, font, platformColors, radius, spacing } from '../theme';

const statusMeta: Record<ConnectionStatus, { label: string; color: string }> = {
  'non-connecte': { label: 'Non connecté', color: colors.textFaint },
  'import-disponible': { label: 'Import de fichiers disponible', color: colors.primary },
  'oauth-en-attente': { label: 'Connexion en attente d’autorisation', color: colors.warning },
  'oauth-disponible': { label: 'Connexion officielle disponible', color: colors.success },
  connecte: { label: 'Connecté', color: colors.success },
};

export default function ConnectionsScreen() {
  const { platforms } = useDemo();
  return (
    <Screen
      title="Connexions"
      subtitle="Sources de vos courses et revenus"
      right={
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profil'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={12}
          style={styles.back}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
      }
    >
      <Card style={styles.notice}>
        <ShieldCheck size={20} color={colors.success} />
        <Text style={[font.small, { color: colors.text, flex: 1 }]}>
          VTC Profit AI ne vous demandera jamais votre mot de passe Uber, Bolt ou Heetch. Les connexions officielles
          passent par la page de la plateforme.
        </Text>
      </Card>

      {platforms.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row>
              <View style={[styles.logo, { backgroundColor: platformColors[p.id] ?? colors.surfaceHigh }]}>
                <Text style={styles.logoText}>{p.name[0]}</Text>
              </View>
              <Text style={font.h2}>{p.name}</Text>
            </Row>
            {!p.enabled && <Pill label="Désactivée" color={colors.textFaint} />}
          </Row>

          <View style={{ gap: 6, marginTop: spacing.md }}>
            {p.statuses.map((s) => (
              <Row key={s} style={{ gap: 8 }}>
                <View style={[styles.dot, { backgroundColor: statusMeta[s].color }]} />
                <Text style={[font.body, { color: statusMeta[s].color }]}>{statusMeta[s].label}</Text>
              </Row>
            ))}
          </View>

          {p.lastSync && <Text style={[font.small, { marginTop: spacing.sm }]}>Dernière mise à jour : {p.lastSync}</Text>}
          {p.importedFields && (
            <Text style={[font.tiny, { marginTop: 4 }]}>Champs importés : {p.importedFields.join(' · ')}</Text>
          )}

          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {p.id === 'prive' ? (
              <Button variant="ghost" label="Ajouter une réservation" icon={<PenLine size={16} color={colors.text} />} />
            ) : (
              <Button variant="ghost" label="Importer un relevé (CSV/Excel)" icon={<FileUp size={16} color={colors.text} />} />
            )}
            {p.statuses.includes('oauth-en-attente') && (
              <View style={styles.pending}>
                <Hourglass size={16} color={colors.warning} />
                <Text style={[font.small, { flex: 1 }]}>
                  La connexion officielle s’activera seulement si Uber autorise notre accès.
                </Text>
              </View>
            )}
            {p.statuses.includes('non-connecte') && (
              <Row style={{ gap: 6 }}>
                <Link2 size={14} color={colors.textFaint} />
                <Text style={font.tiny}>Connexion officielle : conditions d’accès à vérifier.</Text>
              </Row>
            )}
          </View>
        </Card>
      ))}

      <SourceNote>
        Ordre de priorité : 1. import de fichiers · 2. GPS consenti et journal de sessions · 3. connexion officielle si
        la plateforme l’autorise. L’app reste utile sans aucune connexion.
      </SourceNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  logo: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#0A111F', fontWeight: '900', fontSize: 18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pending: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
