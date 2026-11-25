// Filet de sécurité : en cas d'erreur d'affichage, un écran clair avec « Réessayer » au lieu d'un écran vide.
import { Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { colors, font, radius, spacing } from '../theme';

export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg }}>
      <Text style={font.h1}>Un problème d’affichage est survenu</Text>
      <Text style={font.small}>
        Réessayez. Si le problème revient, faites une capture de cet écran et envoyez-la à Evan.
      </Text>
      <Text style={[font.tiny, { color: colors.textFaint }]} numberOfLines={4}>
        {error?.message}
      </Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        style={{ minHeight: 56, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Réessayer</Text>
      </Pressable>
    </View>
  );
}
